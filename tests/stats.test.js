'use strict';

const { buildStore, YEAR_2026 } = require('./fixture'); // sets TZ=UTC first
const test = require('node:test');
const assert = require('node:assert/strict');
const { readStore } = require('../lib/db');
const { computeStats, commandNames, lineDelta, prettyModel, longestStreak } = require('../lib/stats');
const { pickPersona } = require('../lib/persona');
const { resolvePeriod } = require('../lib/period');

test('readStore dedupes branch copies, drops compaction prompts and tool messages', (t) => {
  const store = buildStore();
  t.after(store.cleanup);
  const raw = readStore(store.file, YEAR_2026);
  assert.equal(raw.messages.filter((m) => m.role === 'assistant').length, 5);
  assert.deepEqual(raw.messages.filter((m) => m.userInput).map((m) => m.chars), [24, 47, 2]);
  assert.equal(raw.messages.some((m) => m.sessionId === 'old'), false, 'period filter');
  assert.equal(raw.edits.length, 2, 'edits of sessions outside the period are skipped');
  assert.equal(raw.sessions.length, 4);
});

test('computeStats on the fixture', (t) => {
  const store = buildStore();
  t.after(store.cleanup);
  const s = computeStats(readStore(store.file, YEAR_2026), YEAR_2026);
  assert.equal(s.sessions, 3);
  assert.equal(s.activeDays, 3); // Mon 23:00, Tue (00:40 and 23:00), Thu 10:00
  assert.equal(s.prompts, 3);
  assert.equal(s.avgPromptChars, Math.round((24 + 47 + 2) / 3));
  assert.equal(s.agentMessages, 5);
  assert.equal(s.toolCalls, 8);
  assert.deepEqual(s.topTools[0], { name: 'exec', count: 3 });
  assert.equal(s.shellCommands, 3);
  assert.equal(s.webCalls, 2);
  // 7 distinct commands, once each (the duplicated branch copy is not counted); ties sort by name, top 5 kept
  assert.deepEqual(s.topCommands, ['cat', 'cd', 'echo', 'git', 'ls'].map((name) => ({ name, count: 1 })));
  assert.equal(s.filesTouched, 2);
  assert.equal(s.linesAdded, 2 + 3);
  assert.equal(s.linesRemoved, 1);
  assert.deepEqual(s.topLanguages.map((l) => l.name), ['Python', 'TypeScript']);
  assert.deepEqual(s.models.map((m) => m.label), ['Claude Opus 5.5 Medium', 'SWE 1.6 Slow'], 'compactor hidden');
  assert.deepEqual(s.tokens, { input: 75, output: 500, cacheRead: 5000 });
  assert.deepEqual(s.topProjects.map((p) => p.name), ['webapp', 'api'], 'temp dirs are not projects');
  assert.equal(new Date(s.lateNight.ts).getUTCHours(), 0);
  assert.equal(new Date(s.lateNight.ts).getUTCMinutes(), 40);
  assert.equal(s.longestSession.id, 's1');
  assert.equal(s.longestSession.durationMs, 71_000, 'the 100-minute idle gap before a3 is not counted');
  assert.equal(s.hours[23], 5); // u1, a1, a2 on Monday; u3, a4 on Tuesday
  assert.equal(s.longestStreak, 2);
  assert.deepEqual(s.busiestDay, { date: '2026-03-02', messages: 3 });
});

test('helpers', () => {
  assert.deepEqual(commandNames("cd web && FOO=1 npm test | tee out.log && echo 'a | b; c'"), ['cd', 'npm', 'tee', 'echo']);
  assert.deepEqual(commandNames("cat > f <<'EOF'\nconst x = 1 | 2;\nEOF\ngit status"), ['cat', 'git']);
  assert.deepEqual(commandNames('sudo /usr/bin/python3 x.py; time make'), ['python3', 'make']);
  assert.deepEqual(lineDelta('a\nb\nc', 'a\nB\nc\nd'), { added: 2, removed: 1 });
  assert.deepEqual(lineDelta('', 'x'), { added: 1, removed: 0 });
  assert.equal(prettyModel('claude-opus-5-5-medium'), 'Claude Opus 5.5 Medium');
  assert.equal(prettyModel('swe-1-6-slow'), 'SWE 1.6 Slow');
  assert.equal(prettyModel('gpt-5-codex'), 'GPT 5 Codex');
  assert.equal(longestStreak(['2026-03-01', '2026-03-02', '2026-03-04', '2026-03-05', '2026-03-06']), 3);
  assert.equal(longestStreak([]), 0);
});

test('personas', () => {
  const base = { sessions: 5, shares: { night: 0, morning: 0, weekend: 0 }, toolsPerPrompt: 1, avgPromptChars: 50, linesAdded: 0, linesRemoved: 0, toolCalls: 100, shellCommands: 10, webCalls: 0, maxSessionsInADay: 1 };
  assert.equal(pickPersona({ ...base, sessions: 0 }).id, 'newcomer');
  assert.equal(pickPersona(base).id, 'steady-builder');
  assert.equal(pickPersona({ ...base, shares: { night: 0.5, morning: 0, weekend: 0 } }).id, 'night-owl');
  const p = pickPersona({ ...base, toolsPerPrompt: 60, shares: { night: 0.3, morning: 0, weekend: 0.4 } });
  assert.equal(p.id, 'delegator');
  assert.deepEqual(p.tags, ['night-owl', 'weekend-warrior']);
});

test('periods', () => {
  const now = Date.UTC(2026, 9, 21, 12);
  assert.deepEqual(resolvePeriod({}, now), { from: Date.UTC(2026, 0, 1), to: Date.UTC(2027, 0, 1), label: '2026' });
  assert.equal(resolvePeriod({ days: '30' }, now).label, 'Last 30 days');
  assert.equal(resolvePeriod({ days: '30' }, now).from, now - 30 * 86_400_000);
  assert.equal(resolvePeriod({ all: true }, now).from, 0);
  assert.throws(() => resolvePeriod({ days: '0' }), /days/);
  assert.throws(() => resolvePeriod({ year: 'abc' }), /year/);
});

test('message time comes from metadata.created_at, not the (rewritable) row timestamp', (t) => {
  const store = buildStore();
  t.after(store.cleanup);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(store.file);
  const rowTs = Date.UTC(2025, 0, 1) / 1000; // row says 2025 ...
  db.prepare('INSERT INTO message_nodes (session_id, node_id, chat_message, created_at) VALUES (?, ?, ?, ?)')
    .run('s1', 999, JSON.stringify({ message_id: 'late', role: 'user', content: 'hello', metadata: { is_user_input: true, created_at: '2026-07-04T10:00:00.5Z' } }), rowTs);
  db.close();
  const raw = readStore(store.file, YEAR_2026);
  const m = raw.messages.find((x) => x.chars === 5);
  assert.equal(m.ts, Date.parse('2026-07-04T10:00:00.5Z')); // ... the message says 2026
  assert.equal(readStore(store.file, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2026, 0, 1) }).messages.some((x) => x.chars === 5), false);
});
