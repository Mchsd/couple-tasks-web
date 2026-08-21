// 朝暮 DawnDusk — 动画系统 (庆祝 / 节日 / 打一下 / 音效)
'use strict';

const ANIM = (() => {

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 通用粒子飘落 (彩带雨) ──
  function confetti(count = 80, emojis = ['🎉', '✨', '💖', '🎊', '🌸'], duration = 2800) {
    if (reduced) return;
    const layer = document.getElementById('fxLayer');
    if (!layer) return;
    addFxLayerHTML();
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'fx-confetti';
      el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      el.style.left = Math.random() * 100 + 'vw';
      el.style.animationDelay = Math.random() * 0.9 + 's';
      el.style.fontSize = (14 + Math.random() * 20) + 'px';
      el.style.setProperty('--drift', (Math.random() * 200 - 100) + 'px');
      layer.appendChild(el);
    }
    setTimeout(() => { layer.innerHTML = ''; }, duration + 1200);
  }

  // ── 烟花 (canvas 简化: 多点爆裂) ──
  function fireworks() {
    if (reduced) return;
    const layer = document.getElementById('fxLayer');
    if (!layer) return;
    addFxLayerHTML();
    const colors = ['#ff6b9d', '#c26bff', '#ffd166', '#7ec9a0', '#8fb3ff'];
    const bursts = 7;
    for (let b = 0; b < bursts; b++) {
      setTimeout(() => {
        const x = 10 + Math.random() * 80, y = 15 + Math.random() * 40;
        const color = colors[Math.floor(Math.random() * colors.length)];
        for (let i = 0; i < 18; i++) {
          const dot = document.createElement('div');
          dot.className = 'fx-spark';
          dot.style.left = x + 'vw';
          dot.style.top = y + 'vh';
          dot.style.background = color;
          const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
          const dist = 40 + Math.random() * 70;
          dot.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
          dot.style.setProperty('--dy', Math.sin(ang) * dist - 40 + 'px');
          layer.appendChild(dot);
          setTimeout(() => dot.remove(), 1400);
        }
      }, b * 380);
    }
  }

  // ── 节日动画: 按强度 ──
  function festivalCelebrate(fest) {
    const lv = (fest.anim || 'light') === 'grand' ? 'grand' : 'light';
    const emoji = fest.emoji || '⭐';
    if (lv === 'grand') {
      confetti(140, [emoji, '🎉', '💖', '✨', '🎊', '💘']);
      fireworks();
      toast(`🎊 ${fest.name}快乐！${DATA ? '' : ''}朝朝暮暮都要爱你`);
    } else {
      confetti(60, [emoji, '✨', '💗']);
      toast(`🎐 今天是 ${fest.name}`);
    }
  }

  // ── 打一下动画 ──
  function pokeAnim(targetEl) {
    if (reduced) return;
    addFxLayerHTML();
    // 1. 屏幕微震
    if (navigator.vibrate) { try { navigator.vibrate([40, 30, 60]); } catch (e) {} }
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 420);
    // 2. 按钮处爆裂
    const rect = targetEl ? targetEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2 };
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const emojis = POKE_EMOJIS;
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('div');
      el.className = 'fx-poke';
      el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      const ang = Math.PI * 2 * i / 14 + Math.random() * 0.5;
      const d = 60 + Math.random() * 80;
      el.style.left = cx + 'px';
      el.style.top = cy + 'px';
      el.style.setProperty('--dx', Math.cos(ang) * d + 'px');
      el.style.setProperty('--dy', Math.sin(ang) * d - 30 + 'px');
      el.style.fontSize = (18 + Math.random() * 14) + 'px';
      document.getElementById('fxLayer').appendChild(el);
      setTimeout(() => el.remove(), 1400);
    }
    // 3. 中心大字
    const big = document.createElement('div');
    big.className = 'fx-bigpoke';
    big.textContent = '啪！';
    document.getElementById('fxLayer').appendChild(big);
    setTimeout(() => big.remove(), 1100);
    playTone('poke');
  }

  // ── 完成约定庆祝 ──
  function taskDoneCelebrate() {
    confetti(50, ['💗', '💖', '🌸', '✨', '💕']);
    playTone('done');
  }

  // ── 里程碑庆祝 (正字) ──
  function milestone(kind) {
    if (kind === 'big') {
      confetti(120, ['🎉', '💖', '❤️', '🌹', '🎆', '💘', '✨']);
      fireworks();
      playTone('big');
    } else if (kind === 'small') {
      confetti(60, ['🎁', '💝', '🎀', '✨', '🌸', '💕']);
      playTone('small');
    }
  }

  // ── WebAudio 合成音效 (不引音频文件) ──
  let _audioCtx = null;
  function tone(freq, dur = 0.12, type = 'sine', gain = 0.08, when = 0) {
    try {
      _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = _audioCtx;
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    } catch (e) { /* 静默 */ }
  }
  function playTone(kind) {
    if (reduced) return;
    switch (kind) {
      case 'poke': tone(220, 0.09, 'square', 0.06); tone(160, 0.12, 'square', 0.05, 0.06); break;
      case 'done': tone(523, 0.1, 'sine'); tone(659, 0.12, 'sine', 0.08, 0.1); tone(784, 0.16, 'sine', 0.08, 0.2); break;
      case 'small': tone(659, 0.1, 'triangle', 0.07); tone(880, 0.14, 'triangle', 0.07, 0.1); break;
      case 'big': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, i * 0.12)); break;
      case 'festival': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, 'sine', 0.06, i * 0.1)); break;
    }
  }

  // ── fx 层确保存在 ──
  function addFxLayerHTML() {
    if (document.getElementById('fxLayer')) return;
    const l = document.createElement('div');
    l.id = 'fxLayer';
    l.className = 'fx-layer';
    document.body.appendChild(l);
  }

  function toastMsg(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 3200);
  }
  const toast = toastMsg;

  return { confetti, fireworks, festivalCelebrate, pokeAnim, taskDoneCelebrate, milestone, playTone, toast };
})();
