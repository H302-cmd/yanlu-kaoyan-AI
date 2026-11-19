/*
 * 研途助手 · 主逻辑
 * 纯前端实现：择校分档 / 复习进度(localStorage) / Chart.js 数据看板
 * 数据说明：院校数据来自 school_data.json；用户任务数据保存在浏览器 localStorage
 */

'use strict';

/* ==================== 全局状态 ==================== */
let SCHOOLS = [];                       // 院校数据（从 JSON 加载）
const TASKS_KEY = 'yanlu_tasks_v1';     // localStorage 存储键
let chartSubject = null, chartDone = null, chartStage = null; // 图表实例缓存

/* ==================== 初始化 ==================== */
document.addEventListener('DOMContentLoaded', () => {
  bindTabs();
  bindSchoolEvents();
  bindTaskEvents();
  loadTasks();          // 读取本地任务
  loadSchools();        // 异步加载院校数据
});

/* ==================== 一、Tab 切换 ==================== */
function bindTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      // 切到看板时刷新图表（canvas 在隐藏时尺寸计算不准）
      if (tab.dataset.tab === 'dashboard') renderCharts();
    });
  });
}

/* ==================== 二、智能择校 ==================== */

/** 加载 school_data.json（相对路径，GitHub Pages 下可正常 fetch） */
async function loadSchools() {
  const majorSel = document.getElementById('majorSelect');
  const regionSel = document.getElementById('regionSelect');
  try {
    const resp = await fetch('school_data.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    SCHOOLS = await resp.json();

    // 动态填充「报考专业」下拉（去重排序）
    const majors = [...new Set(SCHOOLS.map(s => s.major))].sort();
    majorSel.innerHTML = majors.map(m => `<option value="${m}">${m}</option>`).join('');

    // 动态填充「意向地区」下拉（去重排序）
    const regions = [...new Set(SCHOOLS.map(s => s.province))].sort();
    regionSel.innerHTML = '<option value="all">不限</option>' +
      regions.map(r => `<option value="${r}">${r}</option>`).join('');
  } catch (e) {
    majorSel.innerHTML = '<option value="">数据加载失败</option>';
    document.getElementById('schoolResult').innerHTML =
      '<p class="empty-tip">院校数据加载失败。请用本地服务器打开（见 README），不要直接双击 index.html。</p>';
    console.error('加载 school_data.json 失败：', e);
  }
}

/** 绑定择校按钮事件 */
function bindSchoolEvents() {
  document.getElementById('searchBtn').addEventListener('click', generateRecommendation);
}

/**
 * 生成择校建议
 * 规则：先按专业/地区/偏好筛选，再按「院校均分 - 目标分」的差值分档：
 *   差值 > 10  → 冲一冲（院校要求高于自身水平）
 *   -10~10    → 稳妥
 *   差值 < -10 → 保底
 */
function generateRecommendation() {
  const major = document.getElementById('majorSelect').value;
  const target = Number(document.getElementById('scoreInput').value) || 0;
  const region = document.getElementById('regionSelect').value;
  const preference = document.getElementById('preferenceInput').value.trim();

  if (!major) { alert('请先选择报考专业'); return; }

  // 从「其他偏好」中识别地区关键词（简单匹配省份/城市名）
  let prefRegion = '';
  for (const s of SCHOOLS) {
    if (preference && (preference.includes(s.province) || preference.includes(s.city))) {
      prefRegion = s.province;
      break;
    }
  }
  // 偏好地区优下拉框；两者都无则为 all
  const regionFilter = prefRegion || (region === 'all' ? '' : region);

  // 筛选候选院校
  const candidates = SCHOOLS.filter(s => {
    if (s.major !== major) return false;
    if (regionFilter && s.province !== regionFilter) return false;
    return true;
  });

  const box = document.getElementById('schoolResult');
  if (candidates.length === 0) {
    box.innerHTML = '<p class="empty-tip">没有符合条件的院校，试试放宽地区或换个专业。</p>';
    return;
  }

  // 分档
  const chong = [], wen = [], bao = [];
  candidates.forEach(s => {
    const gap = s.score - target;
    if (gap > 10) chong.push(s);
    else if (gap < -10) bao.push(s);
    else wen.push(s);
  });

  // 结果说明
  const sourceText = prefRegion ? `其他偏好（${prefRegion}）` : (regionFilter ? '意向地区' : '全国范围');
  let html = `<p class="hint">共匹配 <b>${candidates.length}</b> 所院校，筛选依据：<b>${sourceText}</b>。数据为示例，仅供演示。</p>`;
  html += renderTier('冲一冲', 'chong', chong);
  html += renderTier('稳妥', 'wen', wen);
  html += renderTier('保底', 'bao', bao);
  box.innerHTML = html;
}

/** 渲染单个档次表格 */
function renderTier(title, cls, list) {
  let h = `<div class="tier tier-${cls}"><div class="tier-title">${title} · ${list.length} 所</div>`;
  if (list.length === 0) {
    h += '<p class="none-tip">暂无匹配院校</p>';
  } else {
    h += `<table class="school-table"><thead><tr>
            <th>院校</th><th>地区</th><th>层次</th><th>录取均分</th><th>报录比</th>
          </tr></thead><tbody>`;
    list.forEach(s => {
      h += `<tr>
              <td>${s.name}</td>
              <td>${s.province} · ${s.city}</td>
              <td>${s.tier}</td>
              <td>${s.score}</td>
              <td>${s.ratio}</td>
            </tr>`;
    });
    h += '</tbody></table>';
  }
  return h + '</div>';
}

/* ==================== 三、复习进度（localStorage） ==================== */

/** 从 localStorage 读取任务，失败则返回空数组 */
function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/** 保存任务到 localStorage */
function saveTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

/** 绑定任务相关事件 */
function bindTaskEvents() {
  document.getElementById('addTaskBtn').addEventListener('click', addTask);
  document.getElementById('taskInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTask();
  });
  document.getElementById('clearDoneBtn').addEventListener('click', clearDoneTasks);
  // 事件委托：处理列表内的勾选与删除
  document.getElementById('taskListBody').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    const chk = e.target.closest('input[type="checkbox"]');
    if (btn) handleTaskAction(btn.dataset.id, btn.dataset.action);
    if (chk) handleTaskAction(chk.dataset.id, 'toggle');
  });
  renderTasks(); // 首次渲染
}

