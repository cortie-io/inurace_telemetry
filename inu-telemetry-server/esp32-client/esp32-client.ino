// INU Racing Team — ESP32 telemetry client for inu-telemetry-server's /device endpoint.
//
// Adapted from the original websocket-server test client (same WiFi/TLS/reconnect/heartbeat
// scaffolding, which already worked against Cloudflare-fronted ws.cortie.io) — the protocol
// below now speaks telemetry instead of chat, and authenticates as a specific device.
//
// Required libraries (Arduino IDE > Sketch > Include Library > Manage Libraries):
//   - "WebSockets" by Markus Sattler (Links2004/arduinoWebSockets)
//   - "ArduinoJson" by Benoit Blanchon
// Board: install "esp32 by Espressif Systems" via Boards Manager, then select your board.
//
// Folder/file name must stay esp32-client to open cleanly in Arduino IDE.

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ---------- Config ----------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Once this is actually deployed, telemetry.cortie.io needs DNS + nginx + certbot set up first
// (not done yet as of this firmware revision) — point WS_HOST at wherever inu-telemetry-server
// actually ends up reachable.
const char* WS_HOST = "telemetry.cortie.io";
const uint16_t WS_PORT = 443;
const char* WS_PATH = "/device"; // device ingest endpoint (not /live — that's for dashboard viewers)

// Per-device credentials from the seed script output (`devices` table). Each car/rig gets its
// own key+token pair so one can be revoked without affecting the others.
const char* DEVICE_KEY = "esp32-01";
const char* DEVICE_TOKEN = "REPLACE_WITH_SEEDED_DEVICE_TOKEN";

// Root CA for the TLS chain in front of WS_HOST. Copied from the already-verified ws.cortie.io
// chain (same Cloudflare setup) — re-verify with
// `openssl s_client -connect telemetry.cortie.io:443 -showcerts` once that subdomain is live,
// and swap this if the chain differs. Valid to 2028-01-28 per the original verification.
static const char* ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDejCCAmKgAwIBAgIQf+UwvzMTQ77dghYQST2KGzANBgkqhkiG9w0BAQsFADBX
MQswCQYDVQQGEwJCRTEZMBcGA1UEChMQR2xvYmFsU2lnbiBudi1zYTEQMA4GA1UE
CxMHUm9vdCBDQTEbMBkGA1UEAxMSR2xvYmFsU2lnbiBSb290IENBMB4XDTIzMTEx
NTAzNDMyMVoXDTI4MDEyODAwMDA0MlowRzELMAkGA1UEBhMCVVMxIjAgBgNVBAoT
GUdvb2dsZSBUcnVzdCBTZXJ2aWNlcyBMTEMxFDASBgNVBAMTC0dUUyBSb290IFI0
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE83Rzp2iLYK5DuDXFgTB7S0md+8Fhzube
Rr1r1WEYNa5A3XP3iZEwWus87oV8okB2O6nGuEfYKueSkWpz6bFyOZ8pn6KY019e
WIZlD6GEZQbR3IvJx3PIjGov5cSr0R2Ko4H/MIH8MA4GA1UdDwEB/wQEAwIBhjAd
BgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDwYDVR0TAQH/BAUwAwEB/zAd
BgNVHQ4EFgQUgEzW63T/STaj1dj8tT7FavCUHYwwHwYDVR0jBBgwFoAUYHtmGkUN
l8qJUC99BM00qP/8/UswNgYIKwYBBQUHAQEEKjAoMCYGCCsGAQUFBzAChhpodHRw
Oi8vaS5wa2kuZ29vZy9nc3IxLmNydDAtBgNVHR8EJjAkMCKgIKAehhxodHRwOi8v
Yy5wa2kuZ29vZy9yL2dzcjEuY3JsMBMGA1UdIAQMMAowCAYGZ4EMAQIBMA0GCSqG
SIb3DQEBCwUAA4IBAQAYQrsPBtYDh5bjP2OBDwmkoWhIDDkic574y04tfzHpn+cJ
odI2D4SseesQ6bDrarZ7C30ddLibZatoKiws3UL9xnELz4ct92vID24FfVbiI1hY
+SW6FoVHkNeWIP0GCbaM4C6uVdF5dTUsMVs/ZbzNnIdCp5Gxmx5ejvEau8otR/Cs
kGN+hr/W5GvT1tMBjgWKZ1i4//emhA1JG1BbPzoLJQvyEotc03lXjTaCzv8mEbep
8RqZ7a2CPsgRbuvTPBwcOMBBmuFeU88+FSBX6+7iP0il8b4Z0QFqIwwMHfs/L6K1
vepuoxtGzi4CZ68zJpiq1UvSqTbFJjtbD4seiMHl
-----END CERTIFICATE-----
)EOF";

