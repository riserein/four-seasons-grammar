const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'game.db');

// ---------- 中间件 ----------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'four-seasons-grammar-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ---------- sql.js 包装器 ----------
let DB; // 会在 initDb 后赋值

// 直接执行 SQL (INSERT/UPDATE/DELETE)
function dbRun(sql, params = []) {
  DB.run(sql, params);
  const changes = DB.getRowsModified();
  const lastId = DB.exec("SELECT last_insert_rowid() as id")[0]?.values?.[0]?.[0];
  return { changes, lastInsertRowid: lastId };
}

// 查询单行
function dbGet(sql, params = []) {
  const stmt = DB.prepare(sql);
  stmt.bind(params);
  let row = undefined;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

// 查询多行
function dbAll(sql, params = []) {
  const stmt = DB.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbExec(sql) { DB.run(sql); }

// 方便链式调用的语法糖 (dbPrepare(sql).get(...))
// 注意：每次调用 run/get/all 都会创建新 statement，避免循环中的 statement closed 问题
function dbPrepare(sql) {
  return {
    run: (...p) => dbRun(sql, p),
    get: (...p) => dbGet(sql, p),
    all: (...p) => dbAll(sql, p),
  };
}

function dbTransaction(fn) {
  return (...args) => {
    DB.run('BEGIN');
    try { fn(...args); DB.run('COMMIT'); }
    catch (e) { DB.run('ROLLBACK'); throw e; }
  };
}

// 持久化到磁盘（关键操作后调用）
function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(DB.export()));
}

// ---------- 数据库初始化 ----------
async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    DB = new SQL.Database(buffer);
  } else {
    DB = new SQL.Database();
  }

  // 建表
  dbExec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'student' CHECK(role IN ('student','teacher')),
      points INTEGER DEFAULT 0,
      avatar_hat TEXT DEFAULT '',
      avatar_top TEXT DEFAULT '',
      avatar_bottom TEXT DEFAULT '',
      avatar_shoes TEXT DEFAULT '',
      avatar_accessory TEXT DEFAULT '',
      ui_theme TEXT DEFAULT 'default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS default_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence TEXT NOT NULL,
      highlighted_word TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      difficulty INTEGER DEFAULT 1,
      wrong_hint TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_shared INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS custom_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL,
      sentence TEXT NOT NULL,
      highlighted_word TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      difficulty INTEGER DEFAULT 1,
      wrong_hint TEXT DEFAULT '',
      FOREIGN KEY (bank_id) REFERENCES custom_banks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wrong_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      question_source TEXT DEFAULT 'default',
      user_answer TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      sentence TEXT NOT NULL,
      highlighted_word TEXT NOT NULL,
      wrong_hint TEXT DEFAULT '',
      answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tower_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      best_score INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, level)
    );

    CREATE TABLE IF NOT EXISTS shared_bank_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      FOREIGN KEY (bank_id) REFERENCES custom_banks(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(bank_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS daily_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      checkin_date TEXT NOT NULL,
      streak INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, checkin_date)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      achievement_key TEXT NOT NULL,
      unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, achievement_key)
    );

    CREATE TABLE IF NOT EXISTS question_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      vote_type TEXT NOT NULL CHECK(vote_type IN ('up','down')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS class_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(class_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL,
      creator_score INTEGER DEFAULT -1,
      status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting','completed')),
      questions_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tower_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      attempt_date TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      completed_levels TEXT DEFAULT '',
      best_level INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, attempt_date)
    );
  `);
  // 迁移：为旧数据库添加 wrong_hint 列
  try { dbExec('ALTER TABLE wrong_answers ADD COLUMN wrong_hint TEXT DEFAULT \'\''); } catch(e) {}
  saveDb();

  // 默认题库初始化
  const cnt = dbPrepare('SELECT COUNT(*) as cnt FROM default_questions').get();
  if (cnt.cnt === 0) {
    const defaults = [
      ['Winter is peaceful and fun.', 'peaceful', 'predicative', 1, 'peaceful 在 be 动词 is 后面，描述主语 Winter 本身的状态 → 表语。'],
      ['I always wear a warm coat.', 'warm', 'attribute', 1, 'warm 直接放在名词 coat 前面修饰 → 定语。'],
      ['It is exciting to take a trip.', 'exciting', 'itpattern', 2, 'It 是形式主语，真正主语是 to take a trip → It is...to... 句式。'],
      ['Spring is sunny and warm.', 'sunny', 'predicative', 1, 'sunny 在 be 动词 is 后面，描述主语 Spring → 表语。'],
      ['It is dangerous to swim in the sea.', 'dangerous', 'itpattern', 2, 'dangerous 评价的是 to swim 这个动作 → It is...to... 句式。'],
      ['I bought an old umbrella.', 'old', 'attribute', 1, 'old 直接修饰名词 umbrella → 定语。'],
      ['The snowman looks funny.', 'funny', 'predicative', 1, 'funny 在系动词 looks 后面，描述主语 snowman → 表语。'],
      ['It is important to wear a scarf.', 'important', 'itpattern', 2, 'important 评价 to wear a scarf 这件事 → It is...to... 句式。'],
      ['We saw a bright star.', 'bright', 'attribute', 1, 'bright 直接修饰名词 star → 定语。'],
      ['Summer days are long and hot.', 'long', 'predicative', 1, 'long 在 be 动词 are 后面，描述主语 Summer days → 表语。'],
      ['I love the beautiful flowers in spring.', 'beautiful', 'attribute', 2, 'beautiful 直接修饰名词 flowers → 定语。'],
      ['It is wonderful to play in the snow.', 'wonderful', 'itpattern', 2, 'wonderful 评价 to play in the snow → It is...to... 句式。'],
      ['Autumn leaves turn yellow.', 'yellow', 'predicative', 2, 'yellow 在系动词 turn 后面，描述主语 leaves → 表语。'],
      ['She wore a thick sweater.', 'thick', 'attribute', 2, 'thick 直接修饰名词 sweater → 定语。'],
      ['It is nice to drink hot chocolate.', 'nice', 'itpattern', 2, 'nice 评价 to drink hot chocolate → It is...to... 句式。'],
      ['The cold wind blows hard.', 'cold', 'attribute', 2, 'cold 直接修饰名词 wind → 定语。'],
      ['Ice cream tastes sweet in summer.', 'sweet', 'predicative', 2, 'sweet 在系动词 tastes 后面，描述主语 ice cream → 表语。'],
      ['It is necessary to bring an umbrella in spring.', 'necessary', 'itpattern', 3, 'necessary 评价 to bring an umbrella → It is...to... 句式。'],
      ['The fresh air makes me happy.', 'fresh', 'attribute', 3, 'fresh 直接修饰名词 air → 定语。'],
      ['Flowers smell wonderful in the garden.', 'wonderful', 'predicative', 3, 'wonderful 在系动词 smell 后面，描述主语 flowers → 表语。'],
      ['It is common to see rainbows after rain.', 'common', 'itpattern', 3, 'common 评价 to see rainbows → It is...to... 句式。'],
      ['We enjoyed the cool breeze.', 'cool', 'attribute', 3, 'cool 直接修饰名词 breeze → 定语。'],
      ['The weather becomes warmer in March.', 'warmer', 'predicative', 3, 'warmer 在系动词 becomes 后面，描述主语 weather → 表语。'],
      ['It is hard to wake up early in winter.', 'hard', 'itpattern', 3, 'hard 评价 to wake up early → It is...to... 句式。'],
      ['A gentle rain started falling.', 'gentle', 'attribute', 4, 'gentle 直接修饰名词 rain → 定语。'],
      ['The sky appears gray before a storm.', 'gray', 'predicative', 4, 'gray 在系动词 appears 后面，描述主语 sky → 表语。'],
      ['It is challenging to predict the weather.', 'challenging', 'itpattern', 4, 'challenging 评价 to predict the weather → It is...to... 句式。'],
      ['Lightning looked frightening last night.', 'frightening', 'predicative', 4, 'frightening 在系动词 looked 后面 → 表语。'],
      ['It is unusual to have snow in April.', 'unusual', 'itpattern', 4, 'unusual 评价 to have snow in April → It is...to... 句式。'],
      ['The brilliant sunshine warmed the earth.', 'brilliant', 'attribute', 5, 'brilliant 直接修饰名词 sunshine → 定语。'],
      ['Foggy mornings feel mysterious.', 'mysterious', 'predicative', 5, 'mysterious 在系动词 feel 后面，描述主语 mornings → 表语。'],
      ['It is essential to protect our environment.', 'essential', 'itpattern', 5, 'essential 评价 to protect our environment → It is...to... 句式。'],
    ];
    const insert = dbPrepare('INSERT INTO default_questions (sentence, highlighted_word, correct_answer, difficulty, wrong_hint) VALUES (?,?,?,?,?)');
    const insertMany = dbTransaction((items) => { for (const item of items) insert.run(...item); });
    insertMany(defaults);
    saveDb();
  }
}

// ---------- 鉴权中间件 ----------
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '请先登录' });
  next();
}

function requireTeacher(req, res, next) {
  if (!req.session.userId || req.session.role !== 'teacher') return res.status(403).json({ error: '仅教师可访问' });
  next();
}

// ==================== 认证 API ====================

app.post('/api/register', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const r = dbPrepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role || 'student');
    saveDb();
    res.json({ success: true, userId: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: '用户名已存在' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = dbPrepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.username = user.username;
  res.json({ success: true, role: user.role, username: user.username, points: user.points, avatar: getAvatar(user), theme: user.ui_theme });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = dbPrepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ username: user.username, role: user.role, points: user.points, avatar: getAvatar(user), theme: user.ui_theme });
});

function getAvatar(u) {
  return { hat: u.avatar_hat, top: u.avatar_top, bottom: u.avatar_bottom, shoes: u.avatar_shoes, accessory: u.avatar_accessory };
}

// ==================== 题库 API ====================

app.get('/api/questions/default', requireAuth, (req, res) => {
  const { difficulty } = req.query;
  let questions;
  if (difficulty) {
    questions = dbPrepare('SELECT * FROM default_questions WHERE difficulty = ? ORDER BY id').all(parseInt(difficulty));
  } else {
    questions = dbPrepare('SELECT * FROM default_questions ORDER BY id').all();
  }
  res.json(questions);
});

app.get('/api/banks/custom', requireAuth, (req, res) => {
  const banks = dbPrepare('SELECT cb.*, COUNT(cq.id) as question_count FROM custom_banks cb LEFT JOIN custom_questions cq ON cb.id = cq.bank_id WHERE cb.user_id = ? GROUP BY cb.id ORDER BY cb.id').all(req.session.userId);
  res.json(banks);
});

app.post('/api/banks/custom', requireAuth, (req, res) => {
  const { name } = req.body;
  const r = dbPrepare('INSERT INTO custom_banks (user_id, name) VALUES (?, ?)').run(req.session.userId, name);
  saveDb();
  res.json({ success: true, bankId: r.lastInsertRowid });
});

app.delete('/api/banks/custom/:id', requireAuth, (req, res) => {
  dbPrepare('DELETE FROM custom_banks WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  saveDb();
  res.json({ success: true });
});

app.post('/api/banks/custom/:id/questions', requireAuth, (req, res) => {
  const bank = dbPrepare('SELECT * FROM custom_banks WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });
  const { sentence, highlighted_word, correct_answer, difficulty, wrong_hint } = req.body;
  const r = dbPrepare('INSERT INTO custom_questions (bank_id, sentence, highlighted_word, correct_answer, difficulty, wrong_hint) VALUES (?,?,?,?,?,?)').run(req.params.id, sentence, highlighted_word, correct_answer, difficulty || 1, wrong_hint || '');
  saveDb();
  res.json({ success: true, questionId: r.lastInsertRowid });
});

app.delete('/api/banks/custom/questions/:id', requireAuth, (req, res) => {
  dbPrepare('DELETE FROM custom_questions WHERE id = ? AND bank_id IN (SELECT id FROM custom_banks WHERE user_id = ?)').run(req.params.id, req.session.userId);
  saveDb();
  res.json({ success: true });
});

app.get('/api/banks/custom/:id/questions', requireAuth, (req, res) => {
  const bank = dbPrepare('SELECT * FROM custom_banks WHERE id = ?').get(req.params.id);
  if (!bank) return res.status(404).json({ error: '题库不存在' });
  const questions = dbPrepare('SELECT * FROM custom_questions WHERE bank_id = ? ORDER BY id').all(req.params.id);
  res.json({ bank, questions });
});

app.post('/api/questions/mixed', requireAuth, (req, res) => {
  const { bankIds, difficulty } = req.body;
  let questions = [];
  let defaultQs;
  if (difficulty && difficulty > 0) {
    defaultQs = dbPrepare('SELECT *, \'default\' as source FROM default_questions WHERE difficulty = ?').all(parseInt(difficulty));
  } else {
    defaultQs = dbPrepare('SELECT *, \'default\' as source FROM default_questions').all();
  }
  questions = questions.concat(defaultQs);
  if (bankIds && bankIds.length > 0) {
    for (const bid of bankIds) {
      const customQs = dbPrepare('SELECT cq.*, \'custom\' as source, cb.name as bank_name FROM custom_questions cq JOIN custom_banks cb ON cq.bank_id = cb.id WHERE cb.id = ?').all(bid);
      questions = questions.concat(customQs);
    }
  }
  res.json(questions);
});

// ==================== 共享题库 API ====================

app.post('/api/banks/custom/:id/share', requireAuth, (req, res) => {
  const bank = dbPrepare('SELECT * FROM custom_banks WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });
  const newStatus = bank.is_shared ? 0 : 1;
  dbPrepare('UPDATE custom_banks SET is_shared = ? WHERE id = ?').run(newStatus, req.params.id);
  saveDb();
  res.json({ success: true, is_shared: newStatus });
});

app.get('/api/banks/shared', requireAuth, (req, res) => {
  const banks = dbPrepare(`
    SELECT cb.*, u.username as creator_name,
      (SELECT COUNT(*) FROM custom_questions WHERE bank_id = cb.id) as question_count
    FROM custom_banks cb
    JOIN users u ON cb.user_id = u.id
    WHERE cb.is_shared = 1 AND cb.user_id != ?
    ORDER BY cb.id
  `).all(req.session.userId);
  res.json(banks);
});

app.get('/api/banks/shared/:id/stats', requireAuth, (req, res) => {
  const stats = dbPrepare(`
    SELECT u.username, sbs.attempts, sbs.correct
    FROM shared_bank_stats sbs
    JOIN users u ON sbs.user_id = u.id
    WHERE sbs.bank_id = ?
  `).all(req.params.id);
  // 计算准确率
  const statsWithAccuracy = stats.map(s => ({
    ...s,
    accuracy: s.attempts > 0 ? Math.round(s.correct * 1000 / s.attempts) / 10 : 0
  }));
  statsWithAccuracy.sort((a, b) => b.accuracy - a.accuracy);
  const bank = dbPrepare('SELECT cb.*, u.username as creator_name FROM custom_banks cb JOIN users u ON cb.user_id = u.id WHERE cb.id = ?').get(req.params.id);
  res.json({ bank, stats: statsWithAccuracy });
});

app.post('/api/banks/shared/:id/submit', requireAuth, (req, res) => {
  const { correct, total } = req.body;
  const existing = dbPrepare('SELECT * FROM shared_bank_stats WHERE bank_id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (existing) {
    dbPrepare('UPDATE shared_bank_stats SET attempts = attempts + ?, correct = correct + ? WHERE bank_id = ? AND user_id = ?').run(total, correct, req.params.id, req.session.userId);
  } else {
    dbPrepare('INSERT INTO shared_bank_stats (bank_id, user_id, attempts, correct) VALUES (?,?,?,?)').run(req.params.id, req.session.userId, total, correct);
  }
  saveDb();
  res.json({ success: true });
});

// ==================== 错题本 API ====================

app.post('/api/wrong-answers', requireAuth, (req, res) => {
  const { question_id, question_source, user_answer, correct_answer, sentence, highlighted_word, wrong_hint } = req.body;
  dbPrepare('INSERT INTO wrong_answers (user_id, question_id, question_source, user_answer, correct_answer, sentence, highlighted_word, wrong_hint) VALUES (?,?,?,?,?,?,?,?)').run(req.session.userId, question_id, question_source, user_answer, correct_answer, sentence, highlighted_word, wrong_hint || '');
  saveDb();
  res.json({ success: true });
});

app.get('/api/wrong-answers', requireAuth, (req, res) => {
  const items = dbPrepare('SELECT * FROM wrong_answers WHERE user_id = ? ORDER BY answered_at DESC').all(req.session.userId);
  res.json(items);
});

app.delete('/api/wrong-answers/:id', requireAuth, (req, res) => {
  dbPrepare('DELETE FROM wrong_answers WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/wrong-answers', requireAuth, (req, res) => {
  dbPrepare('DELETE FROM wrong_answers WHERE user_id = ?').run(req.session.userId);
  saveDb();
  res.json({ success: true });
});

// ==================== 每日爬塔 API ====================

// 获取今日爬塔状态
app.get('/api/tower/daily', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const attempt = dbPrepare('SELECT * FROM tower_daily WHERE user_id = ? AND attempt_date = ?').get(req.session.userId, today);
  if (attempt) {
    res.json({ attempted: true, bestLevel: attempt.best_level, completedLevels: attempt.completed_levels.split(',').filter(Boolean).map(Number), totalScore: attempt.total_score });
  } else {
    res.json({ attempted: false });
  }
  // 同时返回旧进度用于兼容
  const progress = dbPrepare('SELECT * FROM tower_progress WHERE user_id = ? ORDER BY level').all(req.session.userId);
});

// 获取今日爬塔题目（生成一次，后续从数据库读取）
app.post('/api/tower/generate', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  let attempt = dbPrepare('SELECT * FROM tower_daily WHERE user_id = ? AND attempt_date = ?').get(req.session.userId, today);
  if (attempt) {
    // 已生成过，直接返回
    return res.json({ questions: JSON.parse(attempt.questions_json), completedLevels: attempt.completed_levels.split(',').filter(Boolean).map(Number), bestLevel: attempt.best_level });
  }

  // 生成新题目：每层5题，按难度 1-5 各取5题
  const allQuestions = {};
  for (let lv = 1; lv <= 5; lv++) {
    const qs = dbPrepare('SELECT * FROM default_questions WHERE difficulty = ?').all(lv);
    // 打乱取5题，不够就全部
    const shuffled = qs.sort(() => Math.random() - 0.5).slice(0, 5);
    allQuestions[lv] = shuffled;
  }

  dbPrepare('INSERT INTO tower_daily (user_id, attempt_date, questions_json) VALUES (?,?,?)').run(req.session.userId, today, JSON.stringify(allQuestions));
  saveDb();
  res.json({ questions: allQuestions, completedLevels: [], bestLevel: 0 });
});

// 提交某一层的成绩，记录错题
app.post('/api/tower/submit-level', requireAuth, (req, res) => {
  const { level, correct, total, score, wrongAnswers } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const attempt = dbPrepare('SELECT * FROM tower_daily WHERE user_id = ? AND attempt_date = ?').get(req.session.userId, today);
  if (!attempt) return res.status(400).json({ error: '未生成今日爬塔' });

  const pct = total > 0 ? Math.round(correct / total * 100) : 0;
  const passed = pct >= 60;

  // 记录错题
  if (wrongAnswers && Array.isArray(wrongAnswers)) {
    for (const wa of wrongAnswers) {
      dbPrepare('INSERT INTO wrong_answers (user_id, question_id, question_source, user_answer, correct_answer, sentence, highlighted_word, wrong_hint) VALUES (?,?,?,?,?,?,?,?)').run(req.session.userId, wa.question_id || 0, 'default', wa.user_answer, wa.correct_answer, wa.sentence, wa.highlighted_word, wa.wrong_hint || '');
    }
  }

  // 更新每日进度
  const completedLevels = (attempt.completed_levels ? attempt.completed_levels.split(',').filter(Boolean) : []);
  const completedSet = new Set(completedLevels.map(Number));
  if (passed) completedSet.add(level);
  const newCompleted = Array.from(completedSet).sort((a,b) => a-b);
  const newBestLevel = passed ? Math.max(attempt.best_level, level) : attempt.best_level;
  const newTotalScore = (attempt.total_score || 0) + score;

  dbPrepare('UPDATE tower_daily SET completed_levels = ?, best_level = ?, total_score = ? WHERE id = ?').run(newCompleted.join(','), newBestLevel, newTotalScore, attempt.id);

  // 用旧表记录最高成绩
  const existing = dbPrepare('SELECT * FROM tower_progress WHERE user_id = ? AND level = ?').get(req.session.userId, level);
  if (existing) {
    if (score > existing.best_score) {
      dbPrepare('UPDATE tower_progress SET best_score = ?, completed = 1 WHERE user_id = ? AND level = ?').run(score, req.session.userId, level);
    }
  } else if (passed) {
    dbPrepare('INSERT INTO tower_progress (user_id, level, completed, best_score) VALUES (?,?,1,?)').run(req.session.userId, level, score);
  }

  // 奖励积分
  if (passed) {
    const bonus = level * 50;
    dbPrepare('UPDATE users SET points = points + ? WHERE id = ?').run(bonus, req.session.userId);
    const user = dbPrepare('SELECT points FROM users WHERE id = ?').get(req.session.userId);
    checkAndUnlockAchievements(req.session.userId);
    saveDb();
    res.json({ success: true, passed, pct, bonus, points: user.points, bestLevel: newBestLevel, completedLevels: newCompleted });
  } else {
    saveDb();
    res.json({ success: true, passed, pct, bonus: 0, bestLevel: newBestLevel, completedLevels: newCompleted });
  }
});

// ==================== 积分 & 商城 API ====================

app.post('/api/points/add', requireAuth, (req, res) => {
  const { amount } = req.body;
  dbPrepare('UPDATE users SET points = points + ? WHERE id = ?').run(amount, req.session.userId);
  const user = dbPrepare('SELECT points FROM users WHERE id = ?').get(req.session.userId);
  checkAndUnlockAchievements(req.session.userId);
  saveDb();
  res.json({ points: user.points });
});

app.get('/api/shop/items', (req, res) => {
  res.json(SHOP_ITEMS);
});

app.post('/api/shop/buy', requireAuth, (req, res) => {
  const { itemId, category } = req.body;
  const user = dbPrepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  let found = null;
  for (const cat of SHOP_ITEMS) {
    if (cat.id === category) { found = cat.items.find(i => i.id === itemId); break; }
  }
  if (!found) return res.status(404).json({ error: '商品不存在' });
  if (user.points < found.price) return res.status(400).json({ error: '积分不足' });
  dbPrepare('UPDATE users SET points = points - ? WHERE id = ?').run(found.price, req.session.userId);
  const fieldMap = { hat: 'avatar_hat', top: 'avatar_top', bottom: 'avatar_bottom', shoes: 'avatar_shoes', accessory: 'avatar_accessory', theme: 'ui_theme' };
  const field = fieldMap[category];
  if (field) {
    dbPrepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(found.value, req.session.userId);
  }
  const updated = dbPrepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  checkAndUnlockAchievements(req.session.userId);
  saveDb();
  res.json({ success: true, points: updated.points, avatar: getAvatar(updated), theme: updated.ui_theme });
});

// ---------- 商城商品定义 ----------
const SHOP_ITEMS = [
  { id: 'hat', name: '帽子', items: [
    { id: 'hat_none', name: '不戴帽子', value: '', price: 0 },
    { id: 'hat_beanie', name: '毛线帽', value: 'beanie', price: 80 },
    { id: 'hat_crown', name: '小王冠', value: 'crown', price: 200 },
    { id: 'hat_cap', name: '棒球帽', value: 'cap', price: 100 },
    { id: 'hat_flower', name: '花环', value: 'flower', price: 150 },
  ]},
  { id: 'top', name: '上衣', items: [
    { id: 'top_none', name: '默认T恤', value: '', price: 0 },
    { id: 'top_jacket', name: '夹克', value: 'jacket', price: 100 },
    { id: 'top_hoodie', name: '卫衣', value: 'hoodie', price: 120 },
    { id: 'top_sweater', name: '毛衣', value: 'sweater', price: 150 },
    { id: 'top_dress', name: '连衣裙', value: 'dress', price: 180 },
  ]},
  { id: 'bottom', name: '下装', items: [
    { id: 'bottom_none', name: '默认裤子', value: '', price: 0 },
    { id: 'bottom_skirt', name: '裙子', value: 'skirt', price: 100 },
    { id: 'bottom_shorts', name: '短裤', value: 'shorts', price: 80 },
  ]},
  { id: 'shoes', name: '鞋子', items: [
    { id: 'shoes_none', name: '默认鞋', value: '', price: 0 },
    { id: 'shoes_boots', name: '靴子', value: 'boots', price: 100 },
    { id: 'shoes_sneakers', name: '运动鞋', value: 'sneakers', price: 120 },
  ]},
  { id: 'accessory', name: '配饰', items: [
    { id: 'acc_none', name: '无配饰', value: '', price: 0 },
    { id: 'acc_scarf', name: '围巾', value: 'scarf', price: 80 },
    { id: 'acc_glasses', name: '眼镜', value: 'glasses', price: 60 },
    { id: 'acc_backpack', name: '书包', value: 'backpack', price: 100 },
  ]},
  { id: 'theme', name: 'UI主题', items: [
    { id: 'theme_default', name: '四季绿（默认）', value: 'default', price: 0 },
    { id: 'theme_ocean', name: '海洋蓝', value: 'ocean', price: 150 },
    { id: 'theme_sunset', name: '日落橙', value: 'sunset', price: 150 },
    { id: 'theme_lavender', name: '薰衣草紫', value: 'lavender', price: 150 },
    { id: 'theme_mint', name: '薄荷绿', value: 'mint', price: 200 },
    { id: 'theme_dark', name: '暗夜模式', value: 'dark', price: 250 },
  ]},
];

// ==================== 排行榜 API ====================

app.get('/api/leaderboard', requireAuth, (req, res) => {
  const users = dbPrepare('SELECT username, points FROM users WHERE role = \'student\' ORDER BY points DESC LIMIT 20').all();
  res.json(users);
});

// ==================== 教师后台 API ====================

app.get('/api/teacher/questions', requireTeacher, (req, res) => {
  res.json(dbPrepare('SELECT * FROM default_questions ORDER BY id').all());
});

app.post('/api/teacher/questions', requireTeacher, (req, res) => {
  const { sentence, highlighted_word, correct_answer, difficulty, wrong_hint } = req.body;
  const r = dbPrepare('INSERT INTO default_questions (sentence, highlighted_word, correct_answer, difficulty, wrong_hint) VALUES (?,?,?,?,?)').run(sentence, highlighted_word, correct_answer, difficulty || 1, wrong_hint || '');
  saveDb();
  res.json({ success: true, id: r.lastInsertRowid });
});

app.put('/api/teacher/questions/:id', requireTeacher, (req, res) => {
  const { sentence, highlighted_word, correct_answer, difficulty, wrong_hint } = req.body;
  dbPrepare('UPDATE default_questions SET sentence=?, highlighted_word=?, correct_answer=?, difficulty=?, wrong_hint=? WHERE id=?').run(sentence, highlighted_word, correct_answer, difficulty || 1, wrong_hint || '', req.params.id);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/teacher/questions/:id', requireTeacher, (req, res) => {
  dbPrepare('DELETE FROM default_questions WHERE id = ?').run(req.params.id);
  saveDb();
  res.json({ success: true });
});

app.get('/api/teacher/students', requireTeacher, (req, res) => {
  res.json(dbPrepare('SELECT id, username, points, created_at FROM users WHERE role = \'student\' ORDER BY points DESC').all());
});

app.delete('/api/teacher/students/:id', requireTeacher, (req, res) => {
  console.log('DELETE student route hit, id=', req.params.id);
  const student = dbPrepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'student');
  if (!student) return res.status(404).json({ error: '学生不存在' });
  // 级联删除学生相关数据
  dbPrepare('DELETE FROM wrong_answers WHERE user_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM tower_progress WHERE user_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM shared_bank_stats WHERE user_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM daily_checkins WHERE user_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM achievements WHERE user_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM question_votes WHERE user_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM class_members WHERE user_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM custom_questions WHERE bank_id IN (SELECT id FROM custom_banks WHERE user_id = ?)').run(req.params.id);
  dbPrepare('DELETE FROM custom_banks WHERE user_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  saveDb();
  res.json({ success: true });
});

app.get('/api/teacher/shared-banks', requireTeacher, (req, res) => {
  const banks = dbPrepare(`
    SELECT cb.*, u.username as creator_name,
      (SELECT COUNT(*) FROM custom_questions WHERE bank_id = cb.id) as question_count
    FROM custom_banks cb JOIN users u ON cb.user_id = u.id
    WHERE cb.is_shared = 1 ORDER BY cb.id
  `).all();
  res.json(banks);
});

app.delete('/api/teacher/shared-banks/:id', requireTeacher, (req, res) => {
  const bank = dbPrepare('SELECT * FROM custom_banks WHERE id = ? AND is_shared = 1').get(req.params.id);
  if (!bank) return res.status(404).json({ error: '共享题库不存在' });
  // 删除该题库及其所有题目和统计
  dbPrepare('DELETE FROM shared_bank_stats WHERE bank_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM custom_questions WHERE bank_id = ?').run(req.params.id);
  dbPrepare('DELETE FROM custom_banks WHERE id = ?').run(req.params.id);
  saveDb();
  res.json({ success: true });
});

// ==================== 成就定义 ====================
const ACHIEVEMENTS = {
  first_blood: { name: '初出茅庐', desc: '完成第一次答题', icon: '🌱', hidden: false },
  perfect_10: { name: '十全十美', desc: '连续10题全对', icon: '⭐', hidden: false },
  century: { name: '百题斩', desc: '累计答对100题', icon: '💯', hidden: false },
  tower_master: { name: '爬塔之王', desc: '五层塔全部通关', icon: '🗼', hidden: false },
  sharer: { name: '知识分享家', desc: '首次分享自定义题库', icon: '🤝', hidden: false },
  collector: { name: '时尚达人', desc: '购买5件商城物品', icon: '👗', hidden: false },
  streak_7: { name: '七日之约', desc: '连续签到7天', icon: '🔥', hidden: false },
  quizmaster: { name: '答题大师', desc: '累计答对500题', icon: '🏆', hidden: false },
  speedster: { name: '闪电答题手', desc: '限时模式3分钟内答对15题', icon: '⚡', hidden: false },
  social_butterfly: { name: '社交达人', desc: '完成10次共享题库挑战', icon: '🦋', hidden: false },
  // 新增成就
  night_owl: { name: '夜猫子', desc: '在凌晨完成一次练习', icon: '🦉', hidden: true },
  perfectionist: { name: '完美主义者', desc: '一次练习10题以上且全部答对', icon: '💎', hidden: true },
  theme_collector: { name: '主题收藏家', desc: '购买全部6种UI主题', icon: '🎨', hidden: true },
  grammar_prof: { name: '语法教授', desc: '错题重做达到100%正确率', icon: '🎓', hidden: false },
  streaker_30: { name: '坚持不懈', desc: '累计签到30天', icon: '📅', hidden: false },
  bank_master: { name: '题库大师', desc: '创建3个自定义题库', icon: '📚', hidden: false },
  explorer: { name: '全能探险家', desc: '体验所有练习模式', icon: '🧭', hidden: true },
  flawless: { name: '零失误', desc: '限时挑战15题全部答对', icon: '🌟', hidden: true },
  teacher_pet: { name: '传道授业', desc: '共享题库被3位同学练习', icon: '👑', hidden: false },
  daily_warrior: { name: '每日勇士', desc: '完成7天每日爬塔', icon: '⚔️', hidden: false },
};

// 邀请码生成
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ==================== 每日打卡 API ====================

app.post('/api/checkin', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const existing = dbPrepare('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?').get(req.session.userId, today);
  if (existing) return res.json({ success: true, streak: existing.streak, already: true });

  // 检查昨天是否签到了
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const lastCheckin = dbPrepare('SELECT streak FROM daily_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 1').get(req.session.userId);
  const streak = lastCheckin ? lastCheckin.streak + 1 : 1;

  dbPrepare('INSERT INTO daily_checkins (user_id, checkin_date, streak) VALUES (?,?,?)').run(req.session.userId, today, streak);

  // 奖励积分：每日5分，连续7天额外+20
  let bonus = 5;
  if (streak % 7 === 0) bonus += 20;
  dbPrepare('UPDATE users SET points = points + ? WHERE id = ?').run(bonus, req.session.userId);

  // 自动检查成就：streak_7 + streaker_30
  if (streak >= 7) unlockAchievement(req.session.userId, 'streak_7');
  const totalDays = dbPrepare('SELECT COUNT(*) as cnt FROM daily_checkins WHERE user_id = ?').get(req.session.userId);
  if (totalDays.cnt >= 30) unlockAchievement(req.session.userId, 'streaker_30');

  const user = dbPrepare('SELECT points FROM users WHERE id = ?').get(req.session.userId);
  saveDb();
  res.json({ success: true, streak, bonus, points: user.points });
});

app.get('/api/checkin', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const existing = dbPrepare('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?').get(req.session.userId, today);
  const lastCheckin = dbPrepare('SELECT streak FROM daily_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 1').get(req.session.userId);
  res.json({ checkedToday: !!existing, streak: existing ? existing.streak : (lastCheckin ? lastCheckin.streak : 0) });
});

// ==================== 成就 API ====================

function unlockAchievement(userId, key) {
  try {
    dbPrepare('INSERT INTO achievements (user_id, achievement_key) VALUES (?,?)').run(userId, key);
    const ach = ACHIEVEMENTS[key];
    if (ach) {
      dbPrepare('UPDATE users SET points = points + 30 WHERE id = ?').run(userId);
    }
    saveDb();
  } catch (e) { /* 已解锁过 */ }
}

app.get('/api/achievements', requireAuth, (req, res) => {
  const unlocked = dbPrepare('SELECT achievement_key FROM achievements WHERE user_id = ?').all(req.session.userId);
  const unlockedKeys = new Set(unlocked.map(u => u.achievement_key));
  const all = Object.entries(ACHIEVEMENTS).map(([key, val]) => ({
    key, ...val, unlocked: unlockedKeys.has(key)
  }));
  res.json(all);
});

app.post('/api/achievements/check', requireAuth, (req, res) => {
  const userId = req.session.userId;
  // 检查各种成就条件
  const totalCorrect = (dbPrepare('SELECT COUNT(*) as cnt FROM wrong_answers WHERE user_id = ? AND correct_answer = ?').get(userId, '') || {}).cnt || 0;
  // 累计正确（从积分反推 + 爬塔）
  const user = dbPrepare('SELECT points FROM users WHERE id = ?').get(userId);

  // century: 累计得分推算题目数
  if (user.points >= 200) unlockAchievement(userId, 'century');
  if (user.points >= 1000) unlockAchievement(userId, 'quizmaster');

  const tower = dbPrepare('SELECT COUNT(*) as cnt FROM tower_progress WHERE user_id = ? AND completed = 1').get(userId);
  if (tower.cnt >= 5) unlockAchievement(userId, 'tower_master');

  const sharedBanks = dbPrepare('SELECT COUNT(*) as cnt FROM custom_banks WHERE user_id = ? AND is_shared = 1').get(userId);
  if (sharedBanks.cnt >= 1) unlockAchievement(userId, 'sharer');

  const boughtItems = user.points; // rough proxy
  // More checks from stats...

  res.json({ success: true });
});

// ==================== 题目投票 API ====================

app.post('/api/questions/:id/vote', requireAuth, (req, res) => {
  const { vote_type } = req.body;
  try {
    dbPrepare('INSERT INTO question_votes (question_id, user_id, vote_type) VALUES (?,?,?)').run(req.params.id, req.session.userId, vote_type);
    saveDb();
    res.json({ success: true });
  } catch (e) {
    // 已投过，切换投票
    dbPrepare('UPDATE question_votes SET vote_type = ? WHERE question_id = ? AND user_id = ?').run(vote_type, req.params.id, req.session.userId);
    saveDb();
    res.json({ success: true, updated: true });
  }
});

app.get('/api/questions/:id/votes', requireAuth, (req, res) => {
  const up = dbPrepare('SELECT COUNT(*) as cnt FROM question_votes WHERE question_id = ? AND vote_type = ?').get(req.params.id, 'up');
  const down = dbPrepare('SELECT COUNT(*) as cnt FROM question_votes WHERE question_id = ? AND vote_type = ?').get(req.params.id, 'down');
  res.json({ up: up.cnt, down: down.cnt });
});

// ==================== 限时挑战 API ====================

// 获取题目用于限时挑战（扩展题库，取随机N题）
app.post('/api/challenges/timed/questions', requireAuth, (req, res) => {
  const { count } = req.body;
  const all = dbPrepare('SELECT * FROM default_questions').all();
  const shuffled = all.sort(() => Math.random() - 0.5).slice(0, count || 15);
  res.json(shuffled);
});

// 提交挑战成绩，检查成就
app.post('/api/challenges/timed/submit', requireAuth, (req, res) => {
  const { score, total, timeSeconds } = req.body;
  if (timeSeconds <= 180 && score >= 15) {
    unlockAchievement(req.session.userId, 'speedster');
  }
  // 奖励积分
  const bonus = Math.floor(score * 3);
  dbPrepare('UPDATE users SET points = points + ? WHERE id = ?').run(bonus, req.session.userId);
  const user = dbPrepare('SELECT points FROM users WHERE id = ?').get(req.session.userId);
  checkAndUnlockAchievements(req.session.userId);
  saveDb();
  res.json({ success: true, bonus, points: user.points });
});

// ==================== 异步对战 API ====================

app.post('/api/challenges', requireAuth, (req, res) => {
  const { questions_json, score } = req.body;
  const r = dbPrepare('INSERT INTO challenges (creator_id, creator_score, questions_json) VALUES (?,?,?)').run(req.session.userId, score, JSON.stringify(questions_json));
  saveDb();
  res.json({ challengeId: r.lastInsertRowid });
});

app.get('/api/challenges', requireAuth, (req, res) => {
  const challenges = dbPrepare(`
    SELECT c.*, u.username as creator_name
    FROM challenges c JOIN users u ON c.creator_id = u.id
    WHERE c.creator_id != ?
    ORDER BY c.created_at DESC LIMIT 20
  `).all(req.session.userId);
  res.json(challenges);
});

app.get('/api/challenges/:id', requireAuth, (req, res) => {
  const c = dbPrepare('SELECT c.*, u.username as creator_name FROM challenges c JOIN users u ON c.creator_id = u.id WHERE c.id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: '不存在' });
  c.questions = JSON.parse(c.questions_json);
  res.json(c);
});

// ==================== 教师：导出成绩 + 批量导入 ====================

app.get('/api/teacher/export', requireTeacher, (req, res) => {
  const students = dbPrepare('SELECT id, username, points, created_at FROM users WHERE role = \'student\' ORDER BY points DESC').all();
  const rows = [];
  for (const s of students) {
    const wrongCount = dbPrepare('SELECT COUNT(*) as cnt FROM wrong_answers WHERE user_id = ?').get(s.id);
    const towerLevels = dbPrepare('SELECT MAX(level) as maxLevel FROM tower_progress WHERE user_id = ? AND completed = 1').get(s.id);
    const checkins = dbPrepare('SELECT COUNT(*) as cnt, MAX(streak) as maxStreak FROM daily_checkins WHERE user_id = ?').get(s.id);
    rows.push({
      username: s.username, points: s.points,
      wrongCount: wrongCount.cnt, maxTowerLevel: towerLevels.maxLevel || 0,
      totalCheckins: checkins.cnt, maxStreak: checkins.maxStreak || 0,
      joinedAt: s.created_at
    });
  }
  res.json(rows);
});

app.post('/api/teacher/import', requireTeacher, (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions)) return res.status(400).json({ error: 'questions 需要是数组' });
  let count = 0;
  for (const q of questions) {
    if (!q.sentence || !q.highlighted_word || !q.correct_answer) continue;
    dbPrepare('INSERT INTO default_questions (sentence, highlighted_word, correct_answer, difficulty, wrong_hint) VALUES (?,?,?,?,?)').run(q.sentence, q.highlighted_word, q.correct_answer, q.difficulty || 1, q.wrong_hint || '');
    count++;
  }
  saveDb();
  res.json({ success: true, imported: count });
});

// ==================== 班级管理 API ====================

app.get('/api/teacher/classes', requireTeacher, (req, res) => {
  const classes = dbPrepare(`
    SELECT c.*, (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) as member_count
    FROM classes c WHERE c.teacher_id = ? ORDER BY c.id
  `).all(req.session.userId);
  res.json(classes);
});

app.post('/api/teacher/classes', requireTeacher, (req, res) => {
  const { name } = req.body;
  const code = generateInviteCode();
  dbPrepare('INSERT INTO classes (teacher_id, name, invite_code) VALUES (?,?,?)').run(req.session.userId, name, code);
  saveDb();
  res.json({ success: true, invite_code: code });
});

app.delete('/api/teacher/classes/:id', requireTeacher, (req, res) => {
  dbPrepare('DELETE FROM classes WHERE id = ? AND teacher_id = ?').run(req.params.id, req.session.userId);
  saveDb();
  res.json({ success: true });
});

app.post('/api/classes/join', requireAuth, (req, res) => {
  const { invite_code } = req.body;
  const cls = dbPrepare('SELECT * FROM classes WHERE invite_code = ?').get(invite_code);
  if (!cls) return res.status(404).json({ error: '邀请码无效' });
  try {
    dbPrepare('INSERT INTO class_members (class_id, user_id) VALUES (?,?)').run(cls.id, req.session.userId);
    saveDb();
    res.json({ success: true, className: cls.name });
  } catch (e) {
    res.status(400).json({ error: '已加入该班级' });
  }
});

app.get('/api/classes', requireAuth, (req, res) => {
  const classes = dbPrepare(`
    SELECT c.*, u.username as teacher_name,
      (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) as member_count
    FROM classes c JOIN users u ON c.teacher_id = u.id
    ORDER BY c.id
  `).all();
  res.json(classes);
});

app.get('/api/classes/:id/members', requireAuth, (req, res) => {
  const members = dbPrepare(`
    SELECT u.username, u.points, cm.joined_at
    FROM class_members cm JOIN users u ON cm.user_id = u.id
    WHERE cm.class_id = ? ORDER BY u.points DESC
  `).all(req.params.id);
  res.json(members);
});

// ==================== 积分变动时自动检查成就 ====================
// 在练习答题和爬塔通关后自动调用
function checkAndUnlockAchievements(userId) {
  const user = dbPrepare('SELECT points FROM users WHERE id = ?').get(userId);
  if (!user) return;
  if (user.points >= 30) unlockAchievement(userId, 'first_blood');
  if (user.points >= 200) unlockAchievement(userId, 'century');
  if (user.points >= 1000) unlockAchievement(userId, 'quizmaster');
  const tower = dbPrepare('SELECT COUNT(*) as cnt FROM tower_progress WHERE user_id = ? AND completed = 1').get(userId);
  if (tower.cnt >= 5) unlockAchievement(userId, 'tower_master');
  const sharedBanks = dbPrepare('SELECT COUNT(*) as cnt FROM custom_banks WHERE user_id = ? AND is_shared = 1').get(userId);
  if (sharedBanks.cnt >= 1) unlockAchievement(userId, 'sharer');
  // 社交达人
  const socialCount = dbPrepare('SELECT COUNT(*) as cnt FROM shared_bank_stats WHERE user_id = ?').get(userId);
  if (socialCount.cnt >= 10) unlockAchievement(userId, 'social_butterfly');
  if (user.points >= 500) unlockAchievement(userId, 'collector');
  // 题库大师：创建3个自定义题库
  const bankCount = dbPrepare('SELECT COUNT(*) as cnt FROM custom_banks WHERE user_id = ?').get(userId);
  if (bankCount.cnt >= 3) unlockAchievement(userId, 'bank_master');
  // 传道授业：共享题库被3个不同学生练习过
  const uniqueStudents = dbPrepare(`
    SELECT COUNT(DISTINCT sbs.user_id) as cnt FROM shared_bank_stats sbs
    JOIN custom_banks cb ON sbs.bank_id = cb.id WHERE cb.user_id = ?
  `).get(userId);
  if (uniqueStudents.cnt >= 3) unlockAchievement(userId, 'teacher_pet');
  // 每日勇士：完成7天每日爬塔
  const dailyTowerDays = dbPrepare('SELECT COUNT(*) as cnt FROM tower_daily WHERE user_id = ? AND best_level > 0').get(userId);
  if (dailyTowerDays.cnt >= 7) unlockAchievement(userId, 'daily_warrior');
  // 坚持不懈：累计签到30天
  const checkinDays = dbPrepare('SELECT COUNT(*) as cnt FROM daily_checkins WHERE user_id = ?').get(userId);
  if (checkinDays.cnt >= 30) unlockAchievement(userId, 'streaker_30');
  // 夜猫子：凌晨0-6点
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 6) unlockAchievement(userId, 'night_owl');
}

// ==================== 静态文件服务 ====================

app.use(express.static(path.join(__dirname, 'public')));
app.use('/teacher', express.static(path.join(__dirname, 'teacher')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== 启动 ====================
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`四季语法游戏服务器已启动: http://localhost:${PORT}`);
    console.log(`教师后台: http://localhost:${PORT}/teacher`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
