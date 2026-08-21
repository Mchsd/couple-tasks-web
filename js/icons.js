// 朝暮 DawnDusk — 古风 SVG 图标系统 (替代 emoji, 统一线条风格)
'use strict';

const ICONS = (() => {
  const wrap = (inner, vb = '0 0 24 24') =>
    `<svg viewBox="${vb}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const icons = {
    // 日月
    sun: `<circle cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19"/>`,
    moon: `<path d="M15.2 3.6A8.6 8.6 0 1 0 20.4 13.8 7 7 0 0 1 15.2 3.6z"/>`,
    // 导航
    calendar: `<rect x="3.6" y="5" width="16.8" height="15.6" rx="2.2"/><path d="M3.6 9.6h16.8M8.2 2.8v4.4M15.8 2.8v4.4"/><path d="M8.2 13.2h2M13.8 13.2h2M8.2 16.8h2"/>`,
    book: `<path d="M4 6.2C6.6 4.4 9.7 3.4 12 3.4s5.4 1 8 2.8v13.2c-2.6-1.8-5.7-2.8-8-2.8s-5.4 1-8 2.8V6.2z"/><path d="M4 6.2v13.2M12 3.4v13"/>`,
    heart: `<path d="M12 20.2S4.6 15.6 2.9 11.2C1.5 7.7 3.6 4.8 6.6 4.8c2 0 3.8 1.2 4.7 3 .9-1.8 2.7-3 4.7-3 3 0 5.1 2.9 3.7 6.4C18.6 15.4 12 20.2 12 20.2z"/>`,
    // 印章 / 卷轴 / 花
    seal: `<rect x="4" y="4" width="16" height="16" rx="2.6"/><path d="M9.2 9.2h5.6v5.6H9.2z" opacity=".55"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" opacity=".35"/>`,
    scroll: `<rect x="7.6" y="3.6" width="8.8" height="16.8" rx="1.8"/><path d="M7.6 6c-1.9.6-3 1.9-3 3.4s1.1 2.8 3 3.4M16.4 6c1.9.6 3 1.9 3 3.4s-1.1 2.8-3 3.4"/><path d="M10.4 8h3.2M10.4 11h3.2M10.4 14h3.2"/>`,
    flower: `<circle cx="12" cy="7.2" r="2"/><circle cx="7" cy="10.4" r="2"/><circle cx="17" cy="10.4" r="2"/><circle cx="8.8" cy="15.4" r="2"/><circle cx="15.2" cy="15.4" r="2"/><circle cx="12" cy="11.4" r="1.6"/>`,
    cloud: `<path d="M7 18.5a4.4 4.4 0 0 1-.4-8.8A6.2 6.2 0 0 1 18.4 8.6a4 4 0 0 1 .9 7.8"/>`,
    // 行为
    check: `<path d="M4.5 13l4.4 4.3L19.5 6.5"/>`,
    uncheck: `<path d="M6.5 4.2v4.2h4.2"/><path d="M6.3 8.4a7.2 7.2 0 1 1-1.2 5.4"/>`,
    note: `<rect x="4.6" y="3.6" width="14.8" height="16.8" rx="2"/><path d="M4.6 8.2h14.8M8.5 12.4h7M8.5 16h4.5"/>`,
    habit: `<path d="M12 20.4v-7.2"/><path d="M12 13.2c-.2-4.2-2.8-6.8-7.2-7.2.2 4.4 3 7 7.2 7.2z"/><path d="M12 13.2c.2-3.5 2.3-5.7 5.8-6.1-.2 3.7-2.4 6-5.8 6.1z"/>`,
    sand: `<path d="M7 3h10M7 21h10M8.2 3c0 5.4 7.6 6.3 7.6 9s-7.6 3.6-7.6 9M15.8 3c0 5.4-7.6 6.3-7.6 9s7.6 3.6 7.6 9"/>`,
    gift: `<rect x="4.4" y="9.4" width="15.2" height="11" rx="1.6"/><path d="M4.4 13.4h15.2M12 9.4v11"/><path d="M12 9.4c-1.9-3-5.4-3.6-6.1-1.6-.7 1.9 2 2.7 6.1 1.6zM12 9.4c1.9-3 5.4-3.6 6.1-1.6.7 1.9-2 2.7-6.1 1.6z"/>`,
    star: `<path d="M12 3.6l2.4 5.3 5.8.6-4.3 3.9 1.2 5.7-5.1-3-5.1 3 1.2-5.7-4.3-3.9 5.8-.6z"/>`,
    drop: `<path d="M12 3.4s6.2 7.2 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 10.6 12 3.4 12 3.4z"/>`,
    flame: `<path d="M12 3.2s5.2 5.6 5.2 9.6a5.2 5.2 0 0 1-10.4 0C6.8 8.8 12 3.2 12 3.2z"/><path d="M12 19.6a2.7 2.7 0 0 0 2.7-2.7c0-1.9-2.7-4-2.7-4s-2.7 2.1-2.7 4a2.7 2.7 0 0 0 2.7 2.7z"/>`,
    poke: `<path d="M13.6 2.4l1.5 2.4M17.5 4l2.4-2.4"/><path d="M3.4 10l9.2-5.3a2.4 2.4 0 0 1 3.2.9l2.3 4a2.4 2.4 0 0 1-.9 3.2l-8.3 4.8z"/><path d="M18.6 7.6l1.9 3.3M6 15.4l9.4-5.4M9.2 10.6l9.4-5.4"/>`,
    lock: `<rect x="5.4" y="10.8" width="13.2" height="9.4" rx="2"/><path d="M8.4 10.8V8a3.6 3.6 0 0 1 7.2 0v2.8M12 13.8v3"/>`,
    inkstone: `<rect x="3.6" y="7.4" width="16.8" height="9.6" rx="2"/><path d="M6 7.4L12 3.8l6 3.6M10.2 11.6h3.6"/>`,
    calendarBtn: `<circle cx="12" cy="12" r="8.6"/><path d="M12 7.6V12l3 1.8"/>`,
  };

  return new Proxy(icons, {
    get(target, prop) {
      if (prop in target) return wrap(target[prop]);
      if (typeof prop === 'string' && prop.startsWith('__')) return undefined;
      return wrap('<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.4"/>');
    },
  });
})();
