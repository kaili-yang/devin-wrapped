#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { defaultDbPath, readStore } = require('../lib/db');
const { computeStats } = require('../lib/stats');
const { pickPersona } = require('../lib/persona');
const { resolvePeriod } = require('../lib/period');
const { renderSvg, renderHtml } = require('../lib/card');
const { renderTerminal } = require('../lib/terminal');

const HELP = `devin-wrapped — your year with Devin, as a shareable card

Usage: npx devin-wrapped [options]

  --year <yyyy>     calendar year (default: this year)
  --days <n>        the last n days instead
  --all             everything in the store
  --out <dir>       where to write the card (default: ./devin-wrapped-<period>)
  --db <path>       Devin session store (default: ${defaultDbPath()})
  --json            print the raw stats as JSON and exit
  --no-png          skip the PNG (needs Chrome/Chromium/Edge)
  --no-open         do not open the result
  -h, --help

Reads Devin's local session store read-only. Nothing is uploaded.`;

const BROWSERS = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium'],
  win32: [`${process.env['PROGRAMFILES'] || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`],
};

function findBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  return (BROWSERS[process.platform] || []).find((p) => fs.existsSync(p)) || null;
}

/** Screenshots the HTML at exactly 1080x1920 with a headless browser. */
function renderPng(htmlPath, pngPath) {
  const browser = findBrowser();
  if (!browser) return false;
  const url = `file://${path.resolve(htmlPath).split(path.sep).join('/').replace(/^([A-Za-z]:)/, '/$1')}#shot`;
  const r = spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1080,1920', `--screenshot=${path.resolve(pngPath)}`, url], { stdio: 'ignore', timeout: 60000 });
  return r.status === 0 && fs.existsSync(pngPath);
}

function openFile(file) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  spawnSync(cmd, args, { stdio: 'ignore', timeout: 10000 });
}

function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'period';
}

function main() {
  const { values } = parseArgs({
    options: {
      year: { type: 'string' }, days: { type: 'string' }, all: { type: 'boolean' },
      out: { type: 'string' }, db: { type: 'string' }, json: { type: 'boolean' },
      'no-png': { type: 'boolean' }, 'no-open': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return console.log(HELP);
  const period = resolvePeriod(values);
  const raw = readStore(values.db || defaultDbPath(), period);
  const stats = computeStats(raw, period);
  const persona = pickPersona(stats);
  if (values.json) return console.log(JSON.stringify({ ...stats, persona }, null, 2));

  console.log(renderTerminal(stats, persona, process.stdout.isTTY));
  const base = `devin-wrapped-${slug(values.all ? 'all' : values.days ? `${values.days}d` : period.label)}`;
  const outDir = path.resolve(values.out || base);
  fs.mkdirSync(outDir, { recursive: true });
  const svg = renderSvg(stats, persona);
  const files = { svg: path.join(outDir, `${base}.svg`), html: path.join(outDir, `${base}.html`), png: path.join(outDir, `${base}.png`) };
  fs.writeFileSync(files.svg, svg);
  fs.writeFileSync(files.html, renderHtml(svg, base));
  const png = !values['no-png'] && renderPng(files.html, files.png);
  console.log(`  ${png ? files.png : files.html}`);
  if (!png && !values['no-png']) console.log('  (no Chrome/Edge found for the PNG: open the HTML and click "Save as PNG")');
  if (!values['no-open']) openFile(png ? files.png : files.html);
}

try {
  main();
} catch (e) {
  process.stderr.write(`devin-wrapped: ${e.message}\n`);
  process.exit(1);
}
