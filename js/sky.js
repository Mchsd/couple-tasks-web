// 朝暮 DawnDusk — 四时天空层 (时间驱动背景 + 水墨山水 + 粒子特效)
'use strict';

// ── 时段定义: 按真实时间切换天空 ──
// phase: 决定天空渐变 + 主题变量(data-phase) + 粒子类型
// angle: 渐变方向(度); sky: [顶色, 中色, 底色]; hint: 主题变量集 (indigo/pink 供 UI)
const SKY_PHASES = [
  // 深夜 keep: 夜(21-24, 0-5)
  { id: 'night',   start: 21, end: 29, sky: ['#141a30', '#1b2340', '#252d4d'],
    sun:  null, moon: true, particles: 'stars', mist: 0.15, label: '夜半星河' },
  { id: 'dawn',    start: 5,  end: 7,  sky: ['#3a3450', '#6d5470', '#c98a83'],
    sun:  null, moon: true, particles: 'sparks', mist: 0.5, label: '晨曦微光',
    dawn: true },
  { id: 'morning', start: 7,  end: 11, sky: ['#a8c4c9', '#cfdcd8', '#e9ddc4'],
    sun:  'rise', moon: false, particles: 'petals', mist: 0.35, label: '晨光熹微' },
  { id: 'noon',    start: 11, end: 14, sky: ['#9ec4d4', '#c2dbe2', '#e6e3ce'],
    sun:  'noon', moon: false, particles: 'petals', mist: 0.2, label: '天青日暖' },
  { id: 'afternoon', start: 14, end: 17, sky: ['#a4b6c4', '#d8cdb4', '#e8d3a6'],
    sun:  'set', moon: false, particles: 'petals', mist: 0.25, label: '午后鎏金' },
  { id: 'dusk',    start: 17, end: 19, sky: ['#4a3a68', '#9e6a7e', '#e8a87c'],
    sun:  'set', moon: false, particles: 'sparks', mist: 0.4, label: '暮色四合' },
  { id: 'nightfall', start: 19, end: 21, sky: ['#232a48', '#3b3458', '#7e5a72'],
    sun:  null, moon: true, particles: 'fireflies', mist: 0.3, label: '月上柳梢' },
];

