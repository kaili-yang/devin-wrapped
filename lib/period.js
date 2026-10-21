'use strict';

/** @returns {{ from: number, to: number, label: string }} */
function resolvePeriod({ year, days, all } = {}, lang = 'en', now = Date.now()) {
  if (all) return { from: 0, to: now + 1, label: lang === 'zh' ? '全部' : 'All time' };
  if (days) {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1) throw new Error('--days must be a positive integer');
    return { from: now - n * 86_400_000, to: now + 1, label: lang === 'zh' ? `最近 ${n} 天` : `Last ${n} days` };
  }
  const y = year ? Number(year) : new Date(now).getFullYear();
  if (!Number.isInteger(y) || y < 2000 || y > 3000) throw new Error('--year must be a year like 2026');
  return { from: new Date(y, 0, 1).getTime(), to: new Date(y + 1, 0, 1).getTime(), label: String(y) };
}

module.exports = { resolvePeriod };
