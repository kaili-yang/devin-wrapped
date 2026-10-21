'use strict';

const STRINGS = {
  zh: {
    title: 'DEVIN WRAPPED',
    subtitle: (label) => (/^\d{4}$/.test(label) ? '你和 Devin 的这一年' : '你和 Devin 的这些日子'),
    sessions: '个会话',
    activeDays: '天活跃',
    toolCalls: '次 Devin 动手',
    lines: '行代码改动',
    streak: (n) => `最长连续 ${n} 天`,
    busiest: (date, n) => `最忙的一天 ${date}，${n} 条消息`,
    youAre: '你的 Devin 人格',
    hours: '一天中的活跃时段',
    heatmap: '每日活跃',
    tools: 'Devin 最常用的工具',
    commands: '最常跑的命令',
    languages: '改得最多的语言',
    models: '合作最多的模型',
    topModel: (m) => `最佳搭档模型：${m}`,
    projects: '主战场',
    prompts: (n, avg) => `你写了 ${n} 条指令，平均 ${avg} 字`,
    tokens: (t) => `Devin 读了 ${t} tokens，写了`,
    lateNight: (time, date) => `最晚的一次：${date} 凌晨 ${time}`,
    lateEvening: (time, date) => `最晚的一次：${date} ${time}`,
    longest: (dur, title) => `最长的会话 ${dur}${title ? `：「${title}」` : ''}`,
    files: (n) => `${n} 个文件`,
    footer: 'npx devin-wrapped · 数据只在你的电脑上',
    hm: (h, m) => (h ? `${h} 小时 ${m} 分` : `${m} 分钟`),
    personas: {
      'night-owl': ['夜猫子', '月亮不睡你不睡，Devin 陪你到天亮。'],
      'early-bird': ['早起鸟', '别人还在睡，你和 Devin 已经开工。'],
      'weekend-warrior': ['周末战士', '周末不休息，Devin 也只好加班。'],
      delegator: ['甩手掌柜', '一句话交代下去，Devin 自己跑完几十步。'],
      'spec-writer': ['产品经理', '需求写得比 PRD 还细，Devin 照单全收。'],
      'refactor-maniac': ['重构狂魔', '代码不改到满意，绝不收工。'],
      'terminal-ninja': ['命令行侠客', '能用命令解决的，绝不点鼠标。'],
      researcher: ['研究员', '动手之前，先把全网翻一遍。'],
      multitasker: ['多线程大师', '同一天开好几个会话，一个人就是一支团队。'],
      'steady-builder': ['稳健型工程师', '不急不躁，一步一个脚印。'],
      newcomer: ['新朋友', '这段时间还没和 Devin 合作过，来一起开工吧。'],
    },
    tagsLabel: '同时也是',
  },
  en: {
    title: 'DEVIN WRAPPED',
    subtitle: (label) => (/^\d{4}$/.test(label) ? 'Your year with Devin' : 'You and Devin'),
    sessions: 'sessions',
    activeDays: 'active days',
    toolCalls: 'things Devin did',
    lines: 'lines changed',
    streak: (n) => `Longest streak: ${n} days`,
    busiest: (date, n) => `Busiest day: ${date}, ${n} messages`,
    youAre: 'Your Devin persona',
    hours: 'When you work',
    heatmap: 'Daily activity',
    tools: "Devin's favorite tools",
    commands: 'Top commands',
    languages: 'Top languages',
    models: 'Top models',
    topModel: (m) => `Favorite model: ${m}`,
    projects: 'Top projects',
    prompts: (n, avg) => `You wrote ${n} prompts, ${avg} characters on average`,
    tokens: (t) => `Devin read ${t} tokens and wrote`,
    lateNight: (time, date) => `Latest night: ${time} on ${date}`,
    lateEvening: (time, date) => `Latest session: ${time} on ${date}`,
    longest: (dur, title) => `Longest session: ${dur}${title ? ` — "${title}"` : ''}`,
    files: (n) => `${n} files`,
    footer: 'npx devin-wrapped · your data never leaves your machine',
    hm: (h, m) => (h ? `${h}h ${m}m` : `${m} min`),
    personas: {
      'night-owl': ['Night Owl', 'The moon is up, so are you, and so is Devin.'],
      'early-bird': ['Early Bird', 'You and Devin ship before everyone else wakes up.'],
      'weekend-warrior': ['Weekend Warrior', 'Weekends are for shipping. Devin agrees, reluctantly.'],
      delegator: ['The Delegator', 'One sentence from you, dozens of steps from Devin.'],
      'spec-writer': ['The Spec Writer', 'Your prompts read like PRDs. Devin loves it.'],
      'refactor-maniac': ['Refactor Maniac', 'Not done until the diff is huge and the code is clean.'],
      'terminal-ninja': ['Terminal Ninja', 'If it can be a command, it is a command.'],
      researcher: ['The Researcher', 'Reads the whole internet before touching the code.'],
      multitasker: ['The Multitasker', 'Several sessions a day. You are a team of one.'],
      'steady-builder': ['Steady Builder', 'Calm, consistent, one step at a time.'],
      newcomer: ['New Friend', 'No Devin sessions in this period yet. Time to start one.'],
    },
    tagsLabel: 'Also',
  },
};

function strings(lang) {
  return STRINGS[lang] || STRINGS.en;
}

function defaultLang(locale = Intl.DateTimeFormat().resolvedOptions().locale) {
  return /^zh/i.test(locale || '') ? 'zh' : 'en';
}

/** 1234 -> 1,234 ; 12_345_678 -> 12.3M */
function compact(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

module.exports = { STRINGS, strings, defaultLang, compact };
