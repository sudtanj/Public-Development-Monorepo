#include <ArduinoJson.h>

/*
  iCare plugins code example based on AnalogReadSerial
  
  This example code is in the public domain.

  https://github.com/sudtanj/iCare-PHR/wiki/Writing-your-Arduino-Code
*/

//char* value = "";
//String s = "";
const size_t bufferSize = JSON_OBJECT_SIZE(4);
DynamicJsonDocument jsonDocument(bufferSize);
// the setup routine runs once when you press reset:
void setup() {
  // initialize serial communication at 9600 bits per second:
  Serial.begin(9600);
}

// the loop routine runs over and over again forever:
void loop() {
  JsonObject root = jsonDocument.to<JsonObject>();
  root["sensorid"]="-LWTaNfoz8mNRTX50LAD";
  root["tag"]="None";
  
  // read the input for example on A0
  int sensorValue = analogRead(A0);

  //Converting number to char
  //value=itoa(sensorValue,value,10);
  root["value"]=sensorValue;
  //Package the data to a json object
  //s = "{\"data\":{\"message\":\"success\",\"sensorid\":\"-LWTaNfoz8mNRTX50LAD\",\"value\":\"";
  //s += value;
  //s += "\"}}\r";
  //s += "\n";
  //root.printTo(Serial);
  root["time"]=millis();
  serializeJson(root, Serial);
  Serial.println();
  //sent data to the apps
  //Serial.println(s);
  
  delay(5000);        // (Following the analogread example from arduino)
}
