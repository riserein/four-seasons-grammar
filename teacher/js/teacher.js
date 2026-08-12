// ==================== API ====================
async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options, credentials: 'same-origin' });
  if (res.status === 403) { alert('请以教师身份登录'); window.location.href = '/'; return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ==================== 标签切换 ====================
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => { if (b.textContent.includes(tab === 'questions' ? '默认题库' : tab === 'students' ? '学生管理' : tab === 'shared' ? '共享题库' : '班级管理')) b.classList.add('active'); });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  if (tab === 'questions') loadQuestions();
  if (tab === 'students') loadStudents();
  if (tab === 'shared') loadSharedBanks();
  if (tab === 'classes') loadClasses();
}

// ==================== 题库管理 ====================
async function loadQuestions() {
  const questions = await api('/api/teacher/questions');
  document.getElementById('total-qs').textContent = questions.length;
  const labelMap = { attribute: '定语', predicative: '表语', itpattern: 'It is...to...' };
  document.getElementById('questions-table').innerHTML = questions.map(q => `
    <tr>
      <td>${q.id}</td>
      <td>${q.sentence}</td>
      <td><strong>${q.highlighted_word}</strong></td>
      <td><span class="badge ${q.correct_answer === 'attribute' ? 'badge-blue' : q.correct_answer === 'predicative' ? 'badge-green' : ''}">${labelMap[q.correct_answer]}</span></td>
      <td>Lv.${q.difficulty}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editQuestion(${q.id}, '${escapeStr(q.sentence)}', '${escapeStr(q.highlighted_word)}', '${q.correct_answer}', ${q.difficulty}, '${escapeStr(q.wrong_hint || '')}')">编辑</button>
        <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${q.id})">删除</button>
      </td>
    </tr>
  `).join('');
}

