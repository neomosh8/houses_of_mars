const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const twilio = require('twilio');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(__dirname));

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
const client = twilio(accountSid, authToken);

const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.post('/api/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    await client.verify.v2
      .services(verifySid)
      .verifications.create({ channel: 'email', to: email });
    res.json({ status: 'pending' });
  } catch (e) {
    console.error('verify start error', e);
    res.status(500).json({ error: 'failed to start verification' });
  }
});

app.post('/api/verify', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ error: 'email and code required' });
  try {
    const check = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({ to: email, code });
    if (check.status !== 'approved')
      return res.status(400).json({ error: 'invalid code' });
    const users = loadUsers();
    if (!users[email]) {
      users[email] = { email, position: [70, 100, -50] };
      saveUsers(users);
    }
    res.json({ user: users[email] });
  } catch (e) {
    console.error('verify error', e);
    res.status(500).json({ error: 'verification failed' });
  }
});

app.get('/api/state/:email', (req, res) => {
  const users = loadUsers();
  const user = users[req.params.email];
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ position: user.position });
});

app.post('/api/state/:email', (req, res) => {
  const users = loadUsers();
  if (!users[req.params.email]) {
    users[req.params.email] = { email: req.params.email, position: req.body.position || [0,0,0] };
  } else {
    users[req.params.email].position = req.body.position;
  }
  saveUsers(users);
  res.json({ ok: true });
});

const clients = new Map(); // id -> ws
const states = new Map();  // id -> { position, rotation, moving }
const emails = new Map();  // id -> email
let nextId = 1;

function broadcast(data, excludeId) {
  const msg = JSON.stringify(data);
  for (const [id, ws] of clients.entries()) {
    if (id === excludeId) continue;
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const email = url.searchParams.get('email') || 'guest';

  const id = nextId++;
  clients.set(id, ws);
  emails.set(id, email);

  const users = loadUsers();
  const user = users[email] || { email, position: [70, 100, -50] };

  states.set(id, { position: user.position, rotation: 0, moving: false });

  const players = [];
  for (const [pid, state] of states.entries()) {
    players.push({ id: pid, ...state });
  }
  ws.send(JSON.stringify({ type: 'welcome', id, players }));

  broadcast({ type: 'spawn', id }, id);

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'state') {
        states.set(id, { position: data.position, rotation: data.rotation, moving: data.moving });
        const users = loadUsers();
        if (users[email]) {
          users[email].position = data.position;
          saveUsers(users);
        }
        broadcast({ type: 'update', id, position: data.position, rotation: data.rotation, moving: data.moving }, id);
      }
    } catch (err) {
      console.error('Invalid message', err);
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    states.delete(id);
    broadcast({ type: 'remove', id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