const SKY = (() => {

  let canvas, ctx, W, H, dpr = 1;
  let phase = null;          // 当前时段对象
  let _lastPhaseCheck = -1;
  let _prevSky = null;       // 上一时段渐变 (缓慢插值用)
  let _phaseStart = 0;       // 时段切换时间戳
  const FADE_DUR = 180000;   // 天空过渡时长 180s (缓慢变化)
  let stars = [];            // 预生成星星
  let particles = [];
  let clouds = [];
  let birds = [];            // 飞鸟
  const SEAL_CHARS = { dawn: '晨', morning: '昼', noon: '午', afternoon: '暮', dusk: '昏', nightfall: '夜', night: '夜' };
  let reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let perfCap = 1;           // 性能降级系数 (0.5/1)

  // 允许测试注入时间 (mock): ?ts=MM-DD-HH 仅开发用
  function nowHour() {
    const m = (location.search.match(/[?&]ts=(\d{1,2})/) || [])[1];
    if (m !== undefined) return Number(m);
    return new Date().getHours();
  }

  function getPhase(hour) {
    for (const p of SKY_PHASES) {
      if (p.start <= hour && hour < p.end) return p;
    }
    // 24-29 映射 night (21-29 已覆盖 24-29 因为 start=21 end=29)
    return SKY_PHASES[0];
  }

  // 渐变颜色插值 (hex → hex, t 0-1)
  function lerpColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ar = pa >> 16, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = pb >> 16, bg = (pb >> 8) & 255, bb = pb & 255;
    const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function init() {
    canvas = document.createElement('canvas');
    canvas.id = 'skyCanvas';
    canvas.className = 'sky-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    resize();
    window.addEventListener('resize', resize);
    // 预生成星星
    for (let i = 0; i < 110; i++) {
      stars.push({ x: Math.random(), y: Math.random() * 0.75, r: 0.5 + Math.random() * 1.4,
        tw: Math.random() * Math.PI * 2, sp: 0.3 + Math.random() * 0.9, alpha: 0.4 + Math.random() * 0.6 });
    }
    // 预生成云
    for (let i = 0; i < 3; i++) {
      clouds.push({ x: Math.random(), y: 0.08 + Math.random() * 0.22, w: 0.3 + Math.random() * 0.3,
        alpha: 0.25, sp: 0.0012 + Math.random() * 0.0018, a: Math.random() });
    }
    // 性能自适应: 缩小逻辑分辨率 (低端设备)
    updatePerfCap();
    tickPhase();   // 立即设置时段/主题 (不等首帧)
    if (!reduced) loop();
    else renderStatic();
  }

  function updatePerfCap() {
    try {
      const nav = navigator;
      const mem = nav.deviceMemory || 4;
      const cores = nav.hardwareConcurrency || 4;
      perfCap = (mem <= 2 || cores <= 2) ? 0.5 : 1;
    } catch (e) { perfCap = 0.5; }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 每 5 分钟检查时段切换
  function tickPhase() {
    const now = Math.floor(Date.now() / 300000);
    if (now === _lastPhaseCheck && phase) return;
    _lastPhaseCheck = now;
    const h = nowHour();
    const p = getPhase(h);
    if (p !== phase) {
      if (phase && phase.id !== p.id) { _prevSky = phase.sky; _phaseStart = Date.now(); }
      phase = p;
      document.body.dataset.phase = p.id;
      initParticles();
      // 时段印章 + 主题色联动 (单字方印)
      const seal = document.getElementById('eraSeal');
      if (seal) seal.textContent = SEAL_CHARS[p.id] || p.label;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        const tint = (p.id === 'night' || p.id === 'nightfall' || p.id === 'dusk') ? '#1a1f2e' : '#e9ddc4';
        meta.content = tint;
      }
    }
    // 当日节气提示 (印章下方)
    try {
      const jieqi = (typeof JIEQI_TABLE !== 'undefined') ? JIEQI_TABLE[todayStr()] : null;
      const sealSub = document.getElementById('eraSealSub');
      if (sealSub) {
        const label = jieqi ? (jieqi + ' · ' + (JIEQI_SEASON[jieqi] || '') + '始') : '';
        if (sealSub.textContent !== label) sealSub.textContent = label;
      }
    } catch (e) { /* config 未加载时静默 */ }
  }

  function initParticles() {
    const type = phase ? phase.particles : 'stars';
    particles = [];
    const n = Math.round((type === 'stars' || type === 'fireflies' ? 34 : 22) * perfCap);
    for (let i = 0; i < n; i++) {
      particles.push(makeParticle(type));
    }
  }

  function makeParticle(type) {
    const base = { type, x: Math.random(), y: Math.random(), vx: 0, vy: 0, r: 1 + Math.random() * 2.2,
      rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.008, ph: Math.random() * Math.PI * 2 };
    if (type === 'petals') { base.emoji = '🌸'; base.s = 8 + Math.random() * 8; base.vy = 0.1 + Math.random() * 0.18; base.vx = (Math.random() - 0.5) * 0.16; }
    if (type === 'fireflies') { base.emoji = '✨'; base.s = 3 + Math.random() * 4; base.vy = (Math.random() - 0.5) * 0.07; base.vx = (Math.random() - 0.5) * 0.07; }
    if (type === 'sparks') { base.emoji = '✦'; base.s = 2 + Math.random() * 3; base.vy = -(0.04 + Math.random() * 0.1); base.vx = (Math.random() - 0.5) * 0.07; }
    if (type === 'stars') { base.s = 1 + Math.random() * 2; base.tw = Math.random() * Math.PI * 2; }
    return base;
  }

  // 天空渐变 (时段切换: 180s 缓慢插值过渡, 从上一时段的颜色渐变为当前时段)
  function drawSky(dt) {
    let c0 = phase.sky[0], c1 = phase.sky[1], c2 = phase.sky[2];
    if (_prevSky) {
      const t = Math.min(1, (Date.now() - _phaseStart) / FADE_DUR);
      const e = t * t * (3 - 2 * t);   // smoothstep
      c0 = lerpColor(_prevSky[0], phase.sky[0], e);
      c1 = lerpColor(_prevSky[1], phase.sky[1], e);
      c2 = lerpColor(_prevSky[2], phase.sky[2], e);
      if (t >= 1) _prevSky = null;
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c0);
    g.addColorStop(0.55, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 薄雾 (底部飘动)
    if (phase.mist > 0) {
      const mistG = ctx.createLinearGradient(0, H * 0.72, 0, H);
      mistG.addColorStop(0, 'rgba(255,255,255,0)');
      mistG.addColorStop(1, `rgba(255,255,255,${0.16 * phase.mist})`);
      ctx.fillStyle = mistG;
      ctx.fillRect(0, H * 0.72, W, H * 0.28);
    }

    // 太阳/月亮 (含月相)
    drawSunMoon(dt);
    // 云
    drawClouds(dt);
    // 远山 (2-3 层剪影, 缓慢漂移)
    drawMountains(dt);
    // 水墨装饰: 松树/飞鸟/竹枝
    drawDecors(dt);
  }

  // ── 水墨装饰层: 中景松树 + 飞鸟雁阵 + 竹枝 (文人画意) ──
  function drawDecors(dt) {
    const night = phase.id === 'night' || phase.id === 'nightfall' || phase.id === 'dusk';
    const ink = night ? 'rgba(14,20,40,0.72)' : 'rgba(44,50,62,0.6)';
    const inkLight = night ? 'rgba(24,32,56,0.5)' : 'rgba(76,84,96,0.38)';
    // 1) 松树 (中景, 右侧, 静态浓墨)
    drawPine(W * 0.86, H * 0.955, H * 0.13, inkLight);
    // 2) 飞鸟 (白天时段远处缓慢掠过)
    if (!night) updateBirds(dt);
    // 3) 竹枝 (左下边缘, 风摆, 浓墨)
    drawBamboo(ink, dt);
  }

  function drawPine(x, baseY, h, color) {
    // 松树: 倾斜主干 + 顶部伞状叶簇 (文人松, 每帧重画, 纯静态)
    const lean = -6;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = h * 0.05;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + lean, baseY - h * 0.6, x + lean * 2.2, baseY - h);
    ctx.stroke();
    // 叶簇: 3-4 层水平扇形
    for (let i = 0; i < 4; i++) {
      const t = 0.25 + i * 0.2;
      const cy = baseY - h * t;
      const cx = x + lean * (t * 2.2 + 0.3);
      const rw = h * (0.34 - i * 0.05);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rw * 0.38, -0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function updateBirds(dt) {
    // 每 30-60s 生成一群鸟
    if (birds.length === 0 && Math.random() < 0.012) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const n = 3 + Math.floor(Math.random() * 3);
      const y0 = H * (0.12 + Math.random() * 0.2);
      for (let i = 0; i < n; i++) {
        birds.push({ x: dir > 0 ? -0.1 : 1.1, y: y0 + (Math.random() - 0.5) * 26 - i * 5,
          s: 7 + Math.random() * 4, dir, ph: Math.random() * Math.PI * 2 });
      }
    }
    for (const b of birds) {
      b.x += b.dir * 0.00022 * dt;   // 极慢飞过
      b.ph += 0.02;
      // 双弧翅膀
      const fl = Math.sin(b.ph * 1.4) * b.s * 0.35;
      ctx.strokeStyle = 'rgba(60,64,76,0.55)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x * W - b.s * b.dir, b.y);
      ctx.quadraticCurveTo(b.x * W - b.s * b.dir * 0.4, b.y + fl * 0.4, b.x * W, b.y);
      ctx.quadraticCurveTo(b.x * W + b.s * b.dir * 0.4, b.y + fl * 0.4, b.x * W + b.s * b.dir, b.y);
      ctx.stroke();
    }
    birds = birds.filter(b => b.x > -0.15 && b.x < 1.15);
  }

  function drawBamboo(ink, dt) {
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = 'round';
    // 主干: 左下边缘向上弯曲 (更靠边, 露出于内容间隙)
    ctx.lineWidth = Math.max(2.5, W * 0.007);
    const bx = W * 0.035;
    ctx.beginPath();
    ctx.moveTo(bx, H * 1.02);
    ctx.quadraticCurveTo(bx + W * 0.013, H * 0.82, bx + W * 0.03, H * 0.6);
    ctx.stroke();
    // 竹节
    for (let i = 0; i < 3; i++) {
      const yy = H * (0.9 - i * 0.1);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx + W * (0.004 + i * 0.002), yy);
      ctx.lineTo(bx + W * (0.013 + i * 0.005), yy + 3);
      ctx.stroke();
    }
    // 竹叶 (3簇, 风摆)
    ctx.lineWidth = 1.8;
    const sway = Math.sin(Date.now() * 0.0005) * 0.12 + Math.sin(Date.now() * 0.00023) * 0.08;
    const clusters = [
      { x: bx + W * 0.028, y: H * 0.62, a: -0.9, n: 4 },
      { x: bx + W * 0.02, y: H * 0.72, a: -2.2, n: 3 },
      { x: bx + W * 0.009, y: H * 0.85, a: -1.4, n: 3 },
    ];
    for (const c of clusters) {
      for (let i = 0; i < c.n; i++) {
        const ang = c.a + (i - c.n / 2) * 0.35 + sway;
        const len = 16 + (i % 2) * 7;
        const ex = c.x + Math.cos(ang) * len;
        const ey = c.y + Math.sin(ang) * len;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.quadraticCurveTo((c.x + ex) / 2, (c.y + ey) / 2 - 6, ex, ey);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawSunMoon(dt) {
    const t = new Date();
    const h = nowHour();
    // 太阳: 日出(5-7)从东升 日中(11-14)高空 落(14-19)西沉
    if (phase.sun) {
      const cx = W * 0.7, cy = H * 0.22;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 130);
      glow.addColorStop(0, 'rgba(255,236,190,0.85)');
      glow.addColorStop(0.35, 'rgba(255,220,160,0.28)');
      glow.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 130, cy - 130, 260, 260);
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#fff3d6';
      ctx.fill();
    }
    // 月亮 + 月晕 + 月相 (8 档, 近似算法: 2000-01-06 新月为基准, 29.53 天周期)
    if (phase.moon) {
      const mx = W * 0.78, my = H * 0.16, R = 20;
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
      glow.addColorStop(0, 'rgba(240,240,255,0.5)');
      glow.addColorStop(1, 'rgba(240,240,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(mx - 90, my - 90, 180, 180);
      const jd = (Date.now() / 86400000) + 2440587.5;
      const lp = ((jd - 2451550.1) / 29.53058867) % 1;
      const t2 = (lp < 0 ? lp + 1 : lp);
      const phaseIdx = Math.round(t2 * 8) % 8;   // 0 新月 → 4 满月 → 7 残月
      const LIT = '#f4f2ea', DARK = 'rgba(22,26,46,0.88)';
      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = LIT;
      ctx.fillRect(mx - R, my - R, R * 2, R * 2);
      switch (phaseIdx) {
        case 0: // 新月: 几乎全暗
          ctx.fillStyle = DARK; ctx.fillRect(mx - R, my - R, R * 2, R * 2);
          ctx.fillStyle = LIT;
          ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = DARK;
          ctx.beginPath(); ctx.ellipse(mx + R * 0.88, my, R, R, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 1: // 蛾眉月 (右)
          ctx.fillStyle = DARK; ctx.fillRect(mx - R, my - R, R * 2, R * 2);
          ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fillStyle = LIT; ctx.fill();
          ctx.beginPath(); ctx.ellipse(mx - R * 0.72, my, R, R, 0, 0, Math.PI * 2); ctx.fillStyle = DARK; ctx.fill();
          break;
        case 2: // 上弦月 (右半亮)
          ctx.fillStyle = DARK; ctx.fillRect(mx - R, my - R, R * 2, R * 2);
          ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fillStyle = LIT; ctx.fill();
          ctx.beginPath(); ctx.ellipse(mx - R * 0.05, my, R * 0.1, R, 0, 0, Math.PI * 2); ctx.fillStyle = DARK; ctx.fill();
          break;
        case 3: // 盈凸月 (右大半)
          ctx.fillStyle = DARK;
          ctx.beginPath(); ctx.ellipse(mx - R * 0.9, my, R * 0.5, R, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 4: // 满月
          break;
        case 5: // 亏凸月 (左大半)
          ctx.fillStyle = DARK;
          ctx.beginPath(); ctx.ellipse(mx + R * 0.9, my, R * 0.5, R, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 6: // 下弦月 (左半亮)
          ctx.fillStyle = DARK; ctx.fillRect(mx - R, my - R, R * 2, R * 2);
          ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fillStyle = LIT; ctx.fill();
          ctx.beginPath(); ctx.ellipse(mx + R * 0.05, my, R * 0.1, R, 0, 0, Math.PI * 2); ctx.fillStyle = DARK; ctx.fill();
          break;
        case 7: // 残月 (左)
          ctx.fillStyle = DARK; ctx.fillRect(mx - R, my - R, R * 2, R * 2);
          ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fillStyle = LIT; ctx.fill();
          ctx.beginPath(); ctx.ellipse(mx + R * 0.72, my, R, R, 0, 0, Math.PI * 2); ctx.fillStyle = DARK; ctx.fill();
          break;
      }
      ctx.restore();
      // 月面阴影点缀
      ctx.beginPath();
      ctx.arc(mx - 6, my - 3, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180,175,160,0.4)';
      ctx.fill();
    }
  }

  function drawClouds(dt) {
    ctx.save();
    for (const c of clouds) {
      c.x += c.sp * dt * 0.016;
      if (c.x > 1.35) c.x = -0.35;
      const w = c.w * W, x = c.x * W - w / 2, y = c.y * H;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, w / 2);
      cg.addColorStop(0, `rgba(255,255,255,${c.alpha})`);
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, w / 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMountains(dt) {
    // 三层远山, 颜色按时段 (日间淡墨, 夜间黛蓝)
    const night = phase.id === 'night' || phase.id === 'nightfall';
    const layers = [
      { y: H * 0.62, amp: H * 0.06, color: night ? '#1c2340' : '#8a97a3', alpha: 0.35, speed: 0.001, seed: 7 },
      { y: H * 0.74, amp: H * 0.08, color: night ? '#161c34' : '#6f7d8a', alpha: 0.5, speed: 0.002, seed: 23 },
      { y: H * 0.88, amp: H * 0.09, color: night ? '#10152a' : '#55616d', alpha: 0.72, speed: 0.003, seed: 41 },
    ];
    const tOff = (Date.now() * 0.000004);   // 漂移速度大幅放慢
    for (const L of layers) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, L.y);
      const seg = 26;
      for (let i = 0; i <= seg; i++) {
        const x = (i / seg) * W;
        const y = L.y - Math.abs(Math.sin(i * 0.55 + L.seed + tOff * 10 / L.speed)) * L.amp * (0.5 + 0.5 * Math.sin(i * 0.3 + L.seed));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = L.color;
      ctx.globalAlpha = L.alpha;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(dt) {
    for (const p of particles) {
      p.ph += 0.03;
      if (p.type === 'petals') {
        p.x += p.vx * 0.004 * dt; p.y += p.vy * 0.004 * dt;
        p.rot += p.vr * 0.03 * dt;
        if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); }
        if (p.x > 1.05) p.x = -0.05;
        ctx.save();
        ctx.translate(p.x * W, p.y * H);
        ctx.rotate(p.rot);
        ctx.globalAlpha = 0.75;
        ctx.font = `${p.s}px serif`;
        ctx.fillText('🌸', 0, 0);
      } else if (p.type === 'fireflies') {
        p.x += Math.sin(p.ph) * 0.0009;
        p.y += p.vy * 0.002 * dt;
        if (p.y > 1.02 || p.y < 0.2) { p.y = 0.4 + Math.random() * 0.4; p.x = Math.random(); }
        const a = 0.35 + 0.6 * Math.abs(Math.sin(p.ph * 1.7));
        ctx.globalAlpha = a;
        ctx.font = `${p.s}px serif`;
        ctx.fillText('✦', p.x * W, p.y * H);
      } else if (p.type === 'sparks') {
        p.y += p.vy * 0.002 * dt; p.x += Math.sin(p.ph) * 0.0006;
        ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(p.ph * 2));
        ctx.font = `${p.s}px serif`;
        ctx.fillText('✦', p.x * W, p.y * H);
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      } else { // stars (画在固定星层, 这里只处理闪)
        const s = stars[Math.floor(p.ph * 13) % stars.length];
        if (s) {
          const tw = (Math.sin(p.ph * 2 + s.tw) + 1) / 2;
          ctx.globalAlpha = tw * 0.9;
          ctx.beginPath();
          ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawStars(dt) {
    if (!(phase && (phase.particles === 'stars' || phase.particles === 'fireflies'))) return;
    for (const s of stars) {
      const tw = (Math.sin(Date.now() * 0.001 * s.sp + s.tw) + 1) / 2;
      ctx.globalAlpha = s.alpha * (0.3 + 0.7 * tw);
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    const dt = 16;
    tickPhase();
    drawSky(dt);
    drawStars(dt);
    drawParticles(dt);
    raf = requestAnimationFrame(loop);
  }

  function renderStatic() {
    tickPhase();
    drawSky(16);
    drawStars(16);
    drawParticles(16);
  }

  return { init, getPhase, nowHour };
})();

window.addEventListener('DOMContentLoaded', () => SKY.init());
