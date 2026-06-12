/**
 * 그린짐 — 운동 기록 Google Sheets 백업용 Apps Script 웹앱
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 배포 방법                                                       │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1) sheets.google.com 에서 새 스프레드시트 생성                  │
 * │ 2) 상단 메뉴 [확장 프로그램] → [Apps Script] 클릭               │
 * │ 3) 기본 코드 전부 지우고 이 파일(googlesheet.gs) 내용 붙여넣기   │
 * │ 4) 디스크 아이콘(저장) 클릭                                     │
 * │ 5) 우측 상단 [배포] → [새 배포] 클릭                            │
 * │ 6) 유형 선택(톱니바퀴) → [웹 앱] 선택                           │
 * │ 7) 설정:                                                       │
 * │      - 설명: greengym backup (아무거나)                        │
 * │      - 다음 사용자 인증 정보로 실행: 나                         │
 * │      - 액세스 권한이 있는 사용자: "모든 사용자"  ← 꼭 이걸로!    │
 * │ 8) [배포] 클릭 → 권한 승인(본인 구글계정 허용)                  │
 * │ 9) 표시되는 "웹 앱 URL" 복사                                    │
 * │    (https://script.google.com/macros/s/..../exec 형태)         │
 * │ 10) app.js 의 SHEET_URL 값에 그 URL 을 붙여넣기                 │
 * │                                                               │
 * │ ※ 코드 수정 후 재배포: [배포] → [배포 관리] → 연필(수정) →     │
 * │   버전 "새 버전" 선택 → [배포]. URL 은 그대로 유지됩니다.      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 받는 JSON 형식 (app.js 의 backupToSheet 가 보냄):
 * {
 *   "date": "2026-06-12",
 *   "member": "홍길동",
 *   "day": "Day1 Push",            // 또는 "1회차"
 *   "exercises": [
 *     { "name": "바벨 벤치프레스",
 *       "sets": [ { "weight": 50, "reps": 10, "result": "success" }, ... ] },
 *     ...
 *   ]
 * }
 *
 * 시트 컬럼: 날짜 / 회원명 / Day / 운동명 / 세트 / 중량 / 횟수 / 성공여부
 * 회원별로 시트 탭을 자동 생성하고, 이미 있으면 그 아래에 이어서 추가합니다.
 */

var HEADERS = ["날짜", "회원명", "Day", "운동명", "세트", "중량", "횟수", "성공여부"];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // 동시 저장 충돌 방지

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 회원명으로 탭 찾기 (없으면 생성 + 헤더)
    var sheetName = sanitizeSheetName(data.member || "미지정");
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    // 운동/세트를 행 단위로 펼치기
    var rows = [];
    (data.exercises || []).forEach(function (ex) {
      (ex.sets || []).forEach(function (s, i) {
        rows.push([
          data.date || "",
          data.member || "",
          data.day || "",
          ex.name || "",
          i + 1,
          (s && s.weight != null) ? s.weight : "",
          (s && s.reps != null) ? s.reps : "",
          resultLabel(s && s.result),
        ]);
      });
    });

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    }

    return jsonOut({ ok: true, sheet: sheetName, added: rows.length });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 배포 확인용 (브라우저로 URL 열면 표시)
function doGet() {
  return jsonOut({ ok: true, service: "greengym sheet backup" });
}

function resultLabel(result) {
  if (result === "success") return "성공";
  if (result === "fail") return "실패";
  return "";
}

// 시트 탭 이름 제약문자 정리 (: \ / ? * [ ] 금지, 최대 100자)
function sanitizeSheetName(name) {
  var clean = String(name).replace(/[:\\\/?*\[\]]/g, " ").trim().slice(0, 100);
  return clean || "미지정";
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
