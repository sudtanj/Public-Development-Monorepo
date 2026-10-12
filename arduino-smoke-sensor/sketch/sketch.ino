/*******
 
 All the resources for this project:
 https://www.hackster.io/Aritro

*******/

int redLed = 12;
int greenLed = 11;
int buzzer = 10;
int smokeA0 = A5;
// Your threshold value
int sensorThres = 400;

void setup() {
  pinMode(redLed, OUTPUT);
  pinMode(greenLed, OUTPUT);
  pinMode(buzzer, OUTPUT);
  pinMode(smokeA0, INPUT);
  Serial.begin(9600);
}

void loop() {
  int analogSensor = analogRead(smokeA0);
  Serial.print("Gas Sensor903,");
  Serial.print(String(analogSensor));
  Serial.print(",");
  delay(1);
}
