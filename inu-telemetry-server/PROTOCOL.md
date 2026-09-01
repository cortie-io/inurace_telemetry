# INU Racing 텔레메트리 WebSocket 프로토콜

`inu-telemetry-server`가 노출하는 두 개의 WebSocket 엔드포인트에 대한 확정 스펙입니다.
실제 스키마 검증(zod)은 [`src/protocol.ts`](src/protocol.ts), 인증/브로드캐스트/연결상태
로직은 [`src/server.ts`](src/server.ts)에 있습니다 — 이 문서와 코드가 어긋나면 코드가 맞는
것이니 그쪽을 기준으로 갱신하세요.

## 전송 방식

- WebSocket, 텍스트 프레임, JSON. 바이너리 프레임은 사용하지 않습니다.
- 모든 메시지는 `{ "type": "...", ... }` 형태 — `type`으로 분기합니다.
- 로컬: `ws://localhost:8090`, 운영: `wss://telemetry.cortie.io`
- 엔드포인트 두 개는 완전히 분리된 인증/권한을 가진 별도 WebSocket 서버입니다:

| 경로 | 연결 주체 | 용도 |
|---|---|---|
| `/device` | 차량(ESP32 등 실제 하드웨어) | 센서값을 서버로 전송 |
| `/live` | 대시보드를 보는 브라우저 | 서버가 받은 값을 실시간으로 구독 |

`/device` 쪽 데이터는 항상 Postgres에 배치 저장되고(200ms/500행 단위 flush), **동시에** 지연 없이
`/live` 구독자 전원에게 그대로 브로드캐스트됩니다 — 저장 배칭과 실시간 전달은 완전히 분리된 경로입니다.

## 인증

두 경로는 인증 방식이 다릅니다 — 하드웨어는 재발급이 번거로우니 오래 사는 토큰을, 브라우저는
페이지 소스에 아무것도 남기면 안 되니 30초짜리 1회용 티켓을 씁니다.

### `/device` — 기기 토큰

연결 직후 **첫 메시지**로 반드시 인증해야 합니다. 인증 전에 다른 메시지를 보내면 연결이 끊깁니다.

```json
// client -> server (연결 직후 첫 메시지)
{ "type": "auth", "deviceKey": "esp32-01", "token": "<db/seed.ts 또는 db/create-user.ts류 스크립트로 발급된 값>" }
```

- `token`은 서버 DB(`devices.token_hash`)에 bcrypt 해시로만 저장되어 있고, 평문은 발급 시 1회만 출력됩니다.
- 15초(`AUTH_TIMEOUT_MS`) 안에 인증하지 않으면 서버가 연결을 끊습니다.
- 기기별로 독립된 `deviceKey`/`token` 쌍을 가지므로, 기기 하나의 토큰이 유출돼도 그 기기만 재발급하면 됩니다.

### `/live` — 단기 티켓

브라우저는 로그인 세션으로 `GET /api/ws-ticket` (대시보드 앱 쪽 API)을 호출해 30초짜리 HMAC
서명 티켓을 받은 뒤, 그 티켓으로 `/live`에 인증합니다. 토큰 자체는 서버 메모리에만 있고 페이지 HTML/JS에는
절대 심지 않습니다.

```json
// client -> server (연결 직후 첫 메시지)
{ "type": "auth", "ticket": "<exp>.<hmac>" }
```

## `/device` 메시지

### 인증 성공 응답

```json
{ "type": "welcome", "deviceKey": "esp32-01", "time": 1786613801159 }
```

### 텔레메트리 프레임 (기기 → 서버)

인증 후에는 이 타입만 받습니다. **매 프레임마다 9개 필드를 전부 채워서** 보냅니다 — 일부 필드만
보내는 부분 업데이트(delta)는 지원하지 않습니다 (실측 전송 속도가 아직 안 나와서, 우선 이 구조를
유지하기로 결정 — 나중에 실측해서 병목이면 배치 전송 구조로 바꿀 수 있음).

