const WebSocket = require('ws');
const { OAuth2Client } = require("google-auth-library");
const fs = require('fs');

// Fix the CLIENT_ID by removing the leading 'Y'
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '615735242765-o0rm9iuv9291h9iq5t6rh17co4gmjahb.apps.googleusercontent.com';
const authClient = new OAuth2Client(CLIENT_ID);

// Ensure data file exists and is valid JSON
const DATA_FILE = './data.json';
let userData = {};
try {
  console.log(`Loading user data from ${DATA_FILE}`);
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  userData = JSON.parse(data);
  console.log(`Loaded data for ${Object.keys(userData).length} users`);
} catch (e) {
  console.log(`Error loading data file: ${e.message}. Creating new data file.`);
  userData = {};
  // Create the file with empty object
  fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
    console.log('User data saved successfully');
  } catch (err) {
    console.error('Error saving user data:', err);
  }
}

// Create WebSocket server
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
  console.log('New client connected');
  let id = null;
  let username = null;
  let displayName = null;

  ws.on('message', async message => {
    try {
      const data = JSON.parse(message);
      console.log(`Received message type: ${data.type}`);

      if (data.type === 'login' && id === null) {
        try {
          console.log('Verifying Google token...');
          const ticket = await authClient.verifyIdToken({
            idToken: data.token,
            audience: CLIENT_ID
          });

          const payload = ticket.getPayload();
          username = payload.sub;
          displayName = payload.name || payload.email || username;
          id = nextId++;

          console.log(`User authenticated: ${displayName} (ID: ${id})`);

          clients.set(id, ws);
          userById.set(id, displayName);

          // Get or create user record
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
            money: record.money
          };
          states.set(id, state);

          // Get current players to inform new player
          const players = [];
          for (const [pid, st] of states.entries()) {
            if (pid === id) continue;
            players.push({
              id: pid,
              position: st.position,
              rotation: st.rotation,
              moving: st.moving
            });
          }

          // Send login success to client
          const loginResponse = {
            type: 'loginSuccess',
            id,
            state,
            players
          };
          console.log(`Sending login success to client ${id}:`, loginResponse);
          ws.send(JSON.stringify(loginResponse));

          // Broadcast new player to others
          broadcast({
            type: 'spawn',
            id,
            state
          }, id);

        } catch (err) {
          console.error('Authentication error:', err);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid login token. Error: ' + err.message
          }));
        }
      } else if (data.type === 'state' && id !== null) {
        // Update player state
        const st = states.get(id);
        if (!st) {
          console.warn(`State update for unknown client ID: ${id}`);
          return;
        }

        st.position = data.position;
        st.rotation = data.rotation;
        st.moving = data.moving;

        // Broadcast state update to other clients
        broadcast({
          type: 'update',
          id,
          position: data.position,
          rotation: data.rotation,
          moving: data.moving
        }, id);
      }
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    if (id !== null) {
      console.log(`Client ${id} (${userById.get(id) || 'unknown'}) disconnected`);

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

      // Notify other clients about disconnection
      broadcast({ type: 'remove', id });
    } else {
      console.log('Anonymous client disconnected');
    }
  });
});

console.log('WebSocket server running on ws://localhost:3000');