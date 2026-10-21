'use strict';
// Renders the stats as a 1080x1920 SVG poster (story format) and an HTML page that
// shows it with a "save as PNG" button (canvas export, so no image library needed).

const { strings, compact } = require('./i18n');
const { dayKey } = require('./stats');

const W = 1080;
const H = 1920;
const PAD = 80;
const FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', 'Segoe UI', sans-serif";
const C = { bg1: '#0b1020', bg2: '#2a1050', teal: '#2ee6c5', violet: '#a77bff', pink: '#ff6bb5', text: '#f4f2ff', dim: '#a9a3c9', faint: '#2b2a4a' };
const HEAT = ['#1f1d3a', '#1d4d57', '#1f7f7a', '#27b3a0', '#2ee6c5'];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function clip(s, n) {
  const a = [...String(s)];
  return a.length > n ? `${a.slice(0, n - 1).join('')}…` : a.join('');
}

function text(x, y, s, { size = 28, weight = 400, fill = C.text, anchor = 'start', spacing = 0, extra = '' } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}${extra}>${esc(s)}</text>`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function tile(x, y, w, h, value, label, color) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#ffffff" fill-opacity="0.06" stroke="${color}" stroke-opacity="0.35"/>`
    + text(x + 32, y + 78, value, { size: 64, weight: 800, fill: color })
    + text(x + 32, y + 118, label, { size: 26, fill: C.dim });
}

function barList(x, y, w, title, items, color, fmt = (i) => compact(i.count)) {
  let out = text(x, y, title, { size: 28, weight: 700, fill: C.dim });
  const max = Math.max(1, ...items.map((i) => i.count));
  items.forEach((it, k) => {
    const yy = y + 34 + k * 62;
    out += text(x, yy + 22, clip(it.label || it.name, 16), { size: 26 });
    out += text(x + w, yy + 22, fmt(it), { size: 24, fill: C.dim, anchor: 'end' });
    out += `<rect x="${x}" y="${yy + 34}" width="${w}" height="10" rx="5" fill="${C.faint}"/>`;
    out += `<rect x="${x}" y="${yy + 34}" width="${Math.max(10, (w * it.count) / max).toFixed(1)}" height="10" rx="5" fill="${color}"/>`;
  });
  return out;
}

function hoursChart(x, y, w, h, hours, title) {
  const max = Math.max(1, ...hours);
  const bw = w / 24;
  let out = text(x, y, title, { size: 28, weight: 700, fill: C.dim });
  hours.forEach((v, i) => {
    const bh = Math.max(4, (h * v) / max);
    const color = i >= 22 || i < 5 ? C.violet : i < 9 ? C.pink : C.teal;
    out += `<rect x="${(x + i * bw + 3).toFixed(1)}" y="${(y + 24 + h - bh).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${bh.toFixed(1)}" rx="5" fill="${color}"/>`;
  });
  for (const i of [0, 6, 12, 18, 23]) out += text(x + i * bw + bw / 2, y + h + 58, String(i), { size: 20, fill: C.dim, anchor: 'middle' });
  return out;
}

/** GitHub-style week grid for long periods; a single strip of days for periods up to 60 days. */
function heatmap(x, y, w, daily, period, title) {
  const DAY = 86_400_000;
  const end = Math.min(period.to, Date.now()) - 1;
  const endDay = new Date(end);
  endDay.setHours(12, 0, 0, 0);
  let start = new Date(Math.max(period.from, end - 52 * 7 * DAY));
  start.setHours(12, 0, 0, 0);
  const days = Math.round((endDay - start) / DAY) + 1;
  const strip = days <= 60;
  if (!strip) start = new Date(start.getTime() - start.getDay() * DAY); // back to Sunday
  const weeks = Math.max(1, Math.ceil((Math.round((endDay - start) / DAY) + 1) / 7));
  const cell = strip ? Math.min(60, Math.floor(w / days)) : Math.min(20, Math.floor(w / weeks));
  const gap = Math.max(2, Math.round(cell / 6));
  const max = Math.max(1, ...Object.values(daily));
  let out = text(x, y, title, { size: 28, weight: 700, fill: C.dim });
  for (let t = start.getTime(), i = 0; t <= endDay.getTime(); t += DAY, i++) {
    const v = daily[dayKey(t)] || 0;
    const level = v === 0 ? 0 : Math.min(4, 1 + Math.floor((3.999 * v) / max));
    const cx = x + (strip ? i : Math.floor(i / 7)) * cell;
    const cy = y + 24 + (strip ? 0 : i % 7) * cell;
    out += `<rect x="${cx}" y="${cy}" width="${cell - gap}" height="${cell - gap}" rx="${Math.min(8, cell / 4)}" fill="${HEAT[level]}"/>`;
  }
  return { svg: out, height: 24 + (strip ? 1 : 7) * cell };
}

/** Clips to roughly `units` full-width characters (CJK = 1, Latin ≈ 0.55). */
function clipWidth(s, units) {
  let used = 0;
  const out = [];
  for (const ch of String(s)) {
    used += /[\u2e80-\uffff]/.test(ch) ? 1 : 0.55;
    if (used > units) return `${out.join('').trimEnd()}…`;
    out.push(ch);
  }
  return out.join('');
}

