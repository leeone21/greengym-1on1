-- 그린짐 회원 운동 관리 앱 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN 하세요.

-- 회원
CREATE TABLE IF NOT EXISTS users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone_last4 text NOT NULL,
  created_at timestamp DEFAULT now()
);

-- 운동 기록
CREATE TABLE IF NOT EXISTS workout_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  date date NOT NULL,
  day integer NOT NULL,
  exercises jsonb,
  created_at timestamp DEFAULT now()
);

-- 식단 기록
CREATE TABLE IF NOT EXISTS diet_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  date date NOT NULL,
  breakfast text, lunch text, dinner text, snack text,
  water integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);

-- 러닝 기록
CREATE TABLE IF NOT EXISTS running_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  date date NOT NULL,
  distance_km numeric,
  duration_min integer,
  created_at timestamp DEFAULT now()
);

-- 운동 처방 (트레이너 → 회원, 주차/회차별)
CREATE TABLE IF NOT EXISTS programs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  week_start date NOT NULL,
  session_number integer NOT NULL,
  exercises jsonb NOT NULL,
  memo text,
  created_at timestamp DEFAULT now()
);

-- 레슨 기록 (트레이너 → 회원, 날짜/회차별 PT 운동 내용)
CREATE TABLE IF NOT EXISTS lesson_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_date date NOT NULL,
  session_number integer NOT NULL DEFAULT 1,
  memo text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(member_id, lesson_date, session_number)
);

-- 레슨 종목 (lesson_logs 1:N)
CREATE TABLE IF NOT EXISTS lesson_exercises (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_log_id uuid NOT NULL REFERENCES lesson_logs(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  sets jsonb NOT NULL DEFAULT '[]',
  created_at timestamp DEFAULT now()
);

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_workout_user_date ON workout_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_diet_user_date ON diet_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_running_user_date ON running_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_programs_user_week ON programs(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_lesson_member_date ON lesson_logs(member_id, lesson_date);

-- RLS(행 수준 보안) 활성화 + anon 키로 접근 허용
-- MVP 단계라 anon 키로 전체 읽기/쓰기를 허용합니다. (회원 인증을 앱에서 자체 처리)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE running_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon all users" ON users;
DROP POLICY IF EXISTS "anon all workout" ON workout_logs;
DROP POLICY IF EXISTS "anon all diet" ON diet_logs;
DROP POLICY IF EXISTS "anon all running" ON running_logs;
DROP POLICY IF EXISTS "anon all programs" ON programs;
DROP POLICY IF EXISTS "anon all lesson_logs" ON lesson_logs;
DROP POLICY IF EXISTS "anon all lesson_exercises" ON lesson_exercises;

CREATE POLICY "anon all users"    ON users        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all workout"  ON workout_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all diet"     ON diet_logs    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all running"  ON running_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all programs"         ON programs          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all lesson_logs"      ON lesson_logs       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all lesson_exercises" ON lesson_exercises   FOR ALL USING (true) WITH CHECK (true);
