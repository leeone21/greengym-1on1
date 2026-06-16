// ===== Google Sheets 백업 =====
// Apps Script 웹앱 배포 후 받은 URL 로 교체하세요 (googlesheet.gs 참고)
const SHEET_URL = "YOUR_APPS_SCRIPT_URL";

// 운동 기록을 Google Sheets 로 백업 (실패해도 앱 동작에 영향 없음)
async function backupToSheet(data) {
  if (!SHEET_URL || SHEET_URL === "YOUR_APPS_SCRIPT_URL") return; // 미설정 시 건너뜀
  try {
    // 헤더를 지정하지 않아 text/plain 으로 전송됨 → CORS preflight 회피
    await fetch(SHEET_URL, { method: "POST", body: JSON.stringify(data) });
  } catch (e) {
    console.warn("시트 백업 실패 (무시)");
  }
}

// ===== 공통 유틸 =====

// 오늘 날짜 키 (YYYY-MM-DD, 로컬)
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayKey() {
  return ymd(new Date());
}

// 해당 날짜가 속한 주의 월요일
function mondayOf(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=일
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function formatKoreanDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const week = ["일", "월", "화", "수", "목", "금", "토"];
  return `${y}년 ${m}월 ${d}일 (${week[dt.getDay()]})`;
}

// 이번 달 접두사 (YYYY-MM)
function monthPrefix() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2000);
}

// 운동 기록 exercises 에서 완료(성공/실패 표시된) 세트 수 계산
function countDoneSets(exercises) {
  let done = 0;
  (exercises || []).forEach((ex) => {
    (ex.sets || []).forEach((s) => { if (s && s.result) done++; });
  });
  return done;
}

// ===== 인덱스(로그인 + 홈) =====
async function initIndexPage() {
  const user = getCurrentUser();
  if (!user) {
    showLoginView();
  } else {
    await showHomeView(user);
  }
}

function showLoginView() {
  document.getElementById("login-view").style.display = "block";
  const btn = document.getElementById("login-btn");
  const doLogin = async () => {
    const name = document.getElementById("login-name").value.trim();
    const phone = document.getElementById("login-phone").value.trim();
    if (!name || phone.length !== 4) {
      showToast("이름과 전화번호 뒷 4자리를 입력하세요");
      return;
    }
    btn.disabled = true;
    btn.textContent = "로그인 중…";
    try {
      const user = await loginMember(name, phone);
      setCurrentUser(user);
      location.reload();
    } catch (e) {
      // DB 테이블 미생성(PGRST205) 등 원인을 화면에 표시
      const tableMissing = e && (e.code === "PGRST205" || /find the table/i.test(e.message || ""));
      const msg = tableMissing
        ? "DB 테이블이 없습니다. Supabase SQL Editor에서 schema.sql을 먼저 실행하세요."
        : `로그인 실패: ${(e && e.message) || "연결을 확인하세요"}`;
      const errBox = document.getElementById("login-error");
      if (errBox) { errBox.textContent = msg; errBox.style.display = "block"; }
      showToast(tableMissing ? "schema.sql을 먼저 실행하세요" : "로그인 실패");
      btn.disabled = false;
      btn.textContent = "로그인 / 시작하기";
    }
  };
  btn.addEventListener("click", doLogin);
  document.getElementById("login-phone").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

async function showHomeView(user) {
  document.getElementById("home-view").style.display = "block";
  document.getElementById("greeting").textContent = `안녕하세요, ${user.name}님 👋`;
  document.getElementById("today-date").textContent = formatKoreanDate(todayKey());

  const tKey = todayKey();
  try {
    // 오늘 운동
    const todayWorkouts = await getWorkoutsByDate(user.id, tKey);
    let doneSets = 0, totalSets = 0;
    todayWorkouts.forEach((w) => { doneSets += countDoneSets(w.exercises); });
    todayWorkouts.forEach((w) => {
      (w.exercises || []).forEach((ex) => { totalSets += (ex.sets || []).length; });
    });
    document.getElementById("sum-workout").textContent =
      todayWorkouts.length ? `${doneSets} / ${totalSets}` : "0 / 0";

    // 오늘 식단
    const diet = await getDiet(user.id, tKey);
    const hasDiet = diet && (diet.breakfast || diet.lunch || diet.dinner || diet.snack || diet.water > 0);
    const dietEl = document.getElementById("sum-diet");
    dietEl.textContent = hasDiet ? "완료" : "미완료";
    dietEl.className = "value " + (hasDiet ? "" : "todo");

    // 러닝
    const runs = await getRunningLogs(user.id);
    const todayKm = runs.filter((r) => r.date === tKey).reduce((s, r) => s + Number(r.distance_km || 0), 0);
    document.getElementById("sum-running").textContent = `${todayKm.toFixed(1)} km`;

    const monthKm = runs.filter((r) => r.date.startsWith(monthPrefix())).reduce((s, r) => s + Number(r.distance_km || 0), 0);
    const totalKm = runs.reduce((s, r) => s + Number(r.distance_km || 0), 0);
    const pct = Math.min(100, (monthKm / MONTHLY_RUN_GOAL) * 100);
    document.getElementById("run-goal-num").textContent = `${monthKm.toFixed(1)} / ${MONTHLY_RUN_GOAL} km`;
    document.getElementById("run-goal-fill").style.width = `${pct}%`;

    // 통계 (이번 달 운동일 / 식단일은 별도 카운트)
    const monthWorkoutDays = await countMonthDays("workout_logs", user.id);
    const monthDietDays = await countMonthDays("diet_logs", user.id);
    document.getElementById("stat-workout-days").textContent = `${monthWorkoutDays}일`;
    document.getElementById("stat-total-km").textContent = `${totalKm.toFixed(1)} km`;
    document.getElementById("stat-month-km").textContent = `${monthKm.toFixed(1)} km`;
    document.getElementById("stat-diet-days").textContent = `${monthDietDays}일`;
  } catch (e) {
    showToast("데이터를 불러오지 못했습니다");
  }

  try {
    const historyEl = document.getElementById("workout-history-list");
    if (historyEl) historyEl.innerHTML = await renderMemberWorkoutHistory(user.id);
  } catch (e) { /* 무시 */ }
}

async function renderMemberWorkoutHistory(userId) {
  const { data: logs } = await db
    .from("workout_logs")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(30);

  if (!logs || !logs.length) return '<div class="empty">운동 기록이 없습니다</div>';

  return logs.map((log) => {
    const exercises = log.exercises || [];
    const doneSets = countDoneSets(exercises);
    const totalSets = exercises.reduce((s, e) => s + (e.sets || []).length, 0);
    const names = exercises.map((e) => e.name).filter(Boolean).join(", ");
    const typeLabel = log.day === 0 ? "자유기록" : log.day === 99 ? "레슨기록" : `${log.day}회차`;
    return `<div class="history-row">
      <div class="history-date">${log.date} · ${typeLabel}</div>
      <div class="history-exercises">${escapeHtml(names) || "-"}</div>
      <div class="history-sets">${doneSets} / ${totalSets} 세트 완료</div>
    </div>`;
  }).join("");
}

// 이번 달 고유 기록일 수
async function countMonthDays(table, userId) {
  const start = `${monthPrefix()}-01`;
  const { data } = await db.from(table).select("date").eq("user_id", userId).gte("date", start);
  const days = new Set((data || []).map((r) => r.date));
  return days.size;
}

// ===== 운동 트래커 =====
let trackerUser = null;
let trackerSessions = [];
let currentSessionKey = null;
const trackerState = {}; // { sessionKey: { exIdx: [ {weight,reps,result} ] } }
let freeExercises = []; // [{name, equipment, memo, sets: [{kg, reps}]}]

async function initTrackerPage() {
  trackerUser = requireAuth();
  if (!trackerUser) return;
  document.getElementById("today-date").textContent = formatKoreanDate(todayKey());

  initTimer();
  document.getElementById("finish-btn").addEventListener("click", saveCurrentSession);

  document.getElementById("exercise-list").innerHTML = '<div class="loading">불러오는 중…</div>';
  trackerSessions = await loadTrackerSessions(trackerUser);
  buildSessionTabs();
  await selectSession(trackerSessions[0].key);
}

// 이번 주 처방이 있으면 처방 세션, 없으면 기본 프로그램
async function loadTrackerSessions(user) {
  const weekStart = ymd(mondayOf(new Date()));
  let programs = [];
  try {
    programs = await getPrograms(user.id, weekStart);
  } catch (e) {
    programs = [];
  }
  if (programs.length) {
    return programs
      .sort((a, b) => a.session_number - b.session_number)
      .map((p) => ({
        key: p.session_number,
        label: `${p.session_number}회차`,
        memo: p.memo || "",
        prescribed: true,
        exercises: (p.exercises || []).map((e) => ({
          name: e.name,
          sets: Number(e.sets) || 1,
          reps: e.reps || "",
          target: Number(e.weight) || 0,
          note: e.warmup ? "워밍업 포함" : "",
        })),
      }));
  }
  // 기본 프로그램 (Day1/2/3)
  return [1, 2, 3].map((d) => ({
    key: d,
    label: WORKOUT_PROGRAM[d].label,
    memo: "",
    prescribed: false,
    exercises: WORKOUT_PROGRAM[d].exercises,
  }));
}

function buildSessionTabs() {
  const bar = document.getElementById("tab-bar");
  bar.innerHTML = trackerSessions
    .map((s) => `<div class="tab" data-key="${s.key}">${s.label}</div>`)
    .join("") + `<div class="tab" data-key="0">자유기록</div>`;
  bar.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => selectSession(Number(tab.dataset.key)));
  });
}

