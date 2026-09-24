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
const CURRENT_SCHEMA_VERSION = 3;
const tripHandleDatabaseName = 'familyTripFileHandles';
const tripHandleStoreName = 'handles';
function parseStoredState() {
  const raw = localStorage.getItem(stateKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.storageSchemaVersion && parsed.storageSchemaVersion > CURRENT_SCHEMA_VERSION) {
      console.warn(`本地行程数据版本 ${parsed.storageSchemaVersion} 高于当前版本 ${CURRENT_SCHEMA_VERSION}`);
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('本地行程数据无法解析，将使用默认行程', error);
    return null;
  }
}
const storedState = parseStoredState();
const legacyTrip = storedState?.days?.length
  ? { id: 'trip-legacy', name: '京都慢游 · 春日家庭行', destination: '日本京都', startDate: '2026-04-03', endDate: '2026-04-07', members: Number(storedState.members) || 4, days: storedState.days }
  : null;
const state = storedState?.trips?.length
  ? { trips: storedState.trips, activeTripId: storedState.activeTripId || storedState.trips[0].id }
  : { trips: [legacyTrip || { id: 'trip-default', name: '京都慢游 · 春日家庭行', destination: '日本京都', startDate: '2026-04-03', endDate: '2026-04-07', members: 4, days: seedDays }], activeTripId: legacyTrip?.id || 'trip-default' };
let selectedDay = 0;
let editingIndex = -1;
let editingAlternativeIndex = -1;
let addingActivityAlternative = false;
let addingDayAlternativeIndex = -1;
let insertingActivityIndex = -1;
let newActivityTime = '';
const daysBoard = document.querySelector('#daysBoard');
const toast = document.querySelector('#toast');
const dialog = document.querySelector('#activityDialog');
const form = document.querySelector('#activityForm');
const tripDialog = document.querySelector('#tripDialog');
const tripForm = document.querySelector('#tripForm');
const planDialog = document.querySelector('#planDialog');
const planForm = document.querySelector('#planForm');
const editTripDialog = document.querySelector('#editTripDialog');
const editTripForm = document.querySelector('#editTripForm');
const $ = selector => document.querySelector(selector);

