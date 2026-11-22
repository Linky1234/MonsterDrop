const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const PORT = 43127;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HOSTED = process.env.MONSTERDROP_SURGE_HOSTED === '1';
const TOKEN = HOSTED ? process.env.MONSTERDROP_SURGE_KEY : crypto.randomBytes(32).toString('hex');
let busy = false;
let job = null;
const WEBSITE = 'https://linky1234.github.io';

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Command timed out. Check the publisher status before starting another batch.')); }, 180000);
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-200000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-200000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error('Command failed. Check Git, Surge credentials, account limits, and the repository branch. For a local helper, run npx surge login.'));
    });
  });
}

function validate(data) {
  const repo = String(data.repo || '').trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '');
  const branch = String(data.branch || 'main').trim();
  const file = String(data.file || '').trim();
  const count = Number(data.count);
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/i.test(repo)) throw new Error('Enter owner/repository.');
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(branch) || branch.includes('..')) throw new Error('Invalid branch.');
  if (!file || file.includes('\\') || file.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.')) || !/\.(html?|svg)$/i.test(file)) throw new Error('Choose a relative HTML or SVG file path.');
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Choose 1–1000 links per batch.');
  return { repo, branch, file, count };
}

async function copySite(source, destination) {
  let bytes = 0;
  async function visit(relative = '') {
    for (const entry of await fs.readdir(path.join(source, relative), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'CNAME') continue;
      const next = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symbolic links are not supported.');
      if (entry.isDirectory()) { await fs.mkdir(path.join(destination, next), { recursive: true }); await visit(next); }
      else if (entry.isFile()) {
        bytes += (await fs.stat(path.join(source, next))).size;
        if (bytes > 100 * 1024 * 1024) throw new Error('This helper supports sites up to 100 MB.');
        await fs.copyFile(path.join(source, next), path.join(destination, next));
      }
    }
  }
  await fs.mkdir(destination, { recursive: true });
  await visit();
}

const CLEVER_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAZlBMVEUUZP////8AWv8AX/8AXP8OYv8AWP/q8f/y9//3+v/7/f+mwP89ev9olP+Orv+xx/9tmP+7zv92nv/a5f9Sh/8ca//f6f8lb/9djf8ydP/H1//V4v+fu//l7v9Ff/+Bpf+VtP/P3f+iYcyoAAACOElEQVRYhe1X2XKrMAw1kmXCEpYEQ3AohP//yQtNW5tgO4TO3Pah5ykz9lGko8WCsT/8bhAhhwmcI9HrdARKj1mS53mXHVMCfO3PgRVlGGiE5UnCdjegSQ7BI6K8F9tMcJav2HeodosJcYoc/And0ziISjd9wrn1q4ny7OUHwaHivv+X4RN+EMQXtwVib0/5E3pnFHhdOVyf61VGI+lQUiRLX8uiQT4VclOUy8Rc7bnAy4LeSbj3wNQTILOFicwmA6EpwDld1AxBo0wLrcUFnhkXSv4oFJkB5o3FATDEKoXlgug+TqeKtilwMkWyaUTivUjPF3tDgE5h3NjTNJdJeFoF93HYaAduVgdmLy8dcUcN4PDFPzjo8y13FYNuwsTlgA9mEVQ7JihjMv7kh3tGMKP0y4HRluSnwEpX2R4JzEbqfsjAd0P4tohkpBF3pdEopH5XIYEeOPtUNOaRJwbyHLW6na0jcwZWg2MaTAD9pkXM1fP1NI9czyvXAyFQ9qF1H6sqtZ8SGpM/sd0RnzLlzOoFvwU+CyS0zPHN+riR+TIruUzmw9qS2gxgYV45DHozm36dFu++o1TEcjcKk4rNiyJnfbdcG2rXaKY6WCKqRzXWq53J9jLeDcj1dmeBZ0XBdoOFwtcr2D5bcuKjv9eQKS//rfctae86QObh57Rh6X5YRgxcq23jjkRfxmv6eNm+8xPIYTQTEl2z9rVPBuIgqyEplVJlN1QSXMXnAyKAEAI4vva58of/jX9wYhfxu8uIYwAAAABJRU5ErkJggg==';
function brandHTML(html) {
  html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '')
    .replace(/<link\b[^>]*>/gi, tag => /\brel\s*=\s*(?:"[^"]*\bicon\b[^"]*"|'[^']*\bicon\b[^']*'|[^\s>]*icon[^\s>]*)/i.test(tag) ? '' : tag);
  const branding = '<title>Clever</title><link rel="icon" type="image/png" href="' + CLEVER_ICON + '">';
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, match => match + branding);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, match => match + '<head>' + branding + '</head>');
  return '<head>' + branding + '</head>' + html;
}

async function prepare(repoDirectory, siteDirectory, file) {
  const selected = path.join(siteDirectory, ...file.split('/'));
  const stat = await fs.stat(selected).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error('Selected file not found. Check capitalization and the file path.');
  if (/\.svg$/i.test(file)) {
    const url = '/' + file.split('/').map(encodeURIComponent).join('/');
    await fs.writeFile(path.join(siteDirectory, 'index.html'), brandHTML('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Published site</title><style>html,body,object{margin:0;width:100%;height:100%;border:0;display:block}</style></head><body><object type="image/svg+xml" data="' + url + '"><a href="' + url + '">Open SVG</a></object></body></html>'));
  } else {
    let html = await fs.readFile(selected, 'utf8');
    const parent = file.split('/').slice(0, -1);
    if (parent.length && !/<base\b/i.test(html)) {
      const base = '<base href="/' + parent.map(encodeURIComponent).join('/') + '/">';
      html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, match => match + base) : base + html;
    }
    await fs.writeFile(path.join(siteDirectory, 'index.html'), brandHTML(html));
  }
}

