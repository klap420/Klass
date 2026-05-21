import { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

export function Esp32Code({ topic }: { topic: string }) {
  const [copied, setCopied] = useState(false);

  const code = `// ESP32 WROOM BLE to MQTT Bridge for Fredorch F21s
// Required Libraries: PubSubClient, ArduinoJson
// Board: ESP32 Dev Module

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

// --- Configuration ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

const char* mqtt_server = "test.mosquitto.org";
const int mqtt_port = 1883;

// Topic dynamically populated from UI
const char* mqtt_topic = "${topic}";
char mqtt_state_topic[100];

// --- BLE Settings for Fredorch (Adjust if needed) ---
// Note: You must scan using a generic BLE scanner app (like nRF Connect) 
// to find the exact Service UUID and Characteristic UUID for your specific Fredorch unit.
static BLEUUID serviceUUID("FFF0"); 
static BLEUUID charUUID("FFF1");

// --- Globals ---
WiFiClient espClient;
PubSubClient client(espClient);

static boolean doConnect = false;
static boolean connected = false;
static boolean doScan = false;
static BLERemoteCharacteristic* pRemoteCharacteristic;
static BLEAdvertisedDevice* myDevice;
String deviceName = "Unknown";
int currentRssi = -100;
unsigned long lastStatusTime = 0;

void publishStatus() {
  if (client.connected()) {
    StaticJsonDocument<200> doc;
    doc["bleConnected"] = connected;
    doc["deviceName"] = deviceName;
    if (connected && myDevice) {
       doc["rssi"] = currentRssi; // Read RSSI could be complex, keeping static or updating via scan
    } else {
       doc["rssi"] = 0;
    }
    
    char buffer[256];
    serializeJson(doc, buffer);
    client.publish(mqtt_state_topic, buffer);
  }
}

// --- BLE Callbacks ---
class MyClientCallback : public BLEClientCallbacks {
  void onConnect(BLEClient* pclient) {
  }

  void onDisconnect(BLEClient* pclient) {
    connected = false;
    Serial.println("onDisconnect");
    publishStatus();
  }
};

class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    Serial.print("BLE Advertised Device found: ");
    Serial.println(advertisedDevice.toString().c_str());

    // Connect automatically if checking by name prefix or UUID
    // The name of Fredorch devices can be generic, e.g., "F21s" or similar.
    if (advertisedDevice.haveServiceUUID() && advertisedDevice.isAdvertisingService(serviceUUID)) {
      BLEDevice::getScan()->stop();
      myDevice = new BLEAdvertisedDevice(advertisedDevice);
      deviceName = advertisedDevice.haveName() ? advertisedDevice.getName().c_str() : "F21s Target";
      currentRssi = advertisedDevice.getRSSI();
      doConnect = true;
      doScan = true;
    }
  }
};

void setupWifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

// Ensure connection to BLE device
bool connectToServer() {
    Serial.print("Forming a connection to ");
    Serial.println(myDevice->getAddress().toString().c_str());
    
    BLEClient*  pClient  = BLEDevice::createClient();
    Serial.println(" - Created client");

    pClient->setClientCallbacks(new MyClientCallback());

    // Connect to the remove BLE Server.
    pClient->connect(myDevice);
    Serial.println(" - Connected to server");

    BLERemoteService* pRemoteService = pClient->getService(serviceUUID);
    if (pRemoteService == nullptr) {
      Serial.print("Failed to find our service UUID: ");
      Serial.println(serviceUUID.toString().c_str());
      pClient->disconnect();
      return false;
    }
    Serial.println(" - Found our service");


    pRemoteCharacteristic = pRemoteService->getCharacteristic(charUUID);
    if (pRemoteCharacteristic == nullptr) {
      Serial.print("Failed to find our characteristic UUID: ");
      Serial.println(charUUID.toString().c_str());
      pClient->disconnect();
      return false;
    }
    Serial.println(" - Found our characteristic");

    connected = true;
    publishStatus();
    return true;
}

// MQTT callback to handle web app commands
void callback(char* t, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(t);
  Serial.print("] ");
  
  // Allocate the JSON document
  StaticJsonDocument<200> doc;
  
  // Deserialize the JSON document
  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.print(F("deserializeJson() failed: "));
    Serial.println(error.f_str());
    return;
  }

  if (doc.containsKey("cmd")) {
    const char* cmd = doc["cmd"];
    if (strcmp(cmd, "reconnect_ble") == 0) {
       Serial.println("Received Reconnect BLE Command");
       if (connected && pRemoteCharacteristic) {
           // We might want to force disconnect here first
           // but for simplicity, let's just trigger a re-scan if not connected
       }
       connected = false;
       doScan = true;
       doConnect = false;
       publishStatus();
       return;
    }
  }

  bool power = doc["power"];     // true/false
  int speed = doc["speed"];      // 0-100
  int depth = doc["depth"];      // 0-100

  Serial.print("Power: "); Serial.print(power);
  Serial.print(" Speed: "); Serial.print(speed);
  Serial.print(" Depth: "); Serial.println(depth);

  if (connected && pRemoteCharacteristic != nullptr) {
    // Protocol mapping for Fredorch F21s
    // PLEASE VERIFY WITH nRF Connect
    // Typical protocol is hex bytes, e.g. 0x01 (command), speed_val (0-0A), checksum 
    // This is a generic 6-byte payload example:
    
    uint8_t packet[6] = {0xAA, 0x55, 0x01, 0x00, 0x00, 0xFF}; 
    
    if (power) {
      // Map 0-100 to device speed max (e.g., 0-20)
      packet[3] = map(speed, 0, 100, 0, 20); 
      // Depth parameter (if device supports stroke mapping)
      packet[4] = map(depth, 0, 100, 0, 20);
    } else {
      packet[3] = 0x00; // stop
      packet[4] = 0x00;
    }
    
    // Add simple checksum if needed
    packet[5] = packet[2] + packet[3] + packet[4];
    
    pRemoteCharacteristic->writeValue(packet, sizeof(packet));
    Serial.println("Sent to BLE");
  } else {
    Serial.println("Not sent - BLE disconnected");
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    // Create a random client ID
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      client.subscribe(mqtt_topic);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  setupWifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  snprintf(mqtt_state_topic, sizeof(mqtt_state_topic), "%s/state", mqtt_topic);

  Serial.println("Starting Arduino BLE Client application...");
  BLEDevice::init("");

  // Retrieve a Scanner and set the callback we want to use to be informed when we
  // have detected a new device.  Specify that we want active scanning and start the
  // scan to run for 5 seconds.
  BLEScan* pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setInterval(1349);
  pBLEScan->setWindow(449);
  pBLEScan->setActiveScan(true);
  pBLEScan->start(5, false);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Handle BLE Connection flow
  if (doConnect == true) {
    if (connectToServer()) {
      Serial.println("We are now connected to the BLE Server.");
    } else {
      Serial.println("We have failed to connect to the server; there is nothing more we will do.");
    }
    doConnect = false;
  }

  if (!connected && doScan) {
    BLEDevice::getScan()->start(5, false); 
    doScan = false; // Prevent continuous fast loops if start blocks/fails
  }

  if (millis() - lastStatusTime > 5000) {
    publishStatus();
    lastStatusTime = millis();
  }
  
  delay(10);
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-lg backdrop-blur-md">
        <h2 className="text-sm font-medium text-white mb-2 uppercase tracking-wide">ESP32 Firmware</h2>
        <p className="text-xs text-gray-400 mb-6 leading-relaxed">
          Flash this code to an ESP32 WROOM module using the Arduino IDE. It bridges the MQTT commands from this web app to your Fredorch F21s via Bluetooth LE.
        </p>

        <div className="space-y-4">
          <div className="flex border border-white/10 bg-black/40 rounded-xl overflow-hidden text-xs relative group">
             <div className="bg-white/5 p-4 border-r border-white/10 flex items-center justify-center">
                <Terminal className="text-cyan-500 w-4 h-4" />
             </div>
             <div className="p-4 overflow-x-auto">
               <ul className="list-disc list-inside text-gray-300 space-y-1.5 font-mono">
                 <li>Libraries: <span className="text-[#ff2d55]">PubSubClient</span>, <span className="text-[#00f2ff]">ArduinoJson</span></li>
                 <li>Board: <strong className="text-white">ESP32 Dev Module</strong></li>
                 <li>Verify BLE UUIDs match your unit.</li>
               </ul>
             </div>
          </div>
        </div>
      </div>

      <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden relative group shadow-2xl backdrop-blur-sm">
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={copyToClipboard}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all flex items-center justify-center backdrop-blur-md border border-white/10"
            title="Copy Code"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-300" />}
          </button>
        </div>
        
        <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center gap-2">
           <div className="flex gap-1.5">
             <div className="w-2.5 h-2.5 rounded-full bg-[#ff2d55]"></div>
             <div className="w-2.5 h-2.5 rounded-full bg-[#fca5a5]"></div>
             <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
           </div>
           <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 ml-2">FredorchBridge.ino</span>
        </div>
        
        <pre className="p-5 overflow-x-auto text-[10px] sm:text-xs font-mono text-cyan-50 bg-transparent max-h-[350px] overflow-y-auto scrollbar-hide">
          <code className="leading-relaxed whitespace-pre font-mono">{code}</code>
        </pre>
      </div>

    </div>
  );
}
