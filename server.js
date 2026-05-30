#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const RADIO_BROWSER = 'https://de1.api.radio-browser.info/json/stations/search';

let stationCache = { at: 0, data: null };
const CACHE_MS = 10 * 60 * 1000;

async function fetchStations() {
  const now = Date.now();
  if (stationCache.data && now - stationCache.at < CACHE_MS) return stationCache.data;

  const tags = ['pop', 'rock', 'indie', 'classic-rock', 'top-40', 'dance'];
  const all = [];
  for (const tag of tags) {
    const params = new URLSearchParams({
      tag,
      hidebroken: 'true',
      order: 'clickcount',
      reverse: 'true',
      limit: '8',
      is_https: 'true',
    });
    try {
      const res = await fetch(`${RADIO_BROWSER}?${params}`, {
        headers: { 'User-Agent': 'AutoTuneFM/0.1' },
      });
      const data = await res.json();
      for (const s of data) {
        const codec = (s.codec || '').toUpperCase();
        if (!['MP3', 'AAC', 'AAC+'].includes(codec)) continue;
        if (!s.url_resolved || !s.url_resolved.startsWith('http')) continue;
        if (all.find(x => x.id === s.stationuuid)) continue;
        all.push({
          id: s.stationuuid,
          name: (s.name || 'Unknown').trim().slice(0, 28),
          url: s.url_resolved,
          codec,
          bitrate: s.bitrate,
          country: s.countrycode,
          tag,
        });
      }
    } catch (e) {
      console.error(`tag ${tag}:`, e.message);
    }
  }

  stationCache = { at: now, data: all };
  return all;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  setCors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (u.pathname === '/stations') {
    try {
      const stations = await fetchStations();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stations));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (u.pathname === '/stream') {
    const streamUrl = u.searchParams.get('url');
    if (!streamUrl || !streamUrl.startsWith('http')) {
      res.writeHead(400); res.end('missing or bad url'); return;
    }
    let upstream;
    try {
      upstream = await fetch(streamUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'AutoTuneFM/0.1', 'Icy-MetaData': '0' },
      });
    } catch (e) {
      res.writeHead(502); res.end('upstream error: ' + e.message); return;
    }
    if (!upstream.ok || !upstream.body) {
      res.writeHead(upstream.status || 502);
      res.end('upstream returned ' + upstream.status);
      return;
    }
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    const reader = upstream.body.getReader();
    let closed = false;
    req.on('close', () => { closed = true; try { reader.cancel(); } catch {} });
    (async () => {
      try {
        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise(r => res.once('drain', r));
          }
        }
      } catch {}
      try { res.end(); } catch {}
    })();
    return;
  }

  let filePath = u.pathname === '/' ? '/index.html' : u.pathname;
  filePath = path.join(ROOT, filePath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const content = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(content);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`\nAuto-Tune FM running at http://localhost:${PORT}\n`);
});
