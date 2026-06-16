// ===== Supabase 설정 =====
const SUPABASE_URL = "https://zapruzcrkxxecahlsjou.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcHJ1emNya3h4ZWNhaGxzam91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDI3MTcsImV4cCI6MjA5NjgxODcxN30.zD4DyXfYeOz5eGAUlnly4RaDl1Umbi4yzlTsIWOX9bA";

// Supabase JS SDK는 HTML에서 CDN으로 먼저 로드됨 (window.supabase)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== 세션 (localStorage) =====
const SESSION_KEY = "greengym_session";

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch (e) {
    return null;
  }
}
function setCurrentUser(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}
function logout() {
  localStorage.removeItem(SESSION_KEY);
  location.href = "index.html";
}

// 로그인 안 된 경우 로그인 페이지로 보냄 (보호 페이지에서 호출)
function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    location.href = "index.html";
    return null;
  }
  return user;
}

// ===== 인증 =====
// 이름 + 전화번호 뒷 4자리로 로그인 (없으면 신규 등록)
async function loginMember(name, phoneLast4) {
  const { data: found, error: selErr } = await db
    .from("users")
    .select("*")
    .eq("name", name)
    .eq("phone_last4", phoneLast4)
    .limit(1);
  if (selErr) throw selErr;
  if (found && found.length) return found[0];

  const { data: created, error: insErr } = await db
    .from("users")
    .insert({ name, phone_last4: phoneLast4 })
    .select()
    .single();
  if (insErr) throw insErr;
  return created;
}

// ===== 운동 기록 =====
// (user_id, date, day) 조합으로 upsert
async function saveWorkout(userId, date, day, exercises) {
  const { data: existing } = await db
    .from("workout_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("date", date)
    .eq("day", day)
    .limit(1);

  if (existing && existing.length) {
    const { error } = await db
      .from("workout_logs")
      .update({ exercises })
      .eq("id", existing[0].id);
    if (error) throw error;
  } else {
    const { error } = await db
      .from("workout_logs")
      .insert({ user_id: userId, date, day, exercises });
    if (error) throw error;
  }
}

async function getWorkout(userId, date, day) {
  const { data } = await db
    .from("workout_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .eq("day", day)
    .limit(1);
  return data && data.length ? data[0] : null;
}

async function getWorkoutsByDate(userId, date) {
  const { data } = await db
    .from("workout_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date);
  return data || [];
}

// ===== 식단 기록 =====
async function saveDiet(userId, date, fields) {
  const { data: existing } = await db
    .from("diet_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("date", date)
    .limit(1);

  if (existing && existing.length) {
    const { error } = await db.from("diet_logs").update(fields).eq("id", existing[0].id);
    if (error) throw error;
  } else {
    const { error } = await db
      .from("diet_logs")
      .insert({ user_id: userId, date, ...fields });
    if (error) throw error;
  }
}

async function getDiet(userId, date) {
  const { data } = await db
    .from("diet_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .limit(1);
  return data && data.length ? data[0] : null;
}

// ===== 러닝 기록 =====
async function addRunning(userId, date, distanceKm, durationMin) {
  const { error } = await db
    .from("running_logs")
    .insert({ user_id: userId, date, distance_km: distanceKm, duration_min: durationMin });
  if (error) throw error;
}

async function getRunningLogs(userId) {
  const { data } = await db
    .from("running_logs")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  return data || [];
}

// ===== 트레이너 대시보드 =====
async function getAllMembers() {
  const { data } = await db
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });
  return data || [];
}

async function getMemberWorkouts(userId) {
  const { data } = await db
    .from("workout_logs")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(30);
  return data || [];
}

async function getMemberDiets(userId) {
  const { data } = await db
    .from("diet_logs")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(30);
  return data || [];
}

async function getMemberRunning(userId) {
  const { data } = await db
    .from("running_logs")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(30);
  return data || [];
}

// ===== 운동 처방 (programs) =====
// 특정 회원의 특정 주차 처방 목록
async function getPrograms(userId, weekStart) {
  const { data, error } = await db
    .from("programs")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .order("session_number", { ascending: true });
  if (error) throw error;
  return data || [];
}

// ===== 레슨 기록 =====
async function getLessonDatesOfMonth(memberId, year, month) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const { data } = await db
    .from("lesson_logs")
    .select("lesson_date")
    .eq("member_id", memberId)
    .gte("lesson_date", from)
    .lte("lesson_date", to);
  return [...new Set((data || []).map((r) => r.lesson_date))];
}

async function getLessonSessionsOfDate(memberId, lessonDate) {
  const { data } = await db
    .from("lesson_logs")
    .select("session_number")
    .eq("member_id", memberId)
    .eq("lesson_date", lessonDate)
    .order("session_number", { ascending: true });
  return (data || []).map((r) => r.session_number);
}

async function getLessonLog(memberId, lessonDate, sessionNumber) {
  const { data: logs } = await db
    .from("lesson_logs")
    .select("*")
    .eq("member_id", memberId)
    .eq("lesson_date", lessonDate)
    .eq("session_number", sessionNumber)
    .limit(1);
  if (!logs || !logs.length) return { log: null, exercises: [] };
  const log = logs[0];
  const { data: exercises } = await db
    .from("lesson_exercises")
    .select("*")
    .eq("lesson_log_id", log.id)
    .order("order_index", { ascending: true });
  return { log, exercises: exercises || [] };
}

async function saveLessonLog(memberId, lessonDate, sessionNumber, exercises, memo) {
  const { data: existing } = await db
    .from("lesson_logs")
    .select("id")
    .eq("member_id", memberId)
    .eq("lesson_date", lessonDate)
    .eq("session_number", sessionNumber)
    .limit(1);

  let logId;
  if (existing && existing.length) {
    logId = existing[0].id;
    const { error } = await db
      .from("lesson_logs")
      .update({ memo, updated_at: new Date().toISOString() })
      .eq("id", logId);
    if (error) throw error;
    await db.from("lesson_exercises").delete().eq("lesson_log_id", logId);
  } else {
    const { data: created, error } = await db
      .from("lesson_logs")
      .insert({ member_id: memberId, lesson_date: lessonDate, session_number: sessionNumber, memo })
      .select()
      .single();
    if (error) throw error;
    logId = created.id;
  }

  if (exercises.length) {
    const rows = exercises.map((ex, i) => ({
      lesson_log_id: logId,
      exercise_name: ex.exercise_name,
      order_index: i,
      sets: ex.sets,
    }));
    const { error } = await db.from("lesson_exercises").insert(rows);
    if (error) throw error;
  }
}

// (user_id, week_start, session_number) 조합으로 처방 upsert
async function saveProgram(userId, weekStart, sessionNumber, exercises, memo) {
  const { data: existing } = await db
    .from("programs")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .eq("session_number", sessionNumber)
    .limit(1);

  if (existing && existing.length) {
    const { error } = await db
      .from("programs")
      .update({ exercises, memo })
      .eq("id", existing[0].id);
    if (error) throw error;
  } else {
    const { error } = await db.from("programs").insert({
      user_id: userId,
      week_start: weekStart,
      session_number: sessionNumber,
      exercises,
      memo,
    });
    if (error) throw error;
  }
}
