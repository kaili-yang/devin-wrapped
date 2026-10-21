'use strict';
// Reads Devin's local session store (Devin CLI and Devin Desktop share it) into plain
// objects. Read-only; the store is a live WAL database, so we never write or lock it.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultDbPath(env = process.env) {
  if (env.DEVIN_SESSIONS_DB) return env.DEVIN_SESSIONS_DB;
  const base = process.platform === 'win32' && env.LOCALAPPDATA
    ? path.join(env.LOCALAPPDATA, 'devin')
    : path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'devin');
  return path.join(base, 'cli', 'sessions.db');
}

function openDb(file) {
  if (!fs.existsSync(file)) throw new Error(`no Devin session store at ${file} (use --db <path>)`);
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(file, { readOnly: true });
}

// Context compaction sends the transcript back as a "user" message; it is not something the user typed.
const INTERNAL_PROMPT_RE = /^Output a summary from the following messages/;

function parse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * @returns {{ sessions: object[], messages: object[], edits: object[] }}
 * messages: { sessionId, role, ts (ms), userInput, chars, tools: [{ name, command? }], model, tokens }
 * edits:    { sessionId, path, oldText, newText }
 */
function readStore(file, { from = 0, to = Infinity } = {}) {
  const db = openDb(file);
  try {
    const sessions = db.prepare('SELECT id, title, working_directory AS cwd, created_at, last_activity_at, model FROM sessions').all()
      .map((s) => ({ id: s.id, title: s.title || '', cwd: s.cwd || '', createdAt: s.created_at * 1000, lastActivityAt: s.last_activity_at * 1000, model: s.model }));

    const messages = [];
    const seen = new Set();
    const stmt = db.prepare('SELECT session_id, chat_message, created_at FROM message_nodes WHERE created_at >= ? AND created_at < ?');
    for (const row of stmt.iterate(Math.floor(from / 1000), to === Infinity ? Number.MAX_SAFE_INTEGER : Math.ceil(to / 1000))) {
      const m = parse(row.chat_message);
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
      // The same message can appear on several branches of a session's message tree.
      if (m.message_id) {
        if (seen.has(m.message_id)) continue;
        seen.add(m.message_id);
      }
      const meta = m.metadata || {};
      const metrics = meta.metrics || {};
      const content = typeof m.content === 'string' ? m.content : '';
      if (m.role === 'user' && INTERNAL_PROMPT_RE.test(content)) continue;
      messages.push({
        sessionId: row.session_id,
        role: m.role,
        ts: row.created_at * 1000,
        userInput: m.role === 'user' && meta.is_user_input === true,
        chars: content.length,
        tools: Array.isArray(m.tool_calls) ? m.tool_calls.map((c) => ({
          name: String(c && c.name || ''),
          command: c && c.arguments && typeof c.arguments.command === 'string' ? c.arguments.command : undefined,
        })) : [],
        model: m.role === 'assistant' ? meta.generation_model || null : null,
        tokens: {
          input: num(metrics.input_tokens) + num(metrics.cache_creation_tokens),
          output: num(metrics.output_tokens),
          cacheRead: num(metrics.cache_read_tokens),
        },
      });
    }

    const active = new Set(messages.map((m) => m.sessionId));
    const edits = [];
    for (const row of db.prepare("SELECT session_id, tool_call_json FROM tool_call_state WHERE tool_call_json LIKE '%\"diff\"%'").iterate()) {
      if (!active.has(row.session_id)) continue;
      const call = parse(row.tool_call_json);
      for (const c of (call && Array.isArray(call.content) ? call.content : [])) {
        if (c && c.type === 'diff' && typeof c.path === 'string') {
          edits.push({ sessionId: row.session_id, path: c.path, oldText: typeof c.oldText === 'string' ? c.oldText : '', newText: typeof c.newText === 'string' ? c.newText : '' });
        }
      }
    }
    return { sessions, messages, edits };
  } finally {
    db.close();
  }
}

module.exports = { defaultDbPath, readStore };
