const http = require('node:http');
const crypto = require('node:crypto');

const PORT = 43130;
const ORIGIN = 'https://linky1234.github.io';
const CHANNEL = '1499944531016028342';
const GUILD = '1468487779456389163';
const MAX_BYTES = 8 * 1024 * 1024;
const USER_AGENT = 'DiscordBot (https://github.com/Linky1234/MonsterDrop, 1.1.0)';

function validateBatch(input) {
  if (!input || typeof input.id !== 'string' ||
      !/^[a-zA-Z0-9-]{16,64}$/.test(input.id) ||
      !Number.isSafeInteger(input.perProvider) ||
      input.perProvider < 1 || input.perProvider > 100000000 ||
      !Array.isArray(input.groups) || !input.groups.length ||
      input.groups.length > 30) {
    throw new Error('Invalid batch. Generate links in MonsterDrop and try again.');
  }

  const names = new Set();
  for (const group of input.groups) {
    if (!group || typeof group.provider !== 'string' ||
        !/^[a-zA-Z0-9 .-]{1,80}$/.test(group.provider) ||
        names.has(group.provider) || !Array.isArray(group.links) ||
        !group.links.length || group.links.length > input.perProvider ||
        group.links.some(link =>
          typeof link !== 'string' || !link || link.length > 10000 ||
          /[\r\n\0]/.test(link)
        )) {
      throw new Error('Invalid provider or link list.');
    }
    names.add(group.provider);
  }
  return input;
}

function buildAttachment(groups) {
  const content = groups.map(group =>
    '# ' + group.provider + ' (' + group.links.length + ')\n' +
    group.links.join('\n')
  ).join('\n\n');

  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
    throw new Error('The attachment exceeds 8 MiB. Send fewer links per provider.');
  }
  return content;
}

async function discordFailure(response, stage, token) {
  let data;
  let raw = '';
  try {
    raw = await response.text();
    data = JSON.parse(raw);
  } catch {
    // A host or edge rejection may be HTML rather than Discord's JSON.
  }
  const code = Number.isSafeInteger(data?.code) ? data.code : null;
  let detail = typeof data?.message === 'string' ? data.message : '';
  if (token) detail = detail.split(token).join('[redacted]');
  detail = detail.replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, 240);

  const hints = {
    50001: 'The bot cannot access the destination channel. Check its channel membership and View Channel permission.',
    50013: 'Check this bot\'s Send Messages and Attach Files permissions in the destination channel. For a thread, also allow Send Messages in Threads and ensure the bot can join it.',
    50083: 'The destination thread is archived. Unarchive it before sending.',
    40058: 'A forum channel cannot receive a plain message. Use a text channel or a forum post thread.',
    10003: 'The configured destination channel was not found.',
    40333: 'Discord reports a Cloudflare rejection. The sender now includes the required bot User-Agent.',
    40005: 'The upload is too large. Send fewer links.',
    50045: 'The attachment is too large. Send fewer links.',
    50014: 'Check DISCORD_BOT_TOKEN in Render.'
  };
  let hint = hints[code] || '';
  if (!hint && response.status === 401) hint = 'Check DISCORD_BOT_TOKEN in Render.';
  if (!data && response.status === 403) {
    hint = /cloudflare/i.test(raw)
      ? 'A Cloudflare response rejected the request. Channel permissions alone may not resolve this.'
      : 'The response was not Discord JSON, so no Discord error code was available.';
  }
  return new Error('Discord ' + stage + ' failed: HTTP ' + response.status +
    (code !== null ? ', code ' + code : '') +
    (detail ? ' — ' + detail : '') + (hint ? '. ' + hint : ''));
}