WebSocketsClient webSocket;

unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 50; // 20Hz placeholder rate — tune to real sensor sampling rate

bool authenticated = false;
float phase = 0;

void sendJson(JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  webSocket.sendTXT(out);
}

void sendAuth() {
  JsonDocument doc;
  doc["type"] = "auth";
  doc["deviceKey"] = DEVICE_KEY;
  doc["token"] = DEVICE_TOKEN;
  sendJson(doc);
}

// Placeholder telemetry generator — replace each field with the real sensor read
// (steering pot, brake pressure sensors, wheel-speed sensor, BMS temp/voltage/current, RTD/
// precharge relay states) once wired up. Kept here only so the protocol/connection can be
// verified end-to-end before the sensor harness exists.
void sendTelemetry() {
  phase += 0.05;
  JsonDocument doc;
  doc["type"] = "telemetry";
  doc["steeringAngle"] = sinf(phase * 0.9f) * 140.0f;
  doc["brakeFront"] = max(0.0f, sinf(phase * 1.3f) * 60.0f);
  doc["brakeRear"] = max(0.0f, sinf(phase * 1.3f) * 50.0f);
  doc["speed"] = 70.0f + sinf(phase * 0.6f) * 55.0f;
  doc["batteryTemp"] = 34.0f + sinf(phase * 0.15f) * 10.0f;
  doc["batteryVoltage"] = 96.0f - sinf(phase * 0.3f) * 1.5f;
  doc["batteryCurrent"] = 150.0f + sinf(phase * 1.1f) * 90.0f;
  doc["rtd"] = true;
  doc["preCharge"] = false;
  sendJson(doc);
}

void handleIncoming(const char* text, size_t length) {
  JsonDocument doc;
  if (deserializeJson(doc, text, length)) return;

  const char* type = doc["type"];
  if (type == nullptr) return;

  if (strcmp(type, "welcome") == 0) {
    authenticated = true;
    Serial.println("[WS] authenticated");
  } else if (strcmp(type, "auth_error") == 0) {
    authenticated = false;
    Serial.printf("[WS] auth failed: %s\n", (const char*)(doc["text"] | ""));
  } else if (strcmp(type, "error") == 0) {
    Serial.printf("[WS] server error: %s\n", (const char*)(doc["text"] | ""));
  }
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("[WS] TCP connected, authenticating");
      authenticated = false;
      sendAuth();
      break;
    case WStype_DISCONNECTED:
      authenticated = false;
      Serial.println("[WS] disconnected, will auto-reconnect");
      break;
    case WStype_TEXT:
      handleIncoming((const char*)payload, length);
      break;
    case WStype_ERROR:
      Serial.println("[WS] error");
      break;
    default:
      break;
  }
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(115200);
  delay(300);

  connectWiFi();

  webSocket.beginSslWithCA(WS_HOST, WS_PORT, WS_PATH, ROOT_CA);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void loop() {
  webSocket.loop();

  if (millis() - lastSend > SEND_INTERVAL_MS) {
    lastSend = millis();
    if (webSocket.isConnected() && authenticated) {
      sendTelemetry();
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
}
