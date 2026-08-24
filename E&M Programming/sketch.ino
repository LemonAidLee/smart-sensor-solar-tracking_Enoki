#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <WiFi.h>          
#include <PubSubClient.h>  
#include <SolarCalculator.h> // NOAA solar position algorithms
#include <time.h>            // Built-in library to manage internal ESP32 clock time

// --- PIN CONFIGURATION (UNTOUCHED FROM YOUR ORIGINAL) ---
#define LDR_1            1
#define LDR_2            2
#define LDR_3            3
#define LDR_4            4

#define POT_2_WIND       5   // pot2:SIG -> esp:5 (Repurposed as Time-Dial in Overcast Mode)
#define POT_1_RAIN       6   // pot1:SIG -> esp:6
#define DHT_DATA_PIN     8   // dht1:SDA -> esp:8
#define DHT_TYPE         DHT22

#define SERVO_PIN        21  // servo1:PWM -> esp:21
#define I2C_SDA          47  // lcd2:SDA -> esp:47
#define I2C_SCL          48  // lcd2:SCL -> esp:48

// --- THRESHOLDS & TUNING ---
// 🛠️ Temporarily set to 9999 so you can use the full POT range for the time dial without tripping storm mode
const int WIND_CRITICAL   = 9999;  
const int REAL_RAIN_THRESHOLD = 1500; // Real rain sensors read LOW when wet
const float TEMP_OVERHEAT = 35.0;  
const int TRACKING_DEADBAND = 150; 

// --- GEOGRAPHIC COORDINATES (Kuala Lumpur / West Malaysia) ---
const double LATITUDE  = 3.1390;   // Kuala Lumpur Latitude
const double LONGITUDE = 101.6869; // Kuala Lumpur Longitude
const int    TIME_ZONE = 8;        // Malaysia standard time zone (UTC +8)

// --- IoT CONFIGURATION ---
const char* WIFI_SSID     = "Wokwi-GUEST"; 
const char* WIFI_PASSWORD = ""; 
const char* MQTT_SERVER   = "broker.hivemq.com"; 
const int   MQTT_PORT     = 1883;
const char* MQTT_TOPIC    = "iem_facade/telemetry"; 

enum FacadeState { SYSTEM_INIT, TRACKING, SHADING, RAIN_RETRACT, STORM_LOCKOUT };
FacadeState currentState = SYSTEM_INIT;

LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo facadeServo;
DHT dht(DHT_DATA_PIN, DHT_TYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

int currentAngle = 90; 
unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL = 3000; 

const char* getStateString(FacadeState state) {
    switch(state) {
        case STORM_LOCKOUT: return "STORM_LOCKOUT";
        case RAIN_RETRACT:  return "RAIN_RETRACT";
        case SHADING:       return "SHADING";
        case TRACKING:      return "TRACKING";
        default:            return "INIT";
    }
}

void setup() {
    Serial.begin(115200);
    
    Wire.begin(I2C_SDA, I2C_SCL);
    lcd.init();
    lcd.backlight();
    
    dht.begin();
    facadeServo.attach(SERVO_PIN);
    facadeServo.write(currentAngle);
    
    lcd.setCursor(0, 0);
    lcd.print("Facade IoT Sys");
    lcd.setCursor(0, 1);
    lcd.print("Connecting WiFi");
    
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 10) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    Serial.println("\nWiFi Connected!");
    
    // Sync ESP32 internal clock using NTP internet servers
    configTime(TIME_ZONE * 3600, 0, "pool.ntp.org", "time.nist.gov");
    Serial.println("Syncing Time with NTP Network...");
    
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    
    lcd.clear();
    lcd.print("Initializing...");
    delay(1000);
}

void reconnectMQTT() {
    if (!mqttClient.connected()) {
        Serial.print("Attempting MQTT connection...");
        String clientId = "ESP32Facade-" + String(random(0, 10000));
        if (mqttClient.connect(clientId.c_str())) {
            Serial.println("connected to Cloud Broker");
        } else {
            Serial.print("failed, rc=");
            Serial.println(mqttClient.state());
        }
    }
}

// 🕹️ MANUAL TIME-DIAL VERSION: Twist POT_2_WIND to manually change the hours!
int getAstronomicalSunAngle() {
    time_t now = time(nullptr);
    struct tm* timeinfo = localtime(&now);
    
    // Read the wind potentiometer (0 to 4095)
    int potTimeVal = analogRead(POT_2_WIND);
    
    // Map the potentiometer value directly to daytime hours (7 AM to 7 PM)
    // 0 = 7:00 AM, 2048 = 1:00 PM (Noon), 4095 = 7:00 PM
    int totalMinutesWindow = map(potTimeVal, 0, 4095, 7 * 60, 19 * 60);
    timeinfo->tm_hour = totalMinutesWindow / 60;
    timeinfo->tm_min = totalMinutesWindow % 60;
    timeinfo->tm_sec = 0;
    
    // Re-package our manually dialed time
    now = mktime(timeinfo); 
    
    // Calculate the precise solar position for this dialed time
    double az, el; 
    calcHorizontalCoordinates(now, LATITUDE, LONGITUDE, az, el);
    
    // Convert the solar Azimuth compass tracking into your 0-180 degree panel target angle
    int targetAstroAngle = map(constrain((int)az, 90, 270), 90, 270, 0, 180);
    
    // Print the manual clock setting to the Serial Monitor so you can watch it live
    Serial.printf(" [MANUAL TIME DIAL] Pot Value: %d -> Dialed Time: %02d:%02d -> Angle: %d deg\n", 
                  potTimeVal, timeinfo->tm_hour, timeinfo->tm_min, targetAstroAngle);
                  
    return targetAstroAngle;
}

