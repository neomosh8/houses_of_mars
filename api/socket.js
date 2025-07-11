const WebSocket = require('ws');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const FileStore = require('../fileStore');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '615735242765-o0rm9iuv9291h9iq5t6rh17co4gmjahb.apps.googleusercontent.com';
const authClient = new OAuth2Client(CLIENT_ID);

const DATA_FILE = path.join(process.cwd(), 'data.json');
const store = new FileStore(DATA_FILE, {});
let userData = store.get();

function saveData() {
  store.update(userData);
}

function createWss(server) {
  if (global.wss) return global.wss;
  const wss = new WebSocket.Server({ noServer: true });
  const clients = new Map();
  const userById = new Map();
  const states = new Map();
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
            const ticket = await authClient.verifyIdToken({
              idToken: data.token,
              audience: CLIENT_ID
            });

            const payload = ticket.getPayload();
            username = payload.sub;
            displayName = payload.name || payload.email || username;
            id = nextId++;

            clients.set(id, ws);
            userById.set(id, displayName);

            const record = userData[username] || {
              name: displayName,
              money: 1000000,
              position: [0, 100, 0],
              rotation: 0
            };
            userData[username] = record;

            const state = {
              position: record.position,
              rotation: record.rotation || 0,
              moving: false,
              running: false,
              money: record.money
            };
            states.set(id, state);

            const players = [];
            for (const [pid, st] of states.entries()) {
              if (pid === id) continue;
              players.push({ id: pid, position: st.position, rotation: st.rotation, moving: st.moving, running: st.running });
            }

            ws.send(JSON.stringify({ type: 'loginSuccess', id, state, players }));
            broadcast({ type: 'spawn', id, state }, id);
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid login token. Error: ' + err.message }));
          }
        } else if (data.type === 'state' && id !== null) {
          const st = states.get(id);
          if (!st) return;
          st.position = data.position;
          st.rotation = data.rotation;
          st.moving = data.moving;
          st.running = data.running;
          broadcast({ type: 'update', id, position: data.position, rotation: data.rotation, moving: data.moving, running: data.running }, id);
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
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

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/api/socket') {
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit('connection', ws, req);
      });
    }
  });

  global.wss = wss;
  return wss;
}

module.exports = (req, res) => {
  const server = res.socket.server;
  const wss = createWss(server);
  if (req.headers.upgrade === 'websocket') {
    // handled in upgrade event above
    return;
  }
  res.statusCode = 200;
  res.end('WebSocket server running');
};
