# 그린짐 — 회원 운동 관리 웹앱

Vanilla HTML/CSS/JS + Supabase 기반 모바일 PWA(최대 너비 430px). 프레임워크 없음.

## 파일 구조
```
index.html       회원 로그인 + 오늘 요약(운동/식단/러닝 + 이번 달 통계)
tracker.html     운동 트래커 (회차/Day 탭, 세트별 중량·횟수·성공/실패, 쉬는시간 타이머)
diet.html        식단 기록 (아침/점심/저녁/간식 + 물 섭취 카운트)
running.html     러닝 적립 (거리·시간, 누적 km, 월별 히스토리)
dashboard.html   트레이너 대시보드 (비밀번호 접근, 회원 목록, 기록 조회 + 운동 처방)
style.css        디자인 시스템 (그린 톤, 카드 UI, 하단 네비)
data.js          운동 프로그램 / 종목 카탈로그 / 상수
supabase.js      Supabase 클라이언트 + 인증 + 모든 DB 접근 함수
app.js           페이지별 로직
schema.sql       Supabase 테이블 스키마
```

## 1. Supabase 설정

연결 정보는 `supabase.js` 상단에 이미 들어 있습니다.
- URL: `https://zapruzcrkxxecahlsjou.supabase.co`
- anon key: (코드에 포함)

### 테이블 생성 (schema.sql 실행)
1. [Supabase 대시보드](https://supabase.com/dashboard) 접속 → 해당 프로젝트 선택
2. 왼쪽 메뉴 **SQL Editor** 클릭
3. **+ New query** 클릭
4. 이 저장소의 `schema.sql` 내용을 전체 복사해 붙여넣기
5. 오른쪽 아래 **Run** (또는 Cmd/Ctrl + Enter) 클릭
6. `Success. No rows returned` 이 나오면 완료

> 테이블: `users`, `workout_logs`, `diet_logs`, `running_logs`, `programs`
> MVP 단계라 RLS는 켜되 anon 키 전체 읽기/쓰기를 허용합니다. (회원 인증은 앱에서 이름+전화 뒷4자리로 자체 처리)

## 2. 로컬에서 테스트

`file://`로 직접 열면 일부 브라우저에서 SDK CORS가 막힐 수 있으니 **로컬 서버**를 권장합니다.

```bash
cd greengym-app

# 방법 A) Python
python3 -m http.server 8000

# 방법 B) Node
npx serve .
```

브라우저에서 `http://localhost:8000` 접속.

## 3. 사용 방법

### 회원
1. `index.html`에서 **이름 + 전화번호 뒷 4자리** 입력 → 로그인 (없으면 자동 가입)
2. 하단 네비: 홈 / 운동 / 식단 / 러닝
3. **운동**: 이번 주 처방이 있으면 회차 탭, 없으면 기본 프로그램(Day1/2/3). 세트별 중량·횟수 입력, 성공/실패 토글(성공 시 90초 타이머 자동 시작), "오늘 운동 저장"
4. **식단 / 러닝**: 입력 후 저장. 홈에서 오늘 현황과 이번 달 통계 확인

### 트레이너
1. `dashboard.html` 접속 → 비밀번호 **`greengym2024`** 입력
2. 회원 목록에서 회원 선택
3. **기록 조회** 탭: 운동/식단/러닝 최근 30건 조회
4. **운동 처방** 탭:
   - 주 시작일 선택(이번 주 월요일 기본)
   - 1~5회차 탭 선택
   - 종목(드롭다운/직접입력) + 세트 + 횟수 + 목표중량 + 워밍업 여부 + 회차 메모 입력
   - 저장하면 해당 회원의 `tracker.html`에 자동 반영(같은 주차)

## 디자인
- 메인 `#2D6A4F`, 포인트 `#C5963A`, 배경 `#F0F4F0`
- 폰트 Malgun Gothic, 카드 radius 14~16px, 하단 고정 네비

## (선택) Google Sheets 백업

운동 저장 시 Supabase 저장 후 Google Sheets로도 백업할 수 있습니다. 별도 서버 없이 Apps Script 웹앱으로 동작합니다.

1. `googlesheet.gs` 파일 상단 주석의 **배포 방법**을 따라 Apps Script 웹앱을 배포 (액세스 권한: **모든 사용자**)
2. 배포 후 받은 **웹 앱 URL**(`.../exec`)을 복사
3. `app.js` 상단의 `const SHEET_URL = 'YOUR_APPS_SCRIPT_URL';` 값을 그 URL로 교체
4. 트래커에서 "오늘 운동 저장" 시 회원별 시트 탭에 자동 기록됨

- 시트 컬럼: 날짜 / 회원명 / Day / 운동명 / 세트 / 중량 / 횟수 / 성공여부
- 회원명으로 탭 자동 생성, 이미 있으면 이어서 추가
- `SHEET_URL` 미설정(`YOUR_APPS_SCRIPT_URL`)이면 백업은 자동 건너뜀, 백업 실패해도 앱 동작엔 영향 없음

## 데이터 구조 메모
- `workout_logs.exercises`: `[{ name, sets: [{ weight, reps, result }] }]`
- `programs.exercises`: `[{ name, sets, reps, weight, warmup }]`
- 처방 회차(`session_number`)와 기록(`day`)은 정수로 매칭됩니다.
