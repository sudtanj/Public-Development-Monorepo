#include<ESP8266WiFi.h>

// WiFi Definitions
const char* ssid = "ap-qjx424";
char* password = "sos9ial4scca"; // has to be longer than 7 chars
char* value = "";
String s = "";
String request = "";
long randNumber = 0;

int ledPin = 13; // GPIO13
WiFiServer server(80);
WiFiClient client;

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
  // Check of client has connected
  client = server.available();
  if (!client) {
    return;
  }
  randNumber = random(10, 20);

  // Read the request line
  request = client.readStringUntil('\r');
  //Serial.println(request);
  client.flush();

  // Match request
  if (request.indexOf("/getData") != -1) {
    //digitalWrite(ledPin, HIGH);
//    value = String(randNumber);
    itoa(randNumber,value,10);
  }
  /**
    else if (request.indexOf("/led/off") != -1) {
     digitalWrite(ledPin, LOW);
      value = "off";
    }*/

  client.flush();

  // JSON response
  s = "HTTP/1.1 200 OK\r\n";
  s += "Content-Type: application/json\r\n\r\n";
  s += "{\"data\":{\"message\":\"success\",\"sensorname\":\"TemperatureWifi156\",\"value\":\"";
  s += value;
  s += "\"}}\r\n";
  s += "\n";

  // Send the response to the client
  client.print(s);
  delay(1000);
  //Serial.println("Client disconnected");
 // client.stop();
  // The client will actually be disconnected when the function returns and the client object is destroyed
}
