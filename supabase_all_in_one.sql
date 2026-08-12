-- 一键建表 + 导入默认题库
-- 复制全部内容到 Supabase SQL Editor 运行

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'student',
  points INTEGER DEFAULT 0,
  avatar_hat TEXT DEFAULT '',
  avatar_top TEXT DEFAULT '',
  avatar_bottom TEXT DEFAULT '',
  avatar_shoes TEXT DEFAULT '',
  avatar_accessory TEXT DEFAULT '',
  ui_theme TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_all ON users FOR ALL USING (true) WITH CHECK (true);

-- 默认题库
CREATE TABLE IF NOT EXISTS default_questions (
  id SERIAL PRIMARY KEY,
  sentence TEXT NOT NULL,
  highlighted_word TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  difficulty INTEGER DEFAULT 1,
  wrong_hint TEXT DEFAULT ''
);
ALTER TABLE default_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY default_questions_all ON default_questions FOR ALL USING (true) WITH CHECK (true);

-- 错题本
CREATE TABLE IF NOT EXISTS wrong_answers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  question_source TEXT DEFAULT 'default',
  user_answer TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  sentence TEXT NOT NULL,
  highlighted_word TEXT NOT NULL,
  wrong_hint TEXT DEFAULT '',
  answered_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wrong_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY wrong_answers_all ON wrong_answers FOR ALL USING (true) WITH CHECK (true);

-- 爬塔进度
CREATE TABLE IF NOT EXISTS tower_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  level INTEGER NOT NULL,
  completed INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  UNIQUE(user_id, level)
);
ALTER TABLE tower_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY tower_progress_all ON tower_progress FOR ALL USING (true) WITH CHECK (true);

-- 自定义题库
CREATE TABLE IF NOT EXISTS custom_banks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_shared INTEGER DEFAULT 0
);
ALTER TABLE custom_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY custom_banks_all ON custom_banks FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS custom_questions (
  id SERIAL PRIMARY KEY,
  bank_id INTEGER NOT NULL,
  sentence TEXT NOT NULL,
  highlighted_word TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  difficulty INTEGER DEFAULT 1,
  wrong_hint TEXT DEFAULT ''
);
ALTER TABLE custom_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY custom_questions_all ON custom_questions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS shared_bank_stats (
  id SERIAL PRIMARY KEY,
  bank_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  UNIQUE(bank_id, user_id)
);
ALTER TABLE shared_bank_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_bank_stats_all ON shared_bank_stats FOR ALL USING (true) WITH CHECK (true);

-- 签到
CREATE TABLE IF NOT EXISTS daily_checkins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  checkin_date TEXT NOT NULL,
  streak INTEGER DEFAULT 0,
  UNIQUE(user_id, checkin_date)
);
ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_checkins_all ON daily_checkins FOR ALL USING (true) WITH CHECK (true);

-- 成就
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_key)
);
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY achievements_all ON achievements FOR ALL USING (true) WITH CHECK (true);

-- 题目投票
CREATE TABLE IF NOT EXISTS question_votes (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, user_id)
);
ALTER TABLE question_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY question_votes_all ON question_votes FOR ALL USING (true) WITH CHECK (true);

-- 班级
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY classes_all ON classes FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS class_members (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, user_id)
);
ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_members_all ON class_members FOR ALL USING (true) WITH CHECK (true);

-- 对战
CREATE TABLE IF NOT EXISTS challenges (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER NOT NULL,
  creator_score INTEGER DEFAULT -1,
  status TEXT DEFAULT 'waiting',
  questions_json TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY challenges_all ON challenges FOR ALL USING (true) WITH CHECK (true);

-- 每日爬塔
CREATE TABLE IF NOT EXISTS tower_daily (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  attempt_date TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  completed_levels TEXT DEFAULT '',
  best_level INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, attempt_date)
);
ALTER TABLE tower_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY tower_daily_all ON tower_daily FOR ALL USING (true) WITH CHECK (true);

