# NSM AI Speaker

과학관 방문객을 위한 AI 음성 안내 서비스

## 개요

NSM AI Speaker는 Google Gemini API를 활용하여 텍스트를 음성으로 변환하는 웹 애플리케이션입니다.
**휴대폰에서 텍스트를 입력하면 서버 PC의 스피커에서 음성이 재생됩니다.**

## 주요 기능

- 텍스트 음성 변환 (TTS) - Google Gemini API 사용
- **서버 스피커 재생** - 휴대폰에서 조작, PC 스피커에서 출력
- 음성 캐싱 및 재사용
- 반복 재생 (간격 설정 가능)
- 볼륨/속도 조절

---

## 설치 튜토리얼

### 1단계: 저장소 클론

```bash
git clone https://github.com/your-username/NSM_Speaker_AI.git
cd NSM_Speaker_AI
```

### 2단계: 의존성 설치

```bash
npm install
```

### 3단계: Google Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com/apikey) 접속
2. Google 계정으로 로그인
3. "API 키 만들기" 클릭
4. 생성된 API 키 복사

### 4단계: 환경 변수 설정

프로젝트 루트에 `.env` 파일 생성:

```bash
# Windows
echo GEMINI_API_KEY=여기에_API_키_붙여넣기 > .env

# 또는 직접 파일 생성
```

`.env` 파일 내용:
```
GEMINI_API_KEY=여기에_발급받은_API_키_입력
PORT=3000
```

### 5단계: 서버 실행

```bash
# 개발 모드 (자동 재시작)
npm run dev

# 또는 프로덕션 모드
npm start
```

서버가 시작되면 다음과 같은 메시지가 표시됩니다:
```
========================================
   NSM AI Speaker Server Started
========================================

  Local:    http://localhost:3000
  Network:  http://10.1.1.19:3000
```

---

## 사용 방법

### PC에서 직접 사용

1. 브라우저에서 `http://localhost:3000` 접속
2. 텍스트 입력
3. "읽어주기" 버튼 클릭

### 휴대폰에서 원격 조작 (권장)

1. **PC와 휴대폰이 같은 WiFi에 연결되어 있는지 확인**

2. **PC의 IP 주소 확인**
   ```bash
   # Windows
   ipconfig

   # IPv4 주소 확인 (예: 192.168.0.100)
   ```

3. **휴대폰 브라우저에서 접속**
   ```
   http://192.168.0.100:3000
   ```
   (IP 주소는 실제 PC의 IP로 변경)

4. **텍스트 입력 후 "읽어주기" 클릭**
   - "서버 스피커로 재생" 체크박스가 선택되어 있으면 PC 스피커에서 재생
   - 체크 해제하면 브라우저에서 재생

### 반복 재생

1. "반복 재생" 체크박스 선택
2. 재생 간격 슬라이더로 대기 시간 설정 (0~10초)
3. "읽어주기" 클릭

---

## Docker 설치 (선택사항)

```bash
# 이미지 빌드
docker-compose build

# 컨테이너 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

---

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| GEMINI_API_KEY | Google Gemini API 키 | (필수) |
| PORT | 서버 포트 | 3000 |
| CACHE_MAX_SIZE | 최대 캐시 크기 (bytes) | 524288000 (500MB) |

---

## API 엔드포인트

| 메소드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/tts | 음성 생성 (브라우저 재생용) |
| POST | /api/speak | 음성 생성 + 서버 스피커 재생 |
| GET | /api/audio/:key | 캐시된 오디오 스트리밍 |
| GET | /api/voices | 사용 가능한 음성 목록 |
| GET | /api/cache/stats | 캐시 통계 |
| DELETE | /api/cache/:key | 특정 캐시 삭제 |
| DELETE | /api/cache | 전체 캐시 삭제 |
| GET | /api/status | 서버 상태 확인 |

---

## 프로젝트 구조

```
NSM_Speaker_AI/
├── server/
│   ├── index.js          # Express 서버 + WebSocket
│   ├── routes/
│   │   └── api.js        # API 라우트
│   ├── services/
│   │   ├── cache.js      # LRU 캐시 관리
│   │   └── gemini.js     # Gemini TTS API
│   └── utils/
│       └── helpers.js    # 유틸리티 함수
├── public/
│   ├── index.html        # 메인 UI
│   ├── css/style.css     # 스타일시트
│   ├── js/app.js         # 클라이언트 앱
│   └── images/           # 이미지 리소스
├── cache/
│   ├── audio/            # 캐시된 WAV 파일
│   └── metadata/         # 캐시 인덱스
├── package.json
├── nodemon.json          # 개발 서버 설정
├── Dockerfile
├── docker-compose.yml
└── .env                  # 환경 변수 (생성 필요)
```

---

## 문제 해결

### API 키 오류
- `.env` 파일이 프로젝트 루트에 있는지 확인
- API 키가 올바르게 입력되었는지 확인
- Gemini API가 활성화되어 있는지 Google Cloud Console에서 확인

### 휴대폰에서 접속 안됨
- PC와 휴대폰이 같은 WiFi 네트워크에 있는지 확인
- PC 방화벽에서 3000번 포트 허용
- IP 주소가 올바른지 확인 (`ipconfig`)

### 서버 스피커에서 소리 안남
- PC 볼륨 및 스피커 연결 확인
- "서버 스피커로 재생" 체크박스가 선택되어 있는지 확인

### 캐시 초기화
```bash
# cache 폴더 삭제
rm -rf cache
# 또는 Windows
rmdir /s /q cache
```

---

## 기술 스택

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **API**: Google Gemini 2.5 Flash TTS
- **Audio**: PCM to WAV 변환
- **Deployment**: Docker

---

## 라이선스

MIT License
