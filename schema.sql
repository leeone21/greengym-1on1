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

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_workout_user_date ON workout_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_diet_user_date ON diet_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_running_user_date ON running_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_programs_user_week ON programs(user_id, week_start);

-- RLS(행 수준 보안) 활성화 + anon 키로 접근 허용
-- MVP 단계라 anon 키로 전체 읽기/쓰기를 허용합니다. (회원 인증을 앱에서 자체 처리)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE running_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon all users" ON users;
DROP POLICY IF EXISTS "anon all workout" ON workout_logs;
DROP POLICY IF EXISTS "anon all diet" ON diet_logs;
DROP POLICY IF EXISTS "anon all running" ON running_logs;
DROP POLICY IF EXISTS "anon all programs" ON programs;

CREATE POLICY "anon all users"    ON users        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all workout"  ON workout_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all diet"     ON diet_logs    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all running"  ON running_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all programs" ON programs     FOR ALL USING (true) WITH CHECK (true);

-- 식사 시간 컬럼 추가 마이그레이션 (Supabase SQL Editor에서 실행)
ALTER TABLE diet_logs
  ADD COLUMN IF NOT EXISTS breakfast_time TIME,
  ADD COLUMN IF NOT EXISTS lunch_time TIME,
  ADD COLUMN IF NOT EXISTS dinner_time TIME,
  ADD COLUMN IF NOT EXISTS snack_time TIME;