void loop() {
    if (!mqttClient.connected()) {
        reconnectMQTT();
    }
    mqttClient.loop();

    // 1. SENSE: Read all environmental metrics
    int ldr1 = analogRead(LDR_1);
    int ldr2 = analogRead(LDR_2);
    int ldr3 = analogRead(LDR_3);
    int ldr4 = analogRead(LDR_4);
    
    int windVal = analogRead(POT_2_WIND);
    int rainVal = analogRead(POT_1_RAIN);
    
    float temp = dht.readTemperature();
    if (isnan(temp)) temp = 27.5; 

    // 2. THINK & DECIDE: Priority Logic Array
    if (windVal > WIND_CRITICAL) {
        currentState = STORM_LOCKOUT;
    }
    else if (rainVal < REAL_RAIN_THRESHOLD) { 
        currentState = RAIN_RETRACT;
    }
    else if (temp > TEMP_OVERHEAT) {
        currentState = SHADING;
    }
    else {
        currentState = TRACKING;
    }

    // 3. ACT: Execute positions
    switch (currentState) {
        case STORM_LOCKOUT:
            currentAngle = 0; 
            updateLCD("STORM LOCKOUT!", "Angle: 0 deg");
            break;

        case RAIN_RETRACT:
            currentAngle = 180; 
            updateLCD("RAIN DETECTED", "Angle: 180 deg");
            break;

        case SHADING:
            currentAngle = 45; 
            char shadeBuf[16];
            snprintf(shadeBuf, sizeof(shadeBuf), "Shading: %.1fC", temp);
            updateLCD("OVERHEAT MODE", shadeBuf);
            break;

        case TRACKING:
            int avgLeft  = (ldr1 + ldr2) / 2;
            int avgRight = (ldr3 + ldr4) / 2;
            int error = avgLeft - avgRight;
            
            // SENSOR FUSION CRITERIA:
            // Check if it's completely dark or overcast (Left and Right are both low/very similar)
            if (avgLeft < 400 && avgRight < 400) {
                // FALLBACK: LDRs are blind due to clouds, fetch calculated angle from the Potentiometer Dial!
                currentAngle = getAstronomicalSunAngle();
                
                char trackBuf[16];
                snprintf(trackBuf, sizeof(trackBuf), "ASTRO-TRK: %ddeg", currentAngle);
                updateLCD("OVERCAST MODE", trackBuf);
            } 
            else {
                // SUNNY DAY MODE: Use LDR real-time micro-adjustments
                if (abs(error) > TRACKING_DEADBAND) {
                    if (error > 0 && currentAngle < 175) currentAngle += 3; 
                    if (error < 0 && currentAngle > 5)   currentAngle -= 3; 
                }
                
                char trackBuf[16];
                snprintf(trackBuf, sizeof(trackBuf), "T:%.1fC A:%ddeg", temp, currentAngle);
                updateLCD("SOLAR TRACKING", trackBuf);
            }
            break;
    }

    facadeServo.write(currentAngle);

    // 4. CLOUD TRANSMISSION
    unsigned long nowTime = millis();
    if (nowTime - lastTelemetryTime > TELEMETRY_INTERVAL) {
        lastTelemetryTime = nowTime;
        
        if (mqttClient.connected()) {
            char jsonPayload[150];
            snprintf(jsonPayload, sizeof(jsonPayload), 
                     "{\"status\":\"%s\",\"temp\":%.1f,\"wind\":%d,\"rain\":%d,\"angle\":%d}", 
                     getStateString(currentState), temp, windVal, rainVal, currentAngle);
            
            mqttClient.publish(MQTT_TOPIC, jsonPayload);
            Serial.print("Cloud Data Sent -> ");
            Serial.println(jsonPayload);
        }
    }

    delay(200); 
}

void updateLCD(const char* line1, const char* line2) {
    static String lastLine1 = "";
    static String lastLine2 = "";
    
    if (String(line1) != lastLine1) {
        lcd.setCursor(0, 0);
        lcd.print("                "); 
        lcd.setCursor(0, 0);
        lcd.print(line1);
        lastLine1 = String(line1);
    }
    if (String(line2) != lastLine2) {
        lcd.setCursor(0, 1);
        lcd.print("                "); 
        lcd.setCursor(0, 1);
        lcd.print(line2);
        lastLine2 = String(line2);
    }
}