const activities = [
  { time: '09:30', title: '抵达关西机场', detail: '机场接送 · 约 1小时20分', emoji: '🛬', cost: 620, duration: 80 },
  { time: '11:10', title: '前往京都站', detail: '包车 · 约 1小时20分', emoji: '🚐', cost: 360, duration: 80 },
  { time: '12:40', title: '午餐 · 京都拉面小路', detail: '京都站 10F · 预计 1小时', emoji: '🍜', cost: 480, duration: 60 },
  { time: '14:00', title: '入住 · 四季京都酒店', detail: '东山区 · 2间家庭房', emoji: '🏨', cost: 8900, duration: 30 },
  { time: '15:00', title: '清水寺与二年坂', detail: '步行游览 · 约 2小时', emoji: '⛩️', cost: 1600, duration: 120 }
];
let members = 4;
const timeline = document.querySelector('#timeline');
const toast = document.querySelector('#toast');

function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function renderTimeline() {
  let current = 9 * 60 + 30;
  timeline.innerHTML = activities.map((activity, index) => {
    const start = current;
    current += activity.duration;
    return `<div class="activity">
      <div class="time">${index === 0 ? activity.time : formatTime(start)}</div><span class="activity-dot"></span>
      <div class="activity-card" data-index="${index}">
        <div class="activity-main"><span class="activity-emoji">${activity.emoji}</span><div><h4>${activity.title}</h4><p>${activity.detail}</p></div></div>
        <div class="activity-meta"><strong>¥ ${activity.cost.toLocaleString('zh-CN')}</strong><small>${activity.duration} 分钟</small></div>
      </div>
    </div>`;
  }).join('');
  timeline.querySelectorAll('.activity-card').forEach(card => card.addEventListener('click', () => {
    const index = Number(card.dataset.index);
    const nextDuration = window.prompt(`调整「${activities[index].title}」的时长（分钟）`, String(activities[index].duration));
    if (nextDuration === null) return;
    const duration = Number(nextDuration);
    if (!Number.isInteger(duration) || duration < 10 || duration > 720) {
      showToast('请输入 10 - 720 之间的整数分钟');
      return;
    }
    activities[index].duration = duration;
    renderTimeline();
    showToast('时长已更新，后续行程自动顺延');
  }));
}
function updateCost() {
  const base = 11340;
  const variable = members * 1780;
  const total = base + variable;
  document.querySelector('#memberCount').textContent = `${members} 人`;
  document.querySelector('#memberHint').textContent = `${Math.max(1, members - 2)} 位成人 · ${Math.min(2, members)} 位儿童`;
  document.querySelector('#totalCost').textContent = `¥ ${total.toLocaleString('zh-CN')}`;
  document.querySelector('#perPerson').textContent = Math.round(total / members).toLocaleString('zh-CN');
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2400);
}
function exportExcel() {
  const rows = activities.map((a, i) => `<tr><td>第1天</td><td>${i + 1}</td><td>${a.time}</td><td>${a.title}</td><td>${a.detail}</td><td>${a.cost}</td></tr>`).join('');
  const table = `<table border="1"><tr><th>日期</th><th>序号</th><th>时间</th><th>安排</th><th>说明</th><th>费用（¥）</th></tr>${rows}</table>`;
  const blob = new Blob([`\ufeff<html><meta charset="utf-8">${table}</html>`], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '京都慢游-家庭行程.xls';
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Excel 行程表已下载');
}
renderTimeline();
updateCost();
document.querySelector('#printPdf').addEventListener('click', () => window.print());
document.querySelector('#exportExcel').addEventListener('click', exportExcel);
document.querySelector('#openMap').addEventListener('click', () => {
  window.open('https://www.google.com/maps/dir/?api=1&origin=京都駅&destination=清水寺&waypoints=錦市場', '_blank', 'noopener');
});
document.querySelector('#addActivity').addEventListener('click', () => {
  activities.push({ time: '17:30', title: '晚餐 · 先斗町', detail: '家庭餐厅 · 约 1小时', emoji: '🍱', cost: 3200, duration: 60 });
  renderTimeline();
  showToast('已添加晚餐，后续时间自动顺延');
});
document.querySelector('#addMember').addEventListener('click', () => {
  members += 1;
  updateCost();
  showToast(`已添加成员，房间与费用已重算为 ${members} 人`);
});
document.querySelector('#manageMembers').addEventListener('click', () => showToast('成员管理将在下一步支持编辑年龄与角色'));
document.querySelectorAll('.day-tab').forEach((tab, index) => tab.addEventListener('click', () => {
  document.querySelectorAll('.day-tab').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  if (index > 0) showToast(`D${index + 1} 行程已准备，点击添加安排开始规划`);
}));
