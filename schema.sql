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

-- 종목 마스터 테이블
CREATE TABLE IF NOT EXISTS exercises (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  allowed_equipment TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exercises_read" ON exercises;
CREATE POLICY "exercises_read" ON exercises FOR SELECT USING (true);
DROP POLICY IF EXISTS "exercises_write" ON exercises;
CREATE POLICY "exercises_write" ON exercises FOR ALL USING (true) WITH CHECK (true);

INSERT INTO exercises (name, category, allowed_equipment) VALUES
  ('벤치프레스',                   '가슴', ARRAY['바벨','덤벨','머신']),
  ('인클라인 벤치프레스',           '가슴', ARRAY['바벨','덤벨','머신']),
  ('딥스',                         '가슴', ARRAY['맨몸','밴드']),
  ('덤벨 플라이',                   '가슴', ARRAY['덤벨','케이블']),
  ('케이블 크로스오버',             '가슴', ARRAY['케이블']),
  ('컨벤셔널 데드리프트',           '등',   ARRAY['바벨','덤벨']),
  ('루마니안 데드리프트',           '등',   ARRAY['바벨','덤벨']),
  ('랫풀다운',                     '등',   ARRAY['머신','케이블']),
  ('바벨 로우',                    '등',   ARRAY['바벨']),
  ('덤벨 로우',                    '등',   ARRAY['덤벨']),
  ('시티드 케이블 로우',            '등',   ARRAY['케이블','머신']),
  ('풀업',                         '등',   ARRAY['맨몸','밴드']),
  ('오버헤드 프레스',               '어깨', ARRAY['바벨','덤벨','머신']),
  ('숄더프레스',                   '어깨', ARRAY['바벨','덤벨','머신']),
  ('사이드 레터럴 레이즈',          '어깨', ARRAY['덤벨','케이블','밴드']),
  ('페이스 풀',                    '어깨', ARRAY['케이블','밴드']),
  ('업라이트 로우',                 '어깨', ARRAY['바벨','덤벨','케이블']),
  ('스쿼트',                       '하체', ARRAY['바벨','덤벨','맨몸','머신']),
  ('프론트 스쿼트',                 '하체', ARRAY['바벨','덤벨']),
  ('레그프레스',                   '하체', ARRAY['머신']),
  ('런지',                         '하체', ARRAY['바벨','덤벨','맨몸','밴드']),
  ('레그 익스텐션',                 '하체', ARRAY['머신']),
  ('레그 컬',                      '하체', ARRAY['머신']),
  ('힙 쓰러스트',                   '하체', ARRAY['바벨','덤벨','밴드']),
  ('카프 레이즈',                   '하체', ARRAY['바벨','덤벨','머신','맨몸']),
  ('바벨 컬',                      '팔',   ARRAY['바벨']),
  ('덤벨 컬',                      '팔',   ARRAY['덤벨']),
  ('해머 컬',                      '팔',   ARRAY['덤벨','케이블']),
  ('트라이셉스 푸시다운',            '팔',   ARRAY['케이블','밴드']),
  ('오버헤드 트라이셉스 익스텐션',   '팔',   ARRAY['덤벨','케이블','바벨']),
  ('플랭크',                       '코어', ARRAY['맨몸','밴드']),
  ('크런치',                       '코어', ARRAY['맨몸','머신']),
  ('레그 레이즈',                   '코어', ARRAY['맨몸']),
  ('트레드밀',                     '유산소', ARRAY[]::TEXT[]),
  ('사이클',                       '유산소', ARRAY[]::TEXT[]),
  ('로잉머신',                     '유산소', ARRAY[]::TEXT[])
ON CONFLICT (name) DO NOTHING;