// ===== 운동 흐름 상태 모델 =====
// trackerState[key][exIdx] = { started_at, ended_at, sets: { setIdx: setObj } }
// setObj.status: 'idle' | 'running' | 'await' | 'resting' | 'done'
let activeSet = null;        // 스톱워치 동작 중인 세트 {exIdx,setIdx}
let stopwatchInterval = null;
let restingRef = null;       // 쉬는시간 측정 중인(직전 완료) 세트 {exIdx,setIdx}

// 로컬 시각 ISO (타임존 없이, 예: 2026-06-12T10:00:00)
function isoNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function mmss(sec) {
  const v = Math.max(0, Math.floor(sec));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}
function getExRT(exIdx) {
  const st = trackerState[currentSessionKey];
  if (!st[exIdx]) st[exIdx] = { started_at: null, ended_at: null, sets: {} };
  return st[exIdx];
}
function getSetRT(exIdx, setIdx) {
  const ex = getExRT(exIdx);
  if (!ex.sets[setIdx]) {
    ex.sets[setIdx] = { status: "idle", kg: null, reps: null, result: null, duration_sec: null, rest_sec: null };
  }
  return ex.sets[setIdx];
}

async function selectSession(key) {
  currentSessionKey = key;
  document.querySelectorAll("#tab-bar .tab").forEach((t) => {
    t.classList.toggle("active", Number(t.dataset.key) === key);
  });

  if (key === 0) {
    await initFreeMode();
    return;
  }

  // 저장된 기록을 1회만 로드해 런타임 상태로 복원
  if (!(key in trackerState)) {
    trackerState[key] = {};
    try {
      const log = await getWorkout(trackerUser.id, todayKey(), key);
      if (log && log.exercises) {
        log.exercises.forEach((e, i) => {
          const sets = {};
          (e.sets || []).forEach((s, n) => {
            const idx = (s.set_number || n + 1) - 1;
            sets[idx] = {
              status: s.result ? "done" : "idle",
              kg: s.kg ?? null,
              reps: s.reps ?? null,
              result: s.result || null,
              duration_sec: s.duration_sec ?? null,
              rest_sec: s.rest_sec ?? null,
              restDone: true,
            };
          });
          trackerState[key][i] = { started_at: e.started_at || null, ended_at: e.ended_at || null, sets };
        });
      }
    } catch (e) {
      /* 무시 */
    }
  }
  renderExercises();
}

function renderExercises() {
  const list = document.getElementById("exercise-list");
  const session = trackerSessions.find((s) => s.key === currentSessionKey);

  let html = "";
  if (session.memo) {
    html += `<div class="card" style="background:var(--color-primary-dim);box-shadow:none;">
      <div style="font-size:13px;font-weight:700;color:var(--color-primary);">📋 트레이너 메모</div>
      <div style="font-size:14px;margin-top:6px;line-height:1.5;">${escapeHtml(session.memo)}</div>
    </div>`;
  }

  if (!session.exercises.length) {
    html += `<div class="empty">처방된 운동이 없습니다.</div>`;
    list.innerHTML = html;
    return;
  }

  html += session.exercises
    .map((ex, exIdx) => {
      const rt = getExRT(exIdx);
      let rows = "";
      for (let i = 0; i < ex.sets; i++) rows += renderSetRow(ex, exIdx, i);
      const meta = `${ex.note ? ex.note + " · " : ""}${ex.reps}회`;
      const doneTag = rt.ended_at ? `<span class="ex-done">완료 ✓</span>` : "";
      return `
        <div class="card exercise-card">
          <div class="exercise-head">
            <div>
              <div class="name">${escapeHtml(ex.name)} ${doneTag}</div>
              <div class="meta">${meta}</div>
            </div>
            <span class="badge">${ex.sets} × ${ex.reps}</span>
          </div>
          ${rows}
        </div>`;
    })
    .join("");

  list.innerHTML = html;
  bindSetRows(session);
}

// 세트 1행 렌더 (상태에 따라 컨트롤이 달라짐)
function renderSetRow(ex, exIdx, setIdx) {
  const s = getSetRT(exIdx, setIdx);
  const prev = setIdx === 0 ? null : getSetRT(exIdx, setIdx - 1);
  const canStart = !activeSet && (setIdx === 0 || (prev && prev.status === "done"));
  const isCurrent = activeSet && activeSet.exIdx === exIdx && activeSet.setIdx === setIdx;
  const kg = s.kg ?? "";
  const reps = s.reps ?? "";
  let mid = "", action = "";

  if (s.status === "idle") {
    mid = `<span class="set-target">목표 ${ex.target ? ex.target + "kg · " : ""}${ex.reps}회</span>`;
    action = `<button class="flow-btn start ${canStart ? "" : "dim"}" data-act="start" ${canStart ? "" : "disabled"}>세트 시작</button>`;
  } else if (s.status === "running") {
    mid = `<input class="input mini set-weight" type="number" inputmode="decimal" placeholder="${ex.target || "kg"}" value="${kg}" />
           <input class="input mini set-reps" type="number" inputmode="numeric" placeholder="${ex.reps}" value="${reps}" />
           <span class="stopwatch" id="sw-${exIdx}-${setIdx}">⏱ 0:00</span>`;
    action = `<button class="flow-btn done" data-act="complete">세트 완료</button>`;
  } else if (s.status === "await") {
    mid = `<span class="set-info">${kg || "-"}kg × ${reps || "-"}회 · ⏱${s.duration_sec != null ? mmss(s.duration_sec) : "-"}</span>`;
    action = `<div class="set-result">
        <button class="result-btn ok" data-act="result" data-r="success">성공</button>
        <button class="result-btn no" data-act="result" data-r="fail">실패</button>
      </div>`;
  } else {
    // resting / done
    const tag = s.result === "success" ? `<span class="tag ok">성공</span>` : s.result === "fail" ? `<span class="tag no">실패</span>` : "";
    const dur = s.duration_sec != null ? `운동 ${mmss(s.duration_sec)}` : "";
    const rest = s.rest_sec != null ? ` · 휴식 ${mmss(s.rest_sec)}` : s.status === "resting" ? ` · 휴식 중…` : "";
    mid = `<span class="set-info">${kg || "-"}kg × ${reps || "-"}회</span>`;
    action = `<div class="set-summary">${tag}<span class="set-times">${dur}${rest}</span></div>`;
  }

  return `<div class="flow-set ${isCurrent ? "current" : ""} status-${s.status}" data-ex="${exIdx}" data-set="${setIdx}">
    <span class="set-no">${setIdx + 1}</span>
    <div class="set-mid">${mid}</div>
    <div class="set-action">${action}</div>
  </div>`;
}

