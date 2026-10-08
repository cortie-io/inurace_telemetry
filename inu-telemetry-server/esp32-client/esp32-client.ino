#include "driver/twai.h"
#include <Arduino.h>
#include <daly-bms-uart.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_task_wdt.h"

// ================== 핀 설정 ==================
#define RX_PIN 5
#define TX_PIN 4
#define STEERING_PIN 3  // 기존 analogRead(5)와의 충돌 방지를 위해 조향각 센서 핀을 3번으로 변경 (현재 미사용)

#define CAN_TX_PIN         GPIO_NUM_7
#define CAN_RX_PIN         GPIO_NUM_6
#define VESC_CONTROLLER_ID 91

// ================== CAN(TWAI) ==================
enum {
    CAN_PACKET_STATUS   = 9,   // eRPM, current(motor), duty
    CAN_PACKET_STATUS_2 = 14,  // amp hours used / charged
    CAN_PACKET_STATUS_3 = 15,  // watt hours used / charged
    CAN_PACKET_STATUS_4 = 16,  // temp fet, temp motor, current in, pid pos
};

// 악셀(페달) 눌림 판정 임계값
#define THROTTLE_ERPM_THRESHOLD   1.0f
#define THROTTLE_POWER_THRESHOLD  1.0f

// 속도 환산 계수 (km/h per ERPM)
#define SPEED_KMH_PER_ERPM  0.0072f

// ================== 하드웨어 설정 ==================
HardwareSerial bmsSerial(1);
Daly_BMS_UART bms(bmsSerial);

// ================== 네트워크 및 서버 설정 ==================
// 실제 Wi-Fi·토큰은 secrets.h(깃에 안 올라감)에 둔다 — 없으면 아래 자리표시로 빌드된다. 견본: secrets.example.h
#if __has_include("secrets.h")
#include "secrets.h"
#else
#define CORTIE_WIFI_SSID "YOUR_WIFI_SSID"
#define CORTIE_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define CORTIE_DEVICE_KEY "esp32-01"
#define CORTIE_DEVICE_TOKEN "REPLACE_WITH_SEEDED_DEVICE_TOKEN"
#endif
// 1. 와이파이 정보 (반드시 2.4GHz 대역 사용)
const char* ssid = CORTIE_WIFI_SSID;
const char* password = CORTIE_WIFI_PASSWORD;

// 2. 서버 및 기기 인증 정보
const char* websockets_server_host = "telemetry.cortie.io";
const uint16_t websockets_server_port = 443;
const char* websockets_path = "/device";

const char* device_key = CORTIE_DEVICE_KEY;
const char* my_token = CORTIE_DEVICE_TOKEN;

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

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL_MS = 20; // 50Hz — 아래 루프 진단 로그로 실측 검증할 것.
                                            // 만약 [DIAG] 최대 루프 시간이 주기적으로 20ms를
                                            // 넘으면 이 값을 33(30Hz)이나 50(20Hz)으로 올릴 것.

bool authenticated = false;

