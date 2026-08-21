// 朝暮 DawnDusk — 月度日历 + 17周热力图
'use strict';

const CAL = (() => {

  let _cur = { y: 0, m: 0 };   // 当前显示的年月 (m: 1-12)
  let _data = null;

  const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];

  function init(data) {
    _data = data;
    const t = new Date();
    _cur = { y: t.getFullYear(), m: t.getMonth() + 1 };
    render();
  }

  function render() {
    const grid = document.getElementById('calGrid');
    if (!grid) return;
    const y = _cur.y, m = _cur.m;
    const first = new Date(y, m - 1, 1);
    const startOffset = (first.getDay() + 6) % 7;        // 周一为首
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = DATA.todayStr();

    let html = `<div class="cal-week">${WEEK_HEAD.map(w => `<span>${w}</span>`).join('')}</div><div class="cal-grid">`;
    for (let i = 0; i < startOffset; i++) html += '<span class="cal-cell blank"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const marks = cellMarks(ds);
      const cls = [
        'cal-cell',
        ds === today ? 'today' : '',
        ds > today ? 'future' : '',
        marks.length ? 'marked' : '',
        marks.some(x => x.kind === 'fest') ? 'fest' : '',
      ].filter(Boolean).join(' ');
      html += `<span class="${cls}" data-date="${ds}">` +
        `<b>${d}</b>` +
        (marks.length ? `<span class="cal-marks">${marks.slice(0, 3).map(x => `<i class="mk mk-${x.kind}" title="${escapeHtml(x.title)}">${x.icon}</i>`).join('')}</span>` : '') +
        `</span>`;
    }
    html += '</div>';
    grid.innerHTML = html;

    document.getElementById('calTitle').textContent = `${y} 年 ${m} 月`;
    document.getElementById('calSub').textContent = monthSummary(y, m);

    grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => showDayDetail(cell.dataset.date));
    });
  }

  // 一天的全部标记
  function cellMarks(ds) {
    const marks = [];
    const day = (_data.days || {})[ds];
    if (day) {
      if (day.done) marks.push({ kind: 'done', icon: '✅', title: `约定完成：${day.task || ''}` });
      if (day.task && !day.done) marks.push({ kind: 'todo', icon: '🗓', title: `约定：${day.task}` });
    }
    const fests = DATA.getDayFestivals(_data, ds);
    fests.forEach(f => marks.push({ kind: 'fest', icon: f.emoji || '⭐', title: `节日：${f.name}` }));
    // 经期 (仅 owner 可见/本地)
    const p = _data.period || {};
    if (p.enabled && (p.visible === 'both' || p.owner === 'a' && APP.me() === 'a' || p.owner === 'b' && APP.me() === 'b')) {
      if ((p.enc ? (p.localHistory || []).indexOf(ds) >= 0 : (p.history || []).indexOf(ds) >= 0)) {
        marks.push({ kind: 'period', icon: p.visible === 'both' ? '💧' : '🩷', title: '经期记录' });
      }
    }
    (_data.countdowns || []).forEach(cd => {
      if (cd.target === ds) marks.push({ kind: 'cd', icon: '⏳', title: `倒计时到期：${cd.title}` });
    });
    const ph = (_data.pokes || {}).history || {};
    if (ph[ds] && ((ph[ds].a2b || 0) + (ph[ds].b2a || 0)) > 0) {
      marks.push({ kind: 'poke', icon: '❤️', title: `打一下 ×${(ph[ds].a2b || 0) + (ph[ds].b2a || 0)}` });
    }
    return marks;
  }

  function monthSummary(y, m) {
    const done = Object.entries(_data.days || {}).filter(([k, v]) =>
      k.startsWith(`${y}-${String(m).padStart(2, '0')}`) && v.done).length;
    const fests = countMonthFests(y, m);
    let s = `完成约定 ${done} 天`;
    if (fests) s += ` · 节日 ${fests} 个`;
    return s;
  }

  function countMonthFests(y, m) {
    let n = 0;
    for (let d = 1; d <= 31; d++) {
      const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      n += DATA.getDayFestivals(_data, ds).length;
    }
    return n;
  }

  // 详情弹层
  function showDayDetail(ds) {
    const layer = document.getElementById('dayDetail');
    const body = document.getElementById('dayDetailBody');
    const day = (_data.days || {})[ds];
    const fests = DATA.getDayFestivals(_data, ds);
    const p = _data.period || {};
    const isPeriodDay = p.enabled && (
      (p.enc ? (p.localHistory || []).includes(ds) : (p.history || []).includes(ds)));

    let html = `<div class="dd-date">📅 ${ds} ${ds === DATA.todayStr() ? '（今天）' : ''}</div>`;
    if (day) {
      html += `<div class="dd-row">${day.done ? '✅' : '🗓'} <b>${escapeHtml(day.task || '(未设置约定)')}</b></div>`;
      if (day.setter) html += `<div class="dd-sub">${escapeHtml(_data.names[day.setter] || '')} 定的约定</div>`;
      if (day.done) html += `<div class="dd-sub">完成人：${escapeHtml(_data.names[day.done_by] || '')} ${day.done_at ? '· ' + day.done_at : ''}</div>`;
      if (day.note) html += `<div class="dd-note">💌 ${escapeHtml(day.note)}</div>`;
    } else {
      html += `<div class="dd-sub">当天没有约定</div>`;
    }
    fests.forEach(f => html += `<div class="dd-row fest"><span class="dd-emoji">${f.emoji}</span> ${escapeHtml(f.name)}${f.custom ? '（自定义）' : ''}${f.lunar ? '（农历）' : ''}</div>`);
    if (isPeriodDay) html += `<div class="dd-row period">💧 经期记录中</div>`;
    (_data.countdowns || []).forEach(cd => { if (cd.target === ds) html += `<div class="dd-row">⏳ ${escapeHtml(cd.title)} 到期</div>`; });
    const ph = (_data.pokes || {}).history || {};
    const phd = ph[ds];
    if (phd && (phd.a2b || 0) + (phd.b2a || 0) > 0) {
      html += `<div class="dd-row">❤️ 打一下 ×${(phd.a2b || 0) + (phd.b2a || 0)}</div>`;
    }
    body.innerHTML = html;
    layer.classList.add('show');
    document.getElementById('dayDetailClose').onclick = () => layer.classList.remove('show');
  }

  function prevMonth() {
    if (_cur.m === 1) { _cur.y--; _cur.m = 12; } else _cur.m--;
    render();
  }
  function nextMonth() {
    if (_cur.m === 12) { _cur.y++; _cur.m = 1; } else _cur.m++;
    render();
  }
  function goToday() {
    const t = new Date();
    _cur = { y: t.getFullYear(), m: t.getMonth() + 1 };
    render();
  }

  // ── 17 周热力图 (移植 v1) ──
  function renderHeatmap(el, history) {
    const daily = {};
    history.forEach(h => { if (h.done) daily[h.date] = (daily[h.date] || 0) + 1; });
    const weeks = 17;
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (weeks * 7 - 1));
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const todayKey = DATA.dkey(today);
    const colCount = Math.ceil((today - start) / 86400000 / 7);
    const html = [];
    for (let w = 0; w < colCount; w++) {
      let col = '<div class="heat-col">';
      for (let r = 0; r < 7; r++) {
        const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + r);
        const k = DATA.dkey(dt);
        const n = daily[k] || 0;
        const lv = (k > todayKey) ? '' : (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4);
        col += `<div class="heat-cell${lv ? ' l' + lv : ''}${k === todayKey ? ' today' : ''}" title="${k}：${n} 次完成"></div>`;
      }
      col += '</div>';
      html.push(col);
    }
    el.innerHTML = html.join('') +
      '<div class="heat-legend"><span class="hl">少</span>' +
      [0, 1, 2, 3, 4].map(l => `<span class="heat-cell${l ? ' l' + l : ''}"></span>`).join('') +
      '<span class="hl">多</span></div>';
  }

  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  return { init, render, prevMonth, nextMonth, goToday, renderHeatmap, cellMarks, showDayDetail, escapeHtml };
})();