function bindSetRows(session) {
  document.querySelectorAll(".flow-set").forEach((row) => {
    const exIdx = Number(row.dataset.ex);
    const setIdx = Number(row.dataset.set);
    const wInput = row.querySelector(".set-weight");
    const rInput = row.querySelector(".set-reps");
    if (wInput) wInput.addEventListener("input", () => { getSetRT(exIdx, setIdx).kg = wInput.value; });
    if (rInput) rInput.addEventListener("input", () => { getSetRT(exIdx, setIdx).reps = rInput.value; });
    row.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "start") startSet(exIdx, setIdx);
        else if (act === "complete") completeSet(exIdx, setIdx);
        else if (act === "result") chooseResult(exIdx, setIdx, btn.dataset.r, session);
      });
    });
  });
}

// 1) 세트 시작 → 스톱워치
function startSet(exIdx, setIdx) {
  if (activeSet) return; // 한 번에 한 세트만
  const ex = getExRT(exIdx);
  if (!ex.started_at) ex.started_at = isoNow();
  const s = getSetRT(exIdx, setIdx);
  s.status = "running";
  s._startMs = Date.now();
  activeSet = { exIdx, setIdx };
  clearInterval(stopwatchInterval);
  stopwatchInterval = setInterval(() => {
    const el = document.getElementById(`sw-${exIdx}-${setIdx}`);
    if (el && s._startMs) el.textContent = `⏱ ${mmss((Date.now() - s._startMs) / 1000)}`;
  }, 1000);
  renderExercises();
}

// 3) 세트 완료 → 운동시간 확정 후 성공/실패 선택 대기
function completeSet(exIdx, setIdx) {
  const s = getSetRT(exIdx, setIdx);
  const row = document.querySelector(`.flow-set[data-ex="${exIdx}"][data-set="${setIdx}"]`);
  if (row) {
    const w = row.querySelector(".set-weight");
    const r = row.querySelector(".set-reps");
    if (w) s.kg = w.value;
    if (r) s.reps = r.value;
  }
  s.duration_sec = Math.round((Date.now() - (s._startMs || Date.now())) / 1000);
  s.status = "await";
  clearInterval(stopwatchInterval);
  activeSet = null;
  renderExercises();
}

// 성공/실패 선택 → 4) 쉬는시간 타이머 자동 시작 (마지막 세트면 운동 종료)
function chooseResult(exIdx, setIdx, result, session) {
  const s = getSetRT(exIdx, setIdx);
  s.result = result;
  const ex = getExRT(exIdx);
  const exercise = session.exercises[exIdx];
  const isLast = setIdx === exercise.sets - 1;
  if (isLast) {
    s.status = "done";
    s.restDone = true;
    ex.ended_at = isoNow(); // 6) 운동 종료 처리
    showToast(`${exercise.name} 완료 ✓`);
  } else {
    s.status = "resting";
    s._restStartMs = Date.now();
    restingRef = { exIdx, setIdx };
    startRestTimer(isCompound(exercise.name) ? 120 : 90, () => onRestEnd(exIdx, setIdx));
  }
  saveCurrentSessionSilent();
  renderExercises();
}

// 5) 쉬는시간 종료 → 다음 세트 시작 가능
function onRestEnd(exIdx, setIdx) {
  const s = getSetRT(exIdx, setIdx);
  if (s.rest_sec == null && s._restStartMs) s.rest_sec = Math.round((Date.now() - s._restStartMs) / 1000);
  s.status = "done";
  s.restDone = true;
  restingRef = null;
  showToast("쉬는시간 끝! 다음 세트 🔔");
  if (navigator.vibrate) navigator.vibrate(400);
  renderExercises();
}

// 쉬는시간을 수동 취소(건너뛰기)할 때 — 실제 쉰 시간 기록 후 다음 세트 허용
function skipRest() {
  if (restingRef) {
    const { exIdx, setIdx } = restingRef;
    const s = getSetRT(exIdx, setIdx);
    if (s.rest_sec == null && s._restStartMs) s.rest_sec = Math.round((Date.now() - s._restStartMs) / 1000);
    s.status = "done";
    s.restDone = true;
    restingRef = null;
  }
  stopRestTimer();
  renderExercises();
}

// 복합운동 판별 (스쿼트/데드리프트/벤치프레스/오버헤드 프레스 → 2분)
function isCompound(name) {
  return /스쿼트|데드|벤치|오버헤드\s*프레스|OHP/i.test(name);
}

// 저장용 exercises 구조 생성 (요청 스키마)
function buildSaveExercises() {
  const session = trackerSessions.find((s) => s.key === currentSessionKey);
  const st = trackerState[currentSessionKey] || {};
  return session.exercises.map((ex, i) => {
    const rt = st[i] || { started_at: null, ended_at: null, sets: {} };
    const sets = [];
    for (let k = 0; k < ex.sets; k++) {
      const s = rt.sets[k];
      const touched = s && (s.result || s.kg != null || s.reps != null || s.duration_sec != null);
      if (!touched) continue;
      let rest = s.rest_sec;
      if (rest == null && s._restStartMs) rest = Math.round((Date.now() - s._restStartMs) / 1000);
      sets.push({
        set_number: k + 1,
        kg: s.kg != null && s.kg !== "" ? Number(s.kg) : null,
        reps: s.reps != null && s.reps !== "" ? Number(s.reps) : null,
        result: s.result || null,
        duration_sec: s.duration_sec != null ? s.duration_sec : null,
        rest_sec: rest != null ? rest : null,
      });
    }
    return { name: ex.name, started_at: rt.started_at || null, ended_at: rt.ended_at || null, sets };
  });
}

async function saveCurrentSessionSilent() {
  try {
    await saveWorkout(trackerUser.id, todayKey(), currentSessionKey, buildSaveExercises());
  } catch (e) {
    /* 조용히 무시 — 명시적 저장 버튼에서 에러 표시 */
  }
}

async function saveCurrentSession() {
  if (currentSessionKey === 0) {
    await saveFreeModeSession();
    return;
  }
  const session = trackerSessions.find((s) => s.key === currentSessionKey);
  const exercises = buildSaveExercises();
  if (countDoneSets(exercises) === 0) {
    showToast("세트를 먼저 완료하세요");
    return;
  }
  const btn = document.getElementById("finish-btn");
  btn.disabled = true;
  btn.textContent = "저장 중…";
  try {
    await saveWorkout(trackerUser.id, todayKey(), currentSessionKey, exercises);
    // Supabase 저장 성공 후 Google Sheets 백업 (fire-and-forget)
    backupToSheet({
      date: todayKey(),
      member: trackerUser.name,
      day: session.label,
      exercises,
    });
    showToast(`${session.label} 저장 완료 💪`);
  } catch (e) {
    showToast("저장 실패: 연결을 확인하세요");
  }
  btn.disabled = false;
  btn.textContent = "오늘 운동 저장";
}