// ================== BMS: 별도 태스크로 분리 ==================
// Daly_BMS_UART::update()는 UART 응답을 기다리며 내부적으로 블로킹된다. 이걸 메인 루프에서
// 직접 호출하면 500ms마다 그 대기 시간만큼 CAN 수신/WS 전송이 밀린다. bms.update()를 전용
// 태스크로 옮기고, 결과값은 뮤텍스로 보호된 스냅샷을 통해 메인 루프에 넘긴다 — 메인 루프는
// 이 값을 읽을 때 절대 블로킹되지 않는다(뮤텍스를 즉시 못 얻으면 이전 값을 그대로 쓴다).
//
// 코어 배치가 핵심이다: 이걸 코어 0(ESP32 Arduino에서 WiFi/lwIP 스택이 쓰는 코어)에 올렸다가
// bms.update()가 (응답 없음 등으로) 오래 버티는 동안 WiFi 타이밍이 흔들려 연결이 반복적으로
// 끊기는 걸 실제로 겪었다. 그래서 코어 1(Arduino loopTask와 같은 코어, WiFi 스택과는 분리)에
// 고정한다 — bmsTask와 loopTask가 같은 코어에서 같은 우선순위로 라운드로빈되므로, bms.update()가
// 아무리 오래 블로킹돼도 loopTask는 매 타이머 틱마다 CPU를 나눠 받아 CAN 파싱/WS 전송을 계속
// 진행한다(코어 0에서는 WiFi 쪽 실시간성 때문에 이 보장이 약했다).
struct BmsSnapshot {
  float packVoltage = 0.0f;
  float packCurrent = 0.0f;
  float tempAverage = 0.0f;
  float packSOC     = 0.0f;      // 배터리 잔량(%)
  bool  valid = false;           // 첫 update() *성공* 전까지 false — 그동안은 0으로 보고됨
  unsigned long lastOkMs = 0;    // 마지막으로 성공한 update() 시각 — 오래(수 초) 갱신 안 되면 BMS 미응답으로 판단 가능
};

SemaphoreHandle_t bmsMutex;
BmsSnapshot bmsShared;      // bmsTask만 쓴다
BmsSnapshot bmsLocalCopy;   // 메인 루프만 읽는다 — 매 루프 갱신 시도, 실패해도 이전 값 유지

const unsigned long BMS_INTERVAL_MS = 500; // BMS 통신 부하 방지를 위해 500ms 간격 유지

