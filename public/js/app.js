// ==================== 全局状态 ====================
const state = {
  user: null,
  shopPreview: null,
  practice: { questions: [], index: 0, score: 0, correct: 0, wrongItems: [], answered: false, timed: false, timerSec: 0, settings: { difficulty: 0, count: 10, banks: ['default'] } },
  tower: { level: 0, questions: [], index: 0, score: 0, correct: 0, total: 5, answered: false },
  wrongRedo: { questions: [], index: 0, correct: 0, answered: false },
  shared: { bankId: null, questions: [], index: 0, score: 0, correct: 0, answered: false },
  battle: { questions: [], index: 0, score: 0, correct: 0, answered: false, challengeId: null },
};

// ==================== 音效 ====================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === 'correct') {
      osc.frequency.value = 660; osc.type = 'sine'; gain.gain.value = 0.2;
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
      setTimeout(() => {
        const o2 = ctx.createOscillator(); o2.connect(gain);
        o2.frequency.value = 880; o2.type = 'sine';
        o2.start(ctx.currentTime + 0.12); o2.stop(ctx.currentTime + 0.25);
      }, 120);
    } else {
      osc.frequency.value = 180; osc.type = 'sawtooth'; gain.gain.value = 0.15;
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    }
  } catch(e) {}
}

// ==================== API 封装 ====================
async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options, credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ==================== 导航 ====================
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  // 高亮导航
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  const navLink = document.querySelector(`.nav-links a[data-page="${page}"]`);
  if (navLink) navLink.classList.add('active');

  // 加载页面数据
  if (page === 'dashboard') loadDashboard();
  if (page === 'practice') loadPracticeSetup();
  if (page === 'tower') loadTower();
  if (page === 'wrongbook') loadWrongBook();
  if (page === 'banks') loadBanks();
  if (page === 'shared') loadShared();
  if (page === 'shop') loadShop();
  if (page === 'leaderboard') loadLeaderboard();
  if (page === 'achievements') loadAchievements();
  if (page === 'battle') loadBattles();
  if (page === 'classes') loadClasses();
}

// ==================== 认证 ====================
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-tab').forEach(t => { if (t.textContent.trim().startsWith(tab === 'login' ? '登' : '注')) t.classList.add('active'); });
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('auth-error').style.display = 'none';
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const role = document.getElementById('login-role').value;
  if (!username || !password) { showAuthError('请填写用户名和密码'); return; }
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    state.user = data;
    applyTheme(data.theme);
    document.getElementById('page-auth').classList.remove('active');
    document.getElementById('navbar').style.display = 'flex';
    if (data.role === 'teacher') {
      window.location.href = '/teacher/';
    } else {
      updateUserUI();
      navigate('dashboard');
    }
  } catch (e) { showAuthError(e.message); }
}

async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const role = document.getElementById('reg-role').value;
  if (!username || !password) { showAuthError('请填写用户名和密码'); return; }
  if (password.length < 4) { showAuthError('密码至少4位'); return; }
  try {
    await api('/api/register', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    showAuthError('注册成功！请登录', false);
    switchAuthTab('login');
    document.getElementById('login-username').value = username;
  } catch (e) { showAuthError(e.message); }
}

function showAuthError(msg, isError = true) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.color = isError ? 'var(--danger)' : 'var(--success)';
  el.style.display = 'block';
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  state.user = null;
  document.getElementById('navbar').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-auth').classList.add('active');
  document.body.className = '';
}

function updateUserUI() {
  if (!state.user) return;
  document.getElementById('nav-username').textContent = state.user.username;
  document.getElementById('nav-points').textContent = state.user.points;
}

async function refreshUser() {
  const data = await api('/api/me');
  state.user = data;
  updateUserUI();
  applyTheme(data.theme);
  return data;
}

function applyTheme(theme) {
  document.body.className = '';
  if (theme && theme !== 'default') document.body.classList.add('theme-' + theme);
}

// ==================== 仪表盘 ====================
async function loadDashboard() {
  const u = await refreshUser();
  document.getElementById('dash-name').textContent = u.username;
  document.getElementById('dash-points').textContent = u.points;
  // 签到状态
  try {
    const ci = await api('/api/checkin');
    if (ci.checkedToday) {
      document.getElementById('checkin-btn').style.display = 'none';
      document.getElementById('checkin-status').style.display = 'inline';
      document.getElementById('checkin-streak').textContent = ci.streak;
    } else {
      document.getElementById('checkin-btn').style.display = 'inline-block';
      document.getElementById('checkin-status').style.display = 'none';
    }
  } catch(e) {}
}

async function doCheckin() {
  try {
    const r = await api('/api/checkin', { method: 'POST' });
    document.getElementById('checkin-btn').style.display = 'none';
    document.getElementById('checkin-status').style.display = 'inline';
    document.getElementById('checkin-streak').textContent = r.streak;
    document.getElementById('dash-points').textContent = r.points;
    state.user.points = r.points;
    updateUserUI();
    if (r.streak % 7 === 0) alert(`🎉 连续签到 ${r.streak} 天！额外 +20 积分！`);
    else alert(`✅ 签到成功！连续 ${r.streak} 天，+${r.bonus} 积分`);
  } catch(e) { alert(e.message); }
}

// ==================== 练习模式 ====================
async function loadPracticeSetup() {
  await refreshUser();
  document.getElementById('practice-setup').style.display = 'block';
  document.getElementById('game-area').style.display = 'none';
  document.getElementById('result-area').style.display = 'none';
  // 加载自定义题库列表
  try {
    const banks = await api('/api/banks/custom');
    const container = document.getElementById('bank-chips');
    // 保留默认题库chip
    container.innerHTML = '<span class="bank-chip selected" data-bank="default" onclick="toggleBank(this, \'default\')">📦 默认题库 <span class="count">(32题)</span></span>';
    banks.forEach(b => {
      const chip = document.createElement('span');
      chip.className = 'bank-chip';
      chip.dataset.bank = 'custom_' + b.id;
      chip.innerHTML = `📝 ${b.name} <span class="count">(${b.question_count || '?'}题)</span>`;
      chip.onclick = () => toggleBank(chip, 'custom_' + b.id);
      container.appendChild(chip);
    });
  } catch (e) { console.error(e); }
}

function toggleBank(chip, bankId) {
  chip.classList.toggle('selected');
  if (bankId === 'default') {
    if (chip.classList.contains('selected')) {
      state.practice.settings.banks.push('default');
    } else {
      state.practice.settings.banks = state.practice.settings.banks.filter(b => b !== 'default');
    }
  } else {
    if (chip.classList.contains('selected')) {
      state.practice.settings.banks.push(bankId);
    } else {
      state.practice.settings.banks = state.practice.settings.banks.filter(b => b !== bankId);
    }
  }
}

function updateDiffLabel() {
  const v = parseInt(document.getElementById('diff-slider').value);
  document.getElementById('diff-label').textContent = v === 0 ? '全部' : 'Lv.' + v;
  state.practice.settings.difficulty = v;
}

function updateCountLabel() {
  const v = parseInt(document.getElementById('count-slider').value);
  document.getElementById('count-label').textContent = v + ' 题';
  state.practice.settings.count = v;
}

