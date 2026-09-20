const seedDays = [
  {
    title: '抵达京都 · 古都初见',
    startTime: '09:30',
    activities: [
      { time: '09:30', title: '抵达关西机场', detail: '机场接送 · 约 1小时20分', emoji: '🛬', cost: 620, duration: 80 },
      { time: '11:10', title: '前往京都站', detail: '包车 · 约 1小时20分', emoji: '🚐', cost: 360, duration: 80 },
      { time: '12:40', title: '午餐 · 京都拉面小路', detail: '京都站 10F · 预计 1小时', emoji: '🍜', cost: 480, duration: 60 },
      { time: '14:00', title: '入住 · 四季京都酒店', detail: '东山区 · 2间家庭房', emoji: '🏨', cost: 8900, duration: 30 },
      { time: '15:00', title: '清水寺与二年坂', detail: '步行游览 · 约 2小时', emoji: '⛩️', cost: 1600, duration: 120 }
    ]
  },
  ...['岚山竹林 · 渡月桥', '伏见稻荷 · 宇治抹茶', '奈良一日 · 与鹿相遇', '返程 · 带着春色回家'].map(title => ({ title, startTime: '09:00', activities: [] }))
];
const stateKey = 'familyTripPlanner';
const storedState = JSON.parse(localStorage.getItem(stateKey) || 'null');
const state = storedState?.days?.length === 5
  ? { members: Number(storedState.members) || 4, days: storedState.days.map((day, index) => ({ ...day, startTime: day.startTime || (index === 0 ? '09:30' : '09:00'), activities: Array.isArray(day.activities) ? day.activities : [] })) }
  : { days: seedDays, members: 4 };
let selectedDay = 0;
let editingIndex = -1;
const timeline = document.querySelector('#timeline');
const toast = document.querySelector('#toast');
const dialog = document.querySelector('#activityDialog');
const form = document.querySelector('#activityForm');
const $ = selector => document.querySelector(selector);

