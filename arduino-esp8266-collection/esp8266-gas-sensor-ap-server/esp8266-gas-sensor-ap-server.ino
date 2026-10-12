#include <ArduinoJson.h>
#include<ESP8266WiFi.h>

// WiFi Definitions
const char* ssid = "ap-ziimho";
char* password = "hbdfxn0qfs4a"; // has to be longer than 7 chars
String value = "";
String s = "";
String request = "";
int ppmValue = 0;
WiFiServer server(80);
WiFiClient client;

const size_t bufferSize = JSON_OBJECT_SIZE(2);
DynamicJsonDocument jsonDocument(bufferSize);

void setup() {

  Serial.begin(115200);
  delay(10);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, password, 1, 1);

  server.begin();
}

void loop() {
  //code
  ppmValue=analogRead(0);
  Serial.print(ppmValue);
  Serial.println(" ppm" ); // milliseconds
  delay(100);
  //end of code
  value="";
  JsonObject root = jsonDocument.to<JsonObject>();
  root["sensorid"]="-LW7DfmxXbdVbzZd4jsk";
  //Check of client has connected
  client = server.available();
  if (!client) {
    return;
  }

  // Read the request line
  request = client.readStringUntil('\r');
  Serial.println(request);
  client.flush();

  // Match request
  if (request.indexOf("/getData") != -1) {
    // read the input for example on A0
    root["value"]=ppmValue;
    serializeJson(root, Serial);
  }
  client.flush();

  // JSON response
  s = "HTTP/1.1 200 OK\r\n";
  s += "Content-Type: application/json\r\n\r\n";
  serializeJson(root, value);
  s +=value;

  // Send the response to the client
  client.print(s);
  delay(1000);
 // client.stop();
  // The client will actually be disconnected when the function returns and the client object is destroyed
}