void bmsTask(void* pvParameters) {
  // 이 태스크는 BMS가 응답이 없을 때 의도적으로 오래 블로킹될 수 있다(그게 이 태스크를 분리한
  // 이유 자체다) — 태스크 워치독에 걸려 칩 전체가 재부팅되는 걸(그 자체로 또 한 번의 "연결
  // 끊김"이다) 막기 위해 워치독 감시 대상에서 미리 뺀다. 구독돼 있지 않으면 ESP_ERR_NOT_FOUND를
  // 반환할 뿐이라 안전하게 무시해도 된다.
  esp_task_wdt_delete(NULL);

  for (;;) {
    unsigned long bmsUpdateStartMs = millis();
    bms.update(); // 이 라이브러리 버전은 update()가 void를 반환 — 성공/실패를 반환값으로는 구분 못 함
    bool ok = true; // 아래 참고: 이 라이브러리로는 사실상 "항상 성공"으로 취급할 수밖에 없다
    unsigned long bmsUpdateElapsedMs = millis() - bmsUpdateStartMs;
    if (bmsUpdateElapsedMs > 200) {
      // BMS가 응답을 안 하거나 느릴 때 실측치로 바로 확인하기 위한 진단 로그 — 이 값이
      // 자꾸 크게(특히 수 초 단위로) 찍히면 BMS 배선(TX/RX 반대로 연결 여부)·전원·보드레이트부터 확인할 것.
      Serial.printf("[BMS] update() 소요시간: %lu ms\n", bmsUpdateElapsedMs);
    }

    // 주의: update()가 void라 진짜 실패(타임아웃 등)를 감지할 방법이 없다 — 이 if(ok && ...)는
    // 사실상 항상 참이 되고, 아래 isBmsStale()도 첫 update() 이후로는 계속 false만 반환하게
    // 된다(BMS가 응답하는지는 위 [BMS] 소요시간 로그로 대신 확인할 것). 실제 실패 여부까지
    // 구분하려면 라이브러리 헤더에서 별도 상태/에러 필드(체크섬 결과, 수신 바이트 수 등)를
    // 찾아 그걸로 바꿔야 한다.
    if (ok && xSemaphoreTake(bmsMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      bmsShared.packVoltage = bms.get.packVoltage;
      bmsShared.packCurrent = bms.get.packCurrent;
      bmsShared.tempAverage = bms.get.tempAverage;
      bmsShared.packSOC     = bms.get.packSOC;
      bmsShared.valid = true;
      bmsShared.lastOkMs = millis();
      xSemaphoreGive(bmsMutex);
    }

    vTaskDelay(pdMS_TO_TICKS(BMS_INTERVAL_MS));
  }
}

// 메인 루프에서 호출 — 뮤텍스를 못 얻어도(락 경합) 절대 기다리지 않고 이전 값을 그대로 쓴다.
void refreshBmsLocalCopy() {
  if (xSemaphoreTake(bmsMutex, 0) == pdTRUE) {
    bmsLocalCopy = bmsShared;
    xSemaphoreGive(bmsMutex);
  }
}

// BMS가 한동안(3주기, 1.5초) 성공적으로 응답한 적이 없으면 "사실상 오프라인"으로 본다 —
// 서버 프로토콜엔 별도의 "무효" 표시가 없어서, 마지막으로 알려진 값을 계속 보내는 대신
// 0으로 정직하게 보고하기 위한 판정. 단, 지금 쓰는 daly-bms-uart 버전은 update()가 void라
// bmsTask가 실패 여부와 무관하게 매번 lastOkMs를 갱신한다 — 그래서 이 함수는 사실상 항상
// false를 반환한다(첫 update() 이후로는 "오프라인"을 감지 못 함). BMS 미연결 시 실제로
// 0이 나가는지는 지금은 bms.get.*이 애초에 0으로 초기화돼 있다는 라이브러리 쪽 우연에 기대고
// 있는 셈 — 확실히 하려면 라이브러리의 실제 성공/실패 신호를 찾아 ok 판정에 반영해야 한다.
bool isBmsStale() {
  return !bmsLocalCopy.valid || (millis() - bmsLocalCopy.lastOkMs > BMS_INTERVAL_MS * 3);
}

// ================== VESC 데이터 구조체 ==================
struct VescData {
    int32_t erpm            = 0;
    float   current_motor   = 0.0f;
    float   duty_cycle      = 0.0f;
    float   speed_kmh       = 0.0f;

    float   amp_hours_used    = 0.0f;
    float   amp_hours_charged = 0.0f;

    float   watt_hours_used    = 0.0f;
    float   watt_hours_charged = 0.0f;

    float   temp_fet     = 0.0f;
    float   temp_motor   = 0.0f;
    float   current_in   = 0.0f;
    float   pid_pos      = 0.0f;

    int     throttle_pressed = 0;  // 0 = 안눌림, 1 = 눌림

    uint32_t last_status1_ms = 0;
    uint32_t last_status2_ms = 0;
    uint32_t last_status3_ms = 0;
    uint32_t last_status4_ms = 0;
};

VescData vesc; // handle_can_message()/sendTelemetry() 모두 코어 1(loop)에서만 접근 — 뮤텍스 불필요

// ================== 유틸리티 함수 ==================
static int32_t be_to_int32(const uint8_t *b) {
    return (int32_t)((uint32_t)b[0] << 24 | (uint32_t)b[1] << 16 |
                      (uint32_t)b[2] << 8  | (uint32_t)b[3]);
}
static int16_t be_to_int16(const uint8_t *b) {
    return (int16_t)((uint16_t)b[0] << 8 | (uint16_t)b[1]);
}

// ================== 악셀 상태 갱신 ==================
static void update_throttle_state() {
    bool erpm_active  = fabsf((float)vesc.erpm) >= THROTTLE_ERPM_THRESHOLD;
    bool power_active = fabsf(vesc.current_in)  >= THROTTLE_POWER_THRESHOLD;
    vesc.throttle_pressed = (erpm_active || power_active) ? 1 : 0;
}

// ================== CAN 패킷 파싱 ==================
static void handle_can_message(const twai_message_t &msg) {
    uint8_t packet_id     = (msg.identifier >> 8) & 0xFF;
    uint8_t controller_id = msg.identifier & 0xFF;

    if (controller_id != VESC_CONTROLLER_ID) return;
    if (msg.data_length_code < 8) return;

    switch (packet_id) {
        case CAN_PACKET_STATUS: {
            vesc.erpm          = be_to_int32(&msg.data[0]);
            vesc.current_motor = be_to_int16(&msg.data[4]) / 10.0f;
            vesc.duty_cycle    = be_to_int16(&msg.data[6]) / 1000.0f;
            vesc.speed_kmh     = vesc.erpm * SPEED_KMH_PER_ERPM;
            vesc.last_status1_ms = millis();
            update_throttle_state();
            break;
        }
        case CAN_PACKET_STATUS_2: {
            vesc.amp_hours_used    = be_to_int32(&msg.data[0]) / 10000.0f;
            vesc.amp_hours_charged = be_to_int32(&msg.data[4]) / 10000.0f;
            vesc.last_status2_ms = millis();
            break;
        }
        case CAN_PACKET_STATUS_3: {
            vesc.watt_hours_used    = be_to_int32(&msg.data[0]) / 10000.0f;
            vesc.watt_hours_charged = be_to_int32(&msg.data[4]) / 10000.0f;
            vesc.last_status3_ms = millis();
            break;
        }
        case CAN_PACKET_STATUS_4: {
            vesc.temp_fet   = be_to_int16(&msg.data[0]) / 10.0f;
            vesc.temp_motor = be_to_int16(&msg.data[2]) / 10.0f;
            vesc.current_in = be_to_int16(&msg.data[4]) / 10.0f;
            vesc.pid_pos    = be_to_int16(&msg.data[6]) / 50.0f;
            vesc.last_status4_ms = millis();
            update_throttle_state();
            break;
        }
        default:
            break;
    }
}

// ================== CAN 버스 오프 감지/복구 ==================
// 노이즈나 종단저항 문제로 에러 카운터가 초과되면 TWAI 컨트롤러가 BUS_OFF로 전환되는데,
// 지금까지는 이걸 감지/복구하는 로직이 없어서 한 번 걸리면 재부팅 전까지 CAN 데이터가
// 영구히 멈췄다. 주기적으로(200ms마다, 논블로킹) 상태를 확인해 BUS_OFF면 복구를 개시하고,
// 복구가 끝나(STOPPED 상태) twai_start()로 재개한다.
unsigned long lastCanHealthCheck = 0;
const unsigned long CAN_HEALTH_CHECK_INTERVAL_MS = 200;
bool canRecoveryInProgress = false;

void check_can_health() {
  unsigned long now = millis();
  if (now - lastCanHealthCheck < CAN_HEALTH_CHECK_INTERVAL_MS) return;
  lastCanHealthCheck = now;

  twai_status_info_t status;
  if (twai_get_status_info(&status) != ESP_OK) return;

  if (status.state == TWAI_STATE_BUS_OFF && !canRecoveryInProgress) {
    Serial.println("[CAN] Bus-off 감지, 복구 시작...");
    twai_initiate_recovery();
    canRecoveryInProgress = true;
  } else if (status.state == TWAI_STATE_STOPPED && canRecoveryInProgress) {
    Serial.println("[CAN] 복구 완료, 드라이버 재시작...");
    if (twai_start() == ESP_OK) {
      canRecoveryInProgress = false;
    }
  }
}

// ================== 웹소켓 통신 ==================
// 매 전송마다 새 JsonDocument를 만들고 String으로 직렬화하면(원래 코드) 20ms마다 힙 할당/
// 해제가 반복돼 장시간(대회 한 세션 내내) 구동 시 힙 파편화 위험이 있다. 전역 JsonDocument를
// 재사용(clear()만 호출)하고, String 대신 고정 크기 버퍼에 직렬화해 힙 사용을 없앤다.
JsonDocument telemetryDoc;
char telemetryBuf[768]; // 18개 필드가 전부 자릿수 많은 값이어도 600바이트 미만 — 모자라면 serializeJson이
                        // 조용히 잘라서 깨진 JSON이 나가므로(서버가 프레임 전체를 거부) 넉넉하게 잡는다.

// 서버(src/protocol.ts)는 범위를 벗어난 필드가 하나라도 있으면 프레임 전체를 거부한다 — 센서
// 하나가 튀거나(미연결 모터 온도 센서 등) 후진으로 ERPM이 음수가 돼도 나머지 값까지 같이
// 버려지지 않도록, 보내기 전에 서버 허용 범위로 잘라 둔다.
static float clampf(float v, float lo, float hi) {
  if (isnan(v)) return lo;
  return v < lo ? lo : (v > hi ? hi : v);
}

void sendAuth() {
  JsonDocument doc;
  doc["type"] = "auth";
  doc["deviceKey"] = device_key;
  doc["token"] = my_token;
  String out;
  serializeJson(doc, out);
  Serial.println("[WSc] 인증 메시지 전송: " + out);
  webSocket.sendTXT(out);
}

void sendTelemetry() {
  refreshBmsLocalCopy(); // 논블로킹 — bmsTask가 최근에 갱신한 값을 가져온다(없으면 이전 값 유지)

  telemetryDoc.clear();
  telemetryDoc["type"] = "telemetry";

  telemetryDoc["steeringAngle"] = 180 / 11.375; // 의도적 고정값 — 조향각 센서 미연동은 현재 상태 유지

  telemetryDoc["brakeFront"] = 50;
  telemetryDoc["brakeRear"]  = 0;

  telemetryDoc["speed"] = clampf(fabsf(vesc.speed_kmh), 0.0f, 400.0f);

  // BMS가 한 번도 응답한 적 없거나(연결 안 됨) 최근 1.5초 안에 응답이 없었으면(끊김) 0으로
  // 정직하게 보고한다 — stale 값을 계속 들고 있다가 "정상 작동 중"인 것처럼 보이게 하지 않는다.
  if (isBmsStale()) {
    telemetryDoc["batteryTemp"]    = 0;
    telemetryDoc["batteryVoltage"] = 0;
    telemetryDoc["batteryCurrent"] = 0;
    telemetryDoc["batterySoc"]     = 0;
  } else {
    telemetryDoc["batteryTemp"]    = bmsLocalCopy.tempAverage;
    telemetryDoc["batteryVoltage"] = bmsLocalCopy.packVoltage;
    telemetryDoc["batteryCurrent"] = bmsLocalCopy.packCurrent;
    telemetryDoc["batterySoc"]     = clampf(bmsLocalCopy.packSOC, 0.0f, 100.0f);
  }

  // 누적 사용량(Ah) — VESC가 전원 켜진 뒤로 배터리에서 끌어다 쓴 총량 (STATUS_2)
  telemetryDoc["batteryAhUsed"] = clampf(vesc.amp_hours_used, 0.0f, 100000.0f);

  // VESC (CAN STATUS / STATUS_4)
  telemetryDoc["vescTemp"]     = clampf(vesc.temp_fet, -40.0f, 200.0f);
  telemetryDoc["erpm"]         = constrain(vesc.erpm, -1000000, 1000000);
  telemetryDoc["motorCurrent"] = clampf(vesc.current_motor, -1000.0f, 1000.0f);
  telemetryDoc["motorTemp"]    = clampf(vesc.temp_motor, -40.0f, 200.0f);

  // 회생제동량 — 누적 에너지(Wh, STATUS_3) / 누적 전하량(Ah, STATUS_2) / 순간 회생 전류(A).
  // 순간 전류는 VESC 입력 전류(current_in)가 음수(배터리로 되돌아가는 방향)일 때의 크기이고,
  // 구동 중에는 0이다.
  telemetryDoc["regenWh"]      = clampf(vesc.watt_hours_charged, 0.0f, 100000.0f);
  telemetryDoc["regenAh"]      = clampf(vesc.amp_hours_charged, 0.0f, 100000.0f);
  telemetryDoc["regenCurrent"] = clampf(-vesc.current_in, 0.0f, 1000.0f);

  telemetryDoc["rtd"]       = 1;
  telemetryDoc["preCharge"] = 0;

  size_t len = serializeJson(telemetryDoc, telemetryBuf, sizeof(telemetryBuf));
  webSocket.sendTXT(telemetryBuf, len);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      authenticated = false;
      Serial.println("[WSc] 서버와 연결이 끊어졌습니다.");
      break;

    case WStype_CONNECTED:
      Serial.printf("[WSc] 서버 연결 성공! URL: %s\n", payload);
      authenticated = false;
      sendAuth();
      break;

    case WStype_TEXT: {
      JsonDocument doc;
      if (deserializeJson(doc, payload, length)) break;
      const char* msgType = doc["type"];
      if (msgType == nullptr) break;

      if (strcmp(msgType, "welcome") == 0) {
        authenticated = true;
        Serial.println("[WSc] 인증 성공, 데이터 전송 시작");
      } else if (strcmp(msgType, "auth_error") == 0) {
        authenticated = false;
        Serial.printf("[WSc] 인증 실패: %s\n", (const char*)(doc["text"] | ""));
      } else if (strcmp(msgType, "error") == 0) {
        Serial.printf("[WSc] 서버 오류: %s\n", (const char*)(doc["text"] | ""));
      }
      break;
    }

    case WStype_BIN:
    case WStype_PING:
    case WStype_PONG:
    case WStype_ERROR:
      break;
  }
}