// 쉬는시간 타이머 (화면 상단 고정, 종료 시 콜백)
let timerInterval = null, timerRemaining = 0, timerPaused = false, timerOnEnd = null;
function initTimer() {
  // 수동 선택 (1분/90초/2분/3분) — 세트 흐름과 무관하게 단독 사용
  document.querySelectorAll("#timer-presets button").forEach((btn) => {
    btn.addEventListener("click", () => startRestTimer(Number(btn.dataset.sec), null));
  });
  document.getElementById("timer-toggle").addEventListener("click", () => {
    timerPaused = !timerPaused;
    document.getElementById("timer-toggle").textContent = timerPaused ? "재개" : "일시정지";
  });
  document.getElementById("timer-reset").addEventListener("click", skipRest);
}
function startRestTimer(sec, onEnd) {
  timerRemaining = sec;
  timerPaused = false;
  timerOnEnd = onEnd || null;
  document.getElementById("timer-bar").style.display = "block";
  document.body.classList.add("timer-active");
  document.getElementById("timer-toggle").textContent = "일시정지";
  updateTimerDisplay();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (timerPaused) return;
    timerRemaining--;
    updateTimerDisplay();
    if (timerRemaining <= 0) {
      const cb = timerOnEnd;
      stopRestTimer();
      if (cb) cb();
      else {
        showToast("쉬는시간 끝! 🔔");
        if (navigator.vibrate) navigator.vibrate(400);
      }
    }
  }, 1000);
}
function updateTimerDisplay() {
  document.getElementById("timer-display").textContent = mmss(Math.max(0, timerRemaining));
}
function stopRestTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerOnEnd = null;
  document.getElementById("timer-bar").style.display = "none";
  document.body.classList.remove("timer-active");
}

// ===== 식단 =====
let dietUser = null, waterCount = 0, dietDate = null;

async function loadDietForDate(dateKey) {
  waterCount = 0;
  document.getElementById("diet-breakfast").value = "";
  document.getElementById("diet-lunch").value = "";
  document.getElementById("diet-dinner").value = "";
  document.getElementById("diet-snack").value = "";
  document.getElementById("diet-breakfast-time").value = "";
  document.getElementById("diet-lunch-time").value = "";
  document.getElementById("diet-dinner-time").value = "";
  document.getElementById("diet-snack-time").value = "";
  document.getElementById("water-count").textContent = 0;
  document.getElementById("diet-date-label").textContent = formatKoreanDate(dateKey);

  const nextBtn = document.getElementById("diet-next-day");
  nextBtn.disabled = dateKey >= todayKey();
  nextBtn.style.opacity = dateKey >= todayKey() ? "0.3" : "1";

  try {
    const diet = await getDiet(dietUser.id, dateKey);
    if (diet) {
      document.getElementById("diet-breakfast").value = diet.breakfast || "";
      document.getElementById("diet-lunch").value = diet.lunch || "";
      document.getElementById("diet-dinner").value = diet.dinner || "";
      document.getElementById("diet-snack").value = diet.snack || "";
      document.getElementById("diet-breakfast-time").value = diet.breakfast_time || "";
      document.getElementById("diet-lunch-time").value = diet.lunch_time || "";
      document.getElementById("diet-dinner-time").value = diet.dinner_time || "";
      document.getElementById("diet-snack-time").value = diet.snack_time || "";
      waterCount = diet.water || 0;
    }
  } catch (e) {
    showToast("기록을 불러오지 못했습니다");
  }
  document.getElementById("water-count").textContent = waterCount;
}

function shiftDate(dateKey, days) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() + days);
  return ymd(d);
}

async function initDietPage() {
  dietUser = requireAuth();
  if (!dietUser) return;
  dietDate = todayKey();
  document.getElementById("today-date").textContent = "";

  await loadDietForDate(dietDate);

  document.getElementById("diet-prev-day").addEventListener("click", async () => {
    dietDate = shiftDate(dietDate, -1);
    await loadDietForDate(dietDate);
  });
  document.getElementById("diet-next-day").addEventListener("click", async () => {
    if (dietDate >= todayKey()) return;
    dietDate = shiftDate(dietDate, 1);
    await loadDietForDate(dietDate);
  });

  document.getElementById("water-plus").addEventListener("click", () => {
    waterCount++;
    document.getElementById("water-count").textContent = waterCount;
  });
  document.getElementById("water-minus").addEventListener("click", () => {
    if (waterCount > 0) waterCount--;
    document.getElementById("water-count").textContent = waterCount;
  });

  document.getElementById("diet-save").addEventListener("click", async () => {
    const btn = document.getElementById("diet-save");
    btn.disabled = true;
    btn.textContent = "저장 중…";
    try {
      await saveDiet(dietUser.id, dietDate, {
        breakfast: document.getElementById("diet-breakfast").value.trim(),
        lunch: document.getElementById("diet-lunch").value.trim(),
        dinner: document.getElementById("diet-dinner").value.trim(),
        snack: document.getElementById("diet-snack").value.trim(),
        water: waterCount,
        breakfast_time: document.getElementById("diet-breakfast-time").value || null,
        lunch_time: document.getElementById("diet-lunch-time").value || null,
        dinner_time: document.getElementById("diet-dinner-time").value || null,
        snack_time: document.getElementById("diet-snack-time").value || null,
      });
      showToast("식단을 저장했어요 ✅");
    } catch (e) {
      showToast("저장 실패: 연결을 확인하세요");
    }
    btn.disabled = false;
    btn.textContent = "식단 저장";
  });
}

// ===== 자유기록 =====
async function initFreeMode() {
  await loadExerciseList();
  if (!freeExercises.length) {
    try {
      const log = await getWorkout(trackerUser.id, todayKey(), 0);
      if (log && log.exercises) {
        freeExercises = log.exercises.map((e) => ({
          name: e.name || "",
          equipment: e.equipment || null,
          memo: e.memo || "",
          sets: (e.sets || []).length
            ? e.sets.map((s) => ({ kg: s.kg != null ? String(s.kg) : "", reps: s.reps != null ? String(s.reps) : "" }))
            : [{ kg: "", reps: "" }],
        }));
      }
    } catch (e) { /* 무시 */ }
  }
  renderFreeSection();
}

function renderFreeSection() {
  const list = document.getElementById("exercise-list");
  let html = freeExercises.map((ex, i) => `
    <div class="card free-ex-card" data-i="${i}" style="margin-bottom:10px;">
      ${renderExerciseInput(ex.name, ex.equipment || null, i, false)}
      <div class="free-set-rows">
        ${(ex.sets || [{ kg: "", reps: "" }]).map((s, si) => `
          <div class="free-set-row">
            <span class="set-no">${si + 1}</span>
            <input class="input mini free-kg" type="number" inputmode="decimal" placeholder="kg" value="${escapeAttr(s.kg || "")}" />
            <input class="input mini free-reps" type="number" inputmode="numeric" placeholder="횟수" value="${escapeAttr(s.reps || "")}" />
          </div>
        `).join("")}
      </div>
      <div class="free-ex-controls">
        <button class="btn btn-outline free-add-set" data-i="${i}">+ 세트</button>
        <button class="presc-del free-del-ex" data-i="${i}">삭제</button>
      </div>
      <textarea class="input free-ex-memo" placeholder="메모 (특이사항 등)" rows="1">${escapeHtml(ex.memo || "")}</textarea>
    </div>
  `).join("");

  if (!freeExercises.length) {
    html += `<div class="empty">아래 버튼으로 종목을 추가하세요</div>`;
  }
  html += `<button class="btn btn-outline" id="free-add-ex" style="margin-bottom:8px;">+ 종목 추가</button>`;
  list.innerHTML = html;

  bindExerciseInputs(list, (wrap, name, equipment) => {
    const i = Number(wrap.dataset.exIndex);
    if (freeExercises[i]) { freeExercises[i].name = name; freeExercises[i].equipment = equipment || null; }
  }, false);

  document.getElementById("free-add-ex").addEventListener("click", () => {
    syncFreeFromDOM();
    freeExercises.push({ name: "", equipment: null, memo: "", sets: [{ kg: "", reps: "" }] });
    renderFreeSection();
  });

  list.querySelectorAll(".free-del-ex").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncFreeFromDOM();
      freeExercises.splice(Number(btn.dataset.i), 1);
      renderFreeSection();
    });
  });

  list.querySelectorAll(".free-add-set").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncFreeFromDOM();
      const i = Number(btn.dataset.i);
      if (freeExercises[i]) { freeExercises[i].sets.push({ kg: "", reps: "" }); renderFreeSection(); }
    });
  });
}

