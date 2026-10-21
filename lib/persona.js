'use strict';
// Picks the persona whose signal exceeds its threshold by the widest margin.

const PERSONAS = [
  { id: 'night-owl', score: (s) => s.shares.night / 0.25 },
  { id: 'early-bird', score: (s) => s.shares.morning / 0.2 },
  { id: 'weekend-warrior', score: (s) => s.shares.weekend / 0.35 },
  { id: 'delegator', score: (s) => s.toolsPerPrompt / 15 },
  { id: 'spec-writer', score: (s) => s.avgPromptChars / 300 },
  { id: 'refactor-maniac', score: (s) => (s.linesAdded + s.linesRemoved) / 5000 },
  { id: 'terminal-ninja', score: (s) => (s.toolCalls >= 20 ? s.shellCommands / s.toolCalls / 0.45 : 0) },
  { id: 'researcher', score: (s) => (s.toolCalls >= 20 ? s.webCalls / s.toolCalls / 0.1 : 0) },
  { id: 'multitasker', score: (s) => s.maxSessionsInADay / 4 },
];

/** @returns {{ id: string, tags: string[] }} main persona plus up to two runner-up tags */
function pickPersona(stats) {
  if (!stats.sessions) return { id: 'newcomer', tags: [] };
  const ranked = PERSONAS.map((p) => ({ id: p.id, score: p.score(stats) || 0 })).filter((p) => p.score >= 1).sort((a, b) => b.score - a.score);
  if (!ranked.length) return { id: 'steady-builder', tags: [] };
  return { id: ranked[0].id, tags: ranked.slice(1, 3).map((p) => p.id) };
}

module.exports = { PERSONAS, pickPersona };
