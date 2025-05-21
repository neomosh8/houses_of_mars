const WebSocket = require('ws');
const { OAuth2Client } = require("google-auth-library");
const fs = require('fs');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID";
const authClient = new OAuth2Client(CLIENT_ID);

const DATA_FILE = './data.json';
let userData = {};
try {
  userData = JSON.parse(fs.readFileSync(DATA_FILE));
} catch (e) {
  userData = {};
}
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
}

const wss = new WebSocket.Server({ port: 3000 });
const clients = new Map(); // id -> ws
const userById = new Map(); // id -> username
const states = new Map();  // id -> { position, rotation, moving, money }
let nextId = 1;

function broadcast(data, excludeId) {
  const msg = JSON.stringify(data);
  for (const [id, ws] of clients.entries()) {
    if (id === excludeId) continue;
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wss.on('connection', ws => {
  let id = null;
  let username = null;
  let displayName = null;

  ws.on('message', async message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'login' && id === null) {
        try {
          const ticket = await authClient.verifyIdToken({ idToken: data.token, audience: CLIENT_ID });
          const payload = ticket.getPayload();
          username = payload.sub;
          const displayName = payload.name || payload.email || username;
          id = nextId++;
          clients.set(id, ws);
          userById.set(id, displayName);

          const record = userData[username] || { name: displayName, money: 1000000, position: [0, 100, 0], rotation: 0 };
          userData[username] = record;

          const state = { position: record.position, rotation: record.rotation || 0, moving: false, money: record.money };
          states.set(id, state);

          const players = [];
          for (const [pid, st] of states.entries()) {
            if (pid === id) continue;
            players.push({ id: pid, position: st.position, rotation: st.rotation, moving: st.moving });
          }
          ws.send(JSON.stringify({ type: 'loginSuccess', id, state, players }));
          broadcast({ type: 'spawn', id, state }, id);
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid login' }));
        }
      } else if (data.type === 'state' && id !== null) {
        const st = states.get(id);
        if (!st) return;
        st.position = data.position;
        st.rotation = data.rotation;
        st.moving = data.moving;
        broadcast({ type: 'update', id, position: data.position, rotation: data.rotation, moving: data.moving }, id);
      }
    } catch (err) {
      console.error('Invalid message', err);
    }
  });

  ws.on('close', () => {
    if (id !== null) {
      clients.delete(id);
      userById.delete(id);
      const st = states.get(id);
      if (st && username) {
        const existing = userData[username] || {};
        userData[username] = {
          name: existing.name || displayName,
          money: st.money || existing.money || 1000000,
          position: st.position,
          rotation: st.rotation
        };
        saveData();
      }
      states.delete(id);
      broadcast({ type: 'remove', id });
    }
  });
});

console.log('WebSocket server running on ws://localhost:3000');
