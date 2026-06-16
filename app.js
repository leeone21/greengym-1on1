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

async function initTrackerPage() {
  trackerUser = requireAuth();
  if (!trackerUser) return;
  document.getElementById("today-date").textContent = formatKoreanDate(todayKey());

  initTimer();

  // 모드 탭 전환
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      const mode = tab.dataset.mode;
      document.querySelectorAll(".mode-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.getElementById("free-section").style.display = mode === "free" ? "block" : "none";
      document.getElementById("homework-section").style.display = mode === "homework" ? "block" : "none";
      if (mode === "free") await initFreeMode();
      else if (mode === "homework") await initHomeworkMode();
    });
  });

  // 기본: 자유 기록
  await initFreeMode();
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
    .join("");
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
      });
      showToast("식단을 저장했어요 ✅");
    } catch (e) {
      showToast("저장 실패: 연결을 확인하세요");
    }
    btn.disabled = false;
    btn.textContent = "식단 저장";
  });
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

// ===== 트레이너 대시보드 =====
const DASH_SESSION_KEY = "greengym_trainer";
let detailMember = null;
let recordTab = "workout";
let prescWeek = null;     // Date (월요일)
let prescSession = 1;     // 1~5
let prescExercises = [];  // [{name, sets, reps, weight, warmup}]
let prescMemo = "";
let prescIsHomework = false;

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
  const editor = document.getElementById("presc-editor");
  editor.innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    const programs = await getPrograms(detailMember.id, ymd(prescWeek));
    const existing = programs.find((p) => p.session_number === prescSession);
    if (existing) {
      prescExercises = (existing.exercises || []).map((e) => ({
        name: e.name || "",
        sets: e.sets || 4,
        reps: e.reps || "10~12",
        weight: e.weight || 0,
        warmup: !!e.warmup,
      }));
      prescMemo = existing.memo || "";
      prescIsHomework = !!existing.is_homework;
    } else {
      prescExercises = [];
      prescMemo = "";
      prescIsHomework = false;
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
    const custom = ex.name && !isInCatalog(ex.name);
    html += `<div class="presc-ex" data-i="${i}">
      <div class="presc-row">
        <select class="input presc-name">${buildExerciseOptions(ex.name)}</select>
      </div>
      <div class="presc-row presc-custom" style="${custom ? "" : "display:none;"}">
        <input class="input presc-customname" type="text" placeholder="종목 직접 입력" value="${custom ? escapeAttr(ex.name) : ""}" />
      </div>
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
  html += `<label class="presc-warmup" style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
    <input type="checkbox" id="presc-is-homework" ${prescIsHomework ? "checked" : ""} />
    📌 숙제로 지정 (회원 숙제 탭에 표시)
  </label>`;
  html += `<button class="btn btn-primary" id="presc-save">${prescSession}회차 처방 저장</button>`;
  editor.innerHTML = html;

  // 종목 select 변경 → 직접입력 토글
  editor.querySelectorAll(".presc-name").forEach((sel) => {
    sel.addEventListener("change", () => {
      const row = sel.closest(".presc-ex");
      const customRow = row.querySelector(".presc-custom");
      customRow.style.display = sel.value === "__custom__" ? "block" : "none";
    });
  });
  editor.querySelectorAll(".presc-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncPrescFromDOM();
      prescExercises.splice(Number(btn.dataset.i), 1);
      renderPrescEditor();
    });
  });
  document.getElementById("presc-add").addEventListener("click", () => {
    syncPrescFromDOM();
    prescExercises.push({ name: "", sets: 4, reps: "10~12", weight: 0, warmup: false });
    renderPrescEditor();
  });
  document.getElementById("presc-save").addEventListener("click", savePrescription);
}

// DOM 입력값을 prescExercises/prescMemo 로 동기화
function syncPrescFromDOM() {
  const rows = document.querySelectorAll("#presc-editor .presc-ex");
  prescExercises = Array.from(rows).map((row) => {
    const sel = row.querySelector(".presc-name").value;
    const name = sel === "__custom__" ? row.querySelector(".presc-customname").value.trim() : sel;
    return {
      name,
      sets: parseInt(row.querySelector(".presc-sets").value, 10) || 1,
      reps: row.querySelector(".presc-reps").value.trim(),
      weight: parseFloat(row.querySelector(".presc-weight").value) || 0,
      warmup: row.querySelector(".presc-warmup-cb").checked,
    };
  });
  const memoEl = document.getElementById("presc-memo");
  if (memoEl) prescMemo = memoEl.value;
  const hwEl = document.getElementById("presc-is-homework");
  if (hwEl) prescIsHomework = hwEl.checked;
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
    await saveProgram(detailMember.id, ymd(prescWeek), prescSession, valid, prescMemo, prescIsHomework);
    showToast(`${prescSession}회차 처방을 저장했어요 ✅`);
  } catch (e) {
    showToast("저장 실패: 연결을 확인하세요");
  }
  btn.disabled = false;
  btn.textContent = `${prescSession}회차 처방 저장`;
}

// ===== 자유 기록 =====
let freeExercises = [];

async function initFreeMode() {
  try {
    const { data } = await db
      .from("workout_logs")
      .select("*")
      .eq("user_id", trackerUser.id)
      .eq("date", todayKey())
      .eq("type", "free")
      .limit(1);
    freeExercises = (data && data.length) ? (data[0].exercises || []) : [];
  } catch (e) {
    freeExercises = [];
  }
  renderFreeSection();
}

function renderFreeSection() {
  const section = document.getElementById("free-section");
  let html = "";

  freeExercises.forEach((ex, i) => {
    html += `<div class="card exercise-card free-ex-card" data-ex="${i}">
      <div class="free-ex-header">
        <input class="input free-ex-name" type="text" placeholder="운동 종목명" value="${escapeAttr(ex.name || "")}" />
        <button class="free-ex-del" data-ex="${i}">×</button>
      </div>`;
    (ex.sets || []).forEach((s, si) => {
      html += `<div class="free-set-row" data-set="${si}">
        <span class="set-no">${si + 1}</span>
        <input class="input mini free-set-kg" type="number" inputmode="decimal" placeholder="kg" value="${s.kg != null ? s.kg : ""}" />
        <span>×</span>
        <input class="input mini free-set-reps" type="number" inputmode="numeric" placeholder="회" value="${s.reps != null ? s.reps : ""}" />
        <div class="free-result-btns">
          <button class="result-btn ok ${s.result === "success" ? "active" : ""}" data-act="result" data-r="success" data-ex="${i}" data-set="${si}">✓</button>
          <button class="result-btn no ${s.result === "fail" ? "active" : ""}" data-act="result" data-r="fail" data-ex="${i}" data-set="${si}">✗</button>
        </div>
        <button class="free-set-del" data-ex="${i}" data-set="${si}">×</button>
      </div>`;
    });
    html += `<button class="btn btn-outline free-add-set" data-ex="${i}" style="margin-top:6px;font-size:13px;padding:6px 12px;">+ 세트 추가</button>
    </div>`;
  });

  html += `<button class="btn btn-outline" id="free-add-ex" style="width:100%;margin:12px 0;">+ 종목 추가</button>`;
  html += `<button class="btn btn-primary" id="free-save">자유 운동 저장</button>`;
  section.innerHTML = html;

  document.getElementById("free-add-ex").addEventListener("click", () => {
    syncFreeFromDOM();
    freeExercises.push({ name: "", sets: [{ kg: null, reps: null, result: null }] });
    renderFreeSection();
  });
  document.querySelectorAll(".free-add-set").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncFreeFromDOM();
      freeExercises[Number(btn.dataset.ex)].sets.push({ kg: null, reps: null, result: null });
      renderFreeSection();
    });
  });
  document.querySelectorAll(".free-ex-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncFreeFromDOM();
      freeExercises.splice(Number(btn.dataset.ex), 1);
      renderFreeSection();
    });
  });
  document.querySelectorAll(".free-set-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncFreeFromDOM();
      freeExercises[Number(btn.dataset.ex)].sets.splice(Number(btn.dataset.set), 1);
      renderFreeSection();
    });
  });
  document.querySelectorAll("[data-act='result']").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncFreeFromDOM();
      freeExercises[Number(btn.dataset.ex)].sets[Number(btn.dataset.set)].result = btn.dataset.r;
      renderFreeSection();
    });
  });
  document.getElementById("free-save").addEventListener("click", saveFreeWorkout);
}

function syncFreeFromDOM() {
  document.querySelectorAll(".free-ex-card").forEach((card, i) => {
    if (!freeExercises[i]) return;
    freeExercises[i].name = card.querySelector(".free-ex-name").value.trim();
    card.querySelectorAll(".free-set-row").forEach((row, si) => {
      if (!freeExercises[i].sets[si]) return;
      freeExercises[i].sets[si].kg = parseFloat(row.querySelector(".free-set-kg").value) || null;
      freeExercises[i].sets[si].reps = parseInt(row.querySelector(".free-set-reps").value, 10) || null;
    });
  });
}

async function saveFreeWorkout() {
  syncFreeFromDOM();
  const valid = freeExercises.filter((e) => e.name);
  if (!valid.length) { showToast("종목을 1개 이상 추가하세요"); return; }
  const btn = document.getElementById("free-save");
  btn.disabled = true;
  btn.textContent = "저장 중…";
  try {
    const { data: existing } = await db
      .from("workout_logs").select("id")
      .eq("user_id", trackerUser.id).eq("date", todayKey()).eq("type", "free").limit(1);
    if (existing && existing.length) {
      await db.from("workout_logs").update({ exercises: valid }).eq("id", existing[0].id);
    } else {
      await db.from("workout_logs").insert({ user_id: trackerUser.id, date: todayKey(), day: 0, type: "free", exercises: valid });
    }
    showToast("자유 운동 저장 완료 💪");
  } catch (e) {
    showToast("저장 실패: 연결을 확인하세요");
  }
  btn.disabled = false;
  btn.textContent = "자유 운동 저장";
}

// ===== 숙제 확인 =====
async function initHomeworkMode() {
  const section = document.getElementById("homework-section");
  section.innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    const weekStart = ymd(mondayOf(new Date()));
    const { data: programs } = await db
      .from("programs").select("*")
      .eq("user_id", trackerUser.id).eq("week_start", weekStart).eq("is_homework", true)
      .order("session_number", { ascending: true });

    if (!programs || !programs.length) {
      section.innerHTML = '<div class="empty" style="padding:40px;text-align:center;">이번 주 숙제가 없어요 🎉</div>';
      return;
    }

    const { data: logs } = await db
      .from("workout_logs").select("day")
      .eq("user_id", trackerUser.id).eq("date", todayKey()).eq("type", "homework");
    const doneSet = new Set((logs || []).map((l) => l.day));

    let html = "";
    programs.forEach((p) => {
      const isDone = doneSet.has(p.session_number);
      html += `<div class="card exercise-card">
        <div class="exercise-head">
          <div>
            <div class="name">${p.session_number}회차 숙제</div>
            <div class="meta">${(p.exercises || []).map((e) => escapeHtml(e.name)).join(", ")}</div>
          </div>
          <span class="badge ${isDone ? "badge-done" : ""}">${isDone ? "완료 ✓" : "미완료"}</span>
        </div>`;
      (p.exercises || []).forEach((ex) => {
        html += `<div class="homework-ex-row">
          <span>${escapeHtml(ex.name)}</span>
          <span class="homework-ex-detail">${ex.sets}세트 × ${ex.reps}회${ex.weight ? " · " + ex.weight + "kg" : ""}</span>
        </div>`;
      });
      if (p.memo) html += `<div class="trainer-memo">📋 ${escapeHtml(p.memo)}</div>`;
      html += `<button class="btn ${isDone ? "btn-outline" : "btn-primary"} homework-done-btn"
        data-session="${p.session_number}" data-done="${isDone}" style="margin-top:12px;width:100%;">
        ${isDone ? "완료 취소" : "완료했어요 ✓"}
      </button></div>`;
    });
    section.innerHTML = html;

    section.querySelectorAll(".homework-done-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sessionNum = Number(btn.dataset.session);
        const isDone = btn.dataset.done === "true";
        btn.disabled = true;
        try {
          if (isDone) {
            await db.from("workout_logs").delete()
              .eq("user_id", trackerUser.id).eq("date", todayKey()).eq("type", "homework").eq("day", sessionNum);
          } else {
            await db.from("workout_logs").insert({ user_id: trackerUser.id, date: todayKey(), day: sessionNum, type: "homework", exercises: [] });
          }
          showToast(isDone ? "완료 취소했어요" : "숙제 완료! 💪");
          await initHomeworkMode();
        } catch (e) {
          showToast("저장 실패: 연결을 확인하세요");
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    section.innerHTML = '<div class="empty">불러오지 못했습니다</div>';
  }
}

// ===== 레슨 기록 =====
let lessonCalYear, lessonCalMonth;
let lessonDate = null;
let lessonSession = 1;
let lessonExercises = [];
let lessonMemo = "";
let lessonDatesCache = [];
let lessonSessionsCache = [];

async function initLesson() {
  const today = new Date();
  lessonCalYear = today.getFullYear();
  lessonCalMonth = today.getMonth() + 1;
  lessonDate = todayKey();
  lessonSession = 1;
  lessonExercises = [];
  lessonMemo = "";
  await renderLessonCalendar();
  await loadLessonSessionTabs();
}

async function renderLessonCalendar() {
  const container = document.getElementById("lesson-calendar");
  try {
    lessonDatesCache = await getLessonDatesOfMonth(detailMember.id, lessonCalYear, lessonCalMonth);
  } catch (e) {
    lessonDatesCache = [];
  }

  const firstDow = new Date(lessonCalYear, lessonCalMonth - 1, 1).getDay();
  const totalDays = new Date(lessonCalYear, lessonCalMonth, 0).getDate();
  const todayStr = todayKey();

  let html = `<div class="lesson-cal">
    <div class="cal-header">
      <button type="button" id="cal-prev">‹</button>
      <span>${lessonCalYear}년 ${lessonCalMonth}월</span>
      <button type="button" id="cal-next">›</button>
    </div>
    <div class="cal-grid">
      <div class="cal-dow">일</div><div class="cal-dow">월</div><div class="cal-dow">화</div>
      <div class="cal-dow">수</div><div class="cal-dow">목</div><div class="cal-dow">금</div><div class="cal-dow">토</div>`;

  for (let i = 0; i < firstDow; i++) html += `<div class="cal-cell"></div>`;

  for (let d = 1; d <= totalDays; d++) {
    const ds = `${lessonCalYear}-${String(lessonCalMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cls = [
      "cal-cell",
      ds === todayStr ? "today" : "",
      ds === lessonDate ? "selected" : "",
      lessonDatesCache.includes(ds) ? "has-lesson" : "",
    ].filter(Boolean).join(" ");
    html += `<div class="${cls}" data-date="${ds}">${d}${lessonDatesCache.includes(ds) ? '<div class="cal-dot"></div>' : ""}</div>`;
  }

  html += `</div></div>`;
  container.innerHTML = html;

  container.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
    cell.addEventListener("click", async () => {
      lessonDate = cell.dataset.date;
      lessonSession = 1;
      await renderLessonCalendar();
      await loadLessonSessionTabs();
    });
  });

  document.getElementById("cal-prev").addEventListener("click", async () => {
    lessonCalMonth--;
    if (lessonCalMonth < 1) { lessonCalMonth = 12; lessonCalYear--; }
    await renderLessonCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", async () => {
    lessonCalMonth++;
    if (lessonCalMonth > 12) { lessonCalMonth = 1; lessonCalYear++; }
    await renderLessonCalendar();
  });
}

