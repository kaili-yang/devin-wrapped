'use strict';
// Builds a small session store with the same tables/columns Devin uses.

process.env.TZ = 'UTC';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE sessions (id TEXT PRIMARY KEY, working_directory TEXT NOT NULL, backend_type TEXT NOT NULL, model TEXT NOT NULL, agent_mode TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL, title TEXT, main_chain_id INTEGER, shell_last_seen_index INTEGER DEFAULT 0,
  cogs_json TEXT, workspace_dirs TEXT, hidden INTEGER NOT NULL DEFAULT 0, metadata TEXT);
CREATE TABLE message_nodes (row_id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, node_id INTEGER NOT NULL, parent_node_id INTEGER,
  chat_message TEXT NOT NULL, created_at INTEGER NOT NULL, metadata TEXT, UNIQUE(session_id, node_id));
CREATE TABLE tool_call_state (session_id TEXT NOT NULL, tool_call_id TEXT NOT NULL, tool_call_json TEXT, tool_call_update_json TEXT, source_node_ids TEXT,
  PRIMARY KEY (session_id, tool_call_id));
`;

const T0 = Date.UTC(2026, 2, 2, 23, 0, 0) / 1000; // Mon 2026-03-02 23:00 UTC

function user(id, text, extra = {}) {
  return { message_id: id, role: 'user', content: text, metadata: { is_user_input: true, ...extra } };
}

function assistant(id, model, tools = [], tokens = {}) {
  return {
    message_id: id, role: 'assistant', content: '',
    tool_calls: tools.map((t, i) => ({ id: `${id}-${i}`, name: t[0], arguments: t[1] || {}, index: i, kind: 'function' })),
    metadata: { generation_model: model, metrics: { input_tokens: 10, output_tokens: 100, cache_read_tokens: 1000, cache_creation_tokens: 5, ...tokens } },
  };
}

function buildStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-wrapped-test-'));
  const file = path.join(dir, 'sessions.db');
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const addSession = db.prepare("INSERT INTO sessions (id, working_directory, backend_type, model, agent_mode, created_at, last_activity_at, title) VALUES (?, ?, 'windsurf', 'm', 'accept-edits', ?, ?, ?)");
  addSession.run('s1', '/Users/me/src/webapp', T0, T0 + 7200, 'Fix login');
  addSession.run('s2', '/Users/me/src/api', T0 + 86400, T0 + 86400 * 2, 'Add endpoint');
  addSession.run('s3', '/private/var/folders/xx/T/tmp123', T0 + 86400 * 3, T0 + 86400 * 3, 'temp');
  addSession.run('old', '/Users/me/src/legacy', Date.UTC(2025, 5, 1) / 1000, Date.UTC(2025, 5, 1) / 1000, 'last year');

  const addMsg = db.prepare('INSERT INTO message_nodes (session_id, node_id, chat_message, created_at) VALUES (?, ?, ?, ?)');
  let node = 0;
  const put = (sid, msg, ts) => addMsg.run(sid, node++, JSON.stringify(msg), ts);

  // s1: Mon 23:00 -> Tue 00:40, crosses midnight (latest-night moment at 00:40)
  put('s1', user('u1', 'please fix the login bug'), T0);
  put('s1', assistant('a1', 'claude-opus-5-5-medium', [['exec', { command: "cd web && FOO=1 npm test | tee out.log && echo 'a | b; c'" }], ['read'], ['edit']]), T0 + 60);
  put('s1', { message_id: 't1', role: 'tool', content: 'ok' }, T0 + 61);
  put('s1', assistant('a1', 'claude-opus-5-5-medium', [['exec', { command: 'npm test' }]]), T0 + 62); // duplicate branch copy
  put('s1', user('u2', 'Output a summary from the following messages: ...', {}), T0 + 70); // compaction prompt
  put('s1', assistant('a2', 'compactor'), T0 + 71);
  put('s1', assistant('a3', 'claude-opus-5-5-medium', [['exec', { command: "cat > f.ts <<'EOF'\nconst x = 1 | 2;\nEOF\ngit status" }]]), T0 + 6000);
  // s2: Tue 23:00, two prompts, web research
  put('s2', user('u3', 'add an endpoint for orders, with tests and docs'), T0 + 86400);
  put('s2', assistant('a4', 'swe-1-6-slow', [['web_search'], ['webfetch'], ['write']]), T0 + 86400 + 30);
  // s3: Thu 10:00
  put('s3', user('u4', 'hi'), T0 + 86400 * 2 + 11 * 3600);
  put('s3', assistant('a5', 'swe-1-6-slow', [['exec', { command: 'ls' }]]), T0 + 86400 * 2 + 11 * 3600 + 5);
  // last year
  put('old', user('u0', 'old prompt'), Date.UTC(2025, 5, 1) / 1000);

  const addTool = db.prepare('INSERT INTO tool_call_state (session_id, tool_call_id, tool_call_json) VALUES (?, ?, ?)');
  addTool.run('s1', 'e1', JSON.stringify({ kind: 'edit', content: [{ type: 'diff', path: '/Users/me/src/webapp/login.ts', oldText: 'a\nb\nc', newText: 'a\nB\nc\nd' }] }));
  addTool.run('s2', 'e2', JSON.stringify({ kind: 'edit', content: [{ type: 'diff', path: '/Users/me/src/api/orders.py', oldText: '', newText: 'x\ny\nz' }] }));
  addTool.run('old', 'e3', JSON.stringify({ kind: 'edit', content: [{ type: 'diff', path: '/old.go', oldText: '', newText: 'q' }] }));
  addTool.run('s1', 'x1', JSON.stringify({ kind: 'execute', content: [] }));
  db.close();
  return { dir, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const YEAR_2026 = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2027, 0, 1), label: '2026' };

module.exports = { buildStore, YEAR_2026, T0 };
