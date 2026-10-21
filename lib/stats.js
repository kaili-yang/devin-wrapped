'use strict';
// Pure aggregation: raw store rows -> the numbers on the card. Local time throughout.

const path = require('node:path');

const DAY_MS = 86_400_000;
const IDLE_MS = 30 * 60_000;
const HIDDEN_MODELS = new Set(['compactor', 'summarizer']);
const TEMP_DIR_RE = /^(\/private)?\/(tmp|var\/folders)\/|[\\/]Temp[\\/]/i;

const LANGUAGES = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', rs: 'Rust', go: 'Go', swift: 'Swift', kt: 'Kotlin', java: 'Java', rb: 'Ruby', php: 'PHP',
  c: 'C', h: 'C', cc: 'C++', cpp: 'C++', hpp: 'C++', cs: 'C#', m: 'Objective-C', mm: 'Objective-C',
  vue: 'Vue', svelte: 'Svelte', html: 'HTML', css: 'CSS', scss: 'CSS', sql: 'SQL', sh: 'Shell', bash: 'Shell', zsh: 'Shell',
  md: 'Markdown', mdx: 'Markdown', json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', dart: 'Dart', lua: 'Lua',
};

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'claude-opus-5-5-medium' -> 'Claude Opus 5.5 Medium', 'swe-1-6-slow' -> 'SWE 1.6 Slow' */
function prettyModel(id) {
  const parts = String(id).split('-');
  const out = [];
  for (const p of parts) {
    if (/^\d+$/.test(p) && out.length && /^\d+(\.\d+)*$/.test(out[out.length - 1])) out[out.length - 1] += `.${p}`;
    else if (/^(swe|gpt|glm|gpt\d.*)$/i.test(p)) out.push(p.toUpperCase());
    else out.push(p.charAt(0).toUpperCase() + p.slice(1));
  }
  return out.join(' ');
}

/** First program of every segment of a shell command line: "cd x && FOO=1 npm test | tee" -> ['cd', 'npm', 'tee'] */
function commandNames(line) {
  const names = [];
  const code = String(line)
    .replace(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n[\s\S]*?(\n\2(?=\s|$)|$)/g, '') // heredoc bodies
    .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""'); // quoted arguments (may contain | ; &&)
  for (const seg of code.split(/&&|\|\||[;|\n]/)) {
    const words = seg.trim().split(/\s+/).filter(Boolean);
    while (words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]) || ['sudo', 'time', 'exec', 'env', 'nohup', '('].includes(words[0]))) words.shift();
    if (!words.length) continue;
    const name = path.basename(words[0].replace(/^["'(]+|["')]+$/g, ''));
    if (name && /^[A-Za-z0-9._+-]+$/.test(name)) names.push(name);
  }
  return names;
}

/** Multiset line diff: good enough for "lines added / removed" without an LCS. */
function lineDelta(oldText, newText) {
  const count = new Map();
  for (const l of oldText ? oldText.split('\n') : []) count.set(l, (count.get(l) || 0) + 1);
  let added = 0;
  for (const l of newText ? newText.split('\n') : []) {
    const c = count.get(l) || 0;
    if (c > 0) count.set(l, c - 1);
    else added++;
  }
  let removed = 0;
  for (const c of count.values()) removed += c;
  return { added, removed };
}

function top(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([name, count]) => ({ name, count }));
}