function persist() { localStorage.setItem(stateKey, JSON.stringify({ ...state, storageSchemaVersion: CURRENT_SCHEMA_VERSION })); }
function supportsFileHandles() {
  return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window && 'indexedDB' in window;
}
function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(tripHandleDatabaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(tripHandleStoreName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readTripHandle(tripId) {
  if (!supportsFileHandles()) return null;
  const database = await openHandleDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(tripHandleStoreName, 'readonly').objectStore(tripHandleStoreName).get(tripId);
    request.onsuccess = () => { database.close(); resolve(request.result || null); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}
async function storeTripHandle(tripId, handle) {
  if (!supportsFileHandles()) return;
  const database = await openHandleDatabase();
  await new Promise((resolve, reject) => {
    const request = database.transaction(tripHandleStoreName, 'readwrite').objectStore(tripHandleStoreName).put(handle, tripId);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}
async function canWriteHandle(handle) {
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}
function tripFileData(trip) {
  return {
    format: 'FamilyTrip',
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
}
function migrateTripFile(fileData) {
  if (!fileData || fileData.format !== 'FamilyTrip' || !fileData.trip || !Array.isArray(fileData.trip.days)) throw new Error('文件格式不正确');
  const sourceVersion = fileData.schemaVersion === undefined ? 1 : Number(fileData.schemaVersion);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) throw new Error('文件版本号不正确');
  if (sourceVersion > CURRENT_SCHEMA_VERSION) throw new Error(`文件版本 ${sourceVersion} 高于当前应用支持的版本 ${CURRENT_SCHEMA_VERSION}，请升级应用后再打开`);
  let trip = { ...fileData.trip };
  if (sourceVersion < 2) {
    trip.familyMembers = Array.isArray(trip.familyMembers) ? trip.familyMembers : [];
    trip.days = trip.days.map(day => ({ ...day, alternatives: Array.isArray(day.alternatives) ? day.alternatives : [] }));
  }
  if (sourceVersion < 3) {
    trip.days = trip.days.map(day => ({
      ...day,
      activities: (Array.isArray(day.activities) ? day.activities : []).map(activity => ({
        ...activity,
        timeLocked: activity.timeLocked === true || Boolean(activity.time)
      })),
      alternatives: (Array.isArray(day.alternatives) ? day.alternatives : []).map(option => ({
        ...option,
        activities: (Array.isArray(option.activities) ? option.activities : []).map(activity => ({
          ...activity,
          timeLocked: activity.timeLocked === true || Boolean(activity.time)
        }))
      }))
    }));
  }
  return { trip: normalizeTrip({ ...trip, id: `trip-${Date.now()}` }), migratedFrom: sourceVersion, schemaVersion: CURRENT_SCHEMA_VERSION };
}
function defaultFamilyMembers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `member-${index + 1}`,
    name: index === 0 ? '主要联系人' : `成员 ${index + 1}`,
    role: index < 2 ? '成人' : '儿童',
    age: index < 2 ? null : 8,
    weights: index < 2 ? { transport: 1, ticket: 1, dining: 1 } : { transport: 0.5, ticket: 0.5, dining: 0.5 }
  }));
}
function currentTrip() { return state.trips.find(trip => trip.id === state.activeTripId) || state.trips[0]; }
function normalizeTrip(trip) {
  const days = Array.isArray(trip.days) && trip.days.length ? trip.days : [{ title: '第一天', startTime: '09:00', activities: [] }];
  const members = Number(trip.members) || 1;
  const familyMembers = (Array.isArray(trip.familyMembers) && trip.familyMembers.length ? trip.familyMembers : defaultFamilyMembers(members)).map(normalizeMember);
  return { ...trip, members: familyMembers.length, familyMembers, days: days.map((day, index) => ({ ...day, startTime: day.startTime || (index === 0 ? '09:30' : '09:00'), activities: Array.isArray(day.activities) ? day.activities.map(normalizeActivity) : [], alternatives: Array.isArray(day.alternatives) ? day.alternatives.map(normalizeDayAlternative) : [] })) };
}
function normalizeMember(member, index) {
  const age = member.age === null || member.age === '' ? null : Number(member.age);
  const role = age !== null ? (age < 12 ? '儿童' : age >= 60 ? '老人' : '成人') : (member.role || '成人');
  const defaults = role === '儿童' ? 0.5 : role === '老人' ? 0.8 : 1;
  return { id: member.id || `member-${index + 1}`, name: member.name || `成员 ${index + 1}`, role, age, weights: { transport: Number(member.weights?.transport ?? defaults), ticket: Number(member.weights?.ticket ?? defaults), dining: Number(member.weights?.dining ?? defaults) } };
}
function normalizeActivity(activity) {
  const alternatives = Array.isArray(activity.alternatives) ? activity.alternatives.map(item => normalizeActivity({ ...item, alternatives: [] })) : [];
  return { ...activity, category: activity.category || '其他', costMode: activity.costMode === 'perPerson' ? 'perPerson' : 'total', cost: Math.max(0, Number(activity.cost) || 0), timeLocked: activity.timeLocked === true, alternatives };
}
function normalizeDayAlternative(alternative) {
  return { id: alternative.id || `day-option-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: alternative.name || '备用方案', activities: Array.isArray(alternative.activities) ? alternative.activities.map(normalizeActivity) : [] };
}
function activityTotal(activity, members) {
  return Number(activity.cost || 0) * (activity.costMode === 'perPerson' ? members : 1);
}
function expenseCategory(category) {
  if (category === '交通费' || category === '机票') return 'transport';
  if (category === '门票') return 'ticket';
  if (category === '餐饮费') return 'dining';
  return null;
}
function activityTotalForTrip(activity, trip) {
  if (activity.costMode !== 'perPerson') return Number(activity.cost || 0);
  const key = expenseCategory(activity.category);
  const units = key ? trip.familyMembers.reduce((sum, member) => sum + member.weights[key], 0) : trip.members;
  return Number(activity.cost || 0) * units;
}
function renderMembers() {
  const trip = currentTrip();
  const colors = ['orange', 'blue-bg', 'yellow', 'pink'];
  $('#memberList').innerHTML = trip.familyMembers.map((member, index) => `<div class="member-row"><span class="member-avatar ${colors[index % colors.length]}">${escapeHtml(member.name.slice(0, 1))}</span><div><strong>${escapeHtml(member.name)}</strong><small>${member.role}${member.age !== null ? ` · ${member.age}岁` : ''}</small></div><span class="check">✓</span></div>`).join('');
}
function memberEditorRow(member, index) {
  return `<div class="member-editor-row" data-member-index="${index}">
    <div class="member-editor-top"><strong>成员 ${index + 1}</strong><button type="button" class="remove-member" data-remove-member="${index}">删除</button></div>
    <div class="member-editor-fields"><label>姓名<input data-member-name value="${escapeHtml(member.name)}" maxlength="20" required></label><label>年龄<input data-member-age type="number" min="0" max="120" value="${member.age ?? ''}"></label></div>
    <div class="weight-grid"><label>交通<input data-weight="transport" type="number" min="0" max="2" step="0.1" value="${member.weights.transport}"></label><label>门票<input data-weight="ticket" type="number" min="0" max="2" step="0.1" value="${member.weights.ticket}"></label><label>餐饮<input data-weight="dining" type="number" min="0" max="2" step="0.1" value="${member.weights.dining}"></label></div>
  </div>`;
}
function renderMembersEditor() {
  $('#membersEditor').innerHTML = currentTrip().familyMembers.map(memberEditorRow).join('');
  $('#membersEditor').querySelectorAll('[data-remove-member]').forEach(button => button.addEventListener('click', () => {
    if (currentTrip().familyMembers.length <= 1) return showToast('至少保留 1 位同行人');
    currentTrip().familyMembers.splice(Number(button.dataset.removeMember), 1);
    currentTrip().members = currentTrip().familyMembers.length;
    renderMembersEditor();
  }));
}
function formatDate(date) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(date);
}
function dateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return { start, days: Math.floor((end - start) / 86400000) + 1 };
}
function updateEditTripDaysHint() {
  const startDate = $('#editTripStart').value;
  const endDate = $('#editTripEnd').value;
  if (!startDate || !endDate) return;
  const range = dateRange(startDate, endDate);
  const trip = currentTrip();
  const removedDays = trip.days.slice(range.days);
  const hasContent = removedDays.some(day => day.activities.length || day.alternatives.length);
  $('#editTripDaysHint').textContent = range.days < 1 ? '结束日期不能早于开始日期' : `将显示 ${range.days} 天${hasContent ? '；缩短日期会移除超出范围的安排' : ''}`;
  $('#editTripRemoveWarning').hidden = !(range.days < trip.days.length && hasContent);
  if (!hasContent) $('#editTripConfirmRemove').checked = false;
}
function openEditTripDialog() {
  const trip = currentTrip();
  $('#editTripName').value = trip.name || '';
  $('#editTripStart').value = trip.startDate;
  $('#editTripEnd').value = trip.endDate;
  $('#editTripConfirmRemove').checked = false;
  updateEditTripDaysHint();
  editTripDialog.showModal();
  $('#editTripName').focus();
}
function formatTime(minutes) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function endTimeFor(startTime, duration) {
  return formatTime(timeToMinutes(startTime) + Number(duration));
}
function syncActivityEndTime() {
  const startTime = $('#activityStartTime').value;
  const duration = Number($('#activityDuration').value);
  if (startTime && Number.isInteger(duration) && duration >= 10) $('#activityEndTime').value = endTimeFor(startTime, duration);
}
function syncActivityDuration() {
  const startTime = $('#activityStartTime').value;
  const endTime = $('#activityEndTime').value;
  if (!startTime || !endTime) return;
  const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (duration >= 10 && duration <= 720) $('#activityDuration').value = duration;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}
function safeFilePart(value) {
  return String(value || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '');
}
function tripFileName(trip) {
  const date = String(trip.startDate || '').replace(/-/g, '');
  const destination = safeFilePart(trip.destination) || '未命名地点';
  const name = safeFilePart(trip.name);
  return `${date}_${destination}${name ? `_${name}` : ''}.trip.json`;
}
function tripDisplayName(trip) {
  return trip.name || trip.destination || '未命名行程';
}
function showToast(message) {
  toast.textContent = message; toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2400);
}
function activityStartTime(day, index) {
  let current = timeToMinutes(day.startTime);
  for (let itemIndex = 0; itemIndex < index; itemIndex += 1) {
    const item = day.activities[itemIndex];
    if (item.timeLocked && item.time) current = Math.max(current, timeToMinutes(item.time));
    current += Number(item.duration);
  }
  const activity = day.activities[index];
  return activity?.timeLocked && activity.time ? Math.max(current, timeToMinutes(activity.time)) : current;
}
function gapHtml(dayIndex, insertIndex, start, end) {
  const duration = end - start;
  if (duration < 10) return '';
  return `<div class="schedule-gap"><span>无行程 · ${Math.floor(duration / 60)}小时${duration % 60 ? `${duration % 60}分钟` : ''}</span><button class="gap-add" data-action="insert-activity" data-day="${dayIndex}" data-insert-index="${insertIndex}" data-insert-time="${formatTime(start)}">＋ 插入安排</button></div>`;
}
function renderTimeline() {
  const trip = currentTrip();
  const range = dateRange(trip.startDate, trip.endDate);
  daysBoard.innerHTML = trip.days.map((day, dayIndex) => {
    const activities = day.activities;
    let previousEnd = timeToMinutes(day.startTime);
    const activityHtml = activities.length ? activities.map((activity, index) => {
      const start = activityStartTime(day, index);
      const gap = gapHtml(dayIndex, index, previousEnd, start);
      previousEnd = start + Number(activity.duration);
      const alternativeButtons = activity.alternatives.map((alternative, alternativeIndex) => `<button class="alternative-chip" data-action="select-activity-alternative" data-alternative-index="${alternativeIndex}">备选：${escapeHtml(alternative.title)}</button>`).join('');
      return `${gap}<div class="activity"><div class="time">${formatTime(start)}</div><span class="activity-dot"></span>
        <div class="activity-card" data-day="${dayIndex}" data-index="${index}"><div class="activity-main"><span class="activity-emoji">${escapeHtml(activity.emoji)}</span><div><h4>${escapeHtml(activity.title)}</h4><p>${escapeHtml(activity.detail || '暂无备注')}</p></div></div>
          <div class="activity-meta"><strong>¥ ${activityTotalForTrip(activity, trip).toLocaleString('zh-CN')}</strong><small>${escapeHtml(activity.category)} · ${activity.costMode === 'perPerson' ? '按权重' : '总额'} · ${activity.duration} 分钟</small></div>
        <div class="activity-controls"><button data-action="up" title="上移">↑</button><button data-action="down" title="下移">↓</button><button data-action="edit" title="编辑">✎</button><button data-action="add-alternative" title="添加活动备用方案">备选</button><button data-action="delete" title="删除">×</button></div>
        ${alternativeButtons ? `<div class="activity-alternatives"><span>备用方案：</span>${alternativeButtons}</div>` : ''}</div></div>`;
    }).join('') : '<div class="empty-state">暂无安排</div>';
    const date = new Date(range.start);
    date.setDate(date.getDate() + dayIndex);
    const dayAlternatives = day.alternatives.map((alternative, alternativeIndex) => `<button class="alternative-chip" data-day="${dayIndex}" data-alternative-index="${alternativeIndex}" data-action="select-day-alternative">备用：${escapeHtml(alternative.name)}</button>`).join('');
    return `<section class="day-column" data-day="${dayIndex}">
      <div class="day-column-header"><div><span class="day-label">DAY ${dayIndex + 1}</span><h3>${escapeHtml(day.title)}</h3><small>${formatDate(date)}</small></div><div class="day-plan-actions"><label class="day-start">开始 <input data-day-start="${dayIndex}" type="time" value="${day.startTime}"></label><button class="plan-button" data-day="${dayIndex}" data-action="add-day-alternative">＋ 备用整日</button>${dayAlternatives}</div></div>
      <div class="timeline">${activityHtml}<button class="day-add-button" data-action="add-day-activity" data-day="${dayIndex}">＋ 添加安排</button></div>
    </section>`;
  }).join('');
  daysBoard.querySelectorAll('.activity-card, .day-plan-actions [data-action], .schedule-gap [data-action], .day-add-button').forEach(card => card.addEventListener('click', event => {
    const action = event.target.dataset.action;
    const dayIndex = Number(card.dataset.day);
    const index = Number(card.dataset.index);
    const activities = trip.days[dayIndex].activities;
    if (action === 'add-day-activity') {
      selectedDay = dayIndex; insertingActivityIndex = activities.length; newActivityTime = ''; openEditor(); return;
    }
    if (action === 'insert-activity') {
      selectedDay = dayIndex; insertingActivityIndex = Number(event.target.dataset.insertIndex); newActivityTime = event.target.dataset.insertTime; openEditor(); return;
    }
    if (action === 'select-day-alternative') {
      const alternativeIndex = Number(event.target.dataset.alternativeIndex);
      const alternative = trip.days[dayIndex].alternatives[alternativeIndex];
      [trip.days[dayIndex].activities, alternative.activities] = [alternative.activities, trip.days[dayIndex].activities];
      persist(); renderTimeline(); updateCost(); showToast(`已切换到整日备用方案“${alternative.name}”，原方案已保留为备用`);
      return;
    }
    if (action === 'add-day-alternative') {
      addingDayAlternativeIndex = dayIndex;
      $('#planName').value = `备用方案 ${trip.days[dayIndex].alternatives.length + 1}`;
      planDialog.showModal();
      $('#planName').focus();
      return;
    }
    if (action === 'select-activity-alternative') {
      const alternativeIndex = Number(event.target.dataset.alternativeIndex);
      const activity = activities[index];
      const primary = { ...activity, alternatives: [] };
      const alternative = activity.alternatives[alternativeIndex];
      Object.assign(activity, { ...alternative, alternatives: activity.alternatives });
      activity.alternatives[alternativeIndex] = primary;
      persist(); renderTimeline(); updateCost(); showToast('已切换活动备用方案，原安排已保留为备用');
      return;
    }
    if (action === 'add-alternative') {
      selectedDay = dayIndex; addingActivityAlternative = true; openEditor(index); return;
    }
    if (action === 'edit') { selectedDay = dayIndex; return openEditor(index); }
    if (action === 'delete') { activities.splice(index, 1); persist(); renderTimeline(); updateCost(); showToast('安排已删除'); return; }
    if (action === 'up' && index > 0) [activities[index - 1], activities[index]] = [activities[index], activities[index - 1]];
    if (action === 'down' && index < activities.length - 1) [activities[index], activities[index + 1]] = [activities[index + 1], activities[index]];
    if (action === 'up' || action === 'down') { persist(); renderTimeline(); showToast('顺序已调整，后续时间自动顺延'); }
  }));
  daysBoard.querySelectorAll('[data-day-start]').forEach(input => input.addEventListener('change', event => {
    const dayIndex = Number(event.target.dataset.dayStart);
    trip.days[dayIndex].startTime = event.target.value || '09:00';
    persist(); renderTimeline(); showToast('开始时间已更新，全天行程自动顺延');
  }));
}
function updateCost() {
  const trip = currentTrip();
  const total = trip.days.reduce((sum, day) => sum + day.activities.reduce((daySum, item) => daySum + activityTotalForTrip(item, trip), 0), 0);
  $('#memberCount').textContent = `${trip.members} 人`;
  $('#memberHint').textContent = `${Math.max(1, trip.members - 2)} 位成人 · ${Math.min(2, trip.members)} 位儿童`;
  $('#totalCost').textContent = `¥ ${total.toLocaleString('zh-CN')}`;
  $('#perPerson').textContent = Math.round(total / trip.members).toLocaleString('zh-CN');
  renderMembers();
}
function renderTripHeader() {
  const trip = currentTrip();
  const range = dateRange(trip.startDate, trip.endDate);
  $('#tripName').textContent = tripDisplayName(trip);
  $('#tripNameCrumb').textContent = tripDisplayName(trip);
  const startLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(range.start);
  const endLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(`${trip.endDate}T00:00:00`));
  $('#tripMeta').innerHTML = `${startLabel} — ${endLabel} <span class="muted-separator">·</span> ${range.days}天${Math.max(0, range.days - 1)}晚 <span class="muted-separator">·</span> ${escapeHtml(trip.destination)}`;
  $('#sidebarTripName').textContent = tripDisplayName(trip);
  $('#sidebarTripFile').textContent = tripFileName(trip);
}
function renderApp() {
  const trip = currentTrip();
  selectedDay = Math.min(selectedDay, trip.days.length - 1);
  renderTripHeader(); renderTimeline(); updateCost();
}
function openEditor(index = -1) {
  editingIndex = index;
  const activity = index >= 0 ? currentTrip().days[selectedDay].activities[index] : { title: '', detail: '', emoji: '📍', category: '其他', cost: 0, costMode: 'total', duration: 60 };
  $('#dialogMode').textContent = addingActivityAlternative ? '新增活动备用方案' : (index >= 0 ? '编辑安排' : '新增安排');
  $('#dialogTitle').textContent = index >= 0 ? activity.title : '添加行程';
  $('#activityName').value = activity.title; $('#activityDetail').value = activity.detail;
  $('#activityEmoji').value = activity.emoji; $('#activityCategory').value = activity.category || '其他'; $('#activityCost').value = activity.cost; $('#activityCostMode').value = activity.costMode || 'total'; $('#activityDuration').value = activity.duration;
  $('#activityStartTime').value = index >= 0 && activity.timeLocked ? activity.time : newActivityTime || formatTime(index >= 0 ? activityStartTime(currentTrip().days[selectedDay], index) : activityStartTime(currentTrip().days[selectedDay], currentTrip().days[selectedDay].activities.length));
  syncActivityEndTime();
  dialog.showModal(); $('#activityName').focus();
}
['activityStartTime', 'activityDuration'].forEach(id => document.querySelector(`#${id}`).addEventListener('change', syncActivityEndTime));
document.querySelector('#activityEndTime').addEventListener('change', syncActivityDuration);
form.addEventListener('submit', event => {
  event.preventDefault();
  const duration = Number($('#activityDuration').value);
  if (!Number.isInteger(duration) || duration < 10 || duration > 720) return showToast('时长需为 10 - 720 分钟的整数');
  const startTime = $('#activityStartTime').value;
  const endTime = $('#activityEndTime').value;
  if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) return showToast('结束时间需晚于开始时间，暂不支持跨天安排');
  if (timeToMinutes(endTime) - timeToMinutes(startTime) !== duration) return showToast('请修改结束时间或时长，使两者保持一致');
  const activity = normalizeActivity({ title: $('#activityName').value.trim(), detail: $('#activityDetail').value.trim(), emoji: $('#activityEmoji').value.trim() || '📍', category: $('#activityCategory').value, cost: Number($('#activityCost').value) || 0, costMode: $('#activityCostMode').value, duration, time: startTime, timeLocked: Boolean(startTime) });
  if (!activity.title) return showToast('请填写安排名称');
  const day = currentTrip().days[selectedDay];
  const suggestedTime = formatTime(editingIndex >= 0 ? activityStartTime(day, editingIndex) : (newActivityTime ? timeToMinutes(newActivityTime) : activityStartTime(day, day.activities.length)));
  activity.timeLocked = addingActivityAlternative || startTime !== suggestedTime || Boolean(newActivityTime);
  if (addingActivityAlternative) {
    currentTrip().days[selectedDay].activities[editingIndex].alternatives.push(activity);
  } else if (editingIndex >= 0) currentTrip().days[selectedDay].activities[editingIndex] = { ...currentTrip().days[selectedDay].activities[editingIndex], ...activity };
  else {
    if (!activity.timeLocked) delete activity.time;
    currentTrip().days[selectedDay].activities.splice(insertingActivityIndex < 0 ? currentTrip().days[selectedDay].activities.length : insertingActivityIndex, 0, activity);
  }
  const wasAlternative = addingActivityAlternative;
  addingActivityAlternative = false; insertingActivityIndex = -1; newActivityTime = '';
  persist(); dialog.close(); renderTimeline(); updateCost(); showToast(wasAlternative ? '活动备用方案已添加' : (editingIndex >= 0 ? '安排已更新，后续时间自动顺延' : '安排已添加'));
});
function exportExcel() {
  const trip = currentTrip();
  const rows = trip.days.flatMap((day, dayIndex) => {
    let current = timeToMinutes(day.startTime);
    return day.activities.map((a, i) => {
      const time = formatTime(current);
      current += Number(a.duration);
      return `<tr><td>第${dayIndex + 1}天</td><td>${i + 1}</td><td>${time}</td><td>${escapeHtml(a.category)}</td><td>${a.costMode === 'perPerson' ? '按权重' : '总额'}</td><td>${escapeHtml(a.title)}</td><td>${escapeHtml(a.detail)}</td><td>${a.duration}</td><td>${activityTotalForTrip(a, trip)}</td></tr>`;
    });
  }).join('');
  const table = `<table border="1"><tr><th>日期</th><th>序号</th><th>时间</th><th>类别</th><th>计费方式</th><th>安排</th><th>说明</th><th>时长（分钟）</th><th>总费用（¥）</th></tr>${rows}</table>`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\ufeff<html><meta charset="utf-8">${table}</html>`], { type: 'application/vnd.ms-excel' }));
  link.download = `${trip.name}-行程.xls`; link.click(); URL.revokeObjectURL(link.href); showToast('Excel 行程表已下载');
}
function expenseTotal(trip) {
  return trip.days.reduce((total, day) => total + day.activities.reduce((sum, activity) => sum + activityTotalForTrip(activity, trip), 0), 0);
}
function downloadTripFile(fileData, trip) {
  const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = tripFileName(trip);
  link.click();
  URL.revokeObjectURL(link.href);
}
async function saveTripFile() {
  const trip = currentTrip();
  const fileData = tripFileData(trip);
  try {
    if (supportsFileHandles()) {
      let handle = await readTripHandle(trip.id);
      if (!handle || !(await canWriteHandle(handle))) {
        handle = await window.showSaveFilePicker({
          suggestedName: tripFileName(trip),
          types: [{ description: '行迹旅行文件', accept: { 'application/json': ['.trip.json', '.json'] } }]
        });
        await storeTripHandle(trip.id, handle);
      }
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(fileData, null, 2));
      await writable.close();
      showToast(`行程已保存到 ${handle.name}`);
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('保存行程文件失败', error);
    if (error.name === 'SecurityError' || error.name === 'NotSupportedError') {
      downloadTripFile(fileData, trip);
      showToast('当前环境不能写回原文件，已下载行程文件');
      return;
    }
    showToast(`无法保存到原文件：${error.message}`);
    return;
  }
  downloadTripFile(fileData, trip);
  showToast('当前浏览器不支持原文件保存，已下载行程文件');
}
async function importTripFile(file) {
  const parsed = JSON.parse(await file.text());
  const migration = migrateTripFile(parsed);
  const trip = migration.trip;
  state.trips.push(trip);
  state.activeTripId = trip.id;
  selectedDay = 0;
  persist();
  renderApp();
  return migration;
}
async function openTripFileWithHandle() {
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: '行迹旅行文件', accept: { 'application/json': ['.trip.json', '.json'] } }]
    });
    const migration = await importTripFile(await handle.getFile());
    await storeTripHandle(migration.trip.id, handle);
    showToast(migration.migratedFrom < CURRENT_SCHEMA_VERSION ? `行程文件已打开并从 v${migration.migratedFrom} 升级到 v${CURRENT_SCHEMA_VERSION}` : `行程文件已打开：${handle.name}`);
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('打开行程文件失败', error);
    showToast(`无法打开行程文件：${error.message}`);
  }
}
function openTripFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importTripFile(file)
    .then(migration => showToast(migration.migratedFrom < CURRENT_SCHEMA_VERSION ? `行程文件已打开并从 v${migration.migratedFrom} 升级到 v${CURRENT_SCHEMA_VERSION}` : '行程文件已打开'))
    .catch(error => showToast(`无法打开行程文件：${error.message}`))
    .finally(() => { event.target.value = ''; });
}
document.querySelector('#printPdf').addEventListener('click', () => window.print());
document.querySelector('#exportExcel').addEventListener('click', exportExcel);
document.querySelector('#saveTripFile').addEventListener('click', saveTripFile);
document.querySelector('#openTripFile').addEventListener('click', () => {
  if (supportsFileHandles()) openTripFileWithHandle();
  else document.querySelector('#tripFileInput').click();
});
document.querySelector('#tripFileInput').addEventListener('change', openTripFile);
document.querySelector('#addMember').addEventListener('click', () => {
  const trip = currentTrip();
  trip.familyMembers = [...(trip.familyMembers || []), normalizeMember({ id: `member-${Date.now()}`, name: `成员 ${trip.familyMembers.length + 1}`, role: '成人' }, trip.familyMembers.length)];
  trip.members = trip.familyMembers.length;
  persist();
  renderMembersEditor();
  renderMembers();
  updateCost();
  showToast(`已添加成员，费用已重算为 ${trip.members} 人`);
});
const membersDialog = document.querySelector('#membersDialog');
const membersForm = document.querySelector('#membersForm');
document.querySelector('#manageMembers').addEventListener('click', () => { renderMembersEditor(); membersDialog.showModal(); });
document.querySelector('#addMemberInDialog').addEventListener('click', () => {
  const trip = currentTrip();
  trip.familyMembers.push(normalizeMember({ id: `member-${Date.now()}`, name: `成员 ${trip.familyMembers.length + 1}`, role: '成人' }, trip.familyMembers.length));
  trip.members = trip.familyMembers.length;
  renderMembersEditor();
});
['closeMembersDialog', 'cancelMembersDialog'].forEach(id => document.querySelector(`#${id}`).addEventListener('click', () => membersDialog.close()));
membersForm.addEventListener('submit', event => {
  event.preventDefault();
  const rows = [...document.querySelectorAll('.member-editor-row')];
  const members = rows.map((row, index) => normalizeMember({
    ...currentTrip().familyMembers[index],
    name: row.querySelector('[data-member-name]').value.trim(),
    age: row.querySelector('[data-member-age]').value,
    weights: {
      transport: row.querySelector('[data-weight="transport"]').value,
      ticket: row.querySelector('[data-weight="ticket"]').value,
      dining: row.querySelector('[data-weight="dining"]').value
    }
  }, index));
  if (members.some(member => !member.name)) return showToast('请填写每位成员的姓名');
  currentTrip().familyMembers = members;
  currentTrip().members = members.length;
  persist();
  membersDialog.close();
  renderApp();
  showToast('成员与优惠权重已保存，费用已重算');
});
document.querySelector('#newTripButton').addEventListener('click', () => {
  const today = new Date();
  const iso = date => date.toISOString().slice(0, 10);
  $('#newTripStart').value = iso(today);
  $('#newTripEnd').value = iso(new Date(today.getTime() + 4 * 86400000));
  $('#newTripMembers').value = currentTrip().members;
  tripDialog.showModal(); $('#newTripName').focus();
});
document.querySelector('#editTripButton').addEventListener('click', openEditTripDialog);
['editTripStart', 'editTripEnd'].forEach(id => document.querySelector(`#${id}`).addEventListener('change', updateEditTripDaysHint));
['closeTripDialog', 'cancelTripDialog'].forEach(id => document.querySelector(`#${id}`).addEventListener('click', () => tripDialog.close()));
['closeEditTripDialog', 'cancelEditTripDialog'].forEach(id => document.querySelector(`#${id}`).addEventListener('click', () => editTripDialog.close()));
['closeActivityDialog', 'cancelActivityDialog'].forEach(id => document.querySelector(`#${id}`).addEventListener('click', () => { addingActivityAlternative = false; dialog.close(); }));
['closePlanDialog', 'cancelPlanDialog'].forEach(id => document.querySelector(`#${id}`).addEventListener('click', () => { addingDayAlternativeIndex = -1; planDialog.close(); }));
planForm.addEventListener('submit', event => {
  event.preventDefault();
  const dayIndex = addingDayAlternativeIndex;
  const name = $('#planName').value.trim();
  if (dayIndex < 0 || !name) return showToast('请填写备用方案名称');
  const day = currentTrip().days[dayIndex];
  day.alternatives.push(normalizeDayAlternative({ name, activities: day.activities.map(activity => ({ ...activity, alternatives: [] })) }));
  addingDayAlternativeIndex = -1;
  persist(); planDialog.close(); renderTimeline(); showToast('整日备用方案已添加');
});
tripForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#newTripName').value.trim();
  const destination = $('#newTripDestination').value.trim();
  const startDate = $('#newTripStart').value;
  const endDate = $('#newTripEnd').value;
  const members = Number($('#newTripMembers').value);
  if (!destination || !startDate || !endDate || !Number.isInteger(members) || members < 1 || members > 30) return showToast('请填写目的地、日期和同行人数');
  const range = dateRange(startDate, endDate);
  if (range.days < 1 || range.days > 31) return showToast('旅行时长需为 1 到 31 天');
  const days = Array.from({ length: range.days }, (_, index) => ({ title: index === 0 ? `抵达 · ${destination}` : `第 ${index + 1} 天`, startTime: '09:00', activities: [] }));
  const trip = normalizeTrip({ id: `trip-${Date.now()}`, name, destination, startDate, endDate, members, days });
  state.trips.push(trip); state.activeTripId = trip.id; selectedDay = 0; persist(); tripDialog.close(); renderApp(); showToast('新行程已创建');
});
editTripForm.addEventListener('submit', event => {
  event.preventDefault();
  const trip = currentTrip();
  const name = $('#editTripName').value.trim();
  const startDate = $('#editTripStart').value;
  const endDate = $('#editTripEnd').value;
  const range = dateRange(startDate, endDate);
  if (!startDate || !endDate || range.days < 1 || range.days > 31) return showToast('日期范围需为 1 到 31 天');
  const removedDays = trip.days.slice(range.days);
  const hasContent = removedDays.some(day => day.activities.length || day.alternatives.length);
  if (hasContent && !$('#editTripConfirmRemove').checked) return showToast('请确认是否删除缩短天数后的超出安排');
  const previousDays = trip.days;
  trip.name = name;
  trip.startDate = startDate;
  trip.endDate = endDate;
  trip.days = Array.from({ length: range.days }, (_, index) => previousDays[index] || ({ title: index === 0 ? `抵达 · ${trip.destination}` : `第 ${index + 1} 天`, startTime: '09:00', activities: [], alternatives: [] }));
  trip.days.forEach((day, index) => { if (!day.title || /^第 \d+ 天$/.test(day.title)) day.title = index === 0 ? `抵达 · ${trip.destination}` : `第 ${index + 1} 天`; });
  selectedDay = Math.min(selectedDay, trip.days.length - 1);
  persist();
  editTripDialog.close();
  renderApp();
  showToast('行程名称和天数已更新');
});
state.trips = state.trips.map(normalizeTrip);
persist();
tripDialog.addEventListener('cancel', event => { event.preventDefault(); tripDialog.close(); });
dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
membersDialog.addEventListener('cancel', event => { event.preventDefault(); membersDialog.close(); });
planDialog.addEventListener('cancel', event => { event.preventDefault(); addingDayAlternativeIndex = -1; planDialog.close(); });
editTripDialog.addEventListener('cancel', event => { event.preventDefault(); editTripDialog.close(); });
renderApp();