async function startPractice() {
  const { difficulty, count, banks } = state.practice.settings;
  const hasDefault = banks.includes('default');
  const customIds = banks.filter(b => b.startsWith('custom_')).map(b => parseInt(b.replace('custom_', '')));

  let questions;
  if (customIds.length === 0 && hasDefault) {
    // 只用默认题库
    questions = await api('/api/questions/default' + (difficulty > 0 ? '?difficulty=' + difficulty : ''));
  } else if (!hasDefault && customIds.length > 0) {
    // 只用自定义题库
    const data = await api('/api/questions/mixed', { method: 'POST', body: JSON.stringify({ bankIds: customIds, difficulty: difficulty > 0 ? difficulty : undefined }) });
    questions = data.filter(q => q.source === 'custom');
  } else {
    // 混合
    questions = await api('/api/questions/mixed', { method: 'POST', body: JSON.stringify({ bankIds: customIds, difficulty: difficulty > 0 ? difficulty : undefined }) });
  }

  if (questions.length === 0) {
    alert('当前设置下没有可用题目，请调整难度或题库选择。');
    return;
  }

  // 随机抽取 + 打乱
  questions = shuffle(questions).slice(0, count);
  state.practice = { ...state.practice, questions, index: 0, score: 0, correct: 0, wrongItems: [], answered: false, finished: false };
  state.practice.timed = document.getElementById('timed-mode')?.checked || false;
  state.practice.timerSec = state.practice.timed ? 180 : 0;
  if (state.practice.timerInterval) clearInterval(state.practice.timerInterval);

  document.getElementById('practice-setup').style.display = 'none';
  document.getElementById('game-area').style.display = 'block';
  document.getElementById('result-area').style.display = 'none';
  document.getElementById('timer-display').style.display = state.practice.timed ? 'block' : 'none';
  if (state.practice.timed) startTimer();
  showPracticeQuestion();
}

function startTimer() {
  updateTimerDisplay();
  state.practice.timerInterval = setInterval(() => {
    state.practice.timerSec--;
    updateTimerDisplay();
    if (state.practice.timerSec <= 0) {
      clearInterval(state.practice.timerInterval);
      showPracticeResult();
    }
  }, 1000);
}
function updateTimerDisplay() {
  const m = Math.floor(state.practice.timerSec / 60);
  const s = state.practice.timerSec % 60;
  document.getElementById('timer-display').textContent = `⏱️ ${m}:${String(s).padStart(2,'0')}`;
  if (state.practice.timerSec <= 30) document.getElementById('timer-display').style.animation = 'none';
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showPracticeQuestion() {
  const { questions, index } = state.practice;
  if (index >= questions.length) return showPracticeResult();

  state.practice.answered = false;
  const q = questions[index];
  document.getElementById('q-num').textContent = `第 ${index + 1} / ${questions.length} 题`;
  document.getElementById('q-sentence').innerHTML = highlightSentence(q.sentence, q.highlighted_word);
  document.getElementById('q-word').textContent = q.highlighted_word;
  document.getElementById('progress-fill').style.width = ((index) / questions.length * 100) + '%';

  const opts = document.getElementById('game-options');
  opts.innerHTML = '';
  [
    { label: '定语 (attribute)', value: 'attribute', desc: '修饰名词' },
    { label: '表语 (predicative)', value: 'predicative', desc: '在be/系动词后描述主语' },
    { label: 'It is...to...', value: 'itpattern', desc: '形式主语，真主语是to do' },
  ].forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'game-option';
    btn.innerHTML = `<div style="font-weight:600">${o.label}</div><div style="font-size:12px;color:var(--text-secondary)">${o.desc}</div>`;
    btn.onclick = () => answerPractice(o.value);
    opts.appendChild(btn);
  });

  document.getElementById('feedback').style.display = 'none';
  document.getElementById('next-btn').style.display = 'none';
  document.getElementById('progress-fill').style.width = ((index) / questions.length * 100) + '%';
}

