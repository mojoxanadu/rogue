#!/usr/bin/env node
// Proxies.sx peer agent client.
// Connects to the registered relay, services proxy_request / tunnel_connect
// traffic, refreshes JWT before expiry, and reconnects on drop.

const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const WebSocket = require('ws');

const STATE_FILE = __dirname + '/register_response.json';
const API = 'https://api.proxies.sx';

let state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const { deviceId } = state;

const tunnels = new Map(); // tunnelId -> net.Socket

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

async function refreshJwt() {
  const res = await fetch(`${API}/v1/peer/agents/${deviceId}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: state.refreshToken }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  state.jwt = j.jwt;
  if (j.refreshToken) state.refreshToken = j.refreshToken;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  log('jwt refreshed');
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function handleProxyRequest(ws, msg) {
  // HTTP (non-CONNECT) request: { id, method, url, headers, body? (base64) }
  const u = new URL(msg.url);
  const lib = u.protocol === 'https:' ? https : http;
  const headers = { ...msg.headers };
  delete headers['proxy-connection'];
  delete headers['host'];
  const req = lib.request({
    method: msg.method,
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    headers,
  }, (res) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => {
      send(ws, {
        type: 'proxy_response',
        id: msg.id,
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('base64'),
      });
    });
  });
  req.on('error', (e) => {
    send(ws, { type: 'proxy_response', id: msg.id, status: 502, error: e.message });
  });
  if (msg.body) req.write(Buffer.from(msg.body, 'base64'));
  req.end();
}

function handleTunnelConnect(ws, msg) {
  // HTTPS CONNECT: { tunnelId, host, port }
  const sock = net.connect(msg.port || 443, msg.host);
  tunnels.set(msg.tunnelId, sock);
  let opened = false;
  sock.on('connect', () => {
    opened = true;
    send(ws, { type: 'tunnel_open', tunnelId: msg.tunnelId });
  });
  sock.on('data', (chunk) => {
    send(ws, {
      type: 'tunnel_data',
      tunnelId: msg.tunnelId,
      data: chunk.toString('base64'),
    });
  });
  sock.on('close', () => {
    tunnels.delete(msg.tunnelId);
    send(ws, { type: 'tunnel_close', tunnelId: msg.tunnelId });
  });
  sock.on('error', (e) => {
    if (!opened) send(ws, { type: 'tunnel_error', tunnelId: msg.tunnelId, error: e.message });
    sock.destroy();
  });
}

function handleTunnelData(msg) {
  const sock = tunnels.get(msg.tunnelId);
  if (sock && !sock.destroyed) sock.write(Buffer.from(msg.data, 'base64'));
}

function handleTunnelClose(msg) {
  const sock = tunnels.get(msg.tunnelId);
  if (sock) sock.end();
  tunnels.delete(msg.tunnelId);
}

function connect(relayUrl) {
  log('connecting to', relayUrl);
  const ws = new WebSocket(relayUrl, [`token.${state.jwt}`]);

  ws.on('open', () => {
    log('ws open');
    send(ws, {
      type: 'device_info',
      country: process.env.PEER_COUNTRY || 'US',
      carrier: process.env.PEER_CARRIER || 'unknown',
      protocol: 'json-v1',
      version: '1.0.0',
    });
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return log('non-json frame, len=', raw.length); }

    switch (msg.type) {
      case 'heartbeat':
      case 'ping':
        send(ws, { type: 'heartbeat_ack', ts: msg.ts });
        break;
      case 'proxy_request':
        handleProxyRequest(ws, msg);
        break;
      case 'tunnel_connect':
        handleTunnelConnect(ws, msg);
        break;
      case 'tunnel_data':
        handleTunnelData(msg);
        break;
      case 'tunnel_close':
        handleTunnelClose(msg);
        break;
      case 'relay_redirect':
        log('relay_redirect ->', msg.relay);
        ws.close();
        state.relay = msg.relay;
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        break;
      case 'connected':
      case 'welcome':
      case 'verified':
      case 'status':
      case 'probe_result':
        log(msg.type, JSON.stringify(msg));
        break;
      default:
        log('unhandled msg type:', msg.type);
    }
  });

  ws.on('close', (code, reason) => {
    log('ws closed', code, reason.toString());
    for (const s of tunnels.values()) s.destroy();
    tunnels.clear();
    setTimeout(() => connect(state.relay), 5000);
  });

  ws.on('error', (e) => log('ws error:', e.message));
}

process.on('SIGINT', () => { log('shutting down'); process.exit(0); });

// Refresh JWT every 50 min on a STANDALONE timer that lives at process
// scope — independent of WebSocket open/close. Previously this timer was
// scheduled inside ws.on('open') and cancelled inside ws.on('close'),
// which meant on cycling networks (or extended idle periods where the
// relay drops the socket) the timer never fired and the JWT silently
// aged past its 1h TTL, producing an infinite 4002 reconnect loop.
// Calling once at startup, then every 50 min thereafter.
async function refreshLoop() {
  try { await refreshJwt(); }
  catch (e) { log('refresh error:', e.message); }
}
refreshLoop().finally(() => connect(state.relay));
setInterval(refreshLoop, 50 * 60 * 1000);
