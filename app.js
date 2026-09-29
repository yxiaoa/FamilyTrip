const seedDays = [
  {
    title: '抵达京都 · 古都初见',
    startTime: '09:30',
    activities: [
      { time: '09:30', title: '抵达关西机场', detail: '机场接送 · 约 1小时20分', cost: 620, duration: 80 },
      { time: '11:10', title: '前往京都站', detail: '包车 · 约 1小时20分', cost: 360, duration: 80 },
      { time: '12:40', title: '午餐 · 京都拉面小路', detail: '京都站 10F · 预计 1小时', cost: 480, duration: 60 },
      { time: '14:00', title: '入住 · 四季京都酒店', detail: '东山区 · 2间家庭房', cost: 8900, duration: 30 },
      { time: '15:00', title: '清水寺与二年坂', detail: '步行游览 · 约 2小时', cost: 1600, duration: 120 }
    ]
  },
  ...['岚山竹林 · 渡月桥', '伏见稻荷 · 宇治抹茶', '奈良一日 · 与鹿相遇', '返程 · 带着春色回家'].map(title => ({ title, startTime: '09:00', activities: [] }))
];
const stateKey = 'familyTripPlanner';
const CURRENT_SCHEMA_VERSION = 7;
const builtInCategories = ['交通费', '机票', '住宿费', '餐饮费', '门票', '其他'];
const supportedCurrencies = ['CNY', 'JPY', 'USD', 'HKD', 'EUR'];
const defaultExchangeRates = { CNY: 1, JPY: 0.05, USD: 7.2, HKD: 0.92, EUR: 7.8 };
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
const currencyDialog = document.querySelector('#currencyDialog');
const currencyForm = document.querySelector('#currencyForm');
const categoryDialog = document.querySelector('#categoryDialog');
const categoryForm = document.querySelector('#categoryForm');
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
        baseCurrency: 'CNY',
        exchangeRates: trip.exchangeRates,
        displayCurrency: trip.displayCurrency
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
  if (sourceVersion < 4) {
    trip.exchangeRates = trip.exchangeRates || defaultExchangeRates;
    trip.displayCurrency = trip.displayCurrency || 'CNY';
  }
  if (sourceVersion < 6) trip.customCategories = [];
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
  const exchangeRates = Object.fromEntries(supportedCurrencies.map(currency => [currency, currency === 'CNY' ? 1 : Math.max(0.0001, Number(trip.exchangeRates?.[currency]) || defaultExchangeRates[currency])]));
  const displayCurrency = supportedCurrencies.includes(trip.displayCurrency) ? trip.displayCurrency : 'CNY';
  const todos = Array.isArray(trip.todos) ? trip.todos.map((todo, index) => normalizeTodo(todo, index)) : defaultTodos();
  const customCategories = [...new Set((Array.isArray(trip.customCategories) ? trip.customCategories : []).map(category => String(category).trim()).filter(category => category && !builtInCategories.includes(category)))].slice(0, 30);
  return { ...trip, members: familyMembers.length, familyMembers, exchangeRates, displayCurrency, todos, customCategories, days: days.map((day, index) => ({ ...day, startTime: day.startTime || (index === 0 ? '09:30' : '09:00'), activities: Array.isArray(day.activities) ? day.activities.map(normalizeActivity) : [], alternatives: Array.isArray(day.alternatives) ? day.alternatives.map(normalizeDayAlternative) : [] })) };
}
function defaultTodos() {
  return [
    '行程单、注意事项记录、任务卡', '请假', '预订车票 / 机票（确认行李额）',
    '确认手提与托运行李限额', '预订住宿', '准备采购旅行用品',
    '出国准备：签证、换外币、购买保险', '安装地图、交通、翻译 App',
    '预订门票', '安排接送站 / 机场', '行前检查：水电气、证件、停车',
    '记账并补充完整行程', '出国准备：了解退税', '记录费用，整理纪念品与照片'
  ].map((text, index) => normalizeTodo({ text }, index));
}
function normalizeTodo(todo, index) {
  return { id: todo.id || `todo-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, text: String(todo.text || '').trim(), completed: todo.completed === true };
}
function normalizeMember(member, index) {
  const age = member.age === null || member.age === '' ? null : Number(member.age);
  const role = age !== null ? (age < 12 ? '儿童' : age >= 60 ? '老人' : '成人') : (member.role || '成人');
  const defaults = role === '儿童' ? 0.5 : role === '老人' ? 0.8 : 1;
  return { id: member.id || `member-${index + 1}`, name: member.name || `成员 ${index + 1}`, role, age, weights: { transport: Number(member.weights?.transport ?? defaults), ticket: Number(member.weights?.ticket ?? defaults), dining: Number(member.weights?.dining ?? defaults) } };
}
function normalizeActivity(activity) {
  const alternatives = Array.isArray(activity.alternatives) ? activity.alternatives.map(item => normalizeActivity({ ...item, alternatives: [] })) : [];
  const type = ['accommodation', 'transport'].includes(activity.type) ? activity.type : 'activity';
  const normalized = { ...activity, type, fromLocation: String(activity.fromLocation || ''), toLocation: String(activity.toLocation || ''), duration: type === 'accommodation' ? 0 : Number(activity.duration) || 60, category: activity.category || '其他', costMode: activity.costMode === 'perPerson' ? 'perPerson' : 'total', cost: Math.max(0, Number(activity.cost) || 0), currency: supportedCurrencies.includes(activity.currency) ? activity.currency : 'CNY', timeLocked: type !== 'accommodation' && activity.timeLocked === true, completed: activity.completed === true, alternatives };
  if (type === 'accommodation') delete normalized.time;
  return normalized;
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
function convertFromCny(amount, currency, trip) {
  return amount / trip.exchangeRates[currency];
}
function activityTotalCny(activity, trip) {
  return activityTotalForTrip(activity, trip) * trip.exchangeRates[activity.currency];
}
function formatCurrency(amount, currency) {
  const digits = currency === 'JPY' ? 0 : 2;
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}
function renderCategoryOptions(selectedCategory = '') {
  const categories = [...builtInCategories, ...currentTrip().customCategories];
  $('#activityCategory').innerHTML = categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  if (categories.includes(selectedCategory)) $('#activityCategory').value = selectedCategory;
}
function renderCategoryList() {
  const trip = currentTrip();
  $('#categoryList').innerHTML = trip.customCategories.length
    ? trip.customCategories.map((category, index) => `<div class="category-row"><span>${escapeHtml(category)}</span><button type="button" class="link-button" data-remove-category="${index}">删除</button></div>`).join('')
    : '<p class="category-empty">暂无自定义类别</p>';
  $('#categoryList').querySelectorAll('[data-remove-category]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.removeCategory);
    const category = trip.customCategories[index];
    const activityUsesCategory = activity => activity.category === category
      || activity.alternatives?.some(alternative => activityUsesCategory(alternative));
    const inUse = trip.days.some(day => day.activities.some(activityUsesCategory)
      || day.alternatives.some(option => option.activities.some(activityUsesCategory)));
    if (inUse) return showToast(`“${category}”已被安排使用，暂不能删除`);
    trip.customCategories.splice(index, 1);
    persist();
    renderCategoryList();
    renderCategoryOptions($('#activityCategory').value);
  }));
}
function openCategoryDialog() {
  renderCategoryList();
  categoryDialog.showModal();
  $('#newCategoryName').focus();
}
function renderMembers() {
  const trip = currentTrip();
  const colors = ['orange', 'blue-bg', 'yellow', 'pink'];
  $('#memberList').innerHTML = trip.familyMembers.map((member, index) => `<div class="member-row"><span class="member-avatar ${colors[index % colors.length]}">${escapeHtml(member.name.slice(0, 1))}</span><div><strong>${escapeHtml(member.name)}</strong><small>${member.role}${member.age !== null ? ` · ${member.age}岁` : ''}</small></div><span class="check">✓</span></div>`).join('');
}
function renderTodos() {
  const todos = currentTrip().todos;
  const completed = todos.filter(todo => todo.completed).length;
  $('#todoProgress').textContent = `${completed} / ${todos.length} 已完成`;
  $('#todoList').innerHTML = todos.map(todo => `<li class="todo-item${todo.completed ? ' is-complete' : ''}" data-todo-id="${escapeHtml(todo.id)}"><label class="todo-check"><input type="checkbox" data-todo-complete ${todo.completed ? 'checked' : ''} aria-label="标记完成：${escapeHtml(todo.text)}"><span>${escapeHtml(todo.text)}</span></label><div class="todo-actions"><button type="button" data-todo-edit title="编辑待办" aria-label="编辑待办">✎</button><button type="button" data-todo-delete title="删除待办" aria-label="删除待办">×</button></div></li>`).join('');
}
function handleTodoListChange(event) {
  const checkbox = event.target.closest('[data-todo-complete]');
  if (!checkbox) return;
  const todo = currentTrip().todos.find(item => item.id === checkbox.closest('[data-todo-id]').dataset.todoId);
  if (!todo) return;
  todo.completed = checkbox.checked;
  persist();
  renderTodos();
}
function handleTodoListClick(event) {
  const row = event.target.closest('[data-todo-id]');
  if (!row) return;
  const trip = currentTrip();
  const index = trip.todos.findIndex(todo => todo.id === row.dataset.todoId);
  if (index < 0) return;
  if (event.target.closest('[data-todo-delete]')) {
    trip.todos.splice(index, 1);
    persist();
    renderTodos();
    return;
  }
  if (!event.target.closest('[data-todo-edit]')) return;
  const todo = trip.todos[index];
  const label = row.querySelector('.todo-check');
  label.innerHTML = `<input class="todo-edit-input" maxlength="80" value="${escapeHtml(todo.text)}" aria-label="编辑待办内容">`;
  const actions = row.querySelector('.todo-actions');
  actions.innerHTML = '<button type="button" data-todo-save title="保存" aria-label="保存">✓</button><button type="button" data-todo-cancel title="取消" aria-label="取消">×</button>';
  const input = row.querySelector('.todo-edit-input');
  input.focus();
  input.select();
}
function handleTodoListEdit(event) {
  const row = event.target.closest('[data-todo-id]');
  if (!row) return;
  if (event.target.closest('[data-todo-cancel]')) return renderTodos();
  if (!event.target.closest('[data-todo-save]')) return;
  const text = row.querySelector('.todo-edit-input').value.trim();
  if (!text) return showToast('待办内容不能为空');
  const todo = currentTrip().todos.find(item => item.id === row.dataset.todoId);
  if (todo) todo.text = text;
  persist();
  renderTodos();
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
    if (item.type === 'accommodation') continue;
    if (item.timeLocked && item.time) current = Math.max(current, timeToMinutes(item.time));
    current += Number(item.duration);
  }
  const activity = day.activities[index];
  if (activity?.type === 'accommodation') return current;
  return activity?.timeLocked && activity.time ? Math.max(current, timeToMinutes(activity.time)) : current;
}
function gapHtml(dayIndex, insertIndex, start, end) {
  const duration = end - start;
  if (duration < 10) return '';
  return `<div class="schedule-gap"><span>无行程 · ${Math.floor(duration / 60)}小时${duration % 60 ? `${duration % 60}分钟` : ''}</span><button class="gap-add" data-action="insert-activity" data-day="${dayIndex}" data-insert-index="${insertIndex}" data-insert-time="${formatTime(start)}">＋ 插入安排</button></div>`;
}
function updateTripProgress() {
  const trip = currentTrip();
  const activities = trip.days.flatMap(day => day.activities);
  const completed = activities.filter(activity => activity.completed).length;
  const percentage = activities.length ? Math.round(completed / activities.length * 100) : 0;
  $('#tripProgress').textContent = `${percentage}%`;
  $('#tripProgressBar').style.width = `${percentage}%`;
  $('#tripProgressBar').parentElement.setAttribute('aria-valuenow', percentage);
  $('#tripProgressCount').textContent = `${completed} / ${activities.length} 项安排已完成`;
  const planningEnd = 21 * 60;
  let availableMinutes = 0;
  let plannedMinutes = 0;
  trip.days.forEach(day => {
    const dayStart = timeToMinutes(day.startTime);
    availableMinutes += Math.max(0, planningEnd - dayStart);
    day.activities.forEach((activity, index) => {
      const activityStart = activityStartTime(day, index);
      const activityEnd = activityStart + Math.max(0, Number(activity.duration) || 0);
      plannedMinutes += Math.max(0, Math.min(activityEnd, planningEnd) - Math.max(activityStart, dayStart));
    });
  });
  const planPercentage = availableMinutes ? Math.min(100, Math.round(plannedMinutes / availableMinutes * 100)) : 0;
  const formatHours = minutes => (minutes / 60).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  $('#tripPlanProgress').textContent = `${planPercentage}%`;
  $('#tripPlanProgressBar').style.width = `${planPercentage}%`;
  $('#tripPlanProgressBar').parentElement.setAttribute('aria-valuenow', planPercentage);
  $('#tripPlanProgressCount').textContent = `${formatHours(plannedMinutes)} / ${formatHours(availableMinutes)} 小时已安排`;
}
function renderTimeline() {
  const trip = currentTrip();
  const range = dateRange(trip.startDate, trip.endDate);
  daysBoard.innerHTML = trip.days.map((day, dayIndex) => {
    const activities = day.activities;
    let previousEnd = timeToMinutes(day.startTime);
    const activityHtml = activities.length ? activities.map((activity, index) => {
      const start = activityStartTime(day, index);
      const isAccommodation = activity.type === 'accommodation';
      const isTransport = activity.type === 'transport';
      const gap = isAccommodation ? '' : gapHtml(dayIndex, index, previousEnd, start);
      if (!isAccommodation) previousEnd = start + Number(activity.duration);
      const alternativeButtons = activity.alternatives.map((alternative, alternativeIndex) => `<button class="alternative-chip" data-action="select-activity-alternative" data-alternative-index="${alternativeIndex}">备选：${escapeHtml(alternative.title)}</button>`).join('');
      const typeLabel = isAccommodation ? '住宿' : isTransport ? '交通' : '';
      const routeHtml = isTransport ? `<div class="activity-route"><span>${escapeHtml(activity.fromLocation || '出发地点')}</span><b aria-label="前往">→</b><span>${escapeHtml(activity.toLocation || '到达地点')}</span></div>` : '';
      const timeHtml = isAccommodation ? '<span>住宿</span>' : `<span>${formatTime(start)}</span><small>${activity.duration}分钟</small>`;
      return `${gap}<div class="activity${isAccommodation ? ' activity-accommodation' : ''}${isTransport ? ' activity-transport' : ''}"><div class="time">${timeHtml}</div><span class="activity-dot"></span>
        <div class="activity-card${activity.completed ? ' is-complete' : ''}${isAccommodation ? ' is-accommodation' : ''}${isTransport ? ' is-transport' : ''}" draggable="true" data-day="${dayIndex}" data-index="${index}" aria-label="拖动安排：${escapeHtml(activity.title)}"><div class="activity-main"><div>${typeLabel ? `<span class="activity-type-label">${typeLabel}</span>` : ''}<h4>${escapeHtml(activity.title)}</h4>${routeHtml}${activity.detail ? `<p>${escapeHtml(activity.detail)}</p>` : ''}</div></div>
          <div class="activity-meta"><strong>${escapeHtml(activity.category)} ${formatCurrency(activityTotalForTrip(activity, trip), activity.currency)}</strong></div>
        <details class="activity-menu"><summary aria-label="更多操作" title="更多操作">⋮</summary><div class="activity-menu-items"><button data-action="toggle-complete" aria-pressed="${activity.completed}">${activity.completed ? '取消完成' : '标记完成'}</button><button data-action="up">上移</button><button data-action="down">下移</button><button data-action="edit">编辑</button><button data-action="add-alternative">添加备用安排</button><button data-action="delete">删除</button></div></details>
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
  updateTripProgress();
  daysBoard.querySelectorAll('.activity-card, .day-plan-actions [data-action], .schedule-gap [data-action], .day-add-button').forEach(card => card.addEventListener('click', event => {
    const actionElement = event.target.closest('[data-action]');
    const action = actionElement?.dataset.action;
    if (!action) return;
    card.querySelector('.activity-menu')?.removeAttribute('open');
    const dayIndex = Number(card.dataset.day);
    const index = Number(card.dataset.index);
    const activities = trip.days[dayIndex].activities;
    if (action === 'toggle-complete') {
      activities[index].completed = !activities[index].completed;
      persist(); renderTimeline(); return;
    }
    if (action === 'add-day-activity') {
      selectedDay = dayIndex; insertingActivityIndex = activities.length; newActivityTime = ''; openEditor(); return;
    }
    if (action === 'insert-activity') {
      selectedDay = dayIndex; insertingActivityIndex = Number(actionElement.dataset.insertIndex); newActivityTime = actionElement.dataset.insertTime; openEditor(); return;
    }
    if (action === 'select-day-alternative') {
      const alternativeIndex = Number(actionElement.dataset.alternativeIndex);
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
      const alternativeIndex = Number(actionElement.dataset.alternativeIndex);
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
  let draggedActivity = null;
  daysBoard.querySelectorAll('.activity-card').forEach(card => {
    card.addEventListener('dragstart', event => {
      draggedActivity = { dayIndex: Number(card.dataset.day), activityIndex: Number(card.dataset.index) };
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'activity');
    });
    card.addEventListener('dragend', () => {
      draggedActivity = null;
      card.classList.remove('is-dragging');
      daysBoard.querySelectorAll('.is-drag-over').forEach(target => target.classList.remove('is-drag-over'));
    });
    card.addEventListener('dragover', event => {
      if (!draggedActivity) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      card.classList.add('is-drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('is-drag-over'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      card.classList.remove('is-drag-over');
      if (!draggedActivity) return;
      const targetDayIndex = Number(card.dataset.day);
      const targetIndex = Number(card.dataset.index);
      moveActivity(draggedActivity.dayIndex, draggedActivity.activityIndex, targetDayIndex, targetIndex);
      draggedActivity = null;
    });
  });
  daysBoard.querySelectorAll('.day-column').forEach(column => {
    column.addEventListener('dragover', event => {
      if (!draggedActivity) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      column.classList.add('is-drag-over');
    });
    column.addEventListener('dragleave', event => {
      if (!column.contains(event.relatedTarget)) column.classList.remove('is-drag-over');
    });
    column.addEventListener('drop', event => {
      event.preventDefault();
      column.classList.remove('is-drag-over');
      if (!draggedActivity) return;
      moveActivity(draggedActivity.dayIndex, draggedActivity.activityIndex, Number(column.dataset.day), trip.days[Number(column.dataset.day)].activities.length);
      draggedActivity = null;
    });
  });
  daysBoard.querySelectorAll('[data-day-start]').forEach(input => input.addEventListener('change', event => {
    const dayIndex = Number(event.target.dataset.dayStart);
    trip.days[dayIndex].startTime = event.target.value || '09:00';
    persist(); renderTimeline(); showToast('开始时间已更新，全天行程自动顺延');
  }));
}
function moveActivity(sourceDayIndex, sourceIndex, targetDayIndex, targetIndex) {
  const trip = currentTrip();
  const sourceActivities = trip.days[sourceDayIndex]?.activities;
  const targetActivities = trip.days[targetDayIndex]?.activities;
  if (!sourceActivities || !targetActivities || !sourceActivities[sourceIndex]) return;
  if (sourceDayIndex === targetDayIndex && (targetIndex === sourceIndex || targetIndex === sourceIndex + 1)) return;
  const [activity] = sourceActivities.splice(sourceIndex, 1);
  activity.timeLocked = false;
  delete activity.time;
  const adjustedIndex = sourceDayIndex === targetDayIndex && targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
  targetActivities.splice(Math.max(0, Math.min(adjustedIndex, targetActivities.length)), 0, activity);
  persist();
  renderTimeline();
  updateCost();
  showToast(sourceDayIndex === targetDayIndex ? '安排顺序已调整，后续时间自动顺延' : '安排已移动到其他天，时间已自动顺延');
}
function updateCost() {
  const trip = currentTrip();
  const total = expenseTotal(trip);
  const displayCurrency = trip.displayCurrency;
  const displayedTotal = convertFromCny(total, displayCurrency, trip);
  $('#memberCount').textContent = `${trip.members} 人`;
  $('#memberHint').textContent = `${Math.max(1, trip.members - 2)} 位成人 · ${Math.min(2, trip.members)} 位儿童`;
  $('#totalCost').textContent = formatCurrency(displayedTotal, displayCurrency);
  $('#perPerson').textContent = formatCurrency(displayedTotal / trip.members, displayCurrency);
  $('#displayCurrency').value = displayCurrency;
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
  $('#tripFileName').textContent = tripDisplayName(trip);
  $('#tripFilePath').textContent = tripFileName(trip);
}
function renderApp() {
  const trip = currentTrip();
  selectedDay = Math.min(selectedDay, trip.days.length - 1);
  renderTripHeader(); renderTimeline(); renderTodos(); updateCost();
}
function setActivityCostMode(mode) {
  $('#activityCostMode').value = mode;
  $('#costModeSwitch').querySelectorAll('[data-cost-mode]').forEach(button => {
    const selected = button.dataset.costMode === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
function syncActivityTypeFields() {
  const type = $('#activityType').value;
  const isAccommodation = type === 'accommodation';
  const isTransport = type === 'transport';
  $('#activityTimeFields').hidden = isAccommodation;
  $('#transportLocationFields').hidden = !isTransport;
  $('#activityStartTime').required = !isAccommodation;
  $('#activityEndTime').required = !isAccommodation;
  $('#transportFrom').required = isTransport;
  $('#transportTo').required = isTransport;
  if (!isAccommodation && Number($('#activityDuration').value) < 10) $('#activityDuration').value = 60;
  if (!isAccommodation) syncActivityEndTime();
}
function openEditor(index = -1) {
  editingIndex = index;
  const activity = index >= 0 ? currentTrip().days[selectedDay].activities[index] : { type: 'activity', title: '', detail: '', category: '其他', cost: 0, costMode: 'total', duration: 60 };
  $('#dialogMode').textContent = addingActivityAlternative ? '新增活动备用方案' : (index >= 0 ? '编辑安排' : '新增安排');
  $('#dialogTitle').textContent = index >= 0 ? activity.title : '添加行程';
  $('#activityName').value = activity.title; $('#activityDetail').value = activity.detail;
  $('#activityType').value = activity.type || 'activity';
  $('#transportFrom').value = activity.fromLocation || '';
  $('#transportTo').value = activity.toLocation || '';
  renderCategoryOptions(activity.category || '其他'); $('#activityCost').value = activity.cost; $('#activityCurrency').value = activity.currency || 'CNY'; setActivityCostMode(activity.costMode || 'total'); $('#activityDuration').value = activity.duration;
  const day = currentTrip().days[selectedDay];
  $('#activityStartTime').value = index >= 0 && activity.timeLocked ? activity.time : newActivityTime || formatTime(activityStartTime(day, index >= 0 ? index : day.activities.length));
  syncActivityTypeFields();
  syncActivityEndTime();
  dialog.showModal(); $('#activityName').focus();
}
function openCurrencyDialog() {
  const trip = currentTrip();
  supportedCurrencies.filter(currency => currency !== 'CNY').forEach(currency => {
    $(`#rate${currency}`).value = trip.exchangeRates[currency];
  });
  currencyDialog.showModal();
  $('#rateJPY').focus();
}
['activityStartTime', 'activityDuration'].forEach(id => document.querySelector(`#${id}`).addEventListener('change', syncActivityEndTime));
document.querySelector('#activityEndTime').addEventListener('change', syncActivityDuration);
$('#activityType').addEventListener('change', syncActivityTypeFields);
$('#costModeSwitch').addEventListener('click', event => {
  const button = event.target.closest('[data-cost-mode]');
  if (button) setActivityCostMode(button.dataset.costMode);
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const type = $('#activityType').value;
  const isAccommodation = type === 'accommodation';
  const duration = isAccommodation ? 0 : Number($('#activityDuration').value);
  if (!isAccommodation && (!Number.isInteger(duration) || duration < 10 || duration > 720)) return showToast('时长需为 10 - 720 分钟的整数');
  const startTime = isAccommodation ? '' : $('#activityStartTime').value;
  const endTime = $('#activityEndTime').value;
  if (!isAccommodation && (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime))) return showToast('结束时间需晚于开始时间，暂不支持跨天安排');
  if (!isAccommodation && timeToMinutes(endTime) - timeToMinutes(startTime) !== duration) return showToast('请修改结束时间或时长，使两者保持一致');
  const fromLocation = $('#transportFrom').value.trim();
  const toLocation = $('#transportTo').value.trim();
  if (type === 'transport' && (!fromLocation || !toLocation)) return showToast('请填写交通行程的出发地点和到达地点');
  const activity = normalizeActivity({ type, fromLocation, toLocation, title: $('#activityName').value.trim(), detail: $('#activityDetail').value.trim(), category: $('#activityCategory').value, cost: Number($('#activityCost').value) || 0, currency: $('#activityCurrency').value, costMode: $('#activityCostMode').value, duration, time: startTime, timeLocked: Boolean(startTime) });
  if (!activity.title) return showToast('请填写安排名称');
  const day = currentTrip().days[selectedDay];
  const suggestedTime = isAccommodation ? '' : formatTime(editingIndex >= 0 ? activityStartTime(day, editingIndex) : (newActivityTime ? timeToMinutes(newActivityTime) : activityStartTime(day, day.activities.length)));
  activity.timeLocked = !isAccommodation && (addingActivityAlternative || startTime !== suggestedTime || Boolean(newActivityTime));
  if (addingActivityAlternative) {
    currentTrip().days[selectedDay].activities[editingIndex].alternatives.push(activity);
  } else if (editingIndex >= 0) {
    const updatedActivity = { ...currentTrip().days[selectedDay].activities[editingIndex], ...activity };
    if (isAccommodation) delete updatedActivity.time;
    currentTrip().days[selectedDay].activities[editingIndex] = updatedActivity;
  }
  else {
    if (!activity.timeLocked) delete activity.time;
    currentTrip().days[selectedDay].activities.splice(insertingActivityIndex < 0 ? currentTrip().days[selectedDay].activities.length : insertingActivityIndex, 0, activity);
  }
  const wasAlternative = addingActivityAlternative;
  addingActivityAlternative = false; insertingActivityIndex = -1; newActivityTime = '';
  persist(); dialog.close(); renderTimeline(); updateCost(); showToast(wasAlternative ? '活动备用方案已添加' : (editingIndex >= 0 ? '安排已更新，后续时间自动顺延' : '安排已添加'));
});
function xmlEscape(value) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}
function zipStore(files) {
  const encoder = new TextEncoder();
  const crc32 = bytes => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunks = [];
  const directory = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true); local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length);
    chunks.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, crc, true); centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true); centralView.setUint32(42, offset, true); central.set(nameBytes, 46);
    directory.push(central);
    offset += local.length;
  }
  const directoryOffset = offset;
  const directorySize = directory.reduce((size, entry) => size + entry.length, 0);
  chunks.push(...directory);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, directory.length, true); endView.setUint16(10, directory.length, true);
  endView.setUint32(12, directorySize, true); endView.setUint32(16, directoryOffset, true);
  chunks.push(end);
  return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function createItineraryWorkbook(rows, dayRanges) {
  const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const cellXml = (value, column, rowNumber) => {
    const reference = `${column}${rowNumber}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}" s="${column === 'F' || column === 'G' || column === 'H' ? 3 : 2}"><v>${value}</v></c>`;
    return `<c r="${reference}" s="${rowNumber === 1 ? 1 : 2}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  };
  const header = ['日期', '星期', '时间', '目的地/活动', '项目', '单价', '人数', '费用'];
  const sheetRows = [header, ...rows].map((values, index) => {
    const rowNumber = index + 1;
    return `<row r="${rowNumber}">${values.map((value, columnIndex) => cellXml(value, columns[columnIndex], rowNumber)).join('')}</row>`;
  }).join('');
  const merges = dayRanges.filter(range => range.end > range.start)
    .flatMap(range => [`<mergeCell ref="A${range.start}:A${range.end}"/>`, `<mergeCell ref="B${range.start}:B${range.end}"/>`]);
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="行程表" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="11"/><name val="等线"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="等线"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="dotted"><color rgb="FF777777"/></left><right style="dotted"><color rgb="FF777777"/></right><top style="dotted"><color rgb="FF777777"/></top><bottom style="dotted"><color rgb="FF777777"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="2" width="8" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="42" customWidth="1"/><col min="5" max="5" width="12" customWidth="1"/><col min="6" max="8" width="12" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:H${rows.length + 1}"/>${merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : ''}</worksheet>`
  };
  return zipStore(files);
}
function exportExcel() {
  const trip = currentTrip();
  const rows = [];
  const dayRanges = [];
  const startDate = new Date(`${trip.startDate}T00:00:00Z`);
  const projectNames = { '交通费': '车票', '机票': '机票', '住宿费': '住宿', '餐饮费': '餐饮', '门票': '门票' };
  trip.days.forEach((day, dayIndex) => {
    if (!day.activities.length) return;
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + dayIndex);
    const dateLabel = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    const weekday = date.getUTCDay() || 7;
    const firstRow = rows.length + 2;
    day.activities.forEach((activity, index) => {
      const isAccommodation = activity.type === 'accommodation';
      const start = isAccommodation ? '' : formatTime(activityStartTime(day, index));
      const end = isAccommodation ? '' : endTimeFor(start, activity.duration);
      const expenseType = expenseCategory(activity.category);
      const people = activity.costMode === 'perPerson'
        ? (expenseType ? trip.familyMembers.reduce((sum, member) => sum + member.weights[expenseType], 0) : trip.members)
        : 1;
      rows.push([
        dateLabel, weekday, isAccommodation ? '住宿（不限时）' : `${start}-${end}`,
        [activity.title, activity.type === 'transport' ? `${activity.fromLocation} → ${activity.toLocation}` : '', activity.detail].filter(Boolean).join(' · '),
        projectNames[activity.category] || activity.category,
        Number(activity.cost || 0), people, activityTotalForTrip(activity, trip)
      ]);
    });
    dayRanges.push({ start: firstRow, end: rows.length + 1 });
  });
  const blob = createItineraryWorkbook(rows, dayRanges);
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${safeFilePart(trip.name) || '行程'}-行程.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Excel 行程表已下载');
}
function expenseTotal(trip) {
  return trip.days.reduce((total, day) => total + day.activities.reduce((sum, activity) => sum + activityTotalCny(activity, trip), 0), 0);
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
$('#todoForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#newTodoText');
  const text = input.value.trim();
  if (!text) return;
  currentTrip().todos.push(normalizeTodo({ text }, currentTrip().todos.length));
  persist();
  renderTodos();
  input.value = '';
  input.focus();
});
$('#todoList').addEventListener('change', handleTodoListChange);
$('#todoList').addEventListener('click', event => {
  if (event.target.closest('[data-todo-save], [data-todo-cancel]')) handleTodoListEdit(event);
  else handleTodoListClick(event);
});
$('#todoList').addEventListener('keydown', event => {
  if (!event.target.matches('.todo-edit-input')) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    handleTodoListEdit({ target: event.target.closest('[data-todo-id]').querySelector('[data-todo-save]') });
  } else if (event.key === 'Escape') {
    renderTodos();
  }
});
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
$('#displayCurrency').addEventListener('change', event => {
  currentTrip().displayCurrency = event.target.value;
  persist();
  updateCost();
});
$('#currencySettings').addEventListener('click', openCurrencyDialog);
['closeCurrencyDialog', 'cancelCurrencyDialog'].forEach(id => $(`#${id}`).addEventListener('click', () => currencyDialog.close()));
currencyForm.addEventListener('submit', event => {
  event.preventDefault();
  const exchangeRates = { CNY: 1 };
  for (const currency of supportedCurrencies.filter(item => item !== 'CNY')) {
    const rate = Number($(`#rate${currency}`).value);
    if (!Number.isFinite(rate) || rate <= 0) return showToast(`${currency} 汇率必须大于 0`);
    exchangeRates[currency] = rate;
  }
  currentTrip().exchangeRates = exchangeRates;
  persist();
  currencyDialog.close();
  renderTimeline();
  updateCost();
  showToast('汇率已更新，预计总花费已重新折算');
});
$('#manageCategories').addEventListener('click', openCategoryDialog);
$('#addCategory').addEventListener('click', () => {
  const name = $('#newCategoryName').value.trim();
  const trip = currentTrip();
  if (!name) return showToast('请输入费用类别名称');
  if (builtInCategories.includes(name) || trip.customCategories.includes(name)) return showToast('该费用类别已存在');
  trip.customCategories.push(name);
  persist();
  $('#newCategoryName').value = '';
  renderCategoryList();
  renderCategoryOptions(name);
  showToast(`已添加费用类别“${name}”`);
});
$('#doneCategory').addEventListener('click', () => categoryDialog.close());
$('#closeCategoryDialog').addEventListener('click', () => categoryDialog.close());
categoryForm.addEventListener('submit', event => { event.preventDefault(); categoryDialog.close(); });
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
currencyDialog.addEventListener('cancel', event => { event.preventDefault(); currencyDialog.close(); });
categoryDialog.addEventListener('cancel', event => { event.preventDefault(); categoryDialog.close(); });
renderApp();