function highlightSentence(sentence, word) {
  return sentence.replace(new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<span class="highlighted">$1</span>');
}

async function answerPractice(userAnswer) {
  if (state.practice.answered) return;
  state.practice.answered = true;

  const { questions, index } = state.practice;
  const q = questions[index];
  const correct = q.correct_answer === userAnswer;

  playSound(correct ? 'correct' : 'wrong');

  if (correct) {
    state.practice.correct++;
    state.practice.score += 10;
  } else {
    state.practice.wrongItems.push(q);
    // 记录错题
    try {
      await api('/api/wrong-answers', { method: 'POST', body: JSON.stringify({
        question_id: q.id || 0,
        question_source: q.source || 'default',
        user_answer: userAnswer,
        correct_answer: q.correct_answer,
        sentence: q.sentence,
        highlighted_word: q.highlighted_word,
        wrong_hint: q.wrong_hint || ''
      })});
    } catch (e) {}
    // 积分奖励答对也有
  }

  // 奖励少量积分
  if (correct) {
    try { await api('/api/points/add', { method: 'POST', body: JSON.stringify({ amount: 2 }) }); } catch (e) {}
  }

  // 高亮选项
  const opts = document.getElementById('game-options').children;
  const answerLabels = { attribute: 0, predicative: 1, itpattern: 2 };
  for (let i = 0; i < opts.length; i++) {
    opts[i].disabled = true;
    if (opts[i].textContent.includes(getLabelByValue(q.correct_answer).split(' ')[0])) {
      opts[i].classList.add('correct');
    }
  }
  if (!correct) {
    opts[answerLabels[userAnswer]].classList.add('wrong');
  }

  // 反馈
  const fb = document.getElementById('feedback');
  fb.style.display = 'block';
  fb.className = 'feedback-box ' + (correct ? 'correct' : 'wrong');
  if (correct) {
    fb.innerHTML = '✅ 回答正确！' + (q.wrong_hint ? `<br><small>${q.wrong_hint}</small>` : '');
  } else {
    fb.innerHTML = `❌ 回答错误！正确答案是：<strong>${getLabelByValue(q.correct_answer)}</strong>`;
    if (q.wrong_hint) fb.innerHTML += `<br><small>💡 ${q.wrong_hint}</small>`;
  }
  // 投票按钮
  if (q.id) fb.innerHTML += `<br><small style="margin-top:6px;display:inline-block">这道题：<button class="btn btn-sm btn-outline" onclick="voteQuestion(${q.id},'up')">👍</button> <button class="btn btn-sm btn-outline" onclick="voteQuestion(${q.id},'down')">👎</button></small>`;

  document.getElementById('next-btn').style.display = 'block';
}

async function voteQuestion(qid, type) {
  try {
    await api('/api/questions/' + qid + '/vote', { method:'POST', body: JSON.stringify({vote_type:type}) });
    alert(type==='up'?'👍 感谢点赞！':'👎 已标记，我们会改进这道题');
  } catch(e) { alert('投票失败，请重试'); }
}

function getLabelByValue(v) {
  const map = { attribute: '定语 (attribute)', predicative: '表语 (predicative)', itpattern: 'It is...to...' };
  return map[v] || v;
}

function nextQuestion() {
  state.practice.index++;
  showPracticeQuestion();
}

function showPracticeResult() {
  if (state.practice.finished) return;
  state.practice.finished = true;
  if (state.practice.timerInterval) clearInterval(state.practice.timerInterval);
  document.getElementById('game-area').style.display = 'none';
  document.getElementById('result-area').style.display = 'block';
  const { correct, questions, score, timed, timerSec } = state.practice;
  const pct = questions.length > 0 ? Math.round(correct / questions.length * 100) : 0;
  document.getElementById('final-score').textContent = pct + '%';
  let extraInfo = '';
  if (timed) {
    const used = 180 - (timerSec || 0);
    extraInfo = ` · 限时模式 · 用时 ${Math.floor(used/60)}:${String(used%60).padStart(2,'0')}`;
    if (pct >= 60 && used <= 180) {
      api('/api/challenges/timed/submit', { method:'POST', body:JSON.stringify({score:correct,total:questions.length,timeSeconds:used}) }).catch(()=>{});
    }
  }
  document.getElementById('final-stats').innerHTML = `共 ${questions.length} 题 · 答对 ${correct} 题 · 获得 ${score} 分${extraInfo}`;
  if (timed && timerSec <= 0) {
    document.getElementById('final-stats').innerHTML += '<br><span style="color:var(--danger)">⏰ 时间到！</span>';
  }
  refreshUser();
}

function retryPractice() {
  document.getElementById('practice-setup').style.display = 'block';
  document.getElementById('game-area').style.display = 'none';
  document.getElementById('result-area').style.display = 'none';
  loadPracticeSetup();
}

// ==================== 爬塔模式（每日） ====================
async function loadTower() {
  await refreshUser();
  document.getElementById('tower-game').style.display = 'none';
  document.getElementById('tower-result').style.display = 'none';
  const towerCard = document.getElementById('tower-levels')?.parentElement;
  if (towerCard) towerCard.style.display = '';

  try {
    const daily = await api('/api/tower/daily');
    const container = document.getElementById('tower-levels');
    const levelNames = ['', '🌱 初春·基础语法', '☀️ 盛夏·提升挑战', '🍁 金秋·综合应用', '❄️ 寒冬·高级辨析', '🌟 巅峰·终极考验'];
    const levelDescs = ['', '形容词基本分类', 'It is...to...区分', '混合用法辨析', '复杂句式判断', '极限挑战'];

    if (daily.attempted && daily.bestLevel >= 5) {
      container.innerHTML = `<div class="card score-display">
        <div style="font-size:48px">🗼</div>
        <h3>今日爬塔已完成！</h3>
        <div class="stats">今日总计 ${daily.totalScore} 分 · 最高通关 Lv.${daily.bestLevel}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:8px">明天再来挑战~</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="loadTower()">🔄 刷新</button>
      </div>`;
      return;
    }

    container.innerHTML = '';
    for (let i = 5; i >= 1; i--) {
      const completed = daily.completedLevels?.includes(i);
      const isUnlocked = i === 1 || daily.completedLevels?.includes(i - 1);

      const div = document.createElement('div');
      div.className = 'tower-level';
      if (completed) div.classList.add('completed');
      if (!isUnlocked && i > 1) div.classList.add('locked');
      else if (isUnlocked && !completed) div.classList.add('current');

      div.innerHTML = `
        <div class="level-num">Lv.${i}</div>
        <div class="level-label">${levelNames[i]}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${levelDescs[i]}</div>
        ${completed ? '<div>✅ 已通关</div>' : ''}
        ${daily.attempted && !completed && isUnlocked ? '<div style="color:var(--accent);font-size:12px">⚡ 可挑战</div>' : ''}
      `;
      div.onclick = () => {
        if (isUnlocked) startTowerLevel(i);
      };
      container.appendChild(div);

      if (i > 1) {
        const conn = document.createElement('div');
        conn.className = 'tower-connector';
        if (completed) conn.style.background = 'var(--success)';
        container.appendChild(conn);
      }
    }
  } catch (e) { console.error(e); }
}

async function startTowerLevel(level) {
  state.tower = { level, questions: [], index: 0, score: 0, correct: 0, total: 5, answered: false, wrongItems: [] };
  try {
    // 生成今日题目
    const data = await api('/api/tower/generate', { method: 'POST' });
    const levelQs = data.questions[level];
    if (!levelQs || levelQs.length === 0) { alert('该层暂无题目'); return; }
    state.tower.questions = levelQs;
    state.tower.total = levelQs.length;

    document.getElementById('tower-levels').parentElement.style.display = 'none';
    document.getElementById('tower-game').style.display = 'block';
    document.getElementById('tower-result').style.display = 'none';
    showTowerQuestion();
  } catch (e) { alert('加载题目失败: ' + e.message); }
}

function showTowerQuestion() {
  const { questions, index } = state.tower;
  if (index >= questions.length) return showTowerResult();
  state.tower.answered = false;

  const q = questions[index];
  document.getElementById('tower-q-num').textContent = `Lv.${state.tower.level} · 第 ${index + 1} / ${state.tower.total} 题`;
  document.getElementById('tower-q-sentence').innerHTML = highlightSentence(q.sentence, q.highlighted_word);
  document.getElementById('tower-q-word').textContent = q.highlighted_word;
  document.getElementById('tower-progress-fill').style.width = ((index) / state.tower.total * 100) + '%';

  const opts = document.getElementById('tower-game-options');
  opts.innerHTML = '';
  [{ label: '定语 (attribute)', value: 'attribute' }, { label: '表语 (predicative)', value: 'predicative' }, { label: 'It is...to...', value: 'itpattern' }].forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'game-option';
    btn.textContent = o.label;
    btn.onclick = () => answerTower(o.value);
    opts.appendChild(btn);
  });
  document.getElementById('tower-feedback').style.display = 'none';
  document.getElementById('tower-next-btn').style.display = 'none';
}

function answerTower(userAnswer) {
  if (state.tower.answered) return;
  state.tower.answered = true;
  const q = state.tower.questions[state.tower.index];
  const correct = q.correct_answer === userAnswer;
  playSound(correct ? 'correct' : 'wrong');
  if (correct) { state.tower.correct++; state.tower.score += 20; }
  else { state.tower.wrongItems.push({ ...q, userAnswer }); }

  const opts = document.getElementById('tower-game-options').children;
  const al = { attribute: 0, predicative: 1, itpattern: 2 };
  for (let i = 0; i < opts.length; i++) {
    opts[i].disabled = true;
    if (opts[i].textContent.startsWith(getLabelByValue(q.correct_answer).split(' ')[0])) opts[i].classList.add('correct');
  }
  if (!correct) opts[al[userAnswer]].classList.add('wrong');

  const fb = document.getElementById('tower-feedback');
  fb.style.display = 'block';
  fb.className = 'feedback-box ' + (correct ? 'correct' : 'wrong');
  fb.innerHTML = correct ? '✅ 正确！' : `❌ 正确答案是：${getLabelByValue(q.correct_answer)}`;
  if (q.wrong_hint) fb.innerHTML += `<br><small>${q.wrong_hint}</small>`;
  document.getElementById('tower-next-btn').style.display = 'block';
}

function towerNextQuestion() { state.tower.index++; showTowerQuestion(); }

async function showTowerResult() {
  document.getElementById('tower-game').style.display = 'none';
  const { level, score, correct, total, wrongItems } = state.tower;
  const pct = total > 0 ? Math.round(correct / total * 100) : 0;

  // 提交成绩（含错题）
  let result = { passed: pct >= 60, pct, bonus: 0, bestLevel: 0, completedLevels: [] };
  try {
    result = await api('/api/tower/submit-level', { method: 'POST', body: JSON.stringify({
      level, correct, total, score,
      wrongAnswers: wrongItems.map(w => ({
        question_id: w.id || 0, user_answer: w.userAnswer, correct_answer: w.correct_answer,
        sentence: w.sentence, highlighted_word: w.highlighted_word, wrong_hint: w.wrong_hint || ''
      }))
    })});
    if (result.points) { state.user.points = result.points; updateUserUI(); }
  } catch (e) { console.error(e); }

  const resultDiv = document.getElementById('tower-result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = `
    <div class="card score-display">
      <div class="big-score">${pct}%</div>
      <div class="stats">Lv.${level} · ${total}题 · 答对 ${correct} 题 · 得分 ${score}</div>
      <div style="font-size:18px;margin-top:8px">${result.passed ? '🎉 通关成功！' : '💪 未达标（需≥60%）'}</div>
      ${result.bonus > 0 ? `<div style="font-size:15px;color:var(--success);margin-top:4px">+${result.bonus} 积分！</div>` : ''}
      <div style="margin-top:20px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="navigate('tower')">🗼 返回爬塔</button>
        ${!result.passed ? `<button class="btn btn-primary" onclick="retryTowerLevel(${level})">🔄 再试本层</button>` : ''}
        <button class="btn btn-outline" onclick="navigate('dashboard')">🏠 首页</button>
      </div>
    </div>
  `;
  await refreshUser();
}

function retryTowerLevel(level) { startTowerLevel(level); }

// ==================== 错题本 ====================
async function loadWrongBook() {
  // 恢复被 redoWrongs 隐藏的元素
  document.getElementById('wrong-list').style.display = '';
  const card = document.querySelector('#page-wrongbook .card');
  if (card) card.style.display = '';
  document.getElementById('wrong-redo').style.display = 'none';
  try {
    const items = await api('/api/wrong-answers');
    const container = document.getElementById('wrong-list');
    if (items.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:60px">🎉 太棒了！错题本是空的~</p>';
      document.getElementById('redo-wrongs-btn').style.display = 'none';
    } else {
      document.getElementById('redo-wrongs-btn').style.display = 'inline-flex';
      container.innerHTML = items.map((item, idx) => `
        <div class="wrong-item" style="cursor:pointer" onclick="toggleWrongHint(${idx}, this)">
          <div class="sentence">${highlightSentence(item.sentence, item.highlighted_word)}</div>
          <div class="meta">
            <span>❌ 你的答案：${getLabelByValue(item.user_answer)}</span>
            <span>✅ 正确答案：${getLabelByValue(item.correct_answer)}</span>
            <span style="color:var(--text-secondary);font-size:12px">${new Date(item.answered_at).toLocaleString('zh-CN')}</span>
          </div>
          <div class="wrong-hint" style="display:none;margin-top:10px;padding:10px;background:var(--bg);border-radius:8px;font-size:13px;color:var(--text-secondary)">
            ${item.wrong_hint ? '💡 ' + item.wrong_hint : '暂无解析'}
          </div>
          <div style="font-size:11px;color:var(--primary);margin-top:4px">点击查看解析</div>
        </div>
      `).join('');
    }
  } catch (e) { console.error(e); }
}

async function clearWrongs() {
  if (!confirm('确定清空所有错题？')) return;
  await api('/api/wrong-answers', { method: 'DELETE' });
  loadWrongBook();
}

function toggleWrongHint(idx, el) {
  const hint = el.querySelector('.wrong-hint');
  const toggle = el.querySelector('div:last-child');
  if (hint.style.display === 'none') {
    hint.style.display = 'block';
    toggle.textContent = '收起解析';
  } else {
    hint.style.display = 'none';
    toggle.textContent = '点击查看解析';
  }
}

async function redoWrongs() {
  const items = await api('/api/wrong-answers');
  if (items.length === 0) { alert('没有错题可重做'); return; }

  state.wrongRedo = { questions: items, index: 0, correct: 0, answered: false };
  document.getElementById('wrong-list').style.display = 'none';
  document.querySelector('#page-wrongbook .card').style.display = 'none';
  document.getElementById('wrong-redo').style.display = 'block';
  showWrongRedoQuestion();
}

function showWrongRedoQuestion() {
  const { questions, index } = state.wrongRedo;
  if (index >= questions.length) return showWrongRedoResult();
  state.wrongRedo.answered = false;

  const item = questions[index];
  document.getElementById('wrong-redo-sentence').innerHTML = highlightSentence(item.sentence, item.highlighted_word);
  document.getElementById('wrong-redo-word').textContent = item.highlighted_word;
  document.getElementById('wrong-redo-progress').style.width = ((index) / questions.length * 100) + '%';

  const opts = document.getElementById('wrong-redo-options');
  opts.innerHTML = '';
  [
    { label: '定语 (attribute)', value: 'attribute' },
    { label: '表语 (predicative)', value: 'predicative' },
    { label: 'It is...to...', value: 'itpattern' },
  ].forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'game-option';
    btn.textContent = o.label;
    btn.onclick = () => answerWrongRedo(o.value, item.correct_answer);
    opts.appendChild(btn);
  });

  document.getElementById('wrong-redo-feedback').style.display = 'none';
  document.getElementById('wrong-redo-next').style.display = 'none';
}

function answerWrongRedo(userAnswer, correctAnswer) {
  if (state.wrongRedo.answered) return;
  state.wrongRedo.answered = true;
  if (userAnswer === correctAnswer) state.wrongRedo.correct++;

  const opts = document.getElementById('wrong-redo-options').children;
  const answerLabels = { attribute: 0, predicative: 1, itpattern: 2 };
  for (let i = 0; i < opts.length; i++) {
    opts[i].disabled = true;
    if (opts[i].textContent.startsWith(getLabelByValue(correctAnswer).split(' ')[0])) opts[i].classList.add('correct');
  }
  if (userAnswer !== correctAnswer) opts[answerLabels[userAnswer]].classList.add('wrong');

  const fb = document.getElementById('wrong-redo-feedback');
  fb.style.display = 'block';
  fb.className = 'feedback-box ' + (userAnswer === correctAnswer ? 'correct' : 'wrong');
  fb.textContent = userAnswer === correctAnswer ? '✅ 这次对了！' : `❌ 还是错了。正确答案：${getLabelByValue(correctAnswer)}`;

  document.getElementById('wrong-redo-next').style.display = 'block';
}

function wrongRedoNext() {
  state.wrongRedo.index++;
  showWrongRedoQuestion();
}

function showWrongRedoResult() {
  const { correct, questions } = state.wrongRedo;
  const pct = Math.round(correct / questions.length * 100);
  document.getElementById('wrong-redo').innerHTML = `
    <div class="card score-display">
      <div class="big-score">${pct}%</div>
      <div class="stats">共 ${questions.length} 道错题 · 本次答对 ${correct} 题</div>
      <div style="margin-top:16px">
        <button class="btn btn-primary" onclick="navigate('wrongbook')">📕 返回错题本</button>
      </div>
    </div>
  `;
}

// ==================== 题库管理 ====================
async function loadBanks() {
  try {
    const banks = await api('/api/banks/custom');
    const container = document.getElementById('banks-list');
    if (banks.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:60px">还没有自定义题库，点击上方按钮创建一个吧！</p>';
    } else {
      container.innerHTML = banks.map(b => `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>📝 ${b.name}</strong>
            <span style="font-size:13px;color:var(--text-secondary);margin-left:12px">${b.question_count || 0} 题</span>
            ${b.is_shared ? '<span class="badge badge-green" style="margin-left:8px">已共享</span>' : ''}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-sm" onclick="showAddQuestion(${b.id}, '${b.name}')">+ 添加题目</button>
            <button class="btn btn-outline btn-sm" onclick="toggleShare(${b.id})">${b.is_shared ? '取消共享' : '共享'}</button>
            <button class="btn btn-danger btn-sm" onclick="deleteBank(${b.id})">删除</button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) { console.error(e); }
}

function showCreateBank() {
  const name = prompt('请输入题库名称：');
  if (!name) return;
  api('/api/banks/custom', { method: 'POST', body: JSON.stringify({ name }) }).then(() => loadBanks());
}

async function deleteBank(id) {
  if (!confirm('确定删除该题库？所有题目将被删除。')) return;
  await api('/api/banks/custom/' + id, { method: 'DELETE' });
  loadBanks();
}

async function toggleShare(id) {
  const r = await api('/api/banks/custom/' + id + '/share', { method: 'POST' });
  alert(r.is_shared ? '已设为共享！其他同学可以看到并练习你的题库。' : '已取消共享。');
  loadBanks();
}

function showAddQuestion(bankId, bankName) {
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-content').innerHTML = `
    <span class="close" onclick="closeModal()">✕</span>
    <h2>添加题目到「${bankName}」</h2>
    <div class="form-group"><label>完整句子（用 **高亮词** 标记重点词）</label><input id="addq-sentence" placeholder="例如：It is **exciting** to take a trip."></div>
    <div class="form-group"><label>高亮词</label><input id="addq-word" placeholder="exciting"></div>
    <div class="form-group"><label>正确分类</label>
      <select id="addq-answer">
        <option value="attribute">定语 (attribute)</option>
        <option value="predicative">表语 (predicative)</option>
        <option value="itpattern">It is...to...</option>
      </select>
    </div>
    <div class="form-group"><label>难度 (1-5)</label>
      <select id="addq-diff">
        <option value="1">1 - 简单</option><option value="2">2</option><option value="3">3 - 中等</option><option value="4">4</option><option value="5">5 - 困难</option>
      </select>
    </div>
    <div class="form-group"><label>错题提示（可选）</label><input id="addq-hint" placeholder="帮助学生区分正确答案"></div>
    <button class="btn btn-primary btn-block" onclick="doAddQuestion(${bankId})">添加</button>
  `;
  modal.classList.add('show');
}

async function doAddQuestion(bankId) {
  const sentence = document.getElementById('addq-sentence').value.trim();
  const word = document.getElementById('addq-word').value.trim();
  if (!sentence || !word) { alert('请填写句子和高亮词'); return; }
  // 自动处理 **高亮词** 标记
  const cleanSentence = sentence.replace(/\*\*(.+?)\*\*/g, '$1');
  const finalWord = word || (sentence.match(/\*\*(.+?)\*\*/) || ['', ''])[1];

  await api('/api/banks/custom/' + bankId + '/questions', {
    method: 'POST',
    body: JSON.stringify({
      sentence: cleanSentence,
      highlighted_word: finalWord,
      correct_answer: document.getElementById('addq-answer').value,
      difficulty: parseInt(document.getElementById('addq-diff').value),
      wrong_hint: document.getElementById('addq-hint').value
    })
  });
  closeModal();
  loadBanks();
  loadPracticeSetup();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

// ==================== 共享题库 ====================
async function loadShared() {
  document.getElementById('shared-game').style.display = 'none';
  document.getElementById('shared-result').style.display = 'none';
  document.getElementById('shared-stats').style.display = 'none';
  document.getElementById('shared-list').style.display = 'block';

  try {
    const banks = await api('/api/banks/shared');
    const container = document.getElementById('shared-list');
    if (banks.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:60px">还没有同学分享题库，来做第一个吧！</p>';
    } else {
      container.innerHTML = banks.map(b => `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>📝 ${b.name}</strong>
            <span style="font-size:13px;color:var(--text-secondary);margin-left:8px">by ${b.creator_name}</span>
            <span class="badge badge-blue" style="margin-left:8px">${b.question_count} 题</span>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-sm" onclick="viewSharedStats(${b.id})">📊 统计</button>
            <button class="btn btn-primary btn-sm" onclick="startSharedGame(${b.id})">▶ 开始做题</button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) { console.error(e); }
}

async function viewSharedStats(bankId) {
  try {
    const data = await api('/api/banks/shared/' + bankId + '/stats');
  document.getElementById('shared-list').style.display = 'none';
  document.getElementById('shared-stats').style.display = 'block';
  document.getElementById('shared-stats-title').textContent = `📊 ${data.bank.name} · 准确率排行`;
  document.getElementById('shared-stats-body').innerHTML = data.stats.length > 0
    ? data.stats.map((s, i) => `
        <div class="leaderboard-item">
          <span class="rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">#${i + 1}</span>
          <span class="name">${s.username}</span>
          <span>${s.attempts} 次 · ${s.accuracy}% 正确率</span>
        </div>`).join('')
    : '<p style="text-align:center;color:var(--text-secondary);padding:40px">暂无数据</p>';
  } catch(e) { console.error(e); }
}

async function startSharedGame(bankId) {
  const data = await api('/api/banks/custom/' + bankId + '/questions');
  if (data.questions.length === 0) { alert('该题库没有题目'); return; }
  state.shared = { bankId, questions: shuffle(data.questions), index: 0, correct: 0, total: 0, answered: false };
  document.getElementById('shared-list').style.display = 'none';
  document.getElementById('shared-stats').style.display = 'none';
  document.getElementById('shared-game').style.display = 'block';
  document.getElementById('shared-result').style.display = 'none';
  showSharedQuestion();
}

function showSharedQuestion() {
  const { questions, index } = state.shared;
  if (index >= questions.length) return showSharedResult();
  state.shared.answered = false;
  const q = questions[index];

  document.getElementById('shared-q-num').textContent = `第 ${index + 1} / ${questions.length} 题`;
  document.getElementById('shared-q-sentence').innerHTML = highlightSentence(q.sentence, q.highlighted_word);
  document.getElementById('shared-q-word').textContent = q.highlighted_word;
  document.getElementById('shared-progress-fill').style.width = ((index) / questions.length * 100) + '%';

  const opts = document.getElementById('shared-game-options');
  opts.innerHTML = '';
  [
    { label: '定语 (attribute)', value: 'attribute' },
    { label: '表语 (predicative)', value: 'predicative' },
    { label: 'It is...to...', value: 'itpattern' },
  ].forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'game-option';
    btn.textContent = o.label;
    btn.onclick = () => answerShared(o.value);
    opts.appendChild(btn);
  });

  document.getElementById('shared-feedback').style.display = 'none';
  document.getElementById('shared-next-btn').style.display = 'none';
}

function answerShared(userAnswer) {
  if (state.shared.answered) return;
  state.shared.answered = true;
  state.shared.total++;

  const q = state.shared.questions[state.shared.index];
  const correct = q.correct_answer === userAnswer;
  if (correct) state.shared.correct++;

  const answerLabels = { attribute: 0, predicative: 1, itpattern: 2 };
  const opts = document.getElementById('shared-game-options').children;
  for (let i = 0; i < opts.length; i++) {
    opts[i].disabled = true;
    if (opts[i].textContent.startsWith(getLabelByValue(q.correct_answer).split(' ')[0])) opts[i].classList.add('correct');
  }
  if (!correct) opts[answerLabels[userAnswer]].classList.add('wrong');

  const fb = document.getElementById('shared-feedback');
  fb.style.display = 'block';
  fb.className = 'feedback-box ' + (correct ? 'correct' : 'wrong');
  fb.textContent = correct ? '✅ 正确！' : `❌ 正确答案：${getLabelByValue(q.correct_answer)}`;

  document.getElementById('shared-next-btn').style.display = 'block';
}

function sharedNext() {
  state.shared.index++;
  showSharedQuestion();
}

async function showSharedResult() {
  document.getElementById('shared-game').style.display = 'none';
  document.getElementById('shared-result').style.display = 'block';
  const { correct, total, bankId } = state.shared;
  const pct = total > 0 ? Math.round(correct / total * 100) : 0;

  // 提交统计
  try {
    await api('/api/banks/shared/' + bankId + '/submit', {
      method: 'POST',
      body: JSON.stringify({ correct, total })
    });
  } catch (e) {}

  document.getElementById('shared-result-content').innerHTML = `
    <div class="big-score">${pct}%</div>
    <div class="stats">共 ${total} 题 · 答对 ${correct} 题</div>
    <div style="margin-top:20px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-outline" onclick="navigate('shared')">🤝 返回共享广场</button>
      <button class="btn btn-primary" onclick="startSharedGame(${bankId})">🔄 再做一次</button>
    </div>
  `;
}

// ==================== 商城 ====================
async function loadShop() {
  await refreshUser();
  try {
    const items = await api('/api/shop/items');
    const tabs = document.getElementById('shop-tabs');
    tabs.innerHTML = items.map((cat, i) =>
      `<button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="showShopCategory('${cat.id}')">${cat.name}</button>`
    ).join('');
    window._shopItems = items;
    state.shopPreview = null;
    if (items && items.length > 0) showShopCategory(items[0].id);
    renderAvatar();
  } catch (e) { console.error(e); }
}

function showShopCategory(catId) {
  // 清除之前的预览状态
  if (state.shopPreview && state.shopPreview.catId === 'theme') {
    applyTheme(state.user?.theme || 'default');
  }
  state.shopPreview = null;
  document.getElementById('shop-preview-actions').style.display = 'none';
  document.getElementById('avatar-preview-title').textContent = '我的形象';
  renderAvatar();

  document.querySelectorAll('#shop-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#shop-tabs .tab-btn').forEach(b => { if (b.textContent === window._shopItems.find(c => c.id === catId)?.name) b.classList.add('active'); });

  const cat = window._shopItems.find(c => c.id === catId);
  if (!cat) return;

  const container = document.getElementById('shop-items');
  container.innerHTML = cat.items.map(item => {
    const owned = isItemOwned(catId, item.value);
    const currentlyEquipped = isCurrentlyEquipped(catId, item.value);
    let onclick, labelExtra = '';
    if (owned) {
      onclick = `equipItem('${catId}', '${item.value}')`;
      if (currentlyEquipped) labelExtra = ' · 使用中';
    } else {
      onclick = `previewItem('${catId}', '${item.id}', '${item.value.replace(/'/g, "\\'")}', ${item.price}, '${item.name}')`;
    }
    return `
      <div class="shop-item ${owned ? 'owned' : ''} ${currentlyEquipped ? 'equipped' : ''}" onclick="${onclick}">
        <div class="item-name">${item.name}${labelExtra}</div>
        <div class="item-price">${owned ? '✅ 已拥有' : '⭐ ' + item.price}</div>
      </div>
    `;
  }).join('');
}

function isCurrentlyEquipped(catId, value) {
  if (!state.user) return false;
  if (catId === 'theme') return state.user.theme === value || (value === 'default' && (!state.user.theme || state.user.theme === 'default'));
  const avatar = state.user.avatar;
  const map = { hat: avatar.hat, top: avatar.top, bottom: avatar.bottom, shoes: avatar.shoes, accessory: avatar.accessory };
  return map[catId] === value || (value === '' && !map[catId]);
}

function isItemOwned(catId, value) {
  if (!state.user) return false;
  return isCurrentlyEquipped(catId, value); // same logic for now — owned items are always equipped items; extend later if needed
}

// 预览商品：在小人上临时显示效果 / 临时切换主题
function previewItem(catId, itemId, itemValue, price, name) {
  state.shopPreview = { catId, itemId, itemValue, price, name };
  document.getElementById('shop-preview-actions').style.display = 'block';
  document.getElementById('avatar-preview-title').textContent = `预览：${name}`;
  if (catId === 'theme') {
    // 主题预览：临时切换 CSS
    applyTheme(itemValue);
  } else {
    renderAvatar(state.shopPreview);
  }

  // 高亮当前预览项
  document.querySelectorAll('.shop-item').forEach(el => el.style.outline = 'none');
  const items = document.querySelectorAll('.shop-item');
  items.forEach(el => {
    if (el.querySelector('.item-name')?.textContent === name) el.style.outline = '3px solid var(--accent)';
  });
}

// 直接装备已拥有的物品
async function equipItem(catId, itemValue) {
  // 找到一个 itemId（从 _shopItems 中查找）
  const cat = window._shopItems.find(c => c.id === catId);
  if (!cat) return;
  const item = cat.items.find(i => i.value === itemValue);
  if (!item) return;

  try {
    const r = await api('/api/shop/buy', { method: 'POST', body: JSON.stringify({ itemId: item.id, category: catId }) });
    state.user.points = r.points;
    state.user.avatar = r.avatar;
    state.user.theme = r.theme;
    applyTheme(r.theme);
    updateUserUI();
    renderAvatar();
    showShopCategory(catId);
  } catch (e) { alert(e.message); }
}

// 确认购买预览中的商品
async function confirmBuy() {
  const p = state.shopPreview;
  if (!p) return;
  try {
    const r = await api('/api/shop/buy', { method: 'POST', body: JSON.stringify({ itemId: p.itemId, category: p.catId }) });
    state.user.points = r.points;
    state.user.avatar = r.avatar;
    state.user.theme = r.theme;
    applyTheme(r.theme);
    updateUserUI();
    state.shopPreview = null;
    document.getElementById('shop-preview-actions').style.display = 'none';
    document.getElementById('avatar-preview-title').textContent = '我的形象';
    renderAvatar();
    showShopCategory(p.catId);
    alert('购买成功！');
  } catch (e) { alert(e.message); }
}

// 取消预览
function cancelPreview() {
  if (state.shopPreview && state.shopPreview.catId === 'theme') {
    // 还原主题
    applyTheme(state.user?.theme || 'default');
  }
  state.shopPreview = null;
  document.getElementById('shop-preview-actions').style.display = 'none';
  document.getElementById('avatar-preview-title').textContent = '我的形象';
  renderAvatar();
  document.querySelectorAll('.shop-item').forEach(el => el.style.outline = 'none');
}

// ==================== 小人渲染 ====================
function renderAvatar(previewOverride) {
  let av = state.user?.avatar || { hat: '', top: '', bottom: '', shoes: '', accessory: '' };
  // 预览模式：覆盖对应部位
  if (previewOverride && previewOverride.catId && previewOverride.catId !== 'theme') {
    av = { ...av };
    const fieldMap = { hat: 'hat', top: 'top', bottom: 'bottom', shoes: 'shoes', accessory: 'accessory' };
    const field = fieldMap[previewOverride.catId];
    if (field) av[field] = previewOverride.itemValue;
  }
  const svg = document.getElementById('avatar-svg');
  svg.innerHTML = `
    <svg viewBox="0 0 120 180" width="120" height="180">
      <!-- 头 -->
      <circle cx="60" cy="40" r="22" fill="#FFD93D" stroke="#E6B800" stroke-width="2"/>
      <!-- 眼睛 -->
      <circle cx="52" cy="37" r="3" fill="#333"/>
      <circle cx="68" cy="37" r="3" fill="#333"/>
      <!-- 微笑 -->
      <path d="M52 46 Q60 52 68 46" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round"/>
      <!-- 身体 -->
      <rect x="40" y="64" width="40" height="50" rx="4" fill="${getTopColor(av.top)}" stroke="#ccc" stroke-width="1"/>
      <!-- 手臂 -->
      <line x1="40" y1="75" x2="22" y2="100" stroke="#FFD93D" stroke-width="6" stroke-linecap="round"/>
      <line x1="80" y1="75" x2="98" y2="100" stroke="#FFD93D" stroke-width="6" stroke-linecap="round"/>
      <!-- 腿 -->
      <rect x="45" y="114" width="14" height="35" rx="3" fill="${getBottomColor(av.bottom)}"/>
      <rect x="61" y="114" width="14" height="35" rx="3" fill="${getBottomColor(av.bottom)}"/>
      <!-- 鞋子 -->
      <ellipse cx="52" cy="153" rx="10" ry="5" fill="${getShoesColor(av.shoes)}"/>
      <ellipse cx="68" cy="153" rx="10" ry="5" fill="${getShoesColor(av.shoes)}"/>
      ${renderHat(av.hat)}
      ${renderAccessory(av.accessory)}
    </svg>
  `;
}

function getTopColor(v) {
  const map = { jacket: '#5C6BC0', hoodie: '#78909C', sweater: '#EF5350', dress: '#AB47BC' };
  return map[v] || '#81C784';
}
function getBottomColor(v) {
  const map = { skirt: '#AB47BC', shorts: '#42A5F5' };
  return map[v] || '#5C6BC0';
}
function getShoesColor(v) {
  const map = { boots: '#5D4037', sneakers: '#fff' };
  return map[v] || '#333';
}
function renderHat(v) {
  if (!v) return '';
  const map = {
    beanie: '<rect x="42" y="10" width="36" height="10" rx="5" fill="#EF5350"/><rect x="38" y="12" width="44" height="8" rx="4" fill="#EF5350"/>',
    crown: '<polygon points="48,5 52,18 68,18 72,5 65,8 60,14 55,8" fill="#FFD700" stroke="#E6B800" stroke-width="1"/>',
    cap: '<path d="M38 18 Q60 8 82 18 L78 22 Q60 12 42 22 Z" fill="#1565C0"/>',
    flower: '<circle cx="52" cy="16" r="4" fill="#FF80AB"/><circle cx="68" cy="16" r="4" fill="#FF80AB"/><circle cx="60" cy="12" r="4" fill="#FF4081"/><circle cx="56" cy="20" r="4" fill="#F48FB1"/><circle cx="64" cy="20" r="4" fill="#F48FB1"/>',
  };
  return map[v] || '';
}
function renderAccessory(v) {
  if (!v) return '';
  const map = {
    scarf: '<path d="M38 62 Q60 70 82 62" fill="none" stroke="#FF7043" stroke-width="5" stroke-linecap="round"/>',
    glasses: '<circle cx="50" cy="37" r="7" fill="none" stroke="#333" stroke-width="1.5"/><circle cx="70" cy="37" r="7" fill="none" stroke="#333" stroke-width="1.5"/><line x1="57" y1="37" x2="63" y2="37" stroke="#333" stroke-width="1.5"/>',
    backpack: '<rect x="72" y="70" width="14" height="22" rx="3" fill="#FF9800"/><rect x="75" y="68" width="8" height="4" rx="2" fill="#F57C00"/>',
  };
  return map[v] || '';
}

// ==================== 排行榜 ====================
async function loadLeaderboard() {
  try {
    const users = await api('/api/leaderboard');
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = users.map((u, i) => {
      let rankClass = '';
      if (i === 0) rankClass = 'gold';
      else if (i === 1) rankClass = 'silver';
      else if (i === 2) rankClass = 'bronze';
      return `
        <div class="leaderboard-item">
          <span class="rank ${rankClass}">#${i + 1}</span>
          <span class="name">${u.username}</span>
          <span class="pts">⭐ ${u.points}</span>
        </div>
      `;
    }).join('') || '<p style="text-align:center;color:var(--text-secondary);padding:40px">暂无排行数据</p>';
  } catch (e) { console.error(e); }
}

// ==================== 成就页 ====================
async function loadAchievements() {
  await refreshUser();
  try {
    const achievements = await api('/api/achievements');
    const grid = document.getElementById('achievements-grid');
    grid.innerHTML = achievements.map(a => {
      const isHidden = a.hidden && !a.unlocked;
      return `
      <div class="card" style="text-align:center;padding:20px;opacity:${a.unlocked ? '1' : '0.4'}">
        <div style="font-size:36px">${a.unlocked ? a.icon : '🔒'}</div>
        <div style="font-weight:600;margin:8px 0">${isHidden ? '???' : a.name}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${isHidden ? '隐藏成就' : a.desc}</div>
        ${a.unlocked ? '<div style="color:var(--success);font-size:12px;margin-top:4px">✅ 已解锁</div>' : ''}
      </div>
    `}).join('');
  } catch(e) {}
}

// ==================== 对战系统 ====================
async function loadBattles() {
  document.getElementById('battle-game').style.display = 'none';
  document.getElementById('battle-result').style.display = 'none';
  document.getElementById('battle-list').style.display = 'block';
  try {
    const challenges = await api('/api/challenges');
    const container = document.getElementById('battle-list');
    if (challenges.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px">暂无对战挑战，发起一个吧！</p>';
    } else {
      container.innerHTML = challenges.map(c => `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${c.creator_name}</strong> 向你发起挑战
            <span style="font-size:13px;color:var(--text-secondary);margin-left:8px">得分: ${c.creator_score >= 0 ? c.creator_score : '?'} 分</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="acceptBattle(${c.id})">⚔️ 应战</button>
        </div>
      `).join('');
    }
  } catch(e) {}
}

async function createBattle() {
  // 取随机15题
  const all = await api('/api/questions/default');
  const questions = shuffle(all).slice(0, 15);
  state.battle = { questions, index: 0, score: 0, correct: 0, answered: false, challengeId: null };

  document.getElementById('battle-list').style.display = 'none';
  document.getElementById('battle-game').style.display = 'block';
  document.getElementById('battle-result').style.display = 'none';
  showBattleQuestion();
}

function showBattleQuestion() {
  const { questions, index } = state.battle;
  if (index >= questions.length) return submitBattleResult();
  state.battle.answered = false;
  const q = questions[index];
  document.getElementById('battle-q-num').textContent = `${index+1}/15`;
  document.getElementById('battle-q-sentence').innerHTML = highlightSentence(q.sentence, q.highlighted_word);
  document.getElementById('battle-q-word').textContent = q.highlighted_word;
  document.getElementById('battle-progress-fill').style.width = (index/15*100)+'%';
  const opts = document.getElementById('battle-game-options');
  opts.innerHTML = '';
  [{label:'定语',value:'attribute'},{label:'表语',value:'predicative'},{label:'It is...to...',value:'itpattern'}].forEach(o => {
    const btn = document.createElement('button'); btn.className='game-option'; btn.textContent=o.label;
    btn.onclick = () => answerBattle(o.value); opts.appendChild(btn);
  });
  document.getElementById('battle-feedback').style.display = 'none';
  document.getElementById('battle-next-btn').style.display = 'none';
}

