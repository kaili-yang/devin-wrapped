'use strict';
// Plain-text summary for the terminal (colors only when stdout is a TTY).

const { strings, compact } = require('./i18n');

const BLOCKS = ' ▁▂▃▄▅▆▇█';

function sparkline(values) {
  const max = Math.max(1, ...values);
  return values.map((v) => BLOCKS[v === 0 ? 0 : Math.max(1, Math.round((8 * v) / max))]).join('');
}

function renderTerminal(stats, persona, lang, color = false) {
  const t = strings(lang);
  const b = (s) => (color ? `\x1b[1m${s}\x1b[0m` : s);
  const c = (s) => (color ? `\x1b[36m${s}\x1b[0m` : s);
  const [pName, pLine] = t.personas[persona.id];
  const lines = [
    '',
    `  ${c(t.title)}  ${b(stats.period.label)}`,
    '',
    `  ${b(compact(stats.sessions))} ${t.sessions}   ${b(compact(stats.activeDays))} ${t.activeDays}   ${b(compact(stats.toolCalls))} ${t.toolCalls}`,
    `  ${b(`+${compact(stats.linesAdded)} / -${compact(stats.linesRemoved)}`)} ${t.lines}, ${t.files(compact(stats.filesTouched))}`,
    '',
    `  ${t.youAre}: ${b(pName)} — ${pLine}`,
    persona.tags.length ? `  ${t.tagsLabel}: ${persona.tags.map((id) => t.personas[id][0]).join(', ')}` : null,
    '',
    `  ${t.hours}  0h ${c(sparkline(stats.hours))} 23h`,
    stats.longestStreak ? `  ${t.streak(stats.longestStreak)}` : null,
    stats.busiestDay ? `  ${t.busiest(stats.busiestDay.date, stats.busiestDay.messages)}` : null,
    stats.prompts ? `  ${t.prompts(compact(stats.prompts), stats.avgPromptChars)}` : null,
    stats.agentMessages ? `  ${t.tokens(compact(stats.tokens.input + stats.tokens.cacheRead))} ${compact(stats.tokens.output)}` : null,
    stats.longestSession && stats.longestSession.durationMs > 0
      ? `  ${t.longest(t.hm(Math.floor(stats.longestSession.durationMs / 3_600_000), Math.floor((stats.longestSession.durationMs % 3_600_000) / 60_000)), stats.longestSession.title)}`
      : null,
    '',
    list(t.tools, stats.topTools),
    list(t.commands, stats.topCommands),
    list(t.languages, stats.topLanguages),
    list(t.models, stats.models.map((m) => ({ ...m, name: m.label }))),
    list(t.projects, stats.topProjects),
    '',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

function list(title, items) {
  if (!items.length) return null;
  return `  ${title}: ${items.map((i) => `${i.name} (${compact(i.count)})`).join(', ')}`;
}

module.exports = { sparkline, renderTerminal };