async function sendToDiscord(token, batch, request = fetch, wait = ms =>
  new Promise(resolve => setTimeout(resolve, ms))) {
  let channelResponse;
  try {
    channelResponse = await request(
      'https://discord.com/api/v10/channels/' + CHANNEL,
      {
        headers: { Authorization: 'Bot ' + token, 'User-Agent': USER_AGENT },
        redirect: 'error',
        signal: AbortSignal.timeout(20000)
      }
    );
  } catch {
    throw new Error('Could not connect to Discord to check the channel.');
  }

  if (!channelResponse.ok) {
    throw await discordFailure(channelResponse, 'channel check', token);
  }

  const channel = await channelResponse.json();
  if (channel.id !== CHANNEL || channel.guild_id !== GUILD) {
    throw new Error('Discord returned an unexpected channel.');
  }

  const attachment = buildAttachment(batch.groups);
  const total = batch.groups.reduce((sum, group) => sum + group.links.length, 0);
  const nonce = crypto.createHash('sha256').update(batch.id).digest('hex').slice(0, 24);
  const summary = [
    'MonsterDrop batch — ' + total.toLocaleString() + ' generated results',
    ...batch.groups.map(group =>
      group.provider + ': ' + group.links.length.toLocaleString()
    )
  ].join('\n');

  for (let attempt = 0; attempt < 3; attempt++) {
    const body = new FormData();
    body.set('payload_json', JSON.stringify({
      content: summary,
      allowed_mentions: { parse: [] },
      nonce,
      enforce_nonce: true,
      attachments: [{ id: 0, filename: 'monsterdrop-links.txt' }]
    }));
    body.set('files[0]', new Blob([attachment], { type: 'text/plain;charset=utf-8' }),
      'monsterdrop-links.txt');

    let response;
    try {
      response = await request(
        'https://discord.com/api/v10/channels/' + CHANNEL + '/messages',
        {
          method: 'POST',
          headers: { Authorization: 'Bot ' + token, 'User-Agent': USER_AGENT },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(30000)
        }
      );
    } catch {
      throw new Error('Delivery is unconfirmed. Check the Discord channel before sending a new batch.');
    }

    if (response.status === 429) {
      const limit = await response.json();
      const seconds = Number(limit.retry_after);
      if (attempt === 2 || !Number.isFinite(seconds) || seconds < 0 || seconds > 30) {
        throw new Error('Discord is rate limiting this bot. Wait before sending a new batch.');
      }
      await wait(Math.ceil(seconds * 1000) + 100);
      continue;
    }

    if (!response.ok) {
      throw await discordFailure(response, 'message upload', token);
    }

    let message;
    try {
      message = await response.json();
    } catch {
      throw new Error('Delivery is unconfirmed. Check Discord before sending a new batch.');
    }
    if (!/^\d+$/.test(message.id || '')) {
      throw new Error('Delivery is unconfirmed. Check Discord before sending a new batch.');
    }

    return {
      total,
      messageURL: 'https://discord.com/channels/' + GUILD + '/' + CHANNEL + '/' + message.id
    };
  }
}

