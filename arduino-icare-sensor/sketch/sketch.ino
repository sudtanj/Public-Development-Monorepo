/*
  iCare plugins code example based on AnalogReadSerial
  
  This example code is in the public domain.

  https://github.com/sudtanj/iCare-PHR/wiki/Writing-your-Arduino-Code
*/

char value[12];
String s = "";

// the setup routine runs once when you press reset:
void setup() {
  // initialize serial communication at 9600 bits per second:
  Serial.begin(9600);
}

// the loop routine runs over and over again forever:
void loop() {
  // read the input for example on A0
  int sensorValue = analogRead(A0);

  //Converting number to char
  itoa(20,value,10);

  //Package the data to a json object
  s = "{\"data\":{\"message\":\"success\",\"sensorid\":\"-LWTaNfoz8mNRTX50LAD\",\"value\":\"";
  s += value;
  s += "\"}}\r\n";
  s += "\n";

  //sent data to the apps
  Serial.println(s);
  
  delay(1);        // (Following the analogread example from arduino)
}
