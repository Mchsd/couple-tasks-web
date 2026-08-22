// 朝暮 DawnDusk — 数据层 V4 (双文件 GitHub + ETag 304 免费轮询 + 写队列 + 409 合并 + 身份系统)
// 接口签名与 V3 完全兼容 (app.js/calendar.js 零感知); 身份系统: device_id → members 绑定
'use strict';

const DATA = (() => {

  const GITHUB = {
    owner: 'Mchsd',
    repo: localStorage.getItem('couple_repo') || 'couple-tasks',   // 测试可覆盖
    files: { config: 'config.json', days: 'days.json' },
    get token() { return localStorage.getItem('couple_token') || ''; },
    set token(v) { localStorage.setItem('couple_token', v); },
  };

  let _cache = null;          // 合并后的完整数据 (config + days)
  let _meta = { config: { sha: null, etag: null }, days: { sha: null, etag: null } };
  let _localMode = false;
  let _syncTimer = null;
  let _polling = false;
  let _writeQueue = { pending: null, timer: null, lastPut: 0, flushing: false };
  const LOCAL_KEY = 'couple_tasks_local';
  const DEVICE_KEY = 'couple_device_id';

  // ── 默认数据 (V3 兼容) ──
  function defaultData() {
    return {
      names: { a: '宝宝', b: '宝贝' },
      days: {},
      used_redos: [],
      zhengzi: { count: 0, gifts_small: 0, gifts_big: 0, love_marks: 0, last_milestone: null },
      created_at: new Date().toISOString().slice(0, 19),
      festivals: [],
      countdowns: [],
      habits: [],
      period: { enabled: false, owner: 'a', storage: 'local', visible: 'me',
                cycle: 28, duration: 5, history: [] },
      pokes: { a: { total: 0, streak: 0, last: null }, b: { total: 0, streak: 0, last: null },
               history: {} },
    };
  }

  // ── 迁移 (补默认字段) ──
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

  // ── 身份系统 ──
  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }
  function members() { return (_cache || {}).members || {}; }
  function myRole() {
    const m = members();
    if (m.a && m.a.device_id === deviceId()) return 'a';
    if (m.b && m.b.device_id === deviceId()) return 'b';
    return null;
  }
  function isBound() { return myRole() !== null; }
  function isInviteOpen() { const m = members(); return !!m.invite_code; }

  async function createCouple(nick) {
    const data = await load(true);
    if (data.members && (data.members.a || data.members.b || data.members.invite_code === '') ) {
      const m = data.members || {};
      if (m.a || m.b) throw new Error('已有成员，请用邀请码加入');
    }
    data.members = data.members || {};
    data.members.a = { nick: String(nick).trim().slice(0, 12), device_id: deviceId(), joined_at: Date.now() };
    data.members.b = null;
    // 6 位邀请码 (去易混 0O1l)
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    data.members.invite_code = code;
    data.members.invite_expires = Date.now() + 30 * 60 * 1000;
    await save(data, true);
    return code;
  }

  async function joinCouple(code, nick) {
    const data = await load(true);
    const m = data.members || {};
    if (!m.invite_code) throw new Error('没有待加入的邀请');
    if (String(code).trim().toUpperCase() !== m.invite_code) throw new Error('邀请码不对');
    if (Date.now() > (m.invite_expires || 0)) throw new Error('邀请码已过期');
    if (m.b) throw new Error('情侣空间已满');
    m.b = { nick: String(nick).trim().slice(0, 12), device_id: deviceId(), joined_at: Date.now() };
    m.invite_code = null; m.invite_expires = null;
    await save(data, true);
    return data;
  }

  async function leaveCouple() {
    // 退出本设备绑定 (不删云端成员, 其他设备不受影响)
    const role = myRole();
    if (!role) return false;
    const data = await load(true);
    const m = data.members || {};
    if (m[role] && m[role].device_id === deviceId()) m[role] = null;
    await save(data, true);
    return true;
  }

  // ── GitHub API (带 etag 条件请求) ──
  async function ghApi(method, suffix, body, etag = null) {
    const opt = { method, headers: { 'Accept': 'application/vnd.github+json' } };
    if (GITHUB.token) opt.headers['Authorization'] = 'Bearer ' + GITHUB.token;
    if (etag) opt.headers['If-None-Match'] = etag;
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), method === 'GET' ? 4000 : 10000);
    try {
      const resp = await fetch(`https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}${suffix}`, Object.assign({}, opt, { signal: ctrl.signal }));
      const j = resp.status === 304 ? null : await resp.json().catch(() => null);
      return { status: resp.status, json: j, etag: resp.headers.get('etag'), ratelimit: resp.headers.get('x-ratelimit-remaining') };
    } catch (e) {
      throw new Error('net: ' + (e.name || e.message));
    } finally {
      clearTimeout(timer);
    }
  }

  // ── 单文件 GET (304 免费) ──
  async function fetchFile(key) {
    const path = GITHUB.files[key];
    const r = await ghApi('GET', '/contents/' + path, null, _meta[key].etag);
    if (r.status === 304) return 'unchanged';
    if (r.status === 200 && r.json && r.json.encoding === 'base64') {
      _meta[key].sha = r.json.sha;
      if (r.etag) _meta[key].etag = r.etag;
      const bytes = Uint8Array.from(atob(r.json.content.replace(/\n/g, '')), c => c.charCodeAt(0));
      const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      _meta[key].last = parsed;   // 供 304 时 load() 复用
      return parsed;
    }
    if (r.status === 404) return null;
    if (r.status === 403) throw new Error('rate: ' + (r.ratelimit || '?'));
    throw new Error('GitHub API ' + r.status);
  }

  // ── load: 合并两文件 ──
  async function load(force = false) {
    if (_cache && !force) return _cache;
    if (_cache && force) { _cache = null; }
    if (!GITHUB.token) { _cache = loadLocal(); _localMode = true; return _cache; }
    try {
      const [cfg, djs] = await Promise.all([fetchFile('config'), fetchFile('days')]);
      // 304 时复用内存中最近一次内容 (etag 已缓存但 _cache 被 force 清空 → 不能丢数据!)
      const cfgObj = (cfg === 'unchanged') ? (_meta.config.last || null) : cfg;
      const djsObj = (djs === 'unchanged') ? (_meta.days.last || null) : djs;
      if (cfgObj === null && djsObj === null) {
        // 全新仓库 → 初始化
        const d = defaultData();
        d.created_at = new Date().toISOString().slice(0, 19);
        _cache = migrate(d);
        _localMode = false;
        await save(_cache, true);
        return _cache;
      }
      if (cfgObj === null || djsObj === null) {
        // 半迁移/异常 → 回退本地
        _cache = loadLocal(); _localMode = true;
        return _cache;
      }
      const merged = migrate(cfgObj);
      // days.json 兼容两种格式: 裸 {"2026-08-22": {...}} 或 包装 {days: {...}} (V3 迁移产物)
      const rawDays = djsObj && (djsObj.days || djsObj);
      merged.days = rawDays || {};
      _cache = merged;
      _localMode = false;
      return _cache;
    } catch (e) {
      _cache = loadLocal();
      _localMode = true;
      return _cache;
    }
  }

  // ── save: 拆分两块 → 写队列 ──
  function splitData(data) {
    const d = Object.assign({}, data);
    const days = d.days || {};
    delete d.days;
    return { config: d, days };
  }

  async function save(data, force = false) {
    _cache = data;
    saveLocal(data);   // 本地镜像始终保留
    if (_localMode || !GITHUB.token) return { ok: true, local: true };
    if (!isBound() && !isInviteOpen()) {
      // 未绑定身份: 仅写本地 (创建/加入流程 force=true 不受限)
      if (!force) return { ok: true, local: true, unbound: true };
    }
    const { config, days } = splitData(data);
    _writeQueue.pending = { config, days };
    if (_writeQueue.timer) clearTimeout(_writeQueue.timer);
    _writeQueue.timer = setTimeout(() => flushWrite(), 500);
    return { ok: true, queued: true };
  }

  async function flushWrite() {
    const job = _writeQueue.pending;
    if (!job || _writeQueue.flushing) return;
    _writeQueue.pending = null;
    _writeQueue.flushing = true;
    try {
      // 最小间隔 3s
      const wait = Math.max(0, 3000 - (Date.now() - _writeQueue.lastPut));
      if (wait) await new Promise(r => setTimeout(r, wait));
      const r1 = await putFile('config', job.config);
      if (r1) {
        const r2 = await putFile('days', job.days);
        if (r2) _writeQueue.lastPut = Date.now();
      }
    } catch (e) {
      // 失败: 重新入队? 保留现场: 丢弃避免风暴, 由下次操作触发
      console.warn('[DATA] write failed', e);
    } finally {
      _writeQueue.flushing = false;
    }
  }

  async function putFile(key, data) {
    const path = GITHUB.files[key];
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const payload = { message: 'update ' + path, content };
    if (_meta[key].sha) payload.sha = _meta[key].sha;
    let r = await ghApi('PUT', '/contents/' + path, payload);
    if (r.status === 409) {
      // 冲突: 拉最新 + 按域合并 + 重试一次
      try {
        const latest = await fetchFile(key);
        if (latest && latest !== 'unchanged') {
          const merged = mergeByDomain(key, data, latest);
          payload.content = btoa(unescape(encodeURIComponent(JSON.stringify(merged, null, 2))));
          payload.sha = _meta[key].sha;
          r = await ghApi('PUT', '/contents/' + path, payload);
        }
      } catch (e) { /* 合并失败 → 保持原样重试 */ }
    }
    if (r.status === 200 || r.status === 201) {
      _meta[key].sha = r.json.content.sha;
      if (r.etag) _meta[key].etag = r.etag;
      // days 更新后, _cache.days 同步 (config 由调用方已持新对象)
      return true;
    }
    if (r.status === 403) throw new Error('限流, 稍后自动重试');
    throw new Error('GitHub 写入失败 ' + r.status);
  }

  // ── 409 按域合并: local=我方变更, remote=云端最新 ──
  // ⚠️ days 的 local 是裸 days 对象 (putFile 传 splitData 后的 job.days), 不是 {days:{...}} 结构
  function mergeByDomain(key, local, remote) {
    if (key !== 'config') {
      const l = local.days || local;   // 兼容两种入参结构
      const merged = Object.assign({}, remote.days || {}, l || {});
      // remote 中本地没有的日期也要保留 (上面的 assign 已覆盖: remote 先, local 后 → 同键 local 优先)
      return { days: merged };
    }
    const out = Object.assign({}, remote, local);
    // 数组按 id 合并
    for (const k of ['festivals', 'countdowns', 'habits']) {
      const l = local[k] || [], r = remote[k] || [];
      const byId = new Map();
      r.forEach(x => byId.set(x.id, x));
      l.forEach(x => byId.set(x.id, x));   // local 优先
      out[k] = Array.from(byId.values());
    }
    // pokes: history 按日合并 + total/streak 取 max
    if (local.pokes || remote.pokes) {
      const lp = local.pokes || {}, rp = remote.pokes || {};
      const hist = Object.assign({}, rp.history || {}, lp.history || {});
      const mk = (p, o) => ({ total: Math.max((p||{}).total||0, (o||{}).total||0),
                              streak: Math.max((p||{}).streak||0, (o||{}).streak||0),
                              last: (p||{}).last || (o||{}).last || null });
      out.pokes = { a: mk(lp.a, rp.a), b: mk(lp.b, rp.b), history: hist };
    }
    // zhengzi.count 取 max (单调递增)
    if (local.zhengzi || remote.zhengzi) {
      const lz = local.zhengzi || {}, rz = remote.zhengzi || {};
      out.zhengzi = Object.assign({}, rz, lz);
      out.zhengzi.count = Math.max(lz.count || 0, rz.count || 0);
      out.zhengzi.gifts_small = Math.max(lz.gifts_small || 0, rz.gifts_small || 0);
      out.zhengzi.gifts_big = Math.max(lz.gifts_big || 0, rz.gifts_big || 0);
      out.zhengzi.love_marks = Math.max(lz.love_marks || 0, rz.love_marks || 0);
    }
    // members: 仅当本地没有而 remote 有 → 用 remote (避免本地半状态覆盖)
    if (remote.members && !local.members) out.members = remote.members;
    return out;
  }

  // ── ETag 轮询 (304 免费): 8s, 仅页面可见时; 200+304 混合 ≈900 req/h << 5000 限额 ──
  function startSync(interval = 8000) {
    if (_syncTimer) return;
    _syncTimer = setInterval(async () => {
      if (document.hidden || _polling || !GITHUB.token || _localMode) return;
      _polling = true;
      try {
        const changed = await pollOnce();
        if (changed && typeof window !== 'undefined' && window.__onRemoteChange) {
          window.__onRemoteChange();
        }
      } catch (e) { /* 静默 */ }
      _polling = false;
    }, interval);
  }
  function stopSync() { if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; } }

  async function pollOnce() {
    let changed = false;
    // config 有变化: 更新 _cache 并合并云端 days (用 _cache 已有的, 随后单独拉 days)
    for (const key of ['config', 'days']) {
      try {
        const r = await fetchFile(key);
        if (r === 'unchanged' || r === null) continue;
        if (key === 'config') {
          const latest = migrate(r);
          _cache = Object.assign({}, latest, { days: (_cache && _cache.days) || {} });
          // config 变化很可能伴随 days 变化, 下一次循环会拉 days; 但为了同步性再拉一次
          try {
            const djs = await fetchFile('days');
            if (djs && djs !== 'unchanged') _cache.days = (djs.days || djs || {});
          } catch (e) {}
        } else {
          const raw = (r.days || r || {});
          if (_cache) _cache.days = raw;
          else _cache = migrate(Object.assign(defaultData(), { days: raw }));
        }
        changed = true;
      } catch (e) {
        if (e.message && e.message.startsWith('rate:')) console.warn('[DATA] rate limited, backoff');
      }
    }
    return changed;
  }

  // ── 日期工具 (V3 原样) ──
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
  function daysBetween(a, b) {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
  }

  // ── 业务函数 (V3 原样) ──
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

  function getDayFestivals(data, dateStr) {
    if (!data) data = _cache || defaultData();
    const mmdd = dateStr.slice(5);
    const out = [];
    for (const f of SOLAR_FESTIVALS) if (f.date === mmdd) out.push(Object.assign({}, f, { lunar: false, custom: false }));
    const lf = LUNAR_FESTIVAL_TABLE[dateStr];
    if (lf) out.push(Object.assign({}, lf, { date: mmdd, lunar: true, custom: false }));
    for (const f of (data.festivals || [])) {
      if (f.lunar) {
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

  // ── 经期加密 (V3 原样) ──
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

  // ── 便捷操作 (V3 原样, 均自动保存) ──
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

  async function poke(who) {
    const data = await load();
    const ds = todayStr();
    const p = data.pokes;
    const other = who === 'a' ? 'b' : 'a';
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

  async function setPeriodEnabled(enabled) {
    const data = await load();
    data.period.enabled = enabled;
    if (enabled && data.period.storage === 'sync') {
      const { enc } = await encPeriod(data.period);
      data.period.enc = enc;
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
    _cache = null; _meta = { config: { sha: null, etag: null }, days: { sha: null, etag: null } };
    _localMode = false;
    if (GITHUB.token) { await load(); return 'synced'; }
    return 'local';
  }

  function localMode() { return _localMode; }
  function fastLocal() { return loadLocal(); }

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
    // V4 新增
    deviceId, myRole, isBound, isInviteOpen, members,
    createCouple, joinCouple, leaveCouple,
    startSync, stopSync,
  };
})();