function answerBattle(userAnswer) {
  if (state.battle.answered) return;
  state.battle.answered = true;
  const q = state.battle.questions[state.battle.index];
  const correct = q.correct_answer === userAnswer;
  if (correct) { state.battle.correct++; state.battle.score += 10; }
  playSound(correct ? 'correct' : 'wrong');
  const opts = document.getElementById('battle-game-options').children;
  const al = {attribute:0,predicative:1,itpattern:2};
  for (let i=0;i<opts.length;i++) { opts[i].disabled=true; if(opts[i].textContent.startsWith(getLabelByValue(q.correct_answer).split(' ')[0])) opts[i].classList.add('correct'); }
  if (!correct) opts[al[userAnswer]].classList.add('wrong');
  document.getElementById('battle-feedback').style.display = 'block';
  document.getElementById('battle-feedback').className = 'feedback-box '+(correct?'correct':'wrong');
  document.getElementById('battle-feedback').textContent = correct ? '✅ 正确！' : `❌ 正确答案：${getLabelByValue(q.correct_answer)}`;
  document.getElementById('battle-next-btn').style.display = 'block';
}
function battleNext() { state.battle.index++; showBattleQuestion(); }

async function submitBattleResult() {
  document.getElementById('battle-game').style.display = 'none';
  document.getElementById('battle-result').style.display = 'block';
  const { score, correct, questions, challengeId, creatorScore, creatorName } = state.battle;
  const myPct = Math.round(correct/15*100);
  if (challengeId) {
    // 应战者：显示与创建者的对比
    const oppPct = creatorScore >= 0 ? Math.round(creatorScore/150*100) : '?';
    const win = creatorScore >= 0 && score > creatorScore;
    document.getElementById('battle-result-content').innerHTML = `
      <div class="big-score">${myPct}%</div>
      <div class="stats">得分 ${score} 分 · 答对 ${correct}/15 题</div>
      <div style="margin-top:16px;padding:12px;background:var(--bg);border-radius:8px">
        <strong>${creatorName || '对手'}</strong> 得分：${creatorScore >= 0 ? creatorScore + ' 分 (' + oppPct + '%)' : '?'}<br>
        ${creatorScore >= 0 ? (win ? '🎉 你赢了！' : score === creatorScore ? '🤝 平局！' : '😢 继续努力！') : ''}
      </div>
      <button class="btn btn-primary" onclick="navigate('battle')" style="margin-top:12px">返回对战</button>
    `;
  } else {
    // 创建者：发布新挑战
    try {
      const r = await api('/api/challenges', { method:'POST', body:JSON.stringify({questions_json:questions,score}) });
      state.battle.challengeId = r.challengeId;
    } catch(e) {}
    document.getElementById('battle-result-content').innerHTML = `
      <div class="big-score">${myPct}%</div>
      <div class="stats">得分 ${score} 分 · 答对 ${correct}/15 题</div>
      <p style="color:var(--success);margin-top:8px">挑战已发布！等待其他同学应战~</p>
      <button class="btn btn-primary" onclick="navigate('battle')">返回对战</button>
    `;
  }
}

async function acceptBattle(id) {
  const data = await api('/api/challenges/' + id);
  const questions = data.questions;
  state.battle = { questions, index: 0, score: 0, correct: 0, answered: false, challengeId: id, creatorScore: data.creator_score, creatorName: data.creator_name };
  document.getElementById('battle-list').style.display = 'none';
  document.getElementById('battle-game').style.display = 'block';
  document.getElementById('battle-result').style.display = 'none';
  showBattleQuestion();
}

// ==================== 班级 ====================
async function loadClasses() {
  try {
    const classes = await api('/api/classes');
    const container = document.getElementById('classes-list');
    if (classes.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:60px">还没有班级，请联系老师创建</p>';
    } else {
      container.innerHTML = classes.map(c => `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>${c.name}</strong><span style="font-size:13px;color:var(--text-secondary);margin-left:8px">教师：${c.teacher_name}</span></div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="badge badge-blue">${c.member_count}人</span>
            <button class="btn btn-outline btn-sm" onclick="viewClassMembers(${c.id},'${c.name}')">查看成员</button>
          </div>
        </div>
      `).join('');
    }
  } catch(e) {}
}

function showJoinClass() {
  const code = prompt('请输入班级邀请码：');
  if (!code) return;
  api('/api/classes/join', { method:'POST', body:JSON.stringify({invite_code:code}) }).then(r => {
    alert('成功加入班级：' + r.className);
    loadClasses();
  }).catch(e => alert(e.message));
}

async function viewClassMembers(id, name) {
  const members = await api('/api/classes/' + id + '/members');
  document.getElementById('classes-list').style.display = 'none';
  document.getElementById('class-detail').style.display = 'block';
  document.getElementById('class-detail-title').textContent = '🏫 ' + name + ' · 班级成员';
  document.getElementById('class-detail-body').innerHTML = members.map((m,i) => `
    <div class="leaderboard-item">
      <span class="rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">#${i+1}</span>
      <span class="name">${m.username}</span>
      <span class="pts">⭐ ${m.points}</span>
    </div>
  `).join('') || '<p style="text-align:center;padding:20px">暂无成员</p>';
}

// ==================== 错题打印 ====================
function printWrongBook() {
  const items = document.querySelectorAll('.wrong-item');
  if (items.length === 0) { alert('没有错题可打印'); return; }
  let html = '<html><head><meta charset="UTF-8"><title>错题本</title><style>body{font-family:sans-serif;padding:20px}.item{border:1px solid #ddd;padding:12px;margin:8px 0;border-radius:8px}.ans{color:#c62828}.correct{color:#2e7d32}h2{text-align:center}</style></head><body><h2>📕 我的错题本</h2>';
  items.forEach(el => {
    const sentence = el.querySelector('.sentence')?.innerHTML || '';
    const meta = el.querySelector('.meta')?.textContent || '';
    const hint = el.querySelector('.wrong-hint')?.textContent || '';
    html += `<div class="item"><div>${sentence}</div><div class="ans">${meta}</div>${hint ? '<div>💡 '+hint+'</div>' : ''}</div>`;
  });
  html += '</body></html>';
  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// 错题本页加打印按钮监听
const origLoadWrongBook = loadWrongBook;
loadWrongBook = async function() {
  await origLoadWrongBook();
  const card = document.querySelector('#page-wrongbook .card');
  if (card && !card.querySelector('#print-wrong-btn')) {
    const btn = document.createElement('button');
    btn.id = 'print-wrong-btn';
    btn.className = 'btn btn-outline btn-sm';
    btn.textContent = '🖨️ 打印错题';
    btn.onclick = printWrongBook;
    btn.style.marginLeft = '8px';
    const redoBtn = document.getElementById('redo-wrongs-btn');
    if (redoBtn) redoBtn.parentElement.appendChild(btn);
  }
};

// ==================== 初始化 ====================
async function init() {
  try {
    const data = await api('/api/me');
    state.user = data;
    applyTheme(data.theme);
    document.getElementById('page-auth').classList.remove('active');
    document.getElementById('navbar').style.display = 'flex';
    updateUserUI();
    if (data.role === 'teacher') {
      window.location.href = '/teacher/';
    } else {
      navigate('dashboard');
    }
  } catch (e) {
    // 未登录，显示登录页
    document.getElementById('page-auth').classList.add('active');
  }
}

// 点击弹窗外关闭
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

init();