function start(token, {
  hosted = process.env.MONSTERDROP_HOSTED === '1',
  port = Number(process.env.PORT) || PORT,
  connectionKey = process.env.MONSTERDROP_SEND_KEY,
  request = fetch
} = {}) {
  if (!token || /\s/.test(token)) {
    throw new Error('Set DISCORD_BOT_TOKEN in the server environment to your bot token first.');
  }

  if (hosted && (!connectionKey || connectionKey.length < 32 || /\s/.test(connectionKey))) {
    throw new Error('Set MONSTERDROP_SEND_KEY to a private key of at least 32 characters.');
  }
  const code = hosted ? connectionKey : crypto.randomBytes(24).toString('hex');
  const instance = crypto.randomUUID();
  const jobs = new Map();
  let busy = false;

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');

    function reply(status, data) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }

    if (hosted && req.method === 'GET' && req.url === '/health') {
      return reply(200, { status: 'ok' });
    }

    if ((!hosted && req.headers.host !== '127.0.0.1:' + server.address().port) ||
        req.headers.origin !== ORIGIN) {
      return reply(403, { error: 'Open MonsterDrop directly on GitHub Pages.' });
    }

    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    if (req.method === 'OPTIONS') {
      const method = req.headers['access-control-request-method'];
      const headers = String(req.headers['access-control-request-headers'] || '')
        .toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
      if (!['GET', 'POST'].includes(method) ||
          headers.some(header => !['content-type', 'x-monsterdrop-discord-code',
            'x-monsterdrop-server-instance'].includes(header))) {
        return reply(403, { error: 'Unsupported request.' });
      }
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type, X-MonsterDrop-Discord-Code, X-MonsterDrop-Server-Instance',
        'Access-Control-Allow-Private-Network': 'true'
      });
      return res.end();
    }

    const suppliedCode = Buffer.from(String(req.headers['x-monsterdrop-discord-code'] || ''));
    const expectedCode = Buffer.from(code);
    if (suppliedCode.length !== expectedCode.length ||
        !crypto.timingSafeEqual(suppliedCode, expectedCode)) {
      return reply(403, { error: 'The connection key is incorrect. Check your server settings.' });
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/session') {
      return reply(200, { instance });
    }
    if (req.method === 'GET' && url.pathname === '/job') {
      const stored = jobs.get(url.searchParams.get('id'));
      return stored
        ? reply(200, { job: stored.job })
        : reply(404, { error: 'Batch not found. Check Discord if the helper restarted.' });
    }
    if (req.method !== 'POST' || url.pathname !== '/send') {
      return reply(404, { error: 'Unknown route.' });
    }

    if (hosted && req.headers['x-monsterdrop-server-instance'] !== instance) {
      return reply(409, { error: 'The server restarted. Check Discord, then refresh MonsterDrop before sending a new batch.' });
    }

    let batch;
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          return reply(413, { error: 'Batch exceeds 8 MiB. Send fewer results.' });
        }
        chunks.push(chunk);
      }
      batch = validateBatch(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      buildAttachment(batch.groups);
    } catch {
      return reply(400, { error: 'Invalid or oversized batch. Send fewer results if needed.' });
    }

    const digest = crypto.createHash('sha256').update(JSON.stringify(batch)).digest('hex');
    const existing = jobs.get(batch.id);
    if (existing) {
      return existing.digest === digest
        ? reply(200, { job: existing.job })
        : reply(409, { error: 'This batch ID already belongs to different results.' });
    }
    if (busy) return reply(409, { error: 'Another batch is still being sent.' });

    // Retain recent jobs so reconnects can recover the result without reposting.
    for (const [id, entry] of jobs) {
      if (entry.job.state !== 'sending' && Date.now() - entry.created > 3600000) jobs.delete(id);
    }
    if (jobs.size >= 100) {
      const oldest = jobs.keys().next().value;
      jobs.delete(oldest);
    }

    const job = { id: batch.id, state: 'sending', messageURL: '', error: '' };
    jobs.set(batch.id, { job, digest, created: Date.now() });
    busy = true;
    reply(202, { job });

    sendToDiscord(token, batch, request)
      .then(result => {
        Object.assign(job, result, { state: 'sent' });
      })
      .catch(error => {
        job.state = 'failed';
        job.error = error.message;
      })
      .finally(() => { busy = false; });
  });

  server.requestTimeout = 30000;
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'The Discord helper is already running on port ' + port + '.'
      : error.message);
  });
  server.listen(port, hosted ? '0.0.0.0' : '127.0.0.1', () => {
    if (!hosted) console.log('Discord helper code: ' + code);
    console.log('Channel: https://discord.com/channels/' + GUILD + '/' + CHANNEL);
    console.log(hosted
      ? 'Online Discord sender is ready. Use the service URL and MONSTERDROP_SEND_KEY in MonsterDrop.'
      : 'Paste the helper code into MonsterDrop. Keep PowerShell open.');
  });
  return { server, code };
}

if (require.main === module) {
  try {
    start(process.env.DISCORD_BOT_TOKEN);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateBatch, buildAttachment, sendToDiscord, start };