async function verify(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const text = await response.text();
      if (response.ok && !/\bpage not found\b/i.test(text.slice(0, 1000))) return true;
    } catch {}
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return false;
}

async function publish(data, onResult = () => {}) {
  if (HOSTED && !process.env.SURGE_TOKEN) throw new Error('Set SURGE_TOKEN in the Render service environment.');
  const { repo, branch, file, count } = validate(data);
  const requireHere = createRequire(path.join(process.cwd(), 'package.json'));
  let surge;
  try { surge = requireHere.resolve('surge/bin/surge'); }
  catch { throw new Error('Install surge@0.56.0 in the publisher folder or check the Render build logs.'); }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'monsterdrop-'));
  const results = [];
  try {
    const checkout = path.join(temporary, 'repo');
    const site = path.join(temporary, 'site');
    await run('git', ['clone', '--depth', '1', '--single-branch', '--branch', branch, '--', 'https://github.com/' + repo + '.git', checkout], temporary);
    await copySite(checkout, site);
    await prepare(checkout, site, file);
    for (let i = 0; i < count; i++) {
      const domain = 'md-' + crypto.randomBytes(10).toString('hex') + '.surge.sh';
      const url = 'https://' + domain + '/';
      try {
        const output = await run(process.execPath, [surge, site, domain], site);
        if (!/Success!\s*-\s*Published to/i.test(output.replace(/\x1b\[[0-9;]*m/g, ''))) throw new Error('Surge did not confirm publication.');
        const checked = await verify(url);
        results.push({ url, status: checked ? 'Published and HTTP-checked' : 'Published; HTTP check inconclusive' });
        onResult(results);
      } catch (error) {
        results.push({ url, status: 'Failed', error: error.message });
        onResult(results);
        break;
      }
    }
    return results;
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

function start({ port = HOSTED ? Number(process.env.PORT) || 10000 : PORT, publisher = publish } = {}) {
  if (HOSTED && (!TOKEN || TOKEN.length < 32 || /\s/.test(TOKEN))) {
    throw new Error('Set MONSTERDROP_SURGE_KEY to a private key of at least 32 characters.');
  }
  if (HOSTED && (!process.env.SURGE_TOKEN || /\s/.test(process.env.SURGE_TOKEN))) {
    throw new Error('Set SURGE_TOKEN in the Render environment to your Surge token.');
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (HOSTED && req.method === 'GET' && req.url === '/ready') return send(200, { status: 'ok' });
    if (!HOSTED && req.headers.host !== '127.0.0.1:' + server.address().port) return send(403, { error: 'Invalid host.' });
    const origin = req.headers.origin;
    if (origin !== WEBSITE && (HOSTED || origin !== ORIGIN)) {
      if (!origin && req.method === 'GET' && req.url === '/') {
        return send(200, { message: 'Publisher running. Connect from the MonsterDrop Surge Publisher tab.' });
      }
      return send(403, { error: 'This helper accepts your MonsterDrop site only.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') {
      const requested = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
      if (!['GET', 'POST'].includes(req.headers['access-control-request-method']) || requested.some(x => !['content-type', 'x-monsterdrop-token'].includes(x))) return send(403, { error: 'Unsupported request.' });
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-MonsterDrop-Token');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(204);
      return res.end();
    }
    const supplied = Buffer.from(String(req.headers['x-monsterdrop-token'] || ''));
    const expected = Buffer.from(TOKEN);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return send(403, { error: 'Wrong publisher connection key. Check MONSTERDROP_SURGE_KEY in Render or your local helper code.' });
    }
    if (req.method === 'GET' && req.url === '/health') return send(200, { connected: true, busy, job });
    if (req.method === 'GET' && req.url === '/job') return send(200, { job });
    if (req.method !== 'POST' || req.url !== '/publish') return send(404, { error: 'Not found.' });
    if (busy) return send(409, { error: 'A batch is already running.' });
    busy = true;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) throw new Error('Request too large.');
      }
      const data = validate(JSON.parse(body));
      job = { id: crypto.randomBytes(8).toString('hex'), state: 'running', count: data.count, results: [], error: '' };
      const current = job;
      send(202, { job: current });
      publisher(data, results => { current.results = [...results]; })
        .then(results => { current.results = results; current.state = 'finished'; })
        .catch(error => { current.error = error.message; current.state = 'failed'; })
        .finally(() => { busy = false; });
    } catch (error) {
      busy = false;
      send(400, { error: error.message });
    }
  });
  server.requestTimeout = 0;
  server.on('error', error => console.error(error.message));
  server.listen(port, HOSTED ? '0.0.0.0' : '127.0.0.1', () => {
    if (HOSTED) {
      console.log('Online Surge publisher ready. Use the service URL and MONSTERDROP_SURGE_KEY in MonsterDrop.');
      return;
    }
    console.log('MonsterDrop helper: ' + ORIGIN);
    console.log('Helper code: ' + TOKEN);
    console.log('Paste this code into your MonsterDrop Surge Publisher tab.');
    console.log('Keep PowerShell open. Press Ctrl+C to stop.');
  });
  return server;
}
if (require.main === module) {
  try { start(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validate, copySite, prepare, brandHTML, start };