// ================== WiFi: 논블로킹 재연결 ==================
// 원래 코드는 while(WiFi.status() != WL_CONNECTED) { delay(500); }로 연결될 때까지 무한정
// 멈춰있었다 — AP를 못 찾거나 비밀번호가 틀리면 기기 전체가 영구 정지한다. setup()에서는
// 시간 제한(15초)을 두고, 그래도 안 되면 멈추지 않고 loop()로 넘어가서 5초 간격으로
// 백그라운드 재시도한다. CAN 파싱은 WiFi 상태와 무관하게 항상 계속 동작한다.
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;
const unsigned long WIFI_RETRY_INTERVAL_MS  = 5000;
unsigned long lastWifiAttempt = 0;

void connectWiFiBlockingWithTimeout() {
  Serial.print("WiFi 연결 중: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(300);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi 연결 완료!");
    Serial.print("ESP32-S3 IP 주소: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi 연결 실패 — CAN 로깅은 계속하고, 백그라운드에서 재시도합니다.");
  }
  lastWifiAttempt = millis();
}

// loop()에서 매 반복 호출 — 이미 연결돼 있거나 마지막 시도 후 WIFI_RETRY_INTERVAL_MS가
// 안 지났으면 즉시 리턴하므로 블로킹이 전혀 없다.
void maintainWiFiNonBlocking() {
  if (WiFi.status() == WL_CONNECTED) return;
  unsigned long now = millis();
  if (now - lastWifiAttempt < WIFI_RETRY_INTERVAL_MS) return;
  lastWifiAttempt = now;
  Serial.println("[WiFi] 재연결 시도...");
  WiFi.disconnect();
  WiFi.begin(ssid, password);
}