```json
{
  "type": "telemetry",
  "steeringAngle": 12.4,
  "brakeFront": 3.1,
  "brakeRear": 1.0,
  "speed": 74.3,
  "batteryTemp": 48.9,
  "batteryVoltage": 88.1,
  "batteryCurrent": 228.1,
  "rtd": true,
  "preCharge": false
}
```

값 단위는 사람이 읽는 단위로 확정 — **raw 센서값이 아니라 이미 변환된 값**을 보내야 합니다
(ADC count나 전압 분배 raw 값이 아니라, ESP32 펌웨어에서 각도/%/km/h/°C/V/A로 변환 후 전송).

| 필드 | 타입 | 단위 | 유효 범위 | 설명 |
|---|---|---|---|---|
| `steeringAngle` | number | 도(°) | −180 ~ 180 | 조향각, 중앙 0, 부호로 좌/우 |
| `brakeFront` | number | % | 0 ~ 100 | 전륜 브레이크 압력/작동률 |
| `brakeRear` | number | % | 0 ~ 100 | 후륜 브레이크 압력/작동률 |
| `speed` | number | km/h | 0 ~ 400 | 차량 속도 |
| `batteryTemp` | number | °C | −40 ~ 200 | 배터리 팩 온도 |
| `batteryVoltage` | number | V | 0 ~ 1000 | 배터리 팩 전압 |
| `batteryCurrent` | number | A | −1000 ~ 1000 | 배터리 전류 (음수 = 회생/충전 방향으로 쓰고 싶으면 사용, 지금 프론트는 절댓값 취급) |
| `rtd` | boolean (또는 0/1 숫자) | – | – | Ready To Drive 상태 |
| `preCharge` | boolean (또는 0/1 숫자) | – | – | 프리차지 릴레이 상태 |

범위를 벗어나거나 타입이 안 맞는 필드가 하나라도 있으면 zod 검증에서 메시지 전체가 거부되고
`{"type":"error","text":"expected telemetry message"}` 응답만 오고 저장/브로드캐스트되지 않습니다 —
부분 저장 없음. 새 필드가 필요해지면 `src/protocol.ts`의 `telemetryMessage`와 이 표를 같이 갱신하세요.

**`rtd`/`preCharge`는 숫자(0/1)로 보내도 허용됩니다** (2026-08-14 발견): 일부 펌웨어가
`doc["rtd"] = digitalRead(pin)`처럼 int를 그대로 넣어서 JSON boolean이 아니라 숫자로 직렬화되는 경우가
있었고, 그때는 이 두 필드 전부 엄격한 `z.boolean()`에 걸려 텔레메트리 프레임 전체가 조용히
거부됐습니다(로그도 안 남아서 "차가 갑자기 연결만 되고 데이터를 안 준다"처럼 보였음) — `src/protocol.ts`의
`boolish` 스키마가 숫자 0/1도 boolean으로 변환해서 받아들이도록 완화했습니다. 펌웨어에서 정식으로
`true`/`false`를 보내도록 고치는 게 이상적이지만, 서버는 어느 쪽이든 받아들입니다.

## `/live` 메시지 (서버 → 브라우저)

### 인증 성공 시

```json
{ "type": "welcome", "time": 1786613801159 }
```

인증 성공 직후, 서버는 **알고 있는 모든 기기**에 대해 현재 상태를 바로 한 번씩 보내줍니다 (아래
`device_status`) — 막 연결한 뷰어가 다음 상태 변화까지 기다리지 않아도 되게 하기 위함입니다.

### 텔레메트리 브로드캐스트

`/device`로 들어온 프레임을 그대로 중계 — `time`은 클라이언트가 아니라 **서버가 받은 시각**(밀리초
epoch)입니다. 하드웨어 시계 드리프트를 신경 쓰지 않기 위한 선택.

```json
{
  "type": "telemetry",
  "deviceKey": "esp32-01",
  "time": 1786613801159,
  "steeringAngle": 12.4,
  "brakeFront": 3.1,
  "brakeRear": 1.0,
  "speed": 74.3,
  "batteryTemp": 48.9,
  "batteryVoltage": 88.1,
  "batteryCurrent": 228.1,
  "rtd": true,
  "preCharge": false
}
```