function inc(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function longestStreak(days) {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    const t = Date.parse(`${d}T12:00:00`);
    run = prev != null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/**
 * @param {{ sessions, messages, edits }} raw
 * @param {{ from: number, to: number, label: string }} period
 */
function computeStats(raw, period) {
  const msgs = raw.messages.filter((m) => m.ts >= period.from && m.ts < period.to).sort((a, b) => a.ts - b.ts);
  const sessionById = new Map(raw.sessions.map((s) => [s.id, s]));
  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  const daily = new Map();
  const tools = new Map();
  const commands = new Map();
  const models = new Map();
  const projects = new Map();
  const sessionSpan = new Map();
  const sessionsPerDay = new Map();
  const tokens = { input: 0, output: 0, cacheRead: 0 };
  let prompts = 0;
  let promptChars = 0;
  let longestPrompt = 0;
  let agentMessages = 0;
  let toolCalls = 0;
  let lateNight = null;

  for (const m of msgs) {
    const d = new Date(m.ts);
    const day = dayKey(m.ts);
    hours[d.getHours()]++;
    weekdays[d.getDay()]++;
    inc(daily, day);
    if (!sessionsPerDay.has(day)) sessionsPerDay.set(day, new Set());
    sessionsPerDay.get(day).add(m.sessionId);
    const span = sessionSpan.get(m.sessionId) || { first: m.ts, last: m.ts, active: 0, messages: 0 };
    // Active time: gaps longer than IDLE_MS (the user walked away) do not count.
    if (m.ts - span.last <= IDLE_MS) span.active += m.ts - span.last;
    span.last = m.ts;
    span.messages++;
    sessionSpan.set(m.sessionId, span);
    const s = sessionById.get(m.sessionId);
    if (s && s.cwd) inc(projects, TEMP_DIR_RE.test(s.cwd) ? null : path.basename(s.cwd));

    if (m.userInput) {
      prompts++;
      promptChars += m.chars;
      longestPrompt = Math.max(longestPrompt, m.chars);
    }
    if (m.role === 'assistant') {
      agentMessages++;
      if (m.model && !HIDDEN_MODELS.has(m.model)) inc(models, m.model);
      tokens.input += m.tokens.input;
      tokens.output += m.tokens.output;
      tokens.cacheRead += m.tokens.cacheRead;
      for (const t of m.tools) {
        if (!t.name) continue;
        toolCalls++;
        inc(tools, t.name);
        if (t.name === 'exec' && t.command) for (const c of commandNames(t.command)) inc(commands, c);
      }
    }
    // The latest moment between midnight and 5 am counts as the latest night; else the latest evening.
    const h = d.getHours() + d.getMinutes() / 60;
    const nightScore = h < 5 ? 24 + h : h >= 21 ? h : -1;
    if (nightScore >= 0 && (!lateNight || nightScore > lateNight.score)) lateNight = { score: nightScore, ts: m.ts };
  }

  const files = new Set();
  const langs = new Map();
  let linesAdded = 0;
  let linesRemoved = 0;
  const activeSessions = new Set(sessionSpan.keys());
  for (const e of raw.edits) {
    if (!activeSessions.has(e.sessionId)) continue;
    files.add(e.path);
    const { added, removed } = lineDelta(e.oldText, e.newText);
    linesAdded += added;
    linesRemoved += removed;
    const ext = path.extname(e.path).slice(1).toLowerCase();
    if (LANGUAGES[ext]) inc(langs, LANGUAGES[ext], added + removed || 1);
  }

  let longestSession = null;
  for (const [id, span] of sessionSpan) {
    const dur = span.active;
    if (!longestSession || dur > longestSession.durationMs) {
      const s = sessionById.get(id);
      longestSession = { id, title: s ? s.title : '', durationMs: dur, messages: span.messages };
    }
  }

  const busiest = top(daily, 1)[0] || null;
  const weekend = weekdays[0] + weekdays[6];
  const total = msgs.length || 1;
  const nightShare = (hours.slice(22).reduce((a, b) => a + b, 0) + hours.slice(0, 5).reduce((a, b) => a + b, 0)) / total;
  const morningShare = hours.slice(5, 9).reduce((a, b) => a + b, 0) / total;

  return {
    period: { label: period.label, from: period.from, to: period.to },
    sessions: activeSessions.size,
    activeDays: daily.size,
    longestStreak: longestStreak(daily.keys()),
    busiestDay: busiest ? { date: busiest.name, messages: busiest.count } : null,
    maxSessionsInADay: Math.max(0, ...[...sessionsPerDay.values()].map((s) => s.size)),
    daily: Object.fromEntries(daily),
    hours,
    weekdays,
    prompts,
    avgPromptChars: prompts ? Math.round(promptChars / prompts) : 0,
    longestPrompt,
    agentMessages,
    toolCalls,
    toolsPerPrompt: prompts ? +(toolCalls / prompts).toFixed(1) : 0,
    topTools: top(tools, 6),
    shellCommands: tools.get('exec') || 0,
    topCommands: top(commands, 5),
    webCalls: (tools.get('web_search') || 0) + (tools.get('webfetch') || 0),
    filesTouched: files.size,
    linesAdded,
    linesRemoved,
    topLanguages: top(langs, 5),
    tokens,
    models: top(models, 4).map((m) => ({ ...m, label: prettyModel(m.name) })),
    topProjects: top(projects, 4).filter((p) => p.name),
    lateNight: lateNight ? { ts: lateNight.ts } : null,
    longestSession,
    shares: { night: nightShare, morning: morningShare, weekend: weekend / total },
  };
}

module.exports = { dayKey, prettyModel, commandNames, lineDelta, longestStreak, computeStats, LANGUAGES };
