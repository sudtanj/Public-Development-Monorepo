#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include<ESP8266WiFi.h>
#include <stdint.h>

// WiFi Definitions (Child and gateway must have same ssid and password)
const char* ssid = "ap-x8fe1g";
char* password = "wv500i7fnrtp"; // has to be longer than 7 chars

//do not touch this ->
String s = "";
String request = "";
long randNumber = 0;
int32_t counter=0;

WiFiServer server(80);
WiFiClient client;
bool destroyIp=false;
JsonObject root;
JsonArray arrayIp;
DynamicJsonDocument jsonBuffer(JSON_ARRAY_SIZE(50));
//<- do not touch this 

//you might want to change this if your data is big 
//use this link https://arduinojson.org/v5/assistant/
//to calculate the buffersize for handling your data
// "key":"value" = JSON_OBJECT_SIZE(1)

const size_t bufferSize = JSON_OBJECT_SIZE(10);
DynamicJsonDocument jsonDocument(bufferSize);

//enter your monitoring id
String getMonitoringId(){
  return "-LwFD2azdcF0kplAoi55";
}
//use unique word to tag the data you sent onDataRetrieved() function 
String getTag(){
  return "ONE";
}

//enter the data you want to sent
void onDataRetrieved(){
   //randomSeed(counter);
   int randNumber = random(1, 999999);
   root["value"]=randNumber;
   //counter+=1;
}

//call only by the child microcontroller
bool notifyGateway(){
  delay(5000);
  if(WiFi.status() == WL_CONNECTED){
  HTTPClient http;  //Declare an object of class HTTPClient
  //http.begin("http://jsonplaceholder.typicode.com/users/1");  //Specify request destination
  http.begin("http://192.168.4.1:80/notifyCentral");  //Specify request destination
  //http.begin("192.168.4.1",80,"/notifyCentral");
  http.addHeader("Content-Type", "application/json");  //Specify content-type header
  int httpCode = http.GET();       
  if(httpCode==200){
    return true;
  }    
  }
  return false;
}

//No need to modify this area ->
void trackNode(WiFiClient client){
  //Serial.println(client.remoteIP());
  //root["newip"]=client.remoteIP();
  arrayIp.add(client.remoteIP().toString());
}

void getNewIp(JsonObject jsonObject){
  jsonObject["newIp"]=arrayIp;
}

void destroyIpList(){
  jsonBuffer.clear();
  arrayIp=jsonBuffer.to<JsonArray>();
}

void initService(){
  arrayIp = jsonBuffer.to<JsonArray>();
  root = jsonDocument.to<JsonObject>();
  root["sensorid"]=getMonitoringId();
  root["tag"]=getTag();
}

void runService(){
  //Check of client has connected
  client = server.available();
  
  // Read the request line
  request = client.readStringUntil('\r');

  if (request.indexOf("/notifyCentral") != -1) {
    trackNode(client);
  }

  if (request.indexOf("/getData") != -1) {
    // read the input for example on A0
    getNewIp(root);
    onDataRetrieved();
    //int randNumber = random(10, 20);
    //root["value"]=randNumber;
    serializeJson(root, Serial);
    destroyIp=true;
  }
  client.flush();

  // JSON response
  s = "HTTP/1.1 200 OK\r\n";
  s += "Content-Type: application/json\r\n\r\n";
  serializeJson(root, s);

  // Send the response to the client
  Serial.println(s);
  client.print(s);
  if(destroyIp==true){
    destroyIpList();
    destroyIp=false;
  }
  delay(1000);
}

void configAsChild(){
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  server.begin();
  while (WiFi.status() != WL_CONNECTED) {
 
    delay(1000);
    Serial.println("Connecting..");
 
  }
}

void configAsGateway(){
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, password, 1, 1);
  server.begin();
}
//No need to modify this area <-

void setup() {

  Serial.begin(115200);
  delay(10);

  configAsGateway();
  //configAsChild();
  
  Serial.println(WiFi.localIP());

  initService();
  //notifyGateway();
}

void loop() {
  runService();
}