### 연결 상태 (`device_status`) — 브라우저-서버 연결과는 별개

**중요**: `/live` 자체가 열려 있다는 것은 "브라우저 ↔ 서버" 연결이 살아있다는 뜻일 뿐, **차량 ↔ 서버
연결(`/device`)이 살아있다는 뜻이 아닙니다.** 차량이 끊겨도 브라우저의 `/live` 연결은 멀쩡할 수
있으므로, 대시보드가 실제 "차량이 붙어있는지"를 알려면 이 메시지를 봐야 합니다.

```json
{
  "type": "device_status",
  "deviceKey": "esp32-01",
  "online": true,
  "lastSeenAt": 1786613801159,
  "connectedAt": 1786613700000
}
```

- 기기가 `/device`에 연결/재연결/인증 성공할 때, 그리고 연결이 끊길 때(정상 종료든 하트비트
  타임아웃이든) 모든 `/live` 구독자에게 즉시 브로드캐스트.
- `lastSeenAt`은 마지막으로 텔레메트리 프레임을 받은 시각(ms epoch) — 서버 재시작 후에도
  `devices.last_seen_at`(DB)에서 복원되므로 막 재시작한 직후에도 "몇 초 전"을 보여줄 수 있습니다.
- `connectedAt`은 **현재 열려 있는** `/device` 연결이 인증에 성공한 시각(ms epoch) — `lastSeenAt`과
  달리 서버 재시작 시 복원되지 않고(재연결 = 새 연결), 연결이 끊기면 즉시 `null`이 됩니다. 프론트에서
  "차량 연결 시간(몇 시간째 붙어있는지)"을 보여주는 용도.
- 프론트(`hooks/use-telemetry.ts`)는 `linkUp`(`/live` 연결 여부) AND `deviceOnline`(이 메시지로
  받은 값)을 합쳐서 최종 `online`을 계산합니다. 화면의 "Link Up/No Link"는 둘 다 참이어야 켜집니다.

### 에러

```json
{ "type": "error", "text": "..." }
{ "type": "auth_error", "text": "..." }
```

`auth_error`를 받으면 그 즉시 연결이 서버 쪽에서 종료됩니다 (재인증 불가, 새로 연결해야 함).

## 하트비트 / 재연결

- 서버는 30초(`HEARTBEAT_INTERVAL_MS`)마다 모든 연결에 WebSocket ping을 보내고, 직전 주기에 pong이
  없었던 연결은 강제 종료합니다. `/device`가 이렇게 끊기면 정상 `close`와 동일하게 `device_status`가
  브로드캐스트됩니다 — 즉 "조용히 죽은" 연결도 이 경로로 잡힙니다.
- 프론트 `/live` 클라이언트는 끊기면 1초부터 시작해 최대 10초까지 지수 백오프로 재연결합니다.
- ESP32 펌웨어(`esp32-client/esp32-client.ino`)는 `WebSocketsClient`의 내장 재연결(5초 간격) +
  하트비트(15초 ping/3초 응답대기/2회 실패시 재연결)를 사용합니다.

## 확장 시 체크리스트

새 센서 필드를 추가하려면:
1. `src/protocol.ts`의 `telemetryMessage`에 필드 + 유효범위 추가
2. `src/db.ts`의 `BufferedSample`/`SAMPLE_COLUMNS`와 `db/telemetry-schema.sql`에 컬럼 추가
   (기존 파티션에는 `ALTER TABLE telemetry_samples ADD COLUMN ...`이 파티션 전체에 전파됨)
3. `src/server.ts`의 telemetry 브로드캐스트 payload에 필드 추가
4. 프론트 `lib/types.ts`(`TelemetrySnapshot`/`TelemetryPoint`)와 `hooks/use-telemetry.ts`,
   그래프/게이지 컴포넌트에 반영
5. 이 문서의 필드 표 갱신