async function loadLessonSessionTabs() {
  try {
    lessonSessionsCache = await getLessonSessionsOfDate(detailMember.id, lessonDate);
  } catch (e) {
    lessonSessionsCache = [];
  }
  if (!lessonSessionsCache.includes(lessonSession)) {
    lessonSession = lessonSessionsCache.length ? lessonSessionsCache[0] : 1;
  }
  renderLessonSessionTabs();
  await loadLessonEditor();
}

function renderLessonSessionTabs() {
  const tabs = document.getElementById("lesson-session-tabs");
  const nextSession = lessonSessionsCache.length ? Math.max(...lessonSessionsCache) + 1 : 1;
  const isNew = !lessonSessionsCache.includes(lessonSession);

  let html = lessonSessionsCache
    .map((n) => `<div class="dtab ${n === lessonSession ? "active" : ""}" data-lsession="${n}">${n}회차</div>`)
    .join("");
  html += `<div class="dtab ${isNew ? "active" : ""}" data-lsession="${nextSession}">+ ${nextSession}회차</div>`;
  tabs.innerHTML = html;

  tabs.querySelectorAll(".dtab").forEach((t) => {
    t.addEventListener("click", async () => {
      lessonSession = Number(t.dataset.lsession);
      tabs.querySelectorAll(".dtab").forEach((x) =>
        x.classList.toggle("active", Number(x.dataset.lsession) === lessonSession));
      await loadLessonEditor();
    });
  });
}