function syncFreeFromDOM() {
  const prev = freeExercises.slice();
  const cards = document.querySelectorAll("#exercise-list .free-ex-card");
  freeExercises = Array.from(cards).map((card, i) => {
    const nameInput = card.querySelector(".ex-search-input");
    const activeEq = card.querySelector(".eq-tag.active");
    const memoEl = card.querySelector(".free-ex-memo");
    const sets = Array.from(card.querySelectorAll(".free-set-row")).map((row) => ({
      kg: row.querySelector(".free-kg").value || "",
      reps: row.querySelector(".free-reps").value || "",
    }));
    return {
      name: nameInput ? nameInput.value.trim() : "",
      equipment: activeEq ? activeEq.dataset.eq : (prev[i] ? prev[i].equipment : null),
      memo: memoEl ? memoEl.value.trim() : "",
      sets: sets.length ? sets : [{ kg: "", reps: "" }],
    };
  });
}

async function saveFreeModeSession() {
  syncFreeFromDOM();
  const valid = freeExercises.filter((e) => e.name);
  if (!valid.length) { showToast("종목을 1개 이상 추가하세요"); return; }
  const btn = document.getElementById("finish-btn");
  btn.disabled = true; btn.textContent = "저장 중…";
  try {
    const exercises = valid.map((ex) => ({
      name: ex.name,
      equipment: ex.equipment || null,
      memo: ex.memo || "",
      sets: (ex.sets || []).filter((s) => s.kg || s.reps).map((s, i) => ({
        set_number: i + 1,
        kg: s.kg ? Number(s.kg) : null,
        reps: s.reps ? Number(s.reps) : null,
        result: "success",
      })),
    }));
    await saveWorkout(trackerUser.id, todayKey(), 0, exercises);
    showToast("자유기록 저장 완료 💪");
  } catch (e) { showToast("저장 실패: 연결을 확인하세요"); }
  btn.disabled = false; btn.textContent = "오늘 운동 저장";
}

// ===== 러닝 =====
let runUser = null;
async function initRunningPage() {
  runUser = requireAuth();
  if (!runUser) return;
  document.getElementById("today-date").textContent = formatKoreanDate(todayKey());
  document.getElementById("run-date").value = todayKey();

  document.getElementById("run-save").addEventListener("click", async () => {
    const date = document.getElementById("run-date").value;
    const dist = parseFloat(document.getElementById("run-distance").value);
    const dur = parseInt(document.getElementById("run-duration").value, 10);
    if (!date || !dist || dist <= 0) {
      showToast("거리를 입력하세요");
      return;
    }
    const btn = document.getElementById("run-save");
    btn.disabled = true;
    btn.textContent = "저장 중…";
    try {
      await addRunning(runUser.id, date, dist, dur || 0);
      document.getElementById("run-distance").value = "";
      document.getElementById("run-duration").value = "";
      showToast("러닝 기록을 추가했어요 🏃");
      await loadRunning();
    } catch (e) {
      showToast("저장 실패: 연결을 확인하세요");
    }
    btn.disabled = false;
    btn.textContent = "러닝 기록 추가";
  });

  await loadRunning();
}

async function loadRunning() {
  let runs = [];
  try {
    runs = await getRunningLogs(runUser.id);
  } catch (e) {
    document.getElementById("run-list").innerHTML = '<div class="empty">불러오지 못했습니다</div>';
    return;
  }
  const monthKm = runs.filter((r) => r.date.startsWith(monthPrefix())).reduce((s, r) => s + Number(r.distance_km || 0), 0);
  const totalKm = runs.reduce((s, r) => s + Number(r.distance_km || 0), 0);
  document.getElementById("run-month-km").textContent = `${monthKm.toFixed(1)} km`;
  document.getElementById("run-total-km").textContent = `${totalKm.toFixed(1)} km`;

  const list = document.getElementById("run-list");
  if (!runs.length) {
    list.innerHTML = '<div class="empty">아직 러닝 기록이 없어요</div>';
    return;
  }
  list.innerHTML = runs
    .map((r) => {
      const pace = r.duration_min ? `${r.duration_min}분 · ${(r.duration_min / r.distance_km).toFixed(1)}분/km` : "";
      return `<div class="run-item">
        <div><div class="run-date">${r.date}</div><div class="run-detail">${pace}</div></div>
        <div class="run-km">${Number(r.distance_km).toFixed(1)} km</div>
      </div>`;
    })
    .join("");
}

// ===== 종목 자동완성 =====
let _exerciseList = null;

async function loadExerciseList() {
  if (_exerciseList) return _exerciseList;
  try {
    _exerciseList = await getExercises();
  } catch (e) {
    _exerciseList = [];
  }
  return _exerciseList;
}

// allowAdd: true=트레이너(직접추가 가능), false=회원(선택만)
function renderExerciseInput(currentName, currentEquipment, exIndex, allowAdd = false) {
  const list = _exerciseList || [];
  const recentTags = list.slice(0, 8);

  const tagHtml = recentTags.map((ex) =>
    `<span class="ex-tag ${ex.name === currentName ? "active" : ""}"
      data-name="${escapeAttr(ex.name)}">${escapeHtml(ex.name)}</span>`
  ).join("");

  const selectedEx = list.find((e) => e.name === currentName);
  const equipmentOptions = selectedEx ? (selectedEx.allowed_equipment || []) : [];
  const equipmentHtml = equipmentOptions.length
    ? `<div class="ex-equipment-tags">${equipmentOptions.map((eq) =>
        `<span class="eq-tag ${eq === currentEquipment ? "active" : ""}" data-eq="${escapeAttr(eq)}">${escapeHtml(eq)}</span>`
      ).join("")}</div>`
    : "";

  return `<div class="ex-input-wrap" data-ex-index="${exIndex}">
    <div class="ex-recent-tags">${tagHtml}</div>
    <input class="input ex-search-input" type="text" placeholder="종목 검색"
      autocomplete="off" value="${escapeAttr(currentName || "")}" />
    <div class="ex-dropdown" style="display:none;"></div>
    ${equipmentHtml}
  </div>`;
}

function bindExerciseInputs(container, onSelect, allowAdd = false) {
  container.querySelectorAll(".ex-input-wrap").forEach((wrap) => {
    const input = wrap.querySelector(".ex-search-input");
    const dropdown = wrap.querySelector(".ex-dropdown");
    const tagArea = wrap.querySelector(".ex-recent-tags");

    tagArea.querySelectorAll(".ex-tag").forEach((tag) => {
      tag.addEventListener("click", () => selectExercise(wrap, tag.dataset.name, null, onSelect));
    });

    input.addEventListener("click", () => {
      renderDropdown(wrap, input.value, allowAdd, onSelect);
      dropdown.style.display = "block";
    });
    input.addEventListener("input", () => {
      renderDropdown(wrap, input.value, allowAdd, onSelect);
      dropdown.style.display = "block";
    });
    input.addEventListener("blur", () => {
      setTimeout(() => { dropdown.style.display = "none"; }, 150);
    });
  });
}

