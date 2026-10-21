'use strict';

const { buildStore, YEAR_2026 } = require('./fixture');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { readStore } = require('../lib/db');
const { computeStats } = require('../lib/stats');
const { pickPersona } = require('../lib/persona');
const { renderSvg, renderHtml, esc } = require('../lib/card');
const { renderTerminal, sparkline } = require('../lib/terminal');
const { STRINGS } = require('../lib/i18n');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');

function stats(store) {
  return computeStats(readStore(store.file, YEAR_2026), YEAR_2026);
}

function wellFormed(svg) {
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) assert.equal(stack.pop(), m[2], `unbalanced </${m[2]}>`);
    else stack.push(m[2]);
  }
  assert.deepEqual(stack, []);
}

test('every persona has a name and tagline in both languages', () => {
  for (const lang of ['zh', 'en']) {
    for (const id of ['night-owl', 'early-bird', 'weekend-warrior', 'delegator', 'spec-writer', 'refactor-maniac', 'terminal-ninja', 'researcher', 'multitasker', 'steady-builder', 'newcomer']) {
      const p = STRINGS[lang].personas[id];
      assert.ok(p && p[0] && p[1], `${lang}/${id}`);
    }
  }
});

test('the SVG card is well-formed and has no placeholder values', (t) => {
  const store = buildStore();
  t.after(store.cleanup);
  const s = stats(store);
  for (const lang of ['zh', 'en']) {
    const persona = pickPersona(s);
    const svg = renderSvg(s, persona, lang);
    wellFormed(svg);
    assert.doesNotMatch(svg, /NaN|undefined|null|Infinity/);
    assert.match(svg, /width="1080" height="1920"/);
    assert.ok(svg.includes(esc(STRINGS[lang].personas[persona.id][0])));
    assert.match(renderHtml(svg, lang), /<svg[\s\S]*<\/svg>[\s\S]*toBlob/);
  }
});

test('an empty period still renders', (t) => {
  const store = buildStore();
  t.after(store.cleanup);
  const period = { from: Date.UTC(2030, 0, 1), to: Date.UTC(2031, 0, 1), label: '2030' };
  const s = computeStats(readStore(store.file, period), period);
  assert.equal(s.sessions, 0);
  const svg = renderSvg(s, pickPersona(s), 'en');
  wellFormed(svg);
  assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  assert.match(renderTerminal(s, pickPersona(s), 'en'), /New Friend/);
});

test('user text is escaped in the SVG', (t) => {
  const store = buildStore();
  t.after(store.cleanup);
  const s = stats(store);
  s.models = [{ name: 'x', count: 1, label: '<script>&' }];
  s.topLanguages = [];
  const svg = renderSvg(s, pickPersona(s), 'en');
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;&amp;'));
});

test('terminal summary', (t) => {
  const store = buildStore();
  t.after(store.cleanup);
  const out = renderTerminal(stats(store), { id: 'researcher', tags: ['night-owl'] }, 'zh');
  assert.match(out, /3 个会话/);
  assert.match(out, /研究员/);
  assert.match(out, /夜猫子/);
  assert.equal(sparkline([0, 1, 8]), ' ▁█');
});

test('CLI writes svg + html and prints JSON', (t) => {
  const store = buildStore();
  t.after(store.cleanup);
  const env = { ...process.env, TZ: 'UTC' };
  const json = spawnSync(process.execPath, [CLI, '--db', store.file, '--year', '2026', '--json'], { encoding: 'utf8', env });
  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.sessions, 3);
  assert.ok(parsed.persona.id);
  const out = path.join(store.dir, 'out');
  const r = spawnSync(process.execPath, [CLI, '--db', store.file, '--year', '2026', '--lang', 'en', '--out', out, '--no-png', '--no-open'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 sessions/);
  assert.ok(fs.existsSync(path.join(out, 'devin-wrapped-2026.svg')));
  assert.ok(fs.existsSync(path.join(out, 'devin-wrapped-2026.html')));
  const bad = spawnSync(process.execPath, [CLI, '--db', path.join(store.dir, 'missing.db')], { encoding: 'utf8', env });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no Devin session store/);
});
