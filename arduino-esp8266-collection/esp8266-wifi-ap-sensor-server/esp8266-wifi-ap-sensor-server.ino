#include <ArduinoJson.h>
#include<ESP8266WiFi.h>

// WiFi Definitions
const char* ssid = "ap-1eje7q";
char* password = "uavp9q4l8tuo"; // has to be longer than 7 chars
String value = "";
String s = "";
String request = "";
long randNumber = 0;

int ledPin = 13; // GPIO13
WiFiServer server(80);
WiFiClient client;

const size_t bufferSize = JSON_OBJECT_SIZE(2);
DynamicJsonDocument jsonDocument(bufferSize);

void setup() {

  Serial.begin(115200);
  delay(10);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, HIGH); // turn on

  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, password, 1, 1);

  server.begin();
  randomSeed(analogRead(0));
}

void loop() {
  value="";
  JsonObject root = jsonDocument.to<JsonObject>();
  root["sensorid"]="-Ll1v82FtEZmFm9rnThr";
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
    int randNumber = random(10, 20);
    root["value"]=randNumber;
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