// ================== 초기화 ==================
bool setup_can() {
    twai_general_config_t g_config =
        TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NORMAL);
    twai_timing_config_t  t_config = TWAI_TIMING_CONFIG_500KBITS();
    twai_filter_config_t  f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

    if (twai_driver_install(&g_config, &t_config, &f_config) != ESP_OK) {
        Serial.println("[CAN] driver install failed");
        return false;
    }
    if (twai_start() != ESP_OK) {
        Serial.println("[CAN] start failed");
        return false;
    }
    Serial.println("[CAN] started (500kbps)");
    return true;
}

int RTD = 0;
int RTD_B = 15;
int RTD_RELAY = 42;
int R_SIG = 16;

void setup() {
  Serial.begin(115200);
  Serial.println("===== BOOT START =====");

  pinMode(RTD_B, INPUT_PULLUP);
  pinMode(RTD_RELAY, OUTPUT);
  pinMode(R_SIG, OUTPUT);
  digitalWrite(RTD_RELAY,LOW);
  digitalWrite(R_SIG,LOW);

  bmsSerial.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  bms.Init();
  Serial.println("[0] Daly BMS 초기화 완료 (실제 통신은 별도 태스크에서 시작됨)");

  Serial.println("[1] CAN 초기화 시도...");
  bool can_ok = setup_can();
  Serial.printf("[1] CAN 초기화 결과: %s\n", can_ok ? "성공" : "실패");
  delay(1000);

  Serial.println();
  connectWiFiBlockingWithTimeout();

  webSocket.beginSslWithCA(websockets_server_host, websockets_server_port, websockets_path, ROOT_CA);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);

  // BMS를 전용 태스크로 분리 — 반드시 코어 1(WiFi/lwIP가 쓰는 코어 0은 피한다). 이 아래로는
  // setup()에서 더 할 일 없음.
  bmsMutex = xSemaphoreCreateMutex();
  xTaskCreatePinnedToCore(
    bmsTask,      // 태스크 함수
    "BMS_Task",   // 이름(디버깅용)
    4096,         // 스택 크기(바이트)
    NULL,         // 파라미터 없음
    1,            // 우선순위 — loopTask와 동일(코어 1에서 라운드로빈)
    NULL,         // 태스크 핸들 불필요
    1             // 코어 1에 고정 — 코어 0(WiFi)과는 절대 공유하지 않는다
  );
  while(true){
    RTD = digitalRead(RTD_B);
    Serial.print("RTD : ");
    Serial.println(RTD);
    if(RTD == 0){
      break;
    }
  }
  digitalWrite(RTD_RELAY,HIGH);
  delay(3000);
  digitalWrite(R_SIG,HIGH);
}