async function loadLessonEditor() {
  const editor = document.getElementById("lesson-editor");
  editor.innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    const { log, exercises } = await getLessonLog(detailMember.id, lessonDate, lessonSession);
    if (log) {
      lessonExercises = exercises.map((ex) => ({ exercise_name: ex.exercise_name, sets: ex.sets || [] }));
      lessonMemo = log.memo || "";
    } else {
      lessonExercises = [];
      lessonMemo = "";
    }
  } catch (e) {
    lessonExercises = [];
    lessonMemo = "";
  }
  renderLessonEditor();
}

function renderLessonEditor() {
  const editor = document.getElementById("lesson-editor");
  let html = "";

  lessonExercises.forEach((ex, i) => {
    html += `<div class="lesson-ex-card" data-ex="${i}">
      <div class="lesson-ex-header">
        <input class="input lesson-ex-name" type="text" value="${escapeAttr(ex.exercise_name)}" placeholder="운동 종목명" />
        <button class="lesson-ex-del" data-ex="${i}">×</button>
      </div>`;
    (ex.sets || []).forEach((s, si) => {
      html += `<div class="lesson-set-row" data-set="${si}">
        <span class="lesson-set-num">${si + 1}세트</span>
        <input class="input lesson-set-weight" type="number" inputmode="decimal" placeholder="kg" value="${s.weight_kg != null ? s.weight_kg : ""}" />
        <span class="lesson-set-x">×</span>
        <input class="input lesson-set-reps" type="number" inputmode="numeric" placeholder="회" value="${s.reps != null ? s.reps : ""}" />
        <button class="lesson-set-del" data-ex="${i}" data-set="${si}">×</button>
      </div>`;
    });
    html += `<button class="btn btn-outline lesson-add-set" data-ex="${i}">+ 세트 추가</button>
    </div>`;
  });

  html += `<button class="btn btn-outline" id="lesson-add-ex" style="margin-top:8px;margin-bottom:12px;width:100%;">+ 종목 추가</button>`;
  html += `<div class="diet-field"><label>회차 메모</label>
    <textarea id="lesson-memo" placeholder="레슨 메모">${escapeHtml(lessonMemo)}</textarea></div>`;
  html += `<button class="btn btn-primary" id="lesson-save">${lessonSession}회차 레슨 저장</button>`;

  editor.innerHTML = html;

  document.getElementById("lesson-add-ex").addEventListener("click", () => {
    syncLessonFromDOM();
    lessonExercises.push({ exercise_name: "", sets: [{ set_number: 1, weight_kg: null, reps: null }] });
    renderLessonEditor();
  });

  editor.querySelectorAll(".lesson-ex-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncLessonFromDOM();
      lessonExercises.splice(Number(btn.dataset.ex), 1);
      renderLessonEditor();
    });
  });

  editor.querySelectorAll(".lesson-add-set").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncLessonFromDOM();
      const i = Number(btn.dataset.ex);
      lessonExercises[i].sets.push({ set_number: lessonExercises[i].sets.length + 1, weight_kg: null, reps: null });
      renderLessonEditor();
    });
  });

  editor.querySelectorAll(".lesson-set-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncLessonFromDOM();
      const i = Number(btn.dataset.ex);
      const si = Number(btn.dataset.set);
      lessonExercises[i].sets.splice(si, 1);
      lessonExercises[i].sets = lessonExercises[i].sets.map((s, idx) => ({ ...s, set_number: idx + 1 }));
      renderLessonEditor();
    });
  });

  document.getElementById("lesson-save").addEventListener("click", saveLesson);
}

