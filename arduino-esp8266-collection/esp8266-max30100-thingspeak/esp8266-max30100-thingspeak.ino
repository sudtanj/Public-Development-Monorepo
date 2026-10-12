#include <CircularBuffer.h>
#include <MAX30100.h>
#include <MAX30100_BeatDetector.h>
#include <MAX30100_Filters.h>
#include <MAX30100_PulseOximeter.h>
#include <MAX30100_Registers.h>
#include <MAX30100_SpO2Calculator.h>

#include <ThingSpeak.h>
//#include <MAX30100.h>
#include <Wire.h>
//#include "MAX30100_PulseOximeter.h"
//#include "MAX30100.h"
//#include "MAX30100_BeatDetector.h"
//#include "MAX30100_Filters.h"
//#include "MAX30100_Registers.h"
//#include "MAX30100_SpO2Calculator.h"
#include <ESP8266WiFi.h>
//#include "ThingSpeak.h"
 
#define REPORTING_PERIOD_MS     1000

unsigned long myChannelNumber = 1078330; // example value, use your own ThingSpeak channel
String apiKey = "EB43DMF1RUHLXNM3"; // example value, use your own API key
const char *ssid = "ssid-03jcdz"; // example value, use your own network
const char *password = "wh4udqjhofxk"; // example value, use your own password
const char *host = "api.thingspeak.com";
PulseOximeter pox;
 
uint32_t tsLastReport = 0;
 
//Function when pulse detected
void onBeatDetected()
{
    Serial.print("Beat!");
}

void setup()
{
    Serial.begin(115200);
 
    Serial.print("Initializing MAX30100 Sensor...");
 
//error handling for initialization
    if (!pox.begin()) {
        Serial.print("FAILED");
        for(;;);
    } else {
        Serial.print("SUCCESS");
    }
 
//to set current IR LED
    pox.setIRLedCurrent(MAX30100_LED_CURR_50MA);
 
//function for pulse detected called
    pox.setOnBeatDetectedCallback(onBeatDetected);
}
 
void loop()
{
    pox.update();

    if (millis() - tsLastReport > REPORTING_PERIOD_MS) {
        Serial.print("Heart rate:");
        Serial.print(pox.getHeartRate());
        Serial.print("bpm / SpO2:");
        Serial.print(pox.getSpO2());
        Serial.print("%");
 
        tsLastReport = millis();
    }
}