// ================== 루프 진단 ==================
// "20ms 주기가 실제로 지켜지는지" 육안 대신 숫자로 확인하기 위한 가벼운 계측 — micros() 호출
// 2번 + 1초에 한 번 Serial 출력이라 오버헤드는 무시할 수준이다. 최대 루프 시간이 20ms를
// 자꾸 넘으면 SEND_INTERVAL_MS를 33이나 50으로 올리는 게 맞다는 실측 근거가 된다.
unsigned long diagWindowStart = 0;
unsigned long diagMaxLoopUs = 0;

void updateLoopDiagnostics(unsigned long loopStartUs) {
  unsigned long elapsed = micros() - loopStartUs;
  if (elapsed > diagMaxLoopUs) diagMaxLoopUs = elapsed;

  unsigned long now = millis();
  if (now - diagWindowStart >= 1000) {
    Serial.printf("[DIAG] 최근 1초 중 최대 루프 시간: %lu us (목표 < %lu us)\n",
                  diagMaxLoopUs, (unsigned long)(SEND_INTERVAL_MS * 1000));
    diagMaxLoopUs = 0;
    diagWindowStart = now;
  }
}

// ================== 메인 루프 (코어 1) ==================
void loop() {
  unsigned long loopStartUs = micros();

  twai_message_t msg;

  // 1. CAN 메시지 지속적으로 수신 및 파싱 (논블로킹, 0=타임아웃 없음)
  while (twai_receive(&msg, 0) == ESP_OK) {
      handle_can_message(msg);
  }

  // 2. CAN 버스 오프 감지/복구 (내부적으로 200ms 스로틀, 논블로킹)
  check_can_health();

  // 3. WiFi 유지 (연결돼 있으면 즉시 리턴, 논블로킹)
  maintainWiFiNonBlocking();

  // 4. 웹소켓 루프
  webSocket.loop();

  // 5. 데이터 전송 (기본 20ms 간격 — 위 [DIAG] 로그로 실측 검증할 것)
  if (authenticated && millis() - lastSendTime > SEND_INTERVAL_MS) {
    lastSendTime = millis();
    sendTelemetry();
  }

  updateLoopDiagnostics(loopStartUs);
}