/** @param {object} stats from computeStats  @param {{ id, tags }} persona */
function renderSvg(stats, persona, lang, opts = {}) {
  const t = strings(lang);
  const inner = W - 2 * PAD;
  const [pName, pLine] = t.personas[persona.id];
  const parts = [];
  parts.push(`<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient>
  <linearGradient id="hero" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.teal}"/><stop offset="0.55" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.pink}"/></linearGradient>
</defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  parts.push(`<circle cx="${W - 60}" cy="140" r="260" fill="${C.violet}" fill-opacity="0.12"/><circle cx="40" cy="${H - 260}" r="300" fill="${C.teal}" fill-opacity="0.08"/>`);

  let y = 120;
  parts.push(text(PAD, y, t.title, { size: 30, weight: 700, fill: C.teal, spacing: 8 }));
  parts.push(text(PAD, y + 126, stats.period.label, { size: 128, weight: 900, fill: 'url(#hero)' }));
  parts.push(text(PAD, y + 180, t.subtitle(stats.period.label), { size: 30, fill: C.dim }));

  y = 350;
  const tw = (inner - 24) / 2;
  parts.push(tile(PAD, y, tw, 140, compact(stats.sessions), t.sessions, C.teal));
  parts.push(tile(PAD + tw + 24, y, tw, 140, compact(stats.activeDays), t.activeDays, C.violet));
  parts.push(tile(PAD, y + 164, tw, 140, compact(stats.toolCalls), t.toolCalls, C.pink));
  parts.push(tile(PAD + tw + 24, y + 164, tw, 140, compact(stats.linesAdded + stats.linesRemoved), t.lines, C.teal));

  y = 690;
  parts.push(`<rect x="${PAD}" y="${y}" width="${inner}" height="244" rx="32" fill="url(#hero)" fill-opacity="0.16" stroke="url(#hero)" stroke-width="2"/>`);
  parts.push(text(PAD + 40, y + 56, t.youAre, { size: 28, fill: C.dim }));
  parts.push(text(PAD + 40, y + 142, pName, { size: 84, weight: 900, fill: 'url(#hero)' }));
  parts.push(text(PAD + 40, y + 192, clipWidth(pLine, 28), { size: 30 }));
  if (persona.tags.length) parts.push(text(PAD + 40, y + 228, `${t.tagsLabel} · ${persona.tags.map((id) => t.personas[id][0]).join(' · ')}`, { size: 24, fill: C.dim }));

  y = 1000;
  parts.push(hoursChart(PAD, y, inner, 100, stats.hours, t.hours));

  y = 1206;
  const hm = heatmap(PAD, y, inner, stats.daily, stats.period, t.heatmap);
  parts.push(hm.svg);

  y += hm.height + 60;
  const cw = (inner - 60) / 2;
  const rows = 3;
  const right = stats.topLanguages.length ? stats.topLanguages : stats.models;
  parts.push(barList(PAD, y, cw, t.tools, stats.topTools.slice(0, rows), C.teal));
  parts.push(barList(PAD + cw + 60, y, cw, stats.topLanguages.length ? t.languages : t.models, right.slice(0, rows), C.violet));

  y += 34 + rows * 62 + 48;
  const facts = [];
  if (stats.longestStreak) facts.push(t.streak(stats.longestStreak));
  if (stats.lateNight) {
    const d = new Date(stats.lateNight.ts);
    const date = `${d.getMonth() + 1}/${d.getDate()}`;
    facts.push(d.getHours() < 5 ? t.lateNight(fmtTime(d), date) : t.lateEvening(fmtTime(d), date));
  }
  if (stats.models.length && stats.topLanguages.length) facts.push(t.topModel(stats.models[0].label));
  if (stats.prompts) facts.push(t.prompts(compact(stats.prompts), stats.avgPromptChars));
  facts.slice(0, Math.max(0, Math.floor((H - 110 - y) / 46))).forEach((f, i) => {
    parts.push(`<circle cx="${PAD + 8}" cy="${y + i * 46 - 9}" r="6" fill="${[C.teal, C.violet, C.pink, C.teal][i % 4]}"/>`);
    parts.push(text(PAD + 30, y + i * 46, clipWidth(f, 30), { size: 28 }));
  });

  parts.push(text(W / 2, H - 56, opts.footer || t.footer, { size: 24, fill: C.dim, anchor: 'middle' }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(FONT)}">\n${parts.join('\n')}\n</svg>\n`;
}

function renderHtml(svg, lang, fileBase = 'devin-wrapped') {
  const save = lang === 'zh' ? '保存为 PNG' : 'Save as PNG';
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Devin Wrapped</title>
<style>
  html,body{margin:0;background:#06080f;color:#f4f2ff;font-family:${FONT}}
  main{display:flex;flex-direction:column;align-items:center;gap:20px;padding:24px}
  #card svg{width:min(540px,92vw);height:auto;border-radius:24px;box-shadow:0 20px 80px rgba(120,80,255,.35)}
  button{font:inherit;font-size:16px;padding:12px 28px;border-radius:999px;border:0;background:linear-gradient(90deg,#2ee6c5,#a77bff,#ff6bb5);color:#0b1020;font-weight:700;cursor:pointer}
  body.shot main{padding:0}body.shot #card svg{width:1080px;border-radius:0;box-shadow:none}body.shot button{display:none}
</style></head>
<body><main><div id="card">${svg}</div><button id="save">${save}</button></main>
<script>
  if (location.hash === '#shot') document.body.classList.add('shot');
  document.getElementById('save').onclick = () => {
    const svg = document.querySelector('#card svg');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 1080; c.height = 1920;
      c.getContext('2d').drawImage(img, 0, 0, 1080, 1920);
      c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = ${JSON.stringify(`${fileBase}.png`)}; a.click(); });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  };
</script></body></html>
`;
}

module.exports = { W, H, esc, clip, renderSvg, renderHtml };