function renderDropdown(wrap, query, allowAdd, onSelect) {
  const dropdown = wrap.querySelector(".ex-dropdown");
  const list = _exerciseList || [];
  const q = (query || "").trim();
  const categories = ["가슴", "등", "어깨", "하체", "팔", "코어", "유산소"];

  let html = "";
  categories.forEach((cat) => {
    const items = list.filter((e) => e.category === cat && (!q || e.name.includes(q)));
    if (!items.length) return;
    html += `<div class="ex-dropdown-category">${cat}</div>`;
    items.forEach((ex) => {
      const eq = JSON.stringify(ex.allowed_equipment || []).replace(/'/g, "&#39;");
      html += `<div class="ex-dropdown-item" data-name="${escapeAttr(ex.name)}" data-equipment='${eq}'>${escapeHtml(ex.name)}</div>`;
    });
  });

  const others = list.filter((e) => !categories.includes(e.category) && (!q || e.name.includes(q)));
  if (others.length) {
    html += `<div class="ex-dropdown-category">기타</div>`;
    others.forEach((ex) => {
      const eq = JSON.stringify(ex.allowed_equipment || []).replace(/'/g, "&#39;");
      html += `<div class="ex-dropdown-item" data-name="${escapeAttr(ex.name)}" data-equipment='${eq}'>${escapeHtml(ex.name)}</div>`;
    });
  }

  if (allowAdd && q && !list.find((e) => e.name === q)) {
    html += `<div class="ex-dropdown-item ex-dropdown-custom" data-name="${escapeAttr(q)}" data-equipment='[]'>"${escapeHtml(q)}" 직접 추가 →</div>`;
  }

  dropdown.innerHTML = html || `<div class="ex-dropdown-empty">검색 결과 없음</div>`;

  dropdown.querySelectorAll(".ex-dropdown-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const name = item.dataset.name;
      dropdown.style.display = "none";
      if (item.classList.contains("ex-dropdown-custom") && allowAdd) {
        saveCustomExercise(name).then(() => selectExercise(wrap, name, null, onSelect));
      } else {
        selectExercise(wrap, name, null, onSelect);
      }
    });
  });
}

function selectExercise(wrap, name, equipment, onSelect) {
  const input = wrap.querySelector(".ex-search-input");
  if (input) input.value = name;

  wrap.querySelectorAll(".ex-tag").forEach((t) =>
    t.classList.toggle("active", t.dataset.name === name));

  const list = _exerciseList || [];
  const ex = list.find((e) => e.name === name);
  const equipmentOptions = ex ? (ex.allowed_equipment || []) : [];

  let eqArea = wrap.querySelector(".ex-equipment-tags");
  if (equipmentOptions.length) {
    const eqHtml = equipmentOptions.map((eq) =>
      `<span class="eq-tag ${eq === equipment ? "active" : ""}" data-eq="${escapeAttr(eq)}">${escapeHtml(eq)}</span>`
    ).join("");
    if (!eqArea) {
      eqArea = document.createElement("div");
      eqArea.className = "ex-equipment-tags";
      wrap.appendChild(eqArea);
    }
    eqArea.innerHTML = eqHtml;
    eqArea.querySelectorAll(".eq-tag").forEach((tag) => {
      tag.addEventListener("click", () => {
        eqArea.querySelectorAll(".eq-tag").forEach((t) => t.classList.toggle("active", t === tag));
        onSelect(wrap, name, tag.dataset.eq);
      });
    });
  } else if (eqArea) {
    eqArea.remove();
  }

  onSelect(wrap, name, equipment);
}

async function saveCustomExercise(name, category = "기타") {
  try {
    const ex = await addExercise(name, category, []);
    if (ex && _exerciseList) _exerciseList.unshift(ex);
  } catch (e) {
    console.warn("종목 추가 실패:", e);
  }
}

// ===== 트레이너 대시보드 =====
const DASH_SESSION_KEY = "greengym_trainer";
let detailMember = null;
let recordTab = "workout";
let prescWeek = null;     // Date (월요일)
let prescSession = 1;     // 1~5
let prescExercises = [];  // [{name, sets, reps, weight, warmup}]
let prescMemo = "";
let lessonExercises = []; // [{name, equipment, sets: [{kg, reps}]}]
let lessonDate = null;

function trainerLogout() {
  sessionStorage.removeItem(DASH_SESSION_KEY);
  location.href = "index.html";
}

function initDashboardPage() {
  document.getElementById("today-date").textContent = formatKoreanDate(todayKey());
  if (sessionStorage.getItem(DASH_SESSION_KEY) === "1") {
    enterDashboard();
  } else {
    document.getElementById("gate-view").style.display = "block";
    const submit = () => {
      const pw = document.getElementById("trainer-pw").value;
      if (pw === TRAINER_PASSWORD) {
        sessionStorage.setItem(DASH_SESSION_KEY, "1");
        document.getElementById("gate-view").style.display = "none";
        enterDashboard();
      } else {
        showToast("비밀번호가 올바르지 않습니다");
      }
    };
    document.getElementById("gate-btn").addEventListener("click", submit);
    document.getElementById("trainer-pw").addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }
}

async function enterDashboard() {
  document.getElementById("dash-view").style.display = "block";
  // 상세 상위 탭(기록/처방) 바인딩
  document.querySelectorAll("#member-detail-view .mode-tabs .dtab").forEach((tab) => {
    tab.addEventListener("click", () => switchDetailMode(tab.dataset.mode));
  });
  // 기록 조회 하위 탭
  document.querySelectorAll("#records-mode .detail-tabs .dtab").forEach((tab) => {
    tab.addEventListener("click", () => {
      recordTab = tab.dataset.tab;
      document.querySelectorAll("#records-mode .detail-tabs .dtab").forEach((t) =>
        t.classList.toggle("active", t.dataset.tab === recordTab));
      renderRecords();
    });
  });
  await loadMembers();
}

async function loadMembers() {
  const listEl = document.getElementById("member-list");
  let members = [];
  try {
    members = await getAllMembers();
  } catch (e) {
    listEl.innerHTML = '<div class="empty">회원을 불러오지 못했습니다</div>';
    return;
  }
  document.getElementById("member-count").textContent = `${members.length}명`;
  if (!members.length) {
    listEl.innerHTML = '<div class="empty">등록된 회원이 없습니다</div>';
    return;
  }
  listEl.innerHTML = members
    .map((m) => `<div class="member-item" data-id="${m.id}" data-name="${escapeHtml(m.name)}">
      <div><div class="m-name">${escapeHtml(m.name)}</div><div class="m-phone">···${m.phone_last4}</div></div>
      <span class="m-arrow">›</span>
    </div>`)
    .join("");
  listEl.querySelectorAll(".member-item").forEach((item) => {
    item.addEventListener("click", () => openMemberDetail({ id: item.dataset.id, name: item.dataset.name }));
  });
}

function openMemberDetail(member) {
  detailMember = member;
  lessonDate = null;
  lessonExercises = [];
  document.getElementById("member-list-view").style.display = "none";
  document.getElementById("member-detail-view").style.display = "block";
  document.getElementById("detail-name").textContent = `${member.name} 회원`;
  switchDetailMode("records");
}

function backToMemberList() {
  document.getElementById("member-detail-view").style.display = "none";
  document.getElementById("member-list-view").style.display = "block";
}

function switchDetailMode(mode) {
  document.querySelectorAll("#member-detail-view .mode-tabs .dtab").forEach((t) =>
    t.classList.toggle("active", t.dataset.mode === mode));
  document.getElementById("records-mode").style.display = mode === "records" ? "block" : "none";
  document.getElementById("prescribe-mode").style.display = mode === "prescribe" ? "block" : "none";
  document.getElementById("lesson-mode").style.display = mode === "lesson" ? "block" : "none";
  if (mode === "records") renderRecords();
  else if (mode === "prescribe") initPrescribe();
  else if (mode === "lesson") initLesson();
}

