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
const legacyTrip = storedState?.days?.length
  ? { id: 'trip-legacy', name: '京都慢游 · 春日家庭行', destination: '日本京都', startDate: '2026-04-03', endDate: '2026-04-07', members: Number(storedState.members) || 4, days: storedState.days }
  : null;
const state = storedState?.trips?.length
  ? { trips: storedState.trips, activeTripId: storedState.activeTripId || storedState.trips[0].id }
  : { trips: [legacyTrip || { id: 'trip-default', name: '京都慢游 · 春日家庭行', destination: '日本京都', startDate: '2026-04-03', endDate: '2026-04-07', members: 4, days: seedDays }], activeTripId: legacyTrip?.id || 'trip-default' };
let selectedDay = 0;
let editingIndex = -1;
const timeline = document.querySelector('#timeline');
const toast = document.querySelector('#toast');
const dialog = document.querySelector('#activityDialog');
const form = document.querySelector('#activityForm');
const tripDialog = document.querySelector('#tripDialog');
const tripForm = document.querySelector('#tripForm');
const $ = selector => document.querySelector(selector);

function persist() { localStorage.setItem(stateKey, JSON.stringify(state)); }
function defaultFamilyMembers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `member-${index + 1}`,
    name: index === 0 ? '主要联系人' : `成员 ${index + 1}`,
    role: index < 2 ? '成人' : '儿童',
    age: null
  }));
}
function currentTrip() { return state.trips.find(trip => trip.id === state.activeTripId) || state.trips[0]; }
function normalizeTrip(trip) {
  const days = Array.isArray(trip.days) && trip.days.length ? trip.days : [{ title: '第一天', startTime: '09:00', activities: [] }];
  const members = Number(trip.members) || 1;
  return { ...trip, members, familyMembers: Array.isArray(trip.familyMembers) && trip.familyMembers.length ? trip.familyMembers : defaultFamilyMembers(members), days: days.map((day, index) => ({ ...day, startTime: day.startTime || (index === 0 ? '09:30' : '09:00'), activities: Array.isArray(day.activities) ? day.activities.map(normalizeActivity) : [] })) };
}
function normalizeActivity(activity) {
  return { ...activity, category: activity.category || '其他', costMode: activity.costMode === 'perPerson' ? 'perPerson' : 'total', cost: Math.max(0, Number(activity.cost) || 0) };
}
function activityTotal(activity, members) {
  return Number(activity.cost || 0) * (activity.costMode === 'perPerson' ? members : 1);
}
function formatDate(date) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(date);
}
function dateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return { start, days: Math.floor((end - start) / 86400000) + 1 };
}
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
  const trip = currentTrip();
  const activities = trip.days[selectedDay].activities;
  let current = timeToMinutes(trip.days[selectedDay].startTime);
  timeline.innerHTML = activities.length ? activities.map((activity, index) => {
    const start = current; current += Number(activity.duration);
    return `<div class="activity"><div class="time">${formatTime(start)}</div><span class="activity-dot"></span>
      <div class="activity-card" data-index="${index}"><div class="activity-main"><span class="activity-emoji">${escapeHtml(activity.emoji)}</span><div><h4>${escapeHtml(activity.title)}</h4><p>${escapeHtml(activity.detail || '暂无备注')}</p></div></div>
      <div class="activity-meta"><strong>¥ ${activityTotal(activity, trip.members).toLocaleString('zh-CN')}</strong><small>${escapeHtml(activity.category)} · ${activity.costMode === 'perPerson' ? '人均' : '总额'} · ${activity.duration} 分钟</small></div>
      <div class="activity-controls"><button data-action="up" title="上移">↑</button><button data-action="down" title="下移">↓</button><button data-action="edit" title="编辑">✎</button><button data-action="delete" title="删除">×</button></div></div></div>`;
  }).join('') : '<div class="empty-state">这一天还没有安排<br><button class="button add-button" data-empty-add>＋ 添加第一项安排</button></div>';
  document.querySelector('#dayLabel').textContent = `DAY ${selectedDay + 1}`;
  document.querySelector('#dayTitle').textContent = trip.days[selectedDay].title;
  document.querySelector('#dayStartTime').value = trip.days[selectedDay].startTime;
  timeline.querySelectorAll('.activity-card').forEach(card => card.addEventListener('click', event => {
    const action = event.target.dataset.action;
    const index = Number(card.dataset.index);
    if (action === 'edit') return openEditor(index);
    if (action === 'delete') { currentTrip().days[selectedDay].activities.splice(index, 1); persist(); renderTimeline(); updateCost(); showToast('安排已删除'); return; }
    if (action === 'up' && index > 0) [activities[index - 1], activities[index]] = [activities[index], activities[index - 1]];
    if (action === 'down' && index < activities.length - 1) [activities[index], activities[index + 1]] = [activities[index + 1], activities[index]];
    if (action === 'up' || action === 'down') { persist(); renderTimeline(); showToast('顺序已调整，后续时间自动顺延'); }
  }));
  const emptyAdd = timeline.querySelector('[data-empty-add]');
  if (emptyAdd) emptyAdd.addEventListener('click', () => openEditor());
}
function renderTabs() {
  const trip = currentTrip();
  const range = dateRange(trip.startDate, trip.endDate);
  document.querySelector('#daysTabs').innerHTML = trip.days.map((day, index) => {
    const date = new Date(range.start);
    date.setDate(date.getDate() + index);
    return `<button class="day-tab${index === selectedDay ? ' active' : ''}" data-day="${index}">D${index + 1}<small>${formatDate(date)}</small></button>`;
  }).join('');
  document.querySelectorAll('.day-tab').forEach(tab => tab.addEventListener('click', () => { selectedDay = Number(tab.dataset.day); renderTabs(); renderTimeline(); }));
}
function updateCost() {
  const trip = currentTrip();
  const total = trip.days.reduce((sum, day) => sum + day.activities.reduce((daySum, item) => daySum + activityTotal(item, trip.members), 0), 0);
  $('#memberCount').textContent = `${trip.members} 人`;
  $('#memberHint').textContent = `${Math.max(1, trip.members - 2)} 位成人 · ${Math.min(2, trip.members)} 位儿童`;
  $('#totalCost').textContent = `¥ ${total.toLocaleString('zh-CN')}`;
  $('#perPerson').textContent = Math.round(total / trip.members).toLocaleString('zh-CN');
}
function renderTripHeader() {
  const trip = currentTrip();
  const range = dateRange(trip.startDate, trip.endDate);
  $('#tripName').textContent = trip.name;
  $('#tripNameCrumb').textContent = trip.name;
  const startLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(range.start);
  const endLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(`${trip.endDate}T00:00:00`));
  $('#tripMeta').innerHTML = `${startLabel} — ${endLabel} <span class="muted-separator">·</span> ${range.days}天${Math.max(0, range.days - 1)}晚 <span class="muted-separator">·</span> ${escapeHtml(trip.destination)}`;
}
function renderApp() {
  const trip = currentTrip();
  selectedDay = Math.min(selectedDay, trip.days.length - 1);
  renderTripHeader(); renderTabs(); renderTimeline(); updateCost();
}
function openEditor(index = -1) {
  editingIndex = index;
  const activity = index >= 0 ? currentTrip().days[selectedDay].activities[index] : { title: '', detail: '', emoji: '📍', category: '其他', cost: 0, costMode: 'total', duration: 60 };
  $('#dialogMode').textContent = index >= 0 ? '编辑安排' : '新增安排';
  $('#dialogTitle').textContent = index >= 0 ? activity.title : '添加行程';
  $('#activityName').value = activity.title; $('#activityDetail').value = activity.detail;
  $('#activityEmoji').value = activity.emoji; $('#activityCategory').value = activity.category || '其他'; $('#activityCost').value = activity.cost; $('#activityCostMode').value = activity.costMode || 'total'; $('#activityDuration').value = activity.duration;
  dialog.showModal(); $('#activityName').focus();
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const duration = Number($('#activityDuration').value);
  if (!Number.isInteger(duration) || duration < 10 || duration > 720) return showToast('时长需为 10 - 720 分钟的整数');
  const activity = normalizeActivity({ title: $('#activityName').value.trim(), detail: $('#activityDetail').value.trim(), emoji: $('#activityEmoji').value.trim() || '📍', category: $('#activityCategory').value, cost: Number($('#activityCost').value) || 0, costMode: $('#activityCostMode').value, duration });
  if (!activity.title) return showToast('请填写安排名称');
  if (editingIndex >= 0) currentTrip().days[selectedDay].activities[editingIndex] = { ...currentTrip().days[selectedDay].activities[editingIndex], ...activity };
  else { activity.time = currentTrip().days[selectedDay].startTime; currentTrip().days[selectedDay].activities.push(activity); }
  persist(); dialog.close(); renderTimeline(); updateCost(); showToast(editingIndex >= 0 ? '安排已更新，后续时间自动顺延' : '安排已添加');
});
function exportExcel() {
  const trip = currentTrip();
  const rows = trip.days.flatMap((day, dayIndex) => {
    let current = timeToMinutes(day.startTime);
    return day.activities.map((a, i) => {
      const time = formatTime(current);
      current += Number(a.duration);
      return `<tr><td>第${dayIndex + 1}天</td><td>${i + 1}</td><td>${time}</td><td>${escapeHtml(a.category)}</td><td>${a.costMode === 'perPerson' ? '人均' : '总额'}</td><td>${escapeHtml(a.title)}</td><td>${escapeHtml(a.detail)}</td><td>${a.duration}</td><td>${activityTotal(a, trip.members)}</td></tr>`;
    });
  }).join('');
  const table = `<table border="1"><tr><th>日期</th><th>序号</th><th>时间</th><th>类别</th><th>计费方式</th><th>安排</th><th>说明</th><th>时长（分钟）</th><th>总费用（¥）</th></tr>${rows}</table>`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\ufeff<html><meta charset="utf-8">${table}</html>`], { type: 'application/vnd.ms-excel' }));
  link.download = `${trip.name}-行程.xls`; link.click(); URL.revokeObjectURL(link.href); showToast('Excel 行程表已下载');
}
function expenseTotal(trip) {
  return trip.days.reduce((total, day) => total + day.activities.reduce((sum, activity) => sum + activityTotal(activity, trip.members), 0), 0);
}
function saveTripFile() {
  const trip = currentTrip();
  const fileData = {
    format: 'FamilyTrip',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    trip: {
      ...trip,
      familyMembers: trip.familyMembers || defaultFamilyMembers(trip.members),
      expenseSummary: {
        activityTotal: expenseTotal(trip),
        estimatedTotal: expenseTotal(trip),
        currency: 'CNY'
      }
    }
  };
  const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${trip.name || '未命名行程'}.trip.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('行程文件已保存，可下次继续打开修改');
}
function openTripFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (parsed.format !== 'FamilyTrip' || !parsed.trip || !Array.isArray(parsed.trip.days)) throw new Error('文件格式不正确');
      const trip = normalizeTrip({ ...parsed.trip, id: `trip-${Date.now()}` });
      state.trips.push(trip);
      state.activeTripId = trip.id;
      selectedDay = 0;
      persist();
      renderApp();
      showToast('行程文件已打开');
    } catch (error) {
      showToast(`无法打开行程文件：${error.message}`);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}
document.querySelector('#printPdf').addEventListener('click', () => window.print());
document.querySelector('#exportExcel').addEventListener('click', exportExcel);
document.querySelector('#saveTripFile').addEventListener('click', saveTripFile);
document.querySelector('#openTripFile').addEventListener('click', () => document.querySelector('#tripFileInput').click());
document.querySelector('#tripFileInput').addEventListener('change', openTripFile);
document.querySelector('#addActivity').addEventListener('click', () => openEditor());
document.querySelector('#addMember').addEventListener('click', () => {
  const trip = currentTrip();
  trip.members += 1;
  trip.familyMembers = [...(trip.familyMembers || []), ...defaultFamilyMembers(1).map(member => ({ ...member, id: `member-${Date.now()}` }))];
  persist();
  updateCost();
  showToast(`已添加成员，费用已重算为 ${trip.members} 人`);
});
document.querySelector('#manageMembers').addEventListener('click', () => showToast('成员管理可在后续版本编辑角色与年龄'));
$('#dayStartTime').addEventListener('change', event => {
  currentTrip().days[selectedDay].startTime = event.target.value || '09:00';
  persist(); renderTimeline(); showToast('开始时间已更新，全天行程自动顺延');
});
document.querySelector('#newTripButton').addEventListener('click', () => {
  const today = new Date();
  const iso = date => date.toISOString().slice(0, 10);
  $('#newTripStart').value = iso(today);
  $('#newTripEnd').value = iso(new Date(today.getTime() + 4 * 86400000));
  $('#newTripMembers').value = currentTrip().members;
  tripDialog.showModal(); $('#newTripName').focus();
});
['closeTripDialog', 'cancelTripDialog'].forEach(id => document.querySelector(`#${id}`).addEventListener('click', () => tripDialog.close()));
['closeActivityDialog', 'cancelActivityDialog'].forEach(id => document.querySelector(`#${id}`).addEventListener('click', () => dialog.close()));
tripForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#newTripName').value.trim();
  const destination = $('#newTripDestination').value.trim();
  const startDate = $('#newTripStart').value;
  const endDate = $('#newTripEnd').value;
  const members = Number($('#newTripMembers').value);
  if (!name || !destination || !startDate || !endDate || !Number.isInteger(members) || members < 1 || members > 30) return showToast('请完整填写旅行信息');
  const range = dateRange(startDate, endDate);
  if (range.days < 1 || range.days > 31) return showToast('旅行时长需为 1 到 31 天');
  const days = Array.from({ length: range.days }, (_, index) => ({ title: index === 0 ? `抵达 · ${destination}` : `第 ${index + 1} 天`, startTime: '09:00', activities: [] }));
  const trip = normalizeTrip({ id: `trip-${Date.now()}`, name, destination, startDate, endDate, members, days });
  state.trips.push(trip); state.activeTripId = trip.id; selectedDay = 0; persist(); tripDialog.close(); renderApp(); showToast('新行程已创建');
});
state.trips = state.trips.map(normalizeTrip);
persist();
tripDialog.addEventListener('cancel', event => { event.preventDefault(); tripDialog.close(); });
dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
renderApp();
