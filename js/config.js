// 朝暮 DawnDusk — 品牌常量 / 节日库 / 农历映射表
'use strict';

const BRAND = {
  name: '朝暮',
  nameEn: 'DawnDusk',
  full: '朝暮 DawnDusk',
  slogan: '两情若是久长时，定不负朝朝暮暮',
  sloganShort: '不负朝朝暮暮',
  sloganEn: 'Long love keeps every dawn and dusk.',
  origin: '秦观《鹊桥仙·纤云弄巧》',
};

// ── 公历节日库（每年固定日期，repeat:true）──
// type: natural(自然节日) | love(情侣纪念日) — love 类默认 grand 动画
const SOLAR_FESTIVALS = [
  { id: 'ny',   name: '元旦',     date: '01-01', emoji: '🎉', anim: 'grand',  type: 'natural' },
  { id: 'val',  name: '情人节',   date: '02-14', emoji: '💘', anim: 'grand',  type: 'love' },
  { id: 'white',name: '白色情人节', date: '03-14', emoji: '🍫', anim: 'light', type: 'love' },
  { id: 'v520', name: '520',      date: '05-20', emoji: '💗', anim: 'grand',  type: 'love' },
  { id: 'xmas', name: '圣诞节',   date: '12-25', emoji: '🎄', anim: 'grand',  type: 'natural' },
];

// ── 农历节日：2026-2030 精确映射表（lunardate 库生成，含闰月校验）──
// 「2026-02-17」等 → {name, emoji, lunar:[月,日], anim}
const LUNAR_FESTIVAL_TABLE = {
  '2026-02-17': { name: '春节', emoji: '🧧', lunar: [1, 1],  anim: 'grand' },
  '2026-03-03': { name: '元宵', emoji: '🏮', lunar: [1, 15], anim: 'light' },
  '2026-06-19': { name: '端午', emoji: '🐲', lunar: [5, 5],  anim: 'light' },
  '2026-08-19': { name: '七夕', emoji: '💫', lunar: [7, 7],  anim: 'grand' },
  '2026-09-25': { name: '中秋', emoji: '🥮', lunar: [8, 15], anim: 'grand' },
  '2027-02-06': { name: '春节', emoji: '🧧', lunar: [1, 1],  anim: 'grand' },
  '2027-02-20': { name: '元宵', emoji: '🏮', lunar: [1, 15], anim: 'light' },
  '2027-06-09': { name: '端午', emoji: '🐲', lunar: [5, 5],  anim: 'light' },
  '2027-08-08': { name: '七夕', emoji: '💫', lunar: [7, 7],  anim: 'grand' },
  '2027-09-15': { name: '中秋', emoji: '🥮', lunar: [8, 15], anim: 'grand' },
  '2028-01-26': { name: '春节', emoji: '🧧', lunar: [1, 1],  anim: 'grand' },
  '2028-02-09': { name: '元宵', emoji: '🏮', lunar: [1, 15], anim: 'light' },
  '2028-05-28': { name: '端午', emoji: '🐲', lunar: [5, 5],  anim: 'light' },
  '2028-08-26': { name: '七夕', emoji: '💫', lunar: [7, 7],  anim: 'grand' },
  '2028-10-03': { name: '中秋', emoji: '🥮', lunar: [8, 15], anim: 'grand' },
  '2029-02-13': { name: '春节', emoji: '🧧', lunar: [1, 1],  anim: 'grand' },
  '2029-02-27': { name: '元宵', emoji: '🏮', lunar: [1, 15], anim: 'light' },
  '2029-06-16': { name: '端午', emoji: '🐲', lunar: [5, 5],  anim: 'light' },
  '2029-08-16': { name: '七夕', emoji: '💫', lunar: [7, 7],  anim: 'grand' },
  '2029-09-22': { name: '中秋', emoji: '🥮', lunar: [8, 15], anim: 'grand' },
  '2030-02-03': { name: '春节', emoji: '🧧', lunar: [1, 1],  anim: 'grand' },
  '2030-02-17': { name: '元宵', emoji: '🏮', lunar: [1, 15], anim: 'light' },
  '2030-06-05': { name: '端午', emoji: '🐲', lunar: [5, 5],  anim: 'light' },
  '2030-08-05': { name: '七夕', emoji: '💫', lunar: [7, 7],  anim: 'grand' },
  '2030-09-12': { name: '中秋', emoji: '🥮', lunar: [8, 15], anim: 'grand' },
};

const FESTIVAL_EMOJIS = ['🧧','🏮','🐲','💫','🥮','💘','🎄','🎉','🍫','💗','🎂','🌹'];

// 快捷短语（留言用）
const QUICK_NOTES = ['想你啦 💕', '超棒的！🌟', '明天见 🌙', '我爱你 ❤️'];

// 正字可换字（笔画数来自 hanzi-writer 可用集）
const ZZ_CHAR_OPTIONS = [
  { char: '正', desc: '正字 · 5画', strokes: 5 },
  { char: '爱', desc: '爱字 · 10画', strokes: 10 },
];

// 打一下表情池（随机）
const POKE_EMOJIS = ['💥', '👋', '🐾', '🫳', '💢', '❤️‍🔥', '🍑', '🤜', '🙀'];

// 节日动画强度
const ANIM_LEVELS = {
  none:  { label: '无动画', confetti: 0,  fireworks: false },
  light: { label: '轻量',   confetti: 60, fireworks: false },
  grand: { label: '盛大',   confetti: 140, fireworks: true },
};