// ----- 기록 조회 -----
async function renderRecords() {
  const body = document.getElementById("detail-body");
  body.innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    if (recordTab === "workout") {
      const logs = await getMemberWorkouts(detailMember.id);
      body.innerHTML = logs.length
        ? logs.map((l) => {
            const done = countDoneSets(l.exercises);
            const names = (l.exercises || []).map((e) => e.name).join(", ");
            return `<div class="log-row"><div class="log-date">${l.date} · ${l.day}회차/Day</div>
              <div class="log-body">${escapeHtml(names) || "-"}<br>완료 세트: ${done}개</div></div>`;
          }).join("")
        : '<div class="empty">운동 기록이 없습니다</div>';
    } else if (recordTab === "diet") {
      const logs = await getMemberDiets(detailMember.id);
      body.innerHTML = logs.length
        ? logs.map((l) => `<div class="log-row"><div class="log-date">${l.date}</div>
            <div class="log-body">
              아침: ${escapeHtml(l.breakfast || "-")}<br>
              점심: ${escapeHtml(l.lunch || "-")}<br>
              저녁: ${escapeHtml(l.dinner || "-")}<br>
              간식: ${escapeHtml(l.snack || "-")} · 물 ${l.water || 0}잔
            </div></div>`).join("")
        : '<div class="empty">식단 기록이 없습니다</div>';
    } else {
      const logs = await getMemberRunning(detailMember.id);
      body.innerHTML = logs.length
        ? logs.map((l) => `<div class="run-item">
            <div><div class="run-date">${l.date}</div><div class="run-detail">${l.duration_min || 0}분</div></div>
            <div class="run-km">${Number(l.distance_km || 0).toFixed(1)} km</div></div>`).join("")
        : '<div class="empty">러닝 기록이 없습니다</div>';
    }
  } catch (e) {
    body.innerHTML = '<div class="empty">불러오지 못했습니다</div>';
  }
}

