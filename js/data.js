// 朝暮 DawnDusk — 数据层 (GitHub Contents API + localStorage 降级 + v1 迁移 + 经期加密)
'use strict';

const DATA = (() => {

  const GITHUB = {
    owner: 'Mchsd',
    repo: 'couple-tasks',
    path: 'data.json',
    get token() { return localStorage.getItem('couple_token') || ''; },
    set token(v) { localStorage.setItem('couple_token', v); },
  };

  let _ghSha = null;
  let _cache = null;
  let _localMode = false;
  const LOCAL_KEY = 'couple_tasks_local';

  // ── 默认数据 (v1 兼容 + v2 扩展) ──
  function defaultData() {
    return {
      names: { a: '宝宝', b: '宝贝' },
      days: {},
      used_redos: [],
      zhengzi: { count: 0, gifts_small: 0, gifts_big: 0, love_marks: 0, last_milestone: null },
      created_at: new Date().toISOString().slice(0, 19),
      // v2 扩展
      festivals: [],   // {id,name,date:'MM-DD',lunar:false,emoji,repeat:true,anim:'light'|'grand',note}
      countdowns: [],  // {id,title,emoji,target:'YYYY-MM-DD',note}
      habits: [],      // {id,name,emoji,owner:'both|a|b',marks:['YYYY-MM-DD']}
      period: { enabled: false, owner: 'a', storage: 'local', visible: 'me',
                cycle: 28, duration: 5, history: [] },
      pokes: { a: { total: 0, streak: 0, last: null }, b: { total: 0, streak: 0, last: null },
               history: {} },   // {'YYYY-MM-DD': {a2b, b2a}}
    };
  }

  // ── v1 → v2 迁移 (补默认字段, 数据零丢失) ──
  function migrate(d) {
    if (!d || typeof d !== 'object') return defaultData();
    const base = defaultData();
    for (const k of Object.keys(base)) {
      if (d[k] === undefined) d[k] = base[k];
    }
    d.festivals = d.festivals || [];
    d.countdowns = d.countdowns || [];
    d.habits = d.habits || [];
    d.period = Object.assign(base.period, d.period || {});
    d.pokes = Object.assign(base.pokes, d.pokes || {});
    if (!d.pokes.a) d.pokes.a = { total: 0, streak: 0, last: null };
    if (!d.pokes.b) d.pokes.b = { total: 0, streak: 0, last: null };
    if (!d.pokes.history) d.pokes.history = {};
    return d;
  }

  function loadLocal() {
    try { return migrate(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null') || defaultData()); }
    catch (e) { return defaultData(); }
  }
  function saveLocal(data) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  }

  async function ghApi(method, suffix, body) {
    const opt = { method, headers: { 'Accept': 'application/vnd.github+json' } };
    if (GITHUB.token) opt.headers['Authorization'] = 'Bearer ' + GITHUB.token;
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    // 超时控制: 中国网络直连 api.github.com 可能极慢/挂起 → 8s 超时降级本地
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const resp = await fetch(`https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}${suffix}`, Object.assign({}, opt, { signal: ctrl.signal }));
      return resp.json().then(j => ({ status: resp.status, json: j }));
    } catch (e) {
      throw new Error('net: ' + (e.name || e.message));
    } finally {
      clearTimeout(timer);
    }
  }

  // 本地立即数据 (首屏秒开用, 不触网)
  function fastLocal() { return loadLocal(); }

  async function load(force = false) {
    if (_cache && !force) return _cache;
    if (_cache && force) { _cache = null; }
    try {
      const r = await ghApi('GET', '/contents/' + GITHUB.path);
      if (r.status === 200 && r.json.encoding === 'base64') {
        _ghSha = r.json.sha;
        const bytes = Uint8Array.from(atob(r.json.content.replace(/\n/g, '')), c => c.charCodeAt(0));
        const text = new TextDecoder('utf-8').decode(bytes);
        _cache = migrate(JSON.parse(text));
        _localMode = false;
        return _cache;
      }
      if (r.status === 404) {
        if (!GITHUB.token) throw new Error('no token (private repo hides as 404)');
        _cache = defaultData();
        _ghSha = null;
        await save(_cache, true);
        _localMode = false;
        return _cache;
      }
      throw new Error('GitHub API ' + r.status);
    } catch (e) {
      _cache = loadLocal();
      _localMode = true;
      return _cache;
    }
  }

  async function save(data, force = false) {
    _cache = data;
    saveLocal(data);   // 本地镜像始终保留
    if (_localMode || !GITHUB.token) return { ok: true, local: true };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const payload = { message: 'update data', content };
    if (_ghSha) payload.sha = _ghSha;
    let r = await ghApi('PUT', '/contents/' + GITHUB.path, payload);
    if (r.status === 409 && !force) {
      await load(true);
      payload.sha = _ghSha;
      r = await ghApi('PUT', '/contents/' + GITHUB.path, payload);
    }
    if (r.status === 200 || r.status === 201) {
      _ghSha = r.json.content.sha;
      return { ok: true };
    }
    throw new Error('GitHub 写入失败 ' + r.status);
  }

  // ── 日期工具 ──
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dkey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addDays(ds, n) {
    const [y, m, dd] = ds.split('-').map(Number);
    const d = new Date(y, m - 1, dd);
    d.setDate(d.getDate() + n);
    return dkey(d);
  }
  function daysBetween(a, b) { // b - a 的整天数 (日期字符串)
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
  }

  // ── 业务函数 ──
  function getStreak(data) {
    const days = data.days || {};
    let streak = 0;
    let cur = todayStr();
    if (!(days[cur] || {}).done) cur = addDays(cur, -1);
    while (true) {
      const entry = days[cur];
      if (entry && entry.done) { streak++; cur = addDays(cur, -1); }
      else break;
    }
    return streak;
  }

  function getStats(data) {
    const days = data.days || {};
    const s = { a: { set: 0, done: 0 }, b: { set: 0, done: 0 } };
    for (const e of Object.values(days)) {
      if (e.setter === 'a') s.a.set++;
      else if (e.setter === 'b') s.b.set++;
      if (e.done) {
        if (e.done_by === 'a') s.a.done++;
        else if (e.done_by === 'b') s.b.done++;
      }
    }
    return s;
  }

  function getHistory(data, limit = 90) {
    return Object.keys(data.days || {}).sort().reverse().slice(0, limit).map(ds => {
      const e = data.days[ds];
      return { date: ds, task: e.task || '', setter: e.setter, done: !!e.done,
        done_by: e.done_by, note: e.note || '', done_at: e.done_at };
    });
  }

  // ── 节日解析: 某天是否是节日 (公历 + 农历 + 自定义 + 纪念日) ──
  function getDayFestivals(data, dateStr) { // dateStr: 'YYYY-MM-DD'
    if (!data) data = _cache || defaultData();
    const mmdd = dateStr.slice(5);                // 'MM-DD'
    const out = [];
    for (const f of SOLAR_FESTIVALS) if (f.date === mmdd) out.push(Object.assign({}, f, { lunar: false, custom: false }));
    const lf = LUNAR_FESTIVAL_TABLE[dateStr];
    if (lf) out.push(Object.assign({}, lf, { date: mmdd, lunar: true, custom: false }));
    for (const f of (data.festivals || [])) {
      if (f.lunar) {
        // 农历自定义: 需查映射表 (lunar:[月,日] 匹配)
        for (const [k, v] of Object.entries(LUNAR_FESTIVAL_TABLE)) {
          if (k === dateStr && v.lunar[0] === f.lunar[0] && v.lunar[1] === f.lunar[1]) {
            out.push(Object.assign({}, f, { name: f.name, lunar: true, custom: true }));
            break;
          }
        }
      } else if (f.date === mmdd) {
        out.push(Object.assign({}, f, { lunar: false, custom: true }));
      }
    }
    return out;
  }

  // 最近一次的节日 (含未来 30 天预告)
  function upcomingFestivals(data, days = 30) {
    const res = [];
    const today = todayStr();
    for (let i = 0; i <= days; i++) {
      const ds = addDays(today, i);
      const fs = getDayFestivals(data, ds);
      fs.forEach(f => res.push(Object.assign({ date: ds, inDays: i }, f)));
    }
    return res.slice(0, 8);
  }

  function countdownDaysLeft(data, cd) {
    return daysBetween(todayStr(), cd.target);
  }

  // ── 经期加密 (AES-GCM, 密钥仅存本机) ──
  let _cryptoKey = null;
  async function getPeriodKey() {
    if (_cryptoKey) return _cryptoKey;
    try {
      const jwk = JSON.parse(localStorage.getItem('period_key') || 'null');
      if (jwk) { _cryptoKey = await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); return _cryptoKey; }
    } catch (e) { /* 重建 */ }
    _cryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const jwk = await crypto.subtle.exportKey('jwk', _cryptoKey);
    localStorage.setItem('period_key', JSON.stringify(jwk));
    return _cryptoKey;
  }
  function hasPeriodKey() { return !!localStorage.getItem('period_key'); }

  async function encPeriod(period) {
    // 加密 history 数组 → base64(iv + ct)
    const key = await getPeriodKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const pt = new TextEncoder().encode(JSON.stringify(period.history || []));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
    const buf = new Uint8Array([...iv, ...new Uint8Array(ct)]);
    let bin = '';
    buf.forEach(b => bin += String.fromCharCode(b));
    return { enc: btoa(bin) };
  }
  async function decPeriod(period) {
    if (!period.enc || !(await hasPeriodKey() || _cryptoKey)) return period.history || [];
    try {
      const key = await getPeriodKey();
      const bin = atob(period.enc);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      const iv = bytes.slice(0, 12);
      const ct = bytes.slice(12);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { return []; }
  }

  // ── 便捷操作 (均自动保存) ──
  async function setTask(task, setter) {
    const data = await load();
    const ds = todayStr();
    data.days = data.days || {};
    data.days[ds] = data.days[ds] || {};
    data.days[ds].task = String(task).trim().slice(0, 100);
    data.days[ds].setter = setter === 'b' ? 'b' : 'a';
    data.days[ds].done = !!data.days[ds].done;
    await save(data);
    return data;
  }

  async function checkTask(doneBy, note) {
    const data = await load();
    const ds = todayStr();
    data.days = data.days || {};
    const entry = data.days[ds] = data.days[ds] || {};
    if (!entry.task) throw new Error('今天还没有约定');
    if (entry.done) throw new Error('今天已经完成啦');
    entry.done = true;
    entry.done_by = doneBy === 'b' ? 'b' : 'a';
    entry.note = String(note || '').trim().slice(0, 200);
    let now = new Date();
    entry.done_at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const zz = data.zhengzi || (data.zhengzi = { count: 0, gifts_small: 0, gifts_big: 0, love_marks: 0 });
    zz.count = (zz.count || 0) + 1;
    let milestone = null;
    if (zz.count % 5 === 0) { zz.gifts_small = (zz.gifts_small || 0) + 1; milestone = 'small'; }
    if (zz.count % 25 === 0) { zz.gifts_big = (zz.gifts_big || 0) + 1; zz.love_marks = (zz.love_marks || 0) + 1; milestone = 'big'; }
    zz.last_milestone = milestone;
    await save(data);
    return { data, milestone };
  }

  async function uncheckTask() {
    const data = await load();
    const entry = (data.days || {})[todayStr()];
    if (entry && entry.done) {
      entry.done = false; entry.done_by = null; entry.done_at = null; entry.note = '';
      const zz = data.zhengzi;
      if (zz && zz.count > 0) zz.count -= 1;
      await save(data);
    }
    return data;
  }

  async function setNames(na, nb) {
    const data = await load();
    if (!na || !nb) throw new Error('两个名字都不能为空');
    data.names = { a: na, b: nb };
    await save(data);
    return data;
  }

  // 习惯打卡
  async function toggleHabit(id, ds) {
    const data = await load();
    const h = (data.habits || []).find(x => x.id === id);
    if (!h) throw new Error('习惯不存在');
    h.marks = h.marks || [];
    const i = h.marks.indexOf(ds);
    if (i >= 0) h.marks.splice(i, 1); else h.marks.push(ds);
    await save(data);
    return data;
  }
  async function addHabit(name, emoji, owner) {
    const data = await load();
    data.habits.push({ id: 'h' + Date.now().toString(36), name: String(name).trim().slice(0, 20),
      emoji: emoji || '🌱', owner: ['both', 'a', 'b'].includes(owner) ? owner : 'both', marks: [] });
    await save(data);
    return data;
  }
  async function removeHabit(id) {
    const data = await load();
    data.habits = (data.habits || []).filter(h => h.id !== id);
    await save(data);
    return data;
  }

  // 倒计时
  async function addCountdown(title, emoji, target, note) {
    const data = await load();
    data.countdowns.push({ id: 'c' + Date.now().toString(36), title: String(title).trim().slice(0, 30),
      emoji: emoji || '⏳', target, note: String(note || '').slice(0, 60) });
    await save(data);
    return data;
  }
  async function removeCountdown(id) {
    const data = await load();
    data.countdowns = (data.countdowns || []).filter(c => c.id !== id);
    await save(data);
    return data;
  }

  // 自定义节日
  async function addFestival(name, mmdd, emoji, lunar, anim, note) {
    const data = await load();
    data.festivals.push({ id: 'f' + Date.now().toString(36), name: String(name).trim().slice(0, 16),
      date: mmdd, emoji: emoji || '🌟', lunar: !!lunar, repeat: true,
      anim: anim === 'grand' ? 'grand' : 'light', note: String(note || '').slice(0, 50) });
    await save(data);
    return data;
  }
  async function removeFestival(id) {
    const data = await load();
    data.festivals = (data.festivals || []).filter(f => f.id !== id);
    await save(data);
    return data;
  }

  // 打一下
  async function poke(who) { // who = 'a' | 'b' (打的人)
    const data = await load();
    const ds = todayStr();
    const p = data.pokes;
    const other = who === 'a' ? 'b' : 'a';
    // 被拍者 total +1
    p[other] = p[other] || { total: 0, streak: 0, last: null };
    p[other].total = (p[other].total || 0) + 1;
    if (p[other].last !== ds) p[other].streak = (p[other].last === addDays(ds, -1)) ? (p[other].streak || 0) + 1 : 1;
    p[other].last = ds;
    p.history = p.history || {};
    const h = p.history[ds] = p.history[ds] || { a2b: 0, b2a: 0 };
    h[who === 'a' ? 'a2b' : 'b2a'] = (h[who === 'a' ? 'a2b' : 'b2a'] || 0) + 1;
    await save(data);
    return { data, total: p[other].total, streak: p[other].streak };
  }

  // 经期
  async function setPeriodEnabled(enabled) {
    const data = await load();
    data.period.enabled = enabled;
    if (enabled) {
      data.period.owner = data.period.owner || 'a';
      if (data.period.storage === 'sync') {
        const { enc } = await encPeriod(data.period);
        data.period.enc = enc;
      }
    }
    await save(data);
    return data;
  }
  async function setPeriodOption(key, val) {
    const data = await load();
    data.period[key] = val;
    if (key === 'storage' && val === 'sync') {
      const { enc } = await encPeriod(data.period);
      data.period.enc = enc;
    }
    if (key === 'storage' && val === 'local') { delete data.period.enc; }
    await save(data);
    return data;
  }
  async function togglePeriodDate(ds) {
    const data = await load();
    const h = await decPeriod(data.period);
    const i = h.indexOf(ds);
    if (i >= 0) h.splice(i, 1); else h.push(ds);
    data.period.history = h;
    if (data.period.storage === 'sync') {
      data.period.enabled = true;
      const { enc } = await encPeriod(data.period);
      data.period.enc = enc;
    }
    await save(data);
    return data;
  }
  function periodNextDate(period, history) {
    if (!period || !history || history.length === 0) return null;
    const sorted = history.slice().sort();
    const last = sorted[sorted.length - 1];
    const cycle = period.cycle || 28;
    return addDays(last, cycle);
  }

  async function setToken(t) {
    GITHUB.token = String(t || '').trim();
    _cache = null; _ghSha = null;
    if (GITHUB.token) { await load(); _localMode = false; return 'synced'; }
    return 'local';
  }

  function localMode() { return _localMode; }

  return {
    GITHUB, defaultData, load, save, migrate, fastLocal,
    todayStr, dkey, addDays, daysBetween,
    getStreak, getStats, getHistory,
    getDayFestivals, upcomingFestivals, countdownDaysLeft,
    getPeriodKey, hasPeriodKey, encPeriod, decPeriod,
    setTask, checkTask, uncheckTask, setNames,
    toggleHabit, addHabit, removeHabit,
    addCountdown, removeCountdown,
    addFestival, removeFestival,
    poke,
    setPeriodEnabled, setPeriodOption, togglePeriodDate, periodNextDate,
    setToken, localMode,
  };
})();