function syncLessonFromDOM() {
  const cards = document.querySelectorAll("#lesson-editor .lesson-ex-card");
  lessonExercises = Array.from(cards).map((card) => {
    const sets = Array.from(card.querySelectorAll(".lesson-set-row")).map((row, si) => ({
      set_number: si + 1,
      weight_kg: parseFloat(row.querySelector(".lesson-set-weight").value) || null,
      reps: parseInt(row.querySelector(".lesson-set-reps").value, 10) || null,
    }));
    return { exercise_name: card.querySelector(".lesson-ex-name").value.trim(), sets };
  });
  const memoEl = document.getElementById("lesson-memo");
  if (memoEl) lessonMemo = memoEl.value.trim();
}

async function saveLesson() {
  syncLessonFromDOM();
  const btn = document.getElementById("lesson-save");
  btn.disabled = true;
  btn.textContent = "저장 중…";
  try {
    await saveLessonLog(detailMember.id, lessonDate, lessonSession, lessonExercises, lessonMemo);
    showToast(`${lessonSession}회차 레슨을 저장했어요 ✅`);
    lessonSessionsCache = await getLessonSessionsOfDate(detailMember.id, lessonDate);
    lessonDatesCache = await getLessonDatesOfMonth(detailMember.id, lessonCalYear, lessonCalMonth);
    await renderLessonCalendar();
    renderLessonSessionTabs();
  } catch (e) {
    showToast("저장 실패: 연결을 확인하세요");
  }
  btn.disabled = false;
  btn.textContent = `${lessonSession}회차 레슨 저장`;
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