function escapeStr(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/`/g, '\\`'); }

function showAddQuestion() {
  document.getElementById('modal-body').innerHTML = `
    <span class="close" onclick="closeModal()">✕</span>
    <h3>添加题目</h3>
    <div class="form-group"><label>完整句子</label><input id="eq-sentence" placeholder="It is exciting to take a trip."></div>
    <div class="form-group"><label>高亮词</label><input id="eq-word" placeholder="exciting"></div>
    <div class="form-row">
      <div class="form-group"><label>正确答案</label>
        <select id="eq-answer"><option value="attribute">定语 (attribute)</option><option value="predicative">表语 (predicative)</option><option value="itpattern">It is...to...</option></select>
      </div>
      <div class="form-group"><label>难度</label>
        <select id="eq-diff"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select>
      </div>
    </div>
    <div class="form-group"><label>错题提示（可选）</label><textarea id="eq-hint" rows="2" placeholder="给学生解释为什么是这个答案"></textarea></div>
    <button class="btn btn-primary" style="width:100%" onclick="doAdd()">添加</button>
  `;
  document.getElementById('modal').classList.add('show');
}

function editQuestion(id, sentence, word, answer, diff, hint) {
  document.getElementById('modal-body').innerHTML = `
    <span class="close" onclick="closeModal()">✕</span>
    <h3>编辑题目 #${id}</h3>
    <div class="form-group"><label>完整句子</label><input id="eq-sentence" value="${sentence.replace(/&quot;/g, '"').replace(/&#39;/g, "'")}"></div>
    <div class="form-group"><label>高亮词</label><input id="eq-word" value="${word}"></div>
    <div class="form-row">
      <div class="form-group"><label>正确答案</label>
        <select id="eq-answer"><option value="attribute" ${answer==='attribute'?'selected':''}>定语</option><option value="predicative" ${answer==='predicative'?'selected':''}>表语</option><option value="itpattern" ${answer==='itpattern'?'selected':''}>It is...to...</option></select>
      </div>
      <div class="form-group"><label>难度</label>
        <select id="eq-diff">${[1,2,3,4,5].map(d => `<option value="${d}" ${diff===d?'selected':''}>${d}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group"><label>错题提示</label><textarea id="eq-hint" rows="2">${hint}</textarea></div>
    <button class="btn btn-primary" style="width:100%" onclick="doEdit(${id})">保存修改</button>
  `;
  document.getElementById('modal').classList.add('show');
}

async function doAdd() {
  const data = {
    sentence: document.getElementById('eq-sentence').value.trim(),
    highlighted_word: document.getElementById('eq-word').value.trim(),
    correct_answer: document.getElementById('eq-answer').value,
    difficulty: parseInt(document.getElementById('eq-diff').value),
    wrong_hint: document.getElementById('eq-hint').value.trim(),
  };
  if (!data.sentence || !data.highlighted_word) { alert('请填写句子和高亮词'); return; }
  await api('/api/teacher/questions', { method: 'POST', body: JSON.stringify(data) });
  closeModal();
  loadQuestions();
}

async function doEdit(id) {
  const data = {
    sentence: document.getElementById('eq-sentence').value.trim(),
    highlighted_word: document.getElementById('eq-word').value.trim(),
    correct_answer: document.getElementById('eq-answer').value,
    difficulty: parseInt(document.getElementById('eq-diff').value),
    wrong_hint: document.getElementById('eq-hint').value.trim(),
  };
  if (!data.sentence || !data.highlighted_word) { alert('请填写句子和高亮词'); return; }
  await api('/api/teacher/questions/' + id, { method: 'PUT', body: JSON.stringify(data) });
  closeModal();
  loadQuestions();
}

async function deleteQuestion(id) {
  if (!confirm('确定删除题目 #' + id + '？')) return;
  await api('/api/teacher/questions/' + id, { method: 'DELETE' });
  loadQuestions();
}

// ==================== 学生管理 ====================
async function loadStudents() {
  const students = await api('/api/teacher/students');
  document.getElementById('students-table').innerHTML = students.map(s => `
    <tr>
      <td>${s.username}</td>
      <td><strong style="color:var(--accent)">⭐ ${s.points}</strong></td>
      <td>${new Date(s.created_at).toLocaleString('zh-CN')}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteStudent(${s.id}, '${s.username}')">删除</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:20px">暂无学生</td></tr>';
}

async function deleteStudent(id, username) {
  if (!confirm(`确定删除学生「${username}」吗？\n\n这将同时删除该学生的所有题库、错题、爬塔记录和积分，不可恢复！`)) return;
  await api('/api/teacher/students/' + id, { method: 'DELETE' });
  loadStudents();
}

// ==================== 共享题库审核 ====================
async function loadSharedBanks() {
  const banks = await api('/api/teacher/shared-banks');
  document.getElementById('shared-table').innerHTML = banks.map(b => `
    <tr>
      <td><strong>${b.name}</strong></td>
      <td>${b.creator_name}</td>
      <td>${b.question_count} 题</td>
      <td>
        <span class="badge badge-green">已共享</span>
        <button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="deleteSharedBank(${b.id}, '${b.name.replace(/'/g, "\\'")}')">删除</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:20px">暂无共享题库</td></tr>';
}

async function deleteSharedBank(id, name) {
  if (!confirm(`确定删除共享题库「${name}」吗？\n\n题库及相关统计数据将被删除。`)) return;
  await api('/api/teacher/shared-banks/' + id, { method: 'DELETE' });
  loadSharedBanks();
}

// ==================== 弹窗 ====================
function closeModal() { document.getElementById('modal').classList.remove('show'); }
document.getElementById('modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });

// ==================== 初始化 ====================
// ==================== 导出成绩 ====================
async function exportData() {
  const data = await api('/api/teacher/export');
  let csv = '用户名,积分,错题数,最高爬塔层,签到次数,最长连续签到,注册时间\n';
  data.forEach(r => {
    csv += `${r.username},${r.points},${r.wrongCount},${r.maxTowerLevel},${r.totalCheckins},${r.maxStreak},${new Date(r.joinedAt).toLocaleDateString('zh-CN')}\n`;
  });
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = '学生成绩.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ==================== 批量导入 ====================
function showImportModal() {
  document.getElementById('modal-body').innerHTML = `
    <span class="close" onclick="closeModal()">✕</span>
    <h3>批量导入题目</h3>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
      每行一道题，格式：<code>句子,高亮词,正确答案,难度,提示</code><br>
      正确答案填：attribute / predicative / itpattern<br>
      难度填1-5，提示可选
    </p>
    <textarea id="import-text" rows="8" placeholder="It is exciting to take a trip.,exciting,itpattern,2,It是形式主语"></textarea>
    <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="doImport()">导入</button>
  `;
  document.getElementById('modal').classList.add('show');
}

async function doImport() {
  const text = document.getElementById('import-text').value.trim();
  const lines = text.split('\n').filter(l => l.trim());
  const questions = lines.map(line => {
    const parts = line.split(',');
    return {
      sentence: (parts[0]||'').trim(),
      highlighted_word: (parts[1]||'').trim(),
      correct_answer: (parts[2]||'').trim(),
      difficulty: parseInt(parts[3]) || 1,
      wrong_hint: (parts[4]||'').trim()
    };
  }).filter(q => q.sentence && q.highlighted_word && q.correct_answer);
  if (questions.length === 0) { alert('没有有效题目'); return; }
  const r = await api('/api/teacher/import', { method:'POST', body:JSON.stringify({questions}) });
  closeModal();
  alert(`成功导入 ${r.imported} 道题目！`);
  loadQuestions();
}

// ==================== 班级管理 ====================
async function loadClasses() {
  const classes = await api('/api/teacher/classes');
  document.getElementById('classes-table').innerHTML = classes.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td><code style="background:var(--bg);padding:2px 8px;border-radius:4px">${c.invite_code}</code></td>
      <td>${c.member_count} 人</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${c.invite_code}');alert('邀请码已复制')">📋 复制</button>
        <button class="btn btn-danger btn-sm" onclick="deleteClass(${c.id})">删除</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px">暂无班级</td></tr>';
}

function showCreateClass() {
  const name = prompt('请输入班级名称：');
  if (!name) return;
  api('/api/teacher/classes', { method:'POST', body:JSON.stringify({name}) }).then(r => {
    alert('班级创建成功！邀请码：' + r.invite_code);
    loadClasses();
  });
}

async function deleteClass(id) {
  if (!confirm('确定删除该班级？')) return;
  await api('/api/teacher/classes/' + id, { method:'DELETE' });
  loadClasses();
}

async function init() {
  try {
    const user = await api('/api/me');
    if (user.role !== 'teacher') { window.location.href = '/'; return; }
  } catch (e) { window.location.href = '/'; return; }
  loadQuestions();
}

async function doLogout() {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

init();
