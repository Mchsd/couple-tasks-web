// 朝暮 DawnDusk — 应用主逻辑 (Tab 路由 + 页面渲染 + 事件)
'use strict';

const APP = (() => {

  const $ = id => document.getElementById(id);
  const state = {
    data: null,
    me: localStorage.getItem('couple_me') || 'a',
    names: { a: '宝宝', b: '宝贝' },
    tab: 'today',
    zhengzi: null,
    history: [],
    streak: 0,
    festivalToday: null,
    periodHistory: [],   // 解密后的经期历史 (仅当 enabled)
  };

  // ── 初始化 (本地优先: 首屏秒开, 后台拉 GitHub 最新) ──
  async function init() {
    renderStars();
    bindEvents();
    injectIcons();
    // 1. 本地数据立即渲染 (不触网)
    state.data = DATA.fastLocal();
    if (state.data.period && state.data.period.enabled) {
      state.periodHistory = await DATA.decPeriod(state.data.period);
      state.data.period.localHistory = state.periodHistory;
    }
    const fests = DATA.getDayFestivals(state.data, DATA.todayStr());
    state.festivalToday = fests[0] || null;
    renderAll();
    checkFestivalAnimation();
    // 2. 后台拉云端最新 (带超时; 成功则渲染最新, 失败静默保持本地)
    try {
      const remote = await DATA.load();
      if (remote !== state.data) {
        state.data = remote;
        state.periodHistory = await refreshPeriodHistory(state.data);
        const f2 = DATA.getDayFestivals(state.data, DATA.todayStr());
        state.festivalToday = f2[0] || null;
        renderAll();
        checkFestivalAnimation();
      }
    } catch (e) { /* 离线保持本地 */ }
    // 3. 实时性: focus 切回 + 每分钟
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
    window.addEventListener('focus', () => refresh());
    setTimeout(refresh, 8000);
  }

  function me() { return state.me; }

  function applyMe() {
    const btn = $('meToggle');
    if (btn) btn.textContent = '我是「' + (state.data.names[state.me] || (state.me === 'a' ? '我 ☀️' : '我 🌙')) + '」';
  }

  // ── Tab 路由 (切换时重渲染对应页, 保证数据最新) ──
  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('show', p.id === 'page-' + tab));
    if (!state.data) return;
    if (tab === 'today') renderToday(state.data);
    if (tab === 'calendar') CAL.init(state.data);
    if (tab === 'memories') renderMemories();
    if (tab === 'us') renderUs(state.data);
  }

  // ── 全量渲染 ──
  function renderAll() {
    const d = state.data;
    state.names = d.names || { a: '宝宝', b: '宝贝' };
    state.streak = DATA.getStreak(d);
    state.history = DATA.getHistory(d);
    state.zhengzi = d.zhengzi;
    renderHeader(d);
    renderToday(d);
    renderUs(d);
    renderSyncState(d);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('show', p.id === 'page-' + state.tab));
  }

  function renderHeader(d) {
    $('nameA').textContent = d.names.a;
    $('nameB').textContent = d.names.b;
    $('headA').innerHTML = ICONS.flower;
    $('headB').innerHTML = ICONS.moon;
  }

  // 注入古风 SVG 图标 (data-ic 占位符 → ICONS)
  function injectIcons() {
    document.querySelectorAll('[data-ic]').forEach(el => {
      el.innerHTML = ICONS[el.dataset.ic] || '';
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
    });
  }

  function renderSyncState(d) {
    const el = $('syncState');
    if (!el) return;
    if (DATA.localMode()) {
      el.textContent = '💾 本机独立模式（未同步）';
      el.classList.remove('ok');
    } else if (DATA.GITHUB.token) {
      el.textContent = '☁️ 已云端同步';
      el.classList.add('ok');
    } else {
      el.textContent = '☁️ 云端同步未开启 · 去「我们」填入令牌';
      el.classList.remove('ok');
    }
  }

  // ════════ Tab 1: 今天 ════════
  function renderToday(d) {
    // 节日横幅
    const banner = $('festBanner');
    if (state.festivalToday) {
      banner.style.display = 'block';
      banner.innerHTML = `<span class="fb-emoji">${state.festivalToday.emoji}</span>` +
        `<span class="fb-text"><b>${state.festivalToday.name}</b>${state.festivalToday.custom ? ' · 我们的节日' : ''}</span>` +
        `<span class="fb-sub">${d.names.a} ♥ ${d.names.b}</span>`;
    } else {
      // 无节日 → 显示连续横幅 (火焰印章)
      banner.style.display = 'block';
      banner.className = 'fest-banner plain';
      banner.innerHTML = `<span class="fb-emoji">${ICONS.flame}</span><span class="fb-text">连续 <b>${state.streak}</b> 天</span>` +
        `<span class="fb-sub">${strings.bannerSub()}</span>`;
    }

    // 今日约定
    const ds = DATA.todayStr();
    const t = (d.days || {})[ds] || {};
    const card = $('taskCard'), btn = $('checkBtn');
    if (t.task) {
      $('taskText').textContent = t.task;
      $('taskText').classList.remove('empty');
      $('setterLine').innerHTML = t.setter ? `<i class="heart-s">${ICONS.heart}</i> ${d.names[t.setter]} 定的约定` : '';
      card.classList.toggle('done', !!t.done);
      if (t.done) {
        btn.innerHTML = `${ICONS.check} 完成啦`; btn.classList.add('done'); btn.disabled = true;
        $('doneInfo').style.display = 'block';
        $('doneInfo').innerHTML = `<b>${d.names[t.done_by]}</b> 完成了它 ${t.done_at ? '· ' + t.done_at : ''}` +
          (t.note ? `<br><i class="note-ic">${ICONS.note}</i> "${CAL.escapeHtml(t.note)}"` : '');
        $('uncheckBtn').style.display = 'inline-block';
        $('setTask').style.display = 'none';
      } else {
        btn.innerHTML = `${ICONS.heart} 一起完成`; btn.classList.remove('done'); btn.disabled = false;
        $('doneInfo').style.display = 'none';
        $('uncheckBtn').style.display = 'none';
        $('noteToggle').style.display = 'inline-block';
      }
    } else {
      $('taskText').textContent = '今天还没有约定';
      $('taskText').classList.add('empty');
      $('setterLine').textContent = '';
      card.classList.remove('done');
      btn.innerHTML = `${ICONS.heart} 一起完成`; btn.classList.remove('done'); btn.disabled = true;
      $('doneInfo').style.display = 'none';
      $('uncheckBtn').style.display = 'none';
      $('noteToggle').style.display = 'none';
    }
    $('setTaskSummary').textContent = t.task ? '✏️ 改今天的约定…' : '✏️ 写下今天的约定…';

    // 习惯打卡区
    renderHabits(d);
    // 倒计时区
    renderCountdowns(d);
    // 正字
    renderZhengzi(d.zhengzi || { count: 0, gifts_small: 0, gifts_big: 0, love_marks: 0 });
    // 今日提醒 (经期预测)
    renderTodayReminders(d);
  }

  function stringsBanner() { return '朝朝暮暮，皆不负你'; }

  const strings = { bannerSub: stringsBanner };

  function renderTodayReminders(d) {
    const box = $('todayReminders');
    if (!box) return;
    const items = [];
    const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    // 倒计时快到期 (≤7 天)
    (d.countdowns || []).forEach(cd => {
      const left = DATA.daysBetween(DATA.todayStr(), cd.target);
      if (left >= 0 && left <= 7) items.push(`⏳ ${cd.emoji} ${CAL.escapeHtml(cd.title)} · 还有 ${left} 天`);
    });
    // 经期预测 (owner 且 enabled)
    const p = d.period || {};
    if (p.enabled && p.owner === state.me) {
      const hist = state.periodHistory;
      const next = DATA.periodNextDate(p, hist);
      if (next) {
        const left = DATA.daysBetween(DATA.todayStr(), next);
        if (left >= 0 && left <= 2) items.push(`💧 预计 ${DAY_NAMES[new Date(next).getDay()]}（${left} 天后）`);
        else if (left > 2) items.push(`💧 下次预计 ${next.slice(5).replace('-', '月')}日`);
      }
    }
    if (items.length) {
      box.style.display = 'block';
      box.innerHTML = items.map(i => `<div class="tr-item">${i}</div>`).join('');
    } else {
      box.style.display = 'none';
    }
  }

  // ── 习惯打卡 ──
  function renderHabits(d) {
    const box = $('habitList');
    const empty = $('habitEmpty');
    const habits = d.habits || [];
    if (!habits.length) {
      box.innerHTML = ''; empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    const ds = DATA.todayStr();
    box.innerHTML = habits.map(h => {
      const marks = h.marks || [];
      const doneToday = marks.includes(ds);
      const week = weekCells(marks, h.owner);
      return `<div class="habit-row${doneToday ? ' done' : ''}">
        <button class="habit-check" data-hid="${h.id}" title="${doneToday ? '取消' : '打卡'}">${h.emoji}</button>
        <div class="habit-info">
          <div class="habit-name">${CAL.escapeHtml(h.name)} ${h.owner === 'both' ? ICONS.heart : h.owner === state.me ? '' : `<i class="dim-ic">${ICONS.heart}</i>`}</div>
          <div class="habit-week">${week}</div>
        </div>
        <span class="habit-count">${marks.length}</span>
      </div>`;
    }).join('');
    box.querySelectorAll('.habit-check').forEach(b => {
      b.addEventListener('click', async () => {
        const r = await DATA.toggleHabit(b.dataset.hid, DATA.todayStr());
        state.data = r;
        renderHabits(r);
        if (b.classList.contains('done')) ANIM.toast('已打卡，继续加油');
      });
    });
  }

  function weekCells(marks, owner) {
    // 本周 7 格 (周一起)
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    let s = '';
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      const k = DATA.dkey(dt);
      const done = marks.includes(k);
      const isToday = k === DATA.todayStr();
      const future = k > DATA.todayStr();
      s += `<span class="wk-cell${done ? ' done' : ''}${isToday ? ' today' : ''}${future ? ' future' : ''}">${done ? '✓' : ''}</span>`;
    }
    return s;
  }

  // ── 倒计时 ──
  function renderCountdowns(d) {
    const box = $('cdList');
    const empty = $('cdEmpty');
    const cds = d.countdowns || [];
    if (!cds.length) { box.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    box.innerHTML = cds.map(cd => {
      const left = DATA.daysBetween(DATA.todayStr(), cd.target);
      const passed = left < 0;
      const label = passed ? `${-left} 天前` : left === 0 ? '就是今天 🎉' : `还有 ${left} 天`;
      return `<div class="cd-row">
        <span class="cd-emoji">${cd.emoji}</span>
        <div class="cd-info">
          <div class="cd-name">${CAL.escapeHtml(cd.title)}</div>
          <div class="cd-date">${cd.target.replace(/-/g, ' · ')}${cd.note ? ' · ' + CAL.escapeHtml(cd.note) : ''}</div>
        </div>
        <span class="cd-count ${passed ? 'passed' : ''}">${label}</span>
      </div>`;
    }).join('');
  }

  // ── 正字系统 (移植 v1) ──
  const ZZ_STROKES = [
    'M 505 667 Q 590 683 683 699 Q 744 712 754 720 Q 764 729 759 738 Q 752 751 719 761 Q 686 768 574 734 Q 421 701 321 693 Q 279 689 308 668 Q 354 641 431 655 Q 444 658 460 659 L 505 667 Z',
    'M 534 154 Q 537 298 539 420 L 540 457 Q 543 634 544 635 Q 543 638 542 638 Q 523 657 505 667 C 480 683 449 687 460 659 Q 484 596 485 591 Q 485 231 484 149 C 484 119 533 124 534 154 Z',
    'M 539 420 Q 578 411 616 422 Q 757 452 767 457 Q 777 466 772 475 Q 763 488 732 495 Q 699 501 667 487 Q 636 477 603 468 Q 573 462 540 457 C 510 452 510 426 539 420 Z',
    'M 346 135 Q 322 345 327 402 Q 328 427 312 441 Q 285 459 254 468 Q 238 472 228 465 Q 221 458 228 441 Q 253 399 266 354 Q 276 309 300 131 C 304 101 349 105 346 135 Z',
    'M 300 131 Q 203 124 100 114 Q 75 113 93 91 Q 109 73 131 66 Q 156 59 176 64 Q 467 131 884 110 Q 885 111 888 110 Q 912 109 918 119 Q 925 134 906 151 Q 839 203 784 190 Q 687 174 534 154 L 484 149 Q 417 143 346 135 L 300 131 Z',
  ];
  let _zzBuilt = false;
  function buildZhengziGrid() {
    if (_zzBuilt) return;
    const grid = $('zzGrid');
    for (let i = 0; i < 5; i++) {
      const cell = document.createElement('div');
      cell.className = 'zz-cell';
      cell.id = 'zzc' + i;
      let svg = `<svg viewBox="0 0 1024 1024"><g transform="translate(0,1024) scale(1,-1)">`;
      ZZ_STROKES.forEach((d, k) => { svg += `<path class="stroke" id="zzs${i}_${k}" d="${d}"/>`; });
      svg += `</g></svg>`;
      cell.innerHTML = svg;
      grid.appendChild(cell);
    }
    _zzBuilt = true;
  }
  function renderZhengzi(zz, animateFrom) {
    buildZhengziGrid();
    const count = zz.count || 0;
    $('zzProgress').textContent = `${count} / 25 画`;
    $('zzSmall').textContent = zz.gifts_small || 0;
    $('zzBig').textContent = zz.gifts_big || 0;
    $('zzLove').textContent = zz.love_marks || 0;
    for (let i = 0; i < 5; i++) {
      const cell = $('zzc' + i);
      if (!cell) continue;
      const lit = Math.max(0, Math.min(5, count - i * 5));
      cell.classList.toggle('done', lit >= 5);
      for (let k = 0; k < 5; k++) {
        const s = $('zzs' + i + '_' + k);
        if (!s) continue;
        const nowLit = k < lit;
        const wasLit = s.classList.contains('lit');
        if (animateFrom && nowLit && !wasLit) {
          setTimeout(() => {
            s.classList.add('lit'); s.classList.remove('pop');
            try { void s.getBBox(); } catch (e) {}
            s.classList.add('pop');
            setTimeout(() => s.classList.remove('pop'), 520);
          }, (i * 5 + k) * 80);
        } else {
          s.classList.toggle('lit', nowLit);
        }
      }
    }
    const needSmall = 5 - (count % 5);
    const needBig = 25 - (count % 25);
    const hint = $('zzHint');
    if (count === 0) hint.innerHTML = '起点！攒出第一个「正」字吧 💕';
    else if (count >= 25) hint.innerHTML = `攒满 5 个正字啦！新的一轮开始 🎉`;
    else hint.innerHTML = `距小惊喜还差 <b>${needSmall}</b> 画 · 距大惊喜还差 <b>${needBig}</b> 画`;
  }

  // ════════ Tab 3: 回忆 ════════
  function renderMemories() {
    const wall = $('wallBody');
    const h = state.history;
    $('wallCount').textContent = `(${h.length})`;
    // 里程碑面板
    const d = state.data;
    $('msDone').textContent = Object.values(d.days || {}).filter(e => e.done).length;
    $('msTotal').textContent = Object.values(d.days || {}).filter(e => e.task).length;
    $('msGift').textContent = (d.zhengzi && d.zhengzi.gifts_small) || 0;
    $('msBig').textContent = (d.zhengzi && d.zhengzi.gifts_big) || 0;
    $('msPoke').textContent = ((d.pokes && d.pokes.a.total) || 0) + ((d.pokes && d.pokes.b.total) || 0);
    if (h.length === 0) {
      wall.innerHTML = '<div class="w-empty">还没有回忆，从今天开始吧 🌙</div>';
    } else {
      wall.innerHTML = h.map(x => `
        <div class="w-item ${x.done ? 'done' : 'undone'}">
          <div class="w-date">${fmtDate(x.date)}${x.done ? ' ✅' : ' ⏳'}<span class="w-date-full">${x.date}</span></div>
          <div class="w-task">${CAL.escapeHtml(x.task || '(未设置)')}</div>
          <div class="w-meta">${x.setter ? `${state.names[x.setter]} 定的` : '—'}${x.done ? ` · ${state.names[x.done_by]} 完成` : ''}</div>
          ${x.note ? `<div class="w-note">💌 ${CAL.escapeHtml(x.note)}</div>` : ''}
        </div>`).join('');
    }
    CAL.renderHeatmap($('heatMap'), h);
  }

  function fmtDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const today = DATA.todayStr();
    if (iso === today) return '今天';
    const diff = DATA.daysBetween(iso, today);
    if (diff === 1) return '昨天';
    if (diff > 1 && diff <= 7) return `${diff}天前`;
    return `${m}月${d}日`;
  }

  // ════════ Tab 4: 我们 ════════
  function renderUs(d) {
    $('setNameA').value = d.names.a;
    $('setNameB').value = d.names.b;
    $('setToken').value = DATA.GITHUB.token;
    // 节日管理
    renderFestList(d);
    // 习惯管理
    renderHabitManage(d);
    // 倒计时管理
    renderCdManage(d);
    // 经期
    renderPeriod(d);
    // 打一下统计
    renderPokeStats(d);
    applyMe();
  }

  function renderFestList(d) {
    const list = $('festList');
    const custom = (d.festivals || []);
    const builtinCount = SOLAR_FESTIVALS.length + Object.keys(LUNAR_FESTIVAL_TABLE).length;
    list.innerHTML =
      `<div class="fest-item builtin"><span class="fi-emoji">${ICONS.seal}</span><div class="fi-info"><div class="fi-name">内置节日库</div><div class="fi-sub">公历 5 个 · 农历 2026-2030 共 ${builtinCount} 天 · 当天自动动画</div></div></div>`
      + (custom.length ? custom.map(f => `
        <div class="fest-item">
          <span class="fi-emoji">${f.emoji}</span>
          <div class="fi-info">
            <div class="fi-name">${CAL.escapeHtml(f.name)}</div>
            <div class="fi-sub">${f.lunar ? '农历 ' + f.lunar[0] + ' 月 ' + f.lunar[1] + ' 日' : '每年 ' + f.date.replace('-', '月') + ' 日'}${f.anim === 'grand' ? ' · 盛大动画' : ''}</div>
          </div>
          <button class="fi-del" data-fid="${f.id}">✕</button>
        </div>`).join('') : '');
    list.querySelectorAll('.fi-del').forEach(b => {
      b.addEventListener('click', async () => {
        state.data = await DATA.removeFestival(b.dataset.fid);
        renderUs(state.data);
        ANIM.toast('已删除节日');
      });
    });
  }

  function renderHabitManage(d) {
    const list = $('habitManageList');
    const hs = d.habits || [];
    list.innerHTML = hs.length ? hs.map(h => `
      <div class="fm-row">
        <span class="fm-emoji">${h.emoji}</span>
        <span class="fm-name">${CAL.escapeHtml(h.name)}</span>
        <span class="fm-sub">${h.owner === 'both' ? '共同' : h.owner === state.me ? '我的' : 'TA 的'} · ${(h.marks || []).length} 天</span>
        <button class="fi-del" data-hid="${h.id}">✕</button>
      </div>`).join('') : '<div class="fm-empty">还没有习惯，加一个吧 🌱</div>';
    list.querySelectorAll('.fi-del').forEach(b => {
      b.addEventListener('click', async () => {
        state.data = await DATA.removeHabit(b.dataset.hid);
        renderUs(state.data);
      });
    });
  }

  function renderCdManage(d) {
    const list = $('cdManageList');
    const cs = d.countdowns || [];
    list.innerHTML = cs.length ? cs.map(c => `
      <div class="fm-row">
        <span class="fm-emoji">${c.emoji}</span>
        <span class="fm-name">${CAL.escapeHtml(c.title)}</span>
        <span class="fm-sub">${c.target}</span>
        <button class="fi-del" data-cid="${c.id}">✕</button>
      </div>`).join('') : '<div class="fm-empty">还没有长期任务，定一个吧 ⏳</div>';
    list.querySelectorAll('.fi-del').forEach(b => {
      b.addEventListener('click', async () => {
        state.data = await DATA.removeCountdown(b.dataset.cid);
        renderUs(state.data);
      });
    });
  }

  function renderPeriod(d) {
    const p = d.period || { enabled: false };
    $('periodToggle').checked = !!p.enabled;
    $('periodOwnerSel').value = p.owner || 'a';
    $('periodVisSel').value = p.visible || 'me';
    $('periodStorageSel').value = p.storage || 'local';
    $('periodCycle').value = p.cycle || 28;
    $('periodDuration').value = p.duration || 5;
    const area = $('periodArea');
    // 最近记录展示 (仅当 enabled)
    const hist = state.periodHistory;
    const list = $('periodList');
    if (p.enabled && hist && hist.length) {
      list.innerHTML = hist.slice().sort().reverse().slice(0, 8).map(ds => `
        <div class="fm-row">
          <span class="fm-emoji">${ICONS.drop}</span>
          <span class="fm-name">${ds}</span>
          <span class="fm-sub">${p.storage === 'sync' ? '加密同步' : '仅本地'}` + (p.owner === state.me ? ' · 我' : ' · TA') + `</span>
          <button class="fi-del" data-pd="${ds}">✕</button>
        </div>`).join('');
      list.querySelectorAll('.fi-del').forEach(b => {
        b.addEventListener('click', async () => {
          state.data = await DATA.togglePeriodDate(b.dataset.pd);
          state.periodHistory = await refreshPeriodHistory(state.data);
          renderUs(state.data);
        });
      });
    } else {
      list.innerHTML = p.enabled ? '<div class="fm-empty">还没有记录 · 在日历上点💧按钮记录</div>' : '<div class="fm-empty">经期记录已关闭</div>';
    }
    area.style.display = p.enabled ? 'block' : 'none';
  }

  async function refreshPeriodHistory(data) {
    if (data.period && data.period.enabled) {
      if (data.period.enc) {
        const h = await DATA.decPeriod(data.period);
        data.period.localHistory = h;
        return h;
      }
      data.period.localHistory = data.period.history || [];
      return data.period.history || [];
    }
    return [];
  }

  function renderPokeStats(d) {
    const pk = (d.pokes || {});
    const a = pk.a || { total: 0, streak: 0 };
    const b = pk.b || { total: 0, streak: 0 };
    $('pokeStatA').textContent = a.total;
    $('pokeStatB').textContent = b.total;
    $('pokeStreakA').textContent = a.streak || 0;
    $('pokeStreakB').textContent = b.streak || 0;
    const ph = pk.history || {};
    const today = DATA.todayStr();
    const h = ph[today];
    $('pokeTodayIA').textContent = `今天你打 TA ${(h && h.a2b) || 0} 次`;
    $('pokeTodayIB').textContent = `今天 TA 打你 ${(h && h.b2a) || 0} 次`;
  }

  // ── 节日动画 (每天首次进入触发) ──
  function checkFestivalAnimation() {
    if (!state.festivalToday) return;
    const key = 'fest_played_' + DATA.todayStr() + '_' + state.festivalToday.name;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    setTimeout(() => {
      ANIM.festivalCelebrate(state.festivalToday);
      ANIM.playTone('festival');
    }, 500);
  }

  // ── 刷新 ──
  async function refresh() {
    try {
      state.data = await DATA.load(true);
      state.periodHistory = await refreshPeriodHistory(state.data);
      const fests = DATA.getDayFestivals(state.data, DATA.todayStr());
      state.festivalToday = fests[0] || null;
      renderAll();
      if (state.tab === 'calendar') CAL.init(state.data);
    } catch (e) { /* 离线保持现状 */ }
  }

  // ── 事件绑定 ──
  function bindEvents() {
    // Tab
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
    });
    // 今日约定
    $('checkBtn').addEventListener('click', async e => {
      const btn = $('checkBtn');
      const r = btn.getBoundingClientRect();
      ANIM.confetti(30, ['💗', '💖', '🌸', '✨']);
      const note = $('noteInput').value.trim();
      try {
        const res = await DATA.checkTask(state.me, note);
        state.data = res.data;
        const prevStreak = state.streak;
        const prevZZ = state.zhengzi ? state.zhengzi.count : 0;
        renderAll();
        if (res.milestone) ANIM.milestone(res.milestone);
        ANIM.taskDoneCelebrate();
        if (state.streak > prevStreak && (state.streak === 7 || state.streak === 30 || state.streak === 100)) {
          ANIM.confetti(100, ['🎉', '💖', '✨', '🎊']);
          const msgs = { 7: '🎉 连续 7 天！爱是日复一日的选择', 30: '💍 连续一个月！把约定过成了习惯', 100: '👑 100 天！这就是长久的模样' };
          setTimeout(() => ANIM.toast(msgs[state.streak] || ''), 500);
        }
        $('noteInput').value = '';
        $('noteBox').classList.remove('show');
      } catch (err) { ANIM.toast(err.message || '出错了'); }
    });
    $('uncheckBtn').addEventListener('click', async () => {
      state.data = await DATA.uncheckTask();
      renderAll();
      ANIM.toast('已取消完成');
    });
    $('noteToggle').addEventListener('click', () => $('noteBox').classList.toggle('show'));
    $('noteQuick').querySelectorAll('.q-btn').forEach(b => {
      b.addEventListener('click', () => { $('noteInput').value = b.textContent; });
    });
    $('taskSave').addEventListener('click', async () => {
      const task = $('taskInput').value.trim();
      if (!task) { ANIM.toast('写点什么吧～'); return; }
      const whoEl = document.querySelector('.who-btn.on');
      state.data = await DATA.setTask(task, whoEl ? whoEl.dataset.who : state.me);
      renderAll();
      $('taskInput').value = '';
      $('setTask').removeAttribute('open');
      ANIM.toast('约定已写下');
    });
    document.querySelectorAll('.who-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.who-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
    });
    $('meToggle').addEventListener('click', () => {
      state.me = state.me === 'a' ? 'b' : 'a';
      localStorage.setItem('couple_me', state.me);
      applyMe();
      ANIM.toast(`现在你是「${state.names[state.me]}」`);
    });
    // 打一下
    $('pokeBtn').addEventListener('click', async e => {
      const btn = e.currentTarget;   // 同步捕获, await 后 currentTarget 会变 null
      const res = await DATA.poke(state.me);
      state.data = res.data;
      ANIM.pokeAnim(btn);
      renderPokeStats(state.data);
      ANIM.toast(`啪！你打了${state.names[state.me === 'a' ? 'b' : 'a']}一下${res.total >= 25 ? ' ✦' : ''}`);
    });
    // 回忆墙展开
    $('wallToggle').addEventListener('click', () => {
      const open = $('wallToggle').classList.toggle('open');
      $('wallBody').classList.toggle('open', open);
    });
    // 日历翻月
    $('calPrev').addEventListener('click', () => CAL.prevMonth());
    $('calNext').addEventListener('click', () => CAL.nextMonth());
    $('calToday').addEventListener('click', () => CAL.goToday());
    // 经期记录按钮 (今天页快捷)
    $('periodMarkBtn').addEventListener('click', async () => {
      const ds = DATA.todayStr();
      state.data = await DATA.togglePeriodDate(ds);
      state.periodHistory = await refreshPeriodHistory(state.data);
      renderUs(state.data);
      renderToday(state.data);
      ANIM.toast('已记录');
    });
    // 名字保存
    $('nameSave').addEventListener('click', async () => {
      const na = $('setNameA').value.trim(), nb = $('setNameB').value.trim();
      if (!na || !nb) { ANIM.toast('两个名字都要填哦'); return; }
      try {
        state.data = await DATA.setNames(na, nb);
        renderAll();
        ANIM.toast('已保存并同步');
      } catch (e) { ANIM.toast(e.message); }
    });
    // token 保存
    $('tokenSave').addEventListener('click', async () => {
      const tk = $('setToken').value.trim();
      try {
        const mode = await DATA.setToken(tk);
        state.data = await DATA.load(true);
        state.periodHistory = await refreshPeriodHistory(state.data);
        renderAll();
        ANIM.toast(mode === 'synced' ? '已连接云端同步' : '已切回本机模式');
      } catch (e) { ANIM.toast('令牌无效：' + e.message); }
    });
    // 节日新增
    $('festAdd').addEventListener('click', async () => {
      const name = $('festName').value.trim();
      const date = $('festDate').value;
      const emoji = $('festEmoji').value.trim() || '🌟';
      const lunar = $('festLunar').checked;
      const anim = $('festAnim').value;
      if (!name || !date) { ANIM.toast('填写节日名和日期'); return; }
      const mmdd = lunar ? date : date.slice(5);
      try {
        state.data = await DATA.addFestival(name, mmdd, emoji, lunar, anim);
        renderUs(state.data);
        $('festName').value = ''; $('festDate').value = '';
        ANIM.toast('节日已添加');
      } catch (e) { ANIM.toast(e.message); }
    });
    // 习惯新增
    $('habitAdd').addEventListener('click', async () => {
      const name = $('habitName').value.trim();
      if (!name) { ANIM.toast('填一个习惯名'); return; }
      const emoji = $('habitEmoji').value.trim() || '🌱';
      const owner = $('habitOwner').value;
      state.data = await DATA.addHabit(name, emoji, owner);
      renderUs(state.data);
      $('habitName').value = '';
      ANIM.toast('习惯已添加');
    });
    // 倒计时新增
    $('cdAdd').addEventListener('click', async () => {
      const title = $('cdTitle').value.trim();
      const target = $('cdTarget').value;
      const emoji = $('cdEmoji').value.trim() || '⏳';
      const note = $('cdNote').value.trim();
      if (!title || !target) { ANIM.toast('写标题 + 选日期'); return; }
      state.data = await DATA.addCountdown(title, emoji, target, note);
      renderUs(state.data);
      $('cdTitle').value = ''; $('cdNote').value = '';
      ANIM.toast('倒计时已添加');
    });
    // 经期开关
    $('periodToggle').addEventListener('change', async e => {
      state.data = await DATA.setPeriodEnabled(e.target.checked);
      state.periodHistory = await refreshPeriodHistory(state.data);
      renderUs(state.data);
      renderToday(state.data);
      ANIM.toast(e.target.checked ? '已开启经期记录（界面已隐藏，仅二级菜单可见）' : '已关闭');
    });
    $('periodOwnerSel').addEventListener('change', async e => {
      state.data = await DATA.setPeriodOption('owner', e.target.value);
      renderUs(state.data);
    });
    $('periodVisSel').addEventListener('change', async e => {
      state.data = await DATA.setPeriodOption('visible', e.target.value);
      renderUs(state.data);
    });
    $('periodStorageSel').addEventListener('change', async e => {
      if (e.target.value === 'sync' && !(await DATA.hasPeriodKey())) {
        ANIM.toast('正在生成加密密钥（仅本机保存）…');
      }
      state.data = await DATA.setPeriodOption('storage', e.target.value);
      state.periodHistory = await refreshPeriodHistory(state.data);
      renderUs(state.data);
      ANIM.toast(e.target.value === 'sync' ? '已开启加密同步（密钥仅本机，云端不可读）' : '已改为仅本地');
    });
    $('periodCycle').addEventListener('change', async e => {
      state.data = await DATA.setPeriodOption('cycle', Math.max(15, Math.min(60, Number(e.target.value) || 28)));
      renderUs(state.data);
    });
    $('periodDuration').addEventListener('change', async e => {
      state.data = await DATA.setPeriodOption('duration', Math.max(1, Math.min(15, Number(e.target.value) || 5)));
      renderUs(state.data);
    });
  }

  // ── 工具 ──
  function renderStars() {
    const s = $('stars');
    if (!s) return;
    for (let i = 0; i < 60; i++) {
      const st = document.createElement('div');
      st.className = 'star';
      const sz = Math.random() * 2.5 + 1;
      st.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${Math.random() * 3}s`;
      s.appendChild(st);
    }
  }

  return { init, refresh, me, switchTab, renderToday, renderUs };
})();

// 启动
window.addEventListener('DOMContentLoaded', () => { APP.init(); });
