// 트레이너 대시보드 접근 비밀번호
const TRAINER_PASSWORD = "greengym2024";

// 이번 달 러닝 목표(km)
const MONTHLY_RUN_GOAL = 30;

// 운동 프로그램 데이터 (day 1 / 2 / 3)
const WORKOUT_PROGRAM = {
  1: {
    label: "Day1 Push",
    icon: "💪",
    exercises: [
      { name: "바벨 벤치프레스", note: "워밍업 40kg · 메인 50kg", sets: 4, reps: "10~12", target: 50 },
      { name: "바벨 오버헤드 프레스", note: "워밍업 25kg · 메인 30kg", sets: 4, reps: "10~12", target: 30 },
      { name: "덤벨 래터럴 레이즈", note: "", sets: 4, reps: "15~20", target: 0 },
      { name: "케이블 래터럴 레이즈", note: "", sets: 3, reps: "15~20", target: 0 },
      { name: "덤벨 인클라인 벤치프레스", note: "", sets: 3, reps: "12~15", target: 0 },
      { name: "케이블 트라이셉스 푸쉬다운", note: "", sets: 3, reps: "15~20", target: 0 },
    ],
  },
  2: {
    label: "Day2 Pull",
    icon: "🏋️",
    exercises: [
      { name: "턱걸이", note: "", sets: 4, reps: "최대", target: 0 },
      { name: "루마니안 데드리프트", note: "워밍업 65kg · 메인 80kg", sets: 4, reps: "8~10", target: 80 },
      { name: "랫 풀다운", note: "", sets: 4, reps: "10~12", target: 0 },
      { name: "시티드 케이블 로우", note: "", sets: 4, reps: "10~12", target: 0 },
      { name: "바벨 컬", note: "", sets: 4, reps: "10~12", target: 0 },
      { name: "해머 컬", note: "", sets: 3, reps: "12~15", target: 0 },
    ],
  },
  3: {
    label: "Day3 Legs+팔",
    icon: "🦵",
    exercises: [
      { name: "바벨 백스쿼트", note: "워밍업 50kg · 메인 60kg", sets: 4, reps: "10~12", target: 60 },
      { name: "레그 프레스", note: "", sets: 4, reps: "12~15", target: 0 },
      { name: "불가리안 스플릿 스쿼트", note: "", sets: 3, reps: "12", target: 0 },
      { name: "레그 컬", note: "", sets: 3, reps: "15~20", target: 0 },
      { name: "바벨 컬", note: "", sets: 3, reps: "10~12", target: 0 },
      { name: "트라이셉스 푸쉬다운", note: "", sets: 3, reps: "15~20", target: 0 },
    ],
  },
};

// 특정 Day의 전체 세트 수
function totalSetsOfDay(day) {
  return WORKOUT_PROGRAM[day].exercises.reduce((sum, ex) => sum + ex.sets, 0);
}

// 트레이너 처방용 기본 운동 종목 카탈로그 (부위별)
const EXERCISE_CATALOG = {
  "가슴": ["바벨 벤치프레스", "덤벨 인클라인 벤치프레스", "케이블 크로스오버", "딥스"],
  "어깨": ["바벨 오버헤드 프레스", "덤벨 숄더프레스", "덤벨 래터럴 레이즈", "케이블 래터럴 레이즈", "페이스 풀"],
  "등": ["턱걸이", "랫 풀다운", "시티드 케이블 로우", "덤벨 원암 로우"],
  "하체": ["바벨 백스쿼트", "레그 프레스", "불가리안 스플릿 스쿼트", "레그 컬", "레그 익스텐션"],
  "이두": ["바벨 컬", "덤벨 컬", "해머 컬"],
  "삼두": ["트라이셉스 푸쉬다운", "오버헤드 익스텐션"],
  "유산소": ["트레드밀", "사이클", "로잉머신"],
};