-- ==================== 导入默认题目 ====================
DELETE FROM default_questions;
INSERT INTO default_questions (sentence, highlighted_word, correct_answer, difficulty, wrong_hint) VALUES
('Winter is peaceful and fun.', 'peaceful', 'predicative', 1, 'peaceful 在 be 动词 is 后面，描述主语 Winter 本身的状态 → 表语。'),
('I always wear a warm coat.', 'warm', 'attribute', 1, 'warm 直接放在名词 coat 前面修饰 → 定语。'),
('It is exciting to take a trip.', 'exciting', 'itpattern', 2, 'It 是形式主语，真正主语是 to take a trip → It is...to... 句式。'),
('Spring is sunny and warm.', 'sunny', 'predicative', 1, 'sunny 在 be 动词 is 后面，描述主语 Spring → 表语。'),
('It is dangerous to swim in the sea.', 'dangerous', 'itpattern', 2, 'dangerous 评价的是 to swim 这个动作 → It is...to... 句式。'),
('I bought an old umbrella.', 'old', 'attribute', 1, 'old 直接修饰名词 umbrella → 定语。'),
('The snowman looks funny.', 'funny', 'predicative', 1, 'funny 在系动词 looks 后面，描述主语 snowman → 表语。'),
('It is important to wear a scarf.', 'important', 'itpattern', 2, 'important 评价 to wear a scarf 这件事 → It is...to... 句式。'),
('We saw a bright star.', 'bright', 'attribute', 1, 'bright 直接修饰名词 star → 定语。'),
('Summer days are long and hot.', 'long', 'predicative', 1, 'long 在 be 动词 are 后面，描述主语 Summer days → 表语。'),
('I love the beautiful flowers in spring.', 'beautiful', 'attribute', 2, 'beautiful 直接修饰名词 flowers → 定语。'),
('It is wonderful to play in the snow.', 'wonderful', 'itpattern', 2, 'wonderful 评价 to play in the snow → It is...to... 句式。'),
('Autumn leaves turn yellow.', 'yellow', 'predicative', 2, 'yellow 在系动词 turn 后面，描述主语 leaves → 表语。'),
('She wore a thick sweater.', 'thick', 'attribute', 2, 'thick 直接修饰名词 sweater → 定语。'),
('It is nice to drink hot chocolate.', 'nice', 'itpattern', 2, 'nice 评价 to drink hot chocolate → It is...to... 句式。'),
('The cold wind blows hard.', 'cold', 'attribute', 2, 'cold 直接修饰名词 wind → 定语。'),
('Ice cream tastes sweet in summer.', 'sweet', 'predicative', 2, 'sweet 在系动词 tastes 后面，描述主语 ice cream → 表语。'),
('It is necessary to bring an umbrella in spring.', 'necessary', 'itpattern', 3, 'necessary 评价 to bring an umbrella → It is...to... 句式。'),
('The fresh air makes me happy.', 'fresh', 'attribute', 3, 'fresh 直接修饰名词 air → 定语。'),
('Flowers smell wonderful in the garden.', 'wonderful', 'predicative', 3, 'wonderful 在系动词 smell 后面，描述主语 flowers → 表语。'),
('It is common to see rainbows after rain.', 'common', 'itpattern', 3, 'common 评价 to see rainbows → It is...to... 句式。'),
('We enjoyed the cool breeze.', 'cool', 'attribute', 3, 'cool 直接修饰名词 breeze → 定语。'),
('The weather becomes warmer in March.', 'warmer', 'predicative', 3, 'warmer 在系动词 becomes 后面，描述主语 weather → 表语。'),
('It is hard to wake up early in winter.', 'hard', 'itpattern', 3, 'hard 评价 to wake up early → It is...to... 句式。'),
('A gentle rain started falling.', 'gentle', 'attribute', 4, 'gentle 直接修饰名词 rain → 定语。'),
('The sky appears gray before a storm.', 'gray', 'predicative', 4, 'gray 在系动词 appears 后面，描述主语 sky → 表语。'),
('It is challenging to predict the weather.', 'challenging', 'itpattern', 4, 'challenging 评价 to predict the weather → It is...to... 句式。'),
('Lightning looked frightening last night.', 'frightening', 'predicative', 4, 'frightening 在系动词 looked 后面 → 表语。'),
('It is unusual to have snow in April.', 'unusual', 'itpattern', 4, 'unusual 评价 to have snow in April → It is...to... 句式。'),
('The brilliant sunshine warmed the earth.', 'brilliant', 'attribute', 5, 'brilliant 直接修饰名词 sunshine → 定语。'),
('Foggy mornings feel mysterious.', 'mysterious', 'predicative', 5, 'mysterious 在系动词 feel 后面，描述主语 mornings → 表语。'),
('It is essential to protect our environment.', 'essential', 'itpattern', 5, 'essential 评价 to protect our environment → It is...to... 句式。');
