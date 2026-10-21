'use strict';
// Every user-facing string on the card and in the terminal summary.

const T = {
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
};

/** 1234 -> 1,234 ; 12_345_678 -> 12.3M */
function compact(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

module.exports = { T, compact };