/** 新增任务 */
function addTask() {
  const input = document.getElementById('taskInput');
  const text = input.value.trim();
  if (!text) { alert('请输入任务内容'); return; }
  const tasks = loadTasks();
  tasks.push({
    id: Date.now().toString(),
    subject: document.getElementById('subjectInput').value,
    text: text,
    stage: document.getElementById('stageInput').value,
    done: false
  });
  saveTasks(tasks);
  input.value = '';
  renderTasks();
}

/** 任务操作：toggle 打卡 / delete 删除 */
function handleTaskAction(id, action) {
  let tasks = loadTasks();
  if (action === 'toggle') {
    tasks = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
  } else if (action === 'delete') {
    tasks = tasks.filter(t => t.id !== id);
  }
  saveTasks(tasks);
  renderTasks();
}

/** 清除所有已完成任务 */
function clearDoneTasks() {
  const tasks = loadTasks().filter(t => !t.done);
  saveTasks(tasks);
  renderTasks();
}

/** 渲染任务列表与统计 */
function renderTasks() {
  const tasks = loadTasks();
  const tbody = document.getElementById('taskListBody');

  if (tasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="none-tip">还没有任务，添加一个开始复习吧。</td></tr>';
  } else {
    tbody.innerHTML = tasks.map(t => `
      <tr>
        <td><input type="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''}></td>
        <td><span class="badge">${t.subject}</span></td>
        <td class="${t.done ? 'task-done' : ''}">${t.text}</td>
        <td><span class="badge badge-stage">${t.stage}</span></td>
        <td><button class="btn-mini" data-id="${t.id}" data-action="delete">删除</button></td>
      </tr>`).join('');
  }

  // 统计
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const rate = total ? Math.round(done / total * 100) : 0;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statRate').textContent = rate + '%';
  document.getElementById('progressFill').style.width = rate + '%';
}

/* ==================== 四、数据看板（Chart.js） ==================== */

/** 渲染三张图表 */
function renderCharts() {
  // 若 CDN 未加载成功，给出提示并跳过
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js 未加载，图表不可用');
    return;
  }
  const tasks = loadTasks();

  // 1) 各科任务数（柱状图）
  const subjects = ['政治', '英语', '数学', '专业课', '其他'];
  const subjectCounts = subjects.map(s => tasks.filter(t => t.subject === s).length);
  chartSubject = drawChart(chartSubject, 'subjectChart', 'bar', subjects, subjectCounts,
    ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#6b7280']);

  // 2) 完成情况（环形图）
  const done = tasks.filter(t => t.done).length;
  const undone = tasks.length - done;
  chartDone = drawChart(chartDone, 'doneChart', 'doughnut', ['已完成', '未完成'], [done, undone],
    ['#16a34a', '#e5e7eb']);

  // 3) 各阶段分布（饼图）
  const stages = ['基础', '强化', '冲刺'];
  const stageCounts = stages.map(s => tasks.filter(t => t.stage === s).length);
  chartStage = drawChart(chartStage, 'stageChart', 'pie', stages, stageCounts,
    ['#2563eb', '#f59e0b', '#dc2626']);
}

/** 通用绘图：先销毁旧实例再创建，避免重复渲染报错 */
function drawChart(oldInstance, canvasId, type, labels, data, colors) {
  if (oldInstance) oldInstance.destroy();
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: type,
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}