// ----- 운동 처방 -----
function initPrescribe() {
  if (!prescWeek) prescWeek = mondayOf(new Date());
  const weekInput = document.getElementById("presc-week");
  weekInput.value = ymd(prescWeek);
  weekInput.onchange = () => {
    prescWeek = mondayOf(new Date(weekInput.value + "T00:00:00"));
    weekInput.value = ymd(prescWeek);
    loadPrescription();
  };

  // 회차 탭
  const tabs = document.getElementById("session-tabs");
  tabs.innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<div class="dtab ${n === prescSession ? "active" : ""}" data-session="${n}">${n}회차</div>`)
    .join("");
  tabs.querySelectorAll(".dtab").forEach((t) => {
    t.addEventListener("click", () => {
      prescSession = Number(t.dataset.session);
      tabs.querySelectorAll(".dtab").forEach((x) => x.classList.toggle("active", Number(x.dataset.session) === prescSession));
      loadPrescription();
    });
  });

  loadPrescription();
}

async function loadPrescription() {
  await loadExerciseList();
  const editor = document.getElementById("presc-editor");
  editor.innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    const programs = await getPrograms(detailMember.id, ymd(prescWeek));
    const existing = programs.find((p) => p.session_number === prescSession);
    if (existing) {
      prescExercises = (existing.exercises || []).map((e) => ({
        name: e.name || "",
        equipment: e.equipment || null,
        sets: e.sets || 4,
        reps: e.reps || "10~12",
        weight: e.weight || 0,
        warmup: !!e.warmup,
      }));
      prescMemo = existing.memo || "";
    } else {
      prescExercises = [];
      prescMemo = "";
    }
  } catch (e) {
    prescExercises = [];
    prescMemo = "";
  }
  renderPrescEditor();
}

// 종목 select 옵션 생성
function buildExerciseOptions(selected) {
  let opts = '<option value="">종목 선택</option>';
  Object.keys(EXERCISE_CATALOG).forEach((cat) => {
    opts += `<optgroup label="${cat}">`;
    EXERCISE_CATALOG[cat].forEach((name) => {
      opts += `<option value="${name}" ${name === selected ? "selected" : ""}>${name}</option>`;
    });
    opts += `</optgroup>`;
  });
  const isCustom = selected && !isInCatalog(selected);
  opts += `<option value="__custom__" ${isCustom ? "selected" : ""}>+ 직접 입력</option>`;
  return opts;
}
function isInCatalog(name) {
  return Object.values(EXERCISE_CATALOG).some((arr) => arr.includes(name));
}

function renderPrescEditor() {
  const editor = document.getElementById("presc-editor");
  let html = "";
  prescExercises.forEach((ex, i) => {
    html += `<div class="presc-ex" data-i="${i}">
      ${renderExerciseInput(ex.name, ex.equipment || null, i, true)}
      <div class="presc-grid">
        <div><label>세트</label><input class="input presc-sets" type="number" inputmode="numeric" value="${ex.sets}" /></div>
        <div><label>횟수</label><input class="input presc-reps" type="text" value="${escapeAttr(ex.reps)}" placeholder="10~12" /></div>
        <div><label>중량(kg)</label><input class="input presc-weight" type="number" inputmode="decimal" value="${ex.weight || ""}" placeholder="0" /></div>
      </div>
      <div class="presc-foot">
        <label class="presc-warmup"><input type="checkbox" class="presc-warmup-cb" ${ex.warmup ? "checked" : ""} /> 워밍업 포함</label>
        <button class="presc-del" data-i="${i}">삭제</button>
      </div>
    </div>`;
  });

  html += `<button class="btn btn-outline" id="presc-add" style="margin-bottom:12px;">+ 종목 추가</button>`;
  html += `<div class="diet-field"><label>회차 메모</label>
    <textarea id="presc-memo" placeholder="예: 벤치프레스 그립 넓게, 천천히">${escapeHtml(prescMemo)}</textarea></div>`;
  html += `<button class="btn btn-primary" id="presc-save">${prescSession}회차 처방 저장</button>`;
  editor.innerHTML = html;

  bindExerciseInputs(editor, (wrap, name, equipment) => {
    const i = Number(wrap.dataset.exIndex);
    if (prescExercises[i]) {
      prescExercises[i].name = name;
      prescExercises[i].equipment = equipment || null;
    }
  }, true);

  editor.querySelectorAll(".presc-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncPrescFromDOM();
      prescExercises.splice(Number(btn.dataset.i), 1);
      renderPrescEditor();
    });
  });
  document.getElementById("presc-add").addEventListener("click", () => {
    syncPrescFromDOM();
    prescExercises.push({ name: "", equipment: null, sets: 4, reps: "10~12", weight: 0, warmup: false });
    renderPrescEditor();
  });
  document.getElementById("presc-save").addEventListener("click", savePrescription);
}

// DOM 입력값을 prescExercises/prescMemo 로 동기화
function syncPrescFromDOM() {
  const prev = prescExercises.slice();
  const rows = document.querySelectorAll("#presc-editor .presc-ex");
  prescExercises = Array.from(rows).map((row, i) => {
    const nameInput = row.querySelector(".ex-search-input");
    const activeEq = row.querySelector(".eq-tag.active");
    return {
      name: nameInput ? nameInput.value.trim() : "",
      equipment: activeEq ? activeEq.dataset.eq : (prev[i] ? prev[i].equipment : null),
      sets: parseInt(row.querySelector(".presc-sets").value, 10) || 1,
      reps: row.querySelector(".presc-reps").value.trim(),
      weight: parseFloat(row.querySelector(".presc-weight").value) || 0,
      warmup: row.querySelector(".presc-warmup-cb").checked,
    };
  });
  const memoEl = document.getElementById("presc-memo");
  if (memoEl) prescMemo = memoEl.value;
}

async function savePrescription() {
  syncPrescFromDOM();
  const valid = prescExercises.filter((e) => e.name);
  if (!valid.length) {
    showToast("운동 종목을 1개 이상 추가하세요");
    return;
  }
  const btn = document.getElementById("presc-save");
  btn.disabled = true;
  btn.textContent = "저장 중…";
  try {
    await saveProgram(detailMember.id, ymd(prescWeek), prescSession, valid, prescMemo);
    showToast(`${prescSession}회차 처방을 저장했어요 ✅`);
  } catch (e) {
    showToast("저장 실패: 연결을 확인하세요");
  }
  btn.disabled = false;
  btn.textContent = `${prescSession}회차 처방 저장`;
}

// ----- 레슨 기록 -----
async function initLesson() {
  await loadExerciseList();
  if (!lessonDate) lessonDate = todayKey();
  try {
    const log = await getWorkout(detailMember.id, lessonDate, 99);
    if (log && log.exercises) {
      lessonExercises = log.exercises.map((e) => ({
        name: e.name || "",
        equipment: e.equipment || null,
        sets: (e.sets || []).length
          ? e.sets.map((s) => ({ kg: s.kg != null ? String(s.kg) : "", reps: s.reps != null ? String(s.reps) : "" }))
          : [{ kg: "", reps: "" }],
      }));
    } else {
      lessonExercises = [];
    }
  } catch (e) {
    lessonExercises = [];
  }
  renderLessonEditor();
}

function renderLessonEditor() {
  const container = document.getElementById("lesson-mode");
  let html = `<div class="card" style="margin-bottom:10px;">
    <div class="field-row" style="margin-bottom:0;">
      <label>날짜</label>
      <input class="input" type="date" id="lesson-date-input" value="${escapeAttr(lessonDate || todayKey())}" />
    </div>
  </div><div id="lesson-editor">`;

  lessonExercises.forEach((ex, i) => {
    html += `<div class="presc-ex" data-i="${i}">
      ${renderExerciseInput(ex.name, ex.equipment || null, i, true)}
      <div class="free-set-rows">
        ${(ex.sets || [{ kg: "", reps: "" }]).map((s, si) => `
          <div class="free-set-row">
            <span class="set-no">${si + 1}</span>
            <input class="input mini free-kg" type="number" inputmode="decimal" placeholder="kg" value="${escapeAttr(s.kg || "")}" />
            <input class="input mini free-reps" type="number" inputmode="numeric" placeholder="횟수" value="${escapeAttr(s.reps || "")}" />
          </div>
        `).join("")}
      </div>
      <div class="free-ex-controls">
        <button class="btn btn-outline free-add-set" data-i="${i}">+ 세트</button>
        <button class="presc-del lesson-del-ex" data-i="${i}">삭제</button>
      </div>
    </div>`;
  });

  html += `</div>
  <button class="btn btn-outline" id="lesson-add-ex" style="margin-bottom:12px;">+ 종목 추가</button>
  <button class="btn btn-primary" id="lesson-save">레슨 기록 저장</button>`;

  container.innerHTML = html;

  document.getElementById("lesson-date-input").addEventListener("change", async (e) => {
    syncLessonFromDOM();
    lessonDate = e.target.value;
    lessonExercises = [];
    await initLesson();
  });

  const editor = document.getElementById("lesson-editor");
  bindExerciseInputs(editor, (wrap, name, equipment) => {
    const i = Number(wrap.dataset.exIndex);
    if (lessonExercises[i]) { lessonExercises[i].name = name; lessonExercises[i].equipment = equipment || null; }
  }, true);

  document.getElementById("lesson-add-ex").addEventListener("click", () => {
    syncLessonFromDOM();
    lessonExercises.push({ name: "", equipment: null, sets: [{ kg: "", reps: "" }] });
    renderLessonEditor();
  });

  editor.querySelectorAll(".lesson-del-ex").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncLessonFromDOM();
      lessonExercises.splice(Number(btn.dataset.i), 1);
      renderLessonEditor();
    });
  });

  editor.querySelectorAll(".free-add-set").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncLessonFromDOM();
      const i = Number(btn.dataset.i);
      if (lessonExercises[i]) { lessonExercises[i].sets.push({ kg: "", reps: "" }); renderLessonEditor(); }
    });
  });

  document.getElementById("lesson-save").addEventListener("click", saveLesson);
}

function syncLessonFromDOM() {
  const prev = lessonExercises.slice();
  const cards = document.querySelectorAll("#lesson-editor .presc-ex");
  lessonExercises = Array.from(cards).map((card, i) => {
    const nameInput = card.querySelector(".ex-search-input");
    const activeEq = card.querySelector(".eq-tag.active");
    const sets = Array.from(card.querySelectorAll(".free-set-row")).map((row) => ({
      kg: row.querySelector(".free-kg").value || "",
      reps: row.querySelector(".free-reps").value || "",
    }));
    return {
      name: nameInput ? nameInput.value.trim() : "",
      equipment: activeEq ? activeEq.dataset.eq : (prev[i] ? prev[i].equipment : null),
      sets: sets.length ? sets : [{ kg: "", reps: "" }],
    };
  });
}

async function saveLesson() {
  syncLessonFromDOM();
  const valid = lessonExercises.filter((e) => e.name);
  if (!valid.length) { showToast("종목을 1개 이상 입력하세요"); return; }
  const btn = document.getElementById("lesson-save");
  btn.disabled = true; btn.textContent = "저장 중…";
  try {
    const exercises = valid.map((ex) => ({
      name: ex.name,
      equipment: ex.equipment || null,
      sets: (ex.sets || []).filter((s) => s.kg || s.reps).map((s, i) => ({
        set_number: i + 1,
        kg: s.kg ? Number(s.kg) : null,
        reps: s.reps ? Number(s.reps) : null,
        result: "success",
      })),
    }));
    await saveWorkout(detailMember.id, lessonDate || todayKey(), 99, exercises);
    showToast("레슨 기록 저장 완료 ✅");
  } catch (e) { showToast("저장 실패: 연결을 확인하세요"); }
  btn.disabled = false; btn.textContent = "레슨 기록 저장";
}

// ===== 종목 관리 (트레이너) =====
function toggleExerciseManager() {
  const managerView = document.getElementById("exercise-manager-view");
  const memberListView = document.getElementById("member-list-view");
  const isHidden = managerView.style.display === "none";
  managerView.style.display = isHidden ? "block" : "none";
  memberListView.style.display = isHidden ? "none" : "block";
  if (isHidden) renderExerciseManager();
}

async function renderExerciseManager() {
  const container = document.getElementById("exercise-manager-container");
  container.innerHTML = '<div class="loading">불러오는 중…</div>';
  _exerciseList = null; // 항상 최신 목록 조회
  await loadExerciseList();
  const list = _exerciseList || [];
  const categories = ["가슴", "등", "어깨", "하체", "팔", "코어", "유산소", "기타"];

  let html = `<div class="ex-manager-header"><h3>종목 관리</h3><span style="font-size:13px;color:var(--color-text-muted);">${list.length}개 활성</span></div>`;

  categories.forEach((cat) => {
    const items = list.filter((e) => e.category === cat);
    if (!items.length) return;
    html += `<div class="ex-manager-category"><strong>${cat}</strong>`;
    items.forEach((ex) => {
      html += `<div class="ex-manager-row">
        <span style="flex:1;">${escapeHtml(ex.name)}</span>
        <span class="ex-manager-eq">${(ex.allowed_equipment || []).join(", ") || "장비 없음"}</span>
        <button class="ex-manager-toggle ${ex.is_active ? "" : "inactive"}"
          data-id="${ex.id}" data-active="${ex.is_active}">
          ${ex.is_active ? "활성" : "비활성"}
        </button>
      </div>`;
    });
    html += `</div>`;
  });

  html += `<div class="ex-add-form">
    <input class="input" id="new-ex-name" type="text" placeholder="새 종목명" />
    <select class="input" id="new-ex-category">
      ${categories.map((c) => `<option value="${c}">${c}</option>`).join("")}
    </select>
    <button class="btn btn-primary" id="new-ex-save">종목 추가</button>
  </div>`;

  container.innerHTML = html;

  container.querySelectorAll(".ex-manager-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isActive = btn.dataset.active === "true";
      try {
        await toggleExercise(btn.dataset.id, !isActive);
        await renderExerciseManager();
      } catch (e) {
        showToast("변경 실패: 연결을 확인하세요");
      }
    });
  });

  document.getElementById("new-ex-save").addEventListener("click", async () => {
    const name = document.getElementById("new-ex-name").value.trim();
    const category = document.getElementById("new-ex-category").value;
    if (!name) { showToast("종목명을 입력하세요"); return; }
    try {
      await addExercise(name, category, []);
      _exerciseList = null;
      showToast(`${name} 추가 완료`);
      await renderExerciseManager();
    } catch (e) {
      showToast("추가 실패: 이미 존재하는 종목명일 수 있습니다");
    }
  });
}

// ===== HTML 이스케이프 =====
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}
function escapeAttr(str) {
  return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
