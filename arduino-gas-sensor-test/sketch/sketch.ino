int sensorValue;
int digitalValue;
int gasSensor=0;

void setup() {
  // put your setup code here, to run once:
  Serial.begin(9600); //serial port to 115200
  pinMode(0, INPUT);
}

void loop() {
  // put your main code here, to run repeatedly:
  Serial.print("Gas Sensor903,");
  float voltage;
  voltage= getVoltage(gasSensor);
//  Serial.println("voltage :" + voltage);
  sensorValue= analogRead(0);
  digitalValue= digitalRead(0);
  //Serial.print("Sensor Value: ");
  Serial.print(String(sensorValue));
  Serial.print(",");
  //Serial.print("Digital Value: ");
  //Serial.println(digitalValue, DEC);
  delay(1);
}

//getVoltage function
float getVoltage(int pin){
  return (analogRead(pin) * 0.004882814);
  //this equation converts the 0 to 1023 value that analogRead()
  //returns, into a 0.0 to 5.0 value that is the true voltage
  //being read at that pin
}