function persist() { localStorage.setItem(stateKey, JSON.stringify(state)); }
function formatTime(minutes) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}
function showToast(message) {
  toast.textContent = message; toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2400);
}
function renderTimeline() {
  const activities = state.days[selectedDay].activities;
  let current = timeToMinutes(state.days[selectedDay].startTime);
  timeline.innerHTML = activities.length ? activities.map((activity, index) => {
    const start = current; current += Number(activity.duration);
    return `<div class="activity"><div class="time">${formatTime(start)}</div><span class="activity-dot"></span>
      <div class="activity-card" data-index="${index}"><div class="activity-main"><span class="activity-emoji">${escapeHtml(activity.emoji)}</span><div><h4>${escapeHtml(activity.title)}</h4><p>${escapeHtml(activity.detail || '暂无备注')}</p></div></div>
      <div class="activity-meta"><strong>¥ ${Number(activity.cost).toLocaleString('zh-CN')}</strong><small>${activity.duration} 分钟</small></div>
      <div class="activity-controls"><button data-action="up" title="上移">↑</button><button data-action="down" title="下移">↓</button><button data-action="edit" title="编辑">✎</button><button data-action="delete" title="删除">×</button></div></div></div>`;
  }).join('') : '<div class="empty-state">这一天还没有安排<br><button class="button add-button" data-empty-add>＋ 添加第一项安排</button></div>';
  document.querySelector('#dayLabel').textContent = `DAY ${selectedDay + 1}`;
  document.querySelector('#dayTitle').textContent = state.days[selectedDay].title;
  document.querySelector('#dayStartTime').value = state.days[selectedDay].startTime;
  timeline.querySelectorAll('.activity-card').forEach(card => card.addEventListener('click', event => {
    const action = event.target.dataset.action;
    const index = Number(card.dataset.index);
    if (action === 'edit') return openEditor(index);
    if (action === 'delete') { state.days[selectedDay].activities.splice(index, 1); persist(); renderTimeline(); showToast('安排已删除'); return; }
    if (action === 'up' && index > 0) [activities[index - 1], activities[index]] = [activities[index], activities[index - 1]];
    if (action === 'down' && index < activities.length - 1) [activities[index], activities[index + 1]] = [activities[index + 1], activities[index]];
    if (action === 'up' || action === 'down') { persist(); renderTimeline(); showToast('顺序已调整，后续时间自动顺延'); }
  }));
  const emptyAdd = timeline.querySelector('[data-empty-add]');
  if (emptyAdd) emptyAdd.addEventListener('click', () => openEditor());
}
function renderTabs() {
  document.querySelectorAll('.day-tab').forEach(tab => tab.classList.toggle('active', Number(tab.dataset.day) === selectedDay));
}
function updateCost() {
  const activitiesCost = state.days.reduce((total, day) => total + day.activities.reduce((sum, item) => sum + Number(item.cost), 0), 0);
  const total = 7120 + activitiesCost + state.members * 520;
  $('#memberCount').textContent = `${state.members} 人`;
  $('#memberHint').textContent = `${Math.max(1, state.members - 2)} 位成人 · ${Math.min(2, state.members)} 位儿童`;
  $('#totalCost').textContent = `¥ ${total.toLocaleString('zh-CN')}`;
  $('#perPerson').textContent = Math.round(total / state.members).toLocaleString('zh-CN');
}
function openEditor(index = -1) {
  editingIndex = index;
  const activity = index >= 0 ? state.days[selectedDay].activities[index] : { title: '', detail: '', emoji: '📍', cost: 0, duration: 60 };
  $('#dialogMode').textContent = index >= 0 ? '编辑安排' : '新增安排';
  $('#dialogTitle').textContent = index >= 0 ? activity.title : '添加行程';
  $('#activityName').value = activity.title; $('#activityDetail').value = activity.detail;
  $('#activityEmoji').value = activity.emoji; $('#activityCost').value = activity.cost; $('#activityDuration').value = activity.duration;
  dialog.showModal(); $('#activityName').focus();
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const duration = Number($('#activityDuration').value);
  if (!Number.isInteger(duration) || duration < 10 || duration > 720) return showToast('时长需为 10 - 720 分钟的整数');
  const activity = { title: $('#activityName').value.trim(), detail: $('#activityDetail').value.trim(), emoji: $('#activityEmoji').value.trim() || '📍', cost: Number($('#activityCost').value) || 0, duration };
  if (!activity.title) return showToast('请填写安排名称');
  if (editingIndex >= 0) state.days[selectedDay].activities[editingIndex] = { ...state.days[selectedDay].activities[editingIndex], ...activity };
  else { activity.time = '09:30'; state.days[selectedDay].activities.push(activity); }
  persist(); dialog.close(); renderTimeline(); updateCost(); showToast(editingIndex >= 0 ? '安排已更新，后续时间自动顺延' : '安排已添加');
});
function exportExcel() {
  const rows = state.days.flatMap((day, dayIndex) => {
    let current = timeToMinutes(day.startTime);
    return day.activities.map((a, i) => {
      const time = formatTime(current);
      current += Number(a.duration);
      return `<tr><td>第${dayIndex + 1}天</td><td>${i + 1}</td><td>${time}</td><td>${escapeHtml(a.title)}</td><td>${escapeHtml(a.detail)}</td><td>${a.duration}</td><td>${a.cost}</td></tr>`;
    });
  }).join('');
  const table = `<table border="1"><tr><th>日期</th><th>序号</th><th>时间</th><th>安排</th><th>说明</th><th>时长（分钟）</th><th>费用（¥）</th></tr>${rows}</table>`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\ufeff<html><meta charset="utf-8">${table}</html>`], { type: 'application/vnd.ms-excel' }));
  link.download = '京都慢游-家庭行程.xls'; link.click(); URL.revokeObjectURL(link.href); showToast('Excel 行程表已下载');
}
document.querySelector('#printPdf').addEventListener('click', () => window.print());
document.querySelector('#exportExcel').addEventListener('click', exportExcel);
document.querySelector('#addActivity').addEventListener('click', () => openEditor());
document.querySelector('#addMember').addEventListener('click', () => { state.members += 1; persist(); updateCost(); showToast(`已添加成员，费用已重算为 ${state.members} 人`); });
document.querySelector('#manageMembers').addEventListener('click', () => showToast('成员管理可在后续版本编辑角色与年龄'));
document.querySelectorAll('.day-tab').forEach(tab => tab.addEventListener('click', () => { selectedDay = Number(tab.dataset.day); renderTabs(); renderTimeline(); }));
$('#dayStartTime').addEventListener('change', event => {
  state.days[selectedDay].startTime = event.target.value || '09:00';
  persist(); renderTimeline(); showToast('开始时间已更新，全天行程自动顺延');
});
renderTabs(); renderTimeline(); updateCost();
