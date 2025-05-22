require('dotenv').config();

const http = require('http');
const path = require('path');
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

const userStore = require('./userStore');
const institutionStore = require('./institutionStore');

const INSTITUTION_PRICES = {
  WatOx: 100,
  Lab: 200,
  Depot: 150
};

const loginRoute = require('./api/login')(client, verifySid);
const verifyRoute = require('./api/verify')(client, verifySid, userStore);
const stateRoute = require('./api/state')(userStore);

app.use('/api/login', loginRoute);
app.use('/api/verify', verifyRoute);
app.use('/api/state', stateRoute);

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

  const users = userStore.loadUsers();
  const user = users[email] || {
    email,
    position: [70, 100, -50],
    money: 1000000,
    health: 100,
    hydration: 100,
    oxygen: 100
  };
  if (!users[email]) {
    users[email] = user;
    userStore.saveUsers(users);
  }

  states.set(id, {
    position: user.position,
    rotation: 0,
    moving: false,
    health: user.health,
    hydration: user.hydration,
    oxygen: user.oxygen
  });

  const players = [];
  for (const [pid, state] of states.entries()) {
    players.push({ id: pid, ...state });
  }
  const institutions = institutionStore.getInstitutions();
  ws.send(
    JSON.stringify({
      type: 'welcome',
      id,
      players,
      institutions,
      money: user.money,
      health: user.health,
      hydration: user.hydration,
      oxygen: user.oxygen
    })
  );

   broadcast({ type: 'spawn', id }, id);

   ws.on('message', message => {
     try {
       const data = JSON.parse(message);
      if (data.type === 'state') {
        states.set(id, {
          position: data.position,
          rotation: data.rotation,
          moving: data.moving,
          health: data.health,
          hydration: data.hydration,
          oxygen: data.oxygen
        });
        const users = userStore.loadUsers();
        if (users[email]) {
          users[email].position = data.position;
          users[email].health = data.health;
          users[email].hydration = data.hydration;
          users[email].oxygen = data.oxygen;
          userStore.saveUsers(users);
        }
        broadcast(
          {
            type: 'update',
            id,
            position: data.position,
            rotation: data.rotation,
            moving: data.moving,
            health: data.health,
            hydration: data.hydration,
            oxygen: data.oxygen
          },
          id
        );
      } else if (data.type === 'respawn') {
        const users = userStore.loadUsers();
        const user = users[email];
        if (user && user.money >= 1000) {
          user.money -= 1000;
          user.health = 1000;
          user.hydration = 100;
          user.oxygen = 100;
          userStore.saveUsers(users);
          const state = states.get(id) || {};
          state.health = 100;
          state.hydration = 100;
          state.oxygen = 100;
          states.set(id, state);
          ws.send(
            JSON.stringify({
              type: 'respawn',
              health: 100,
              hydration: 100,
              oxygen: 100,
              money: user.money
            })
          );
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'not enough money' }));
        }
      } else if (data.type === 'addInstitution') {
        const price = INSTITUTION_PRICES[data.name] || 0;
        const users = userStore.loadUsers();
        const user = users[email];
        if (user && user.money >= price) {
          user.money -= price;
          userStore.saveUsers(users);
          const inst = {
            owner: email,
            name: data.name,
            position: data.position,
            rotation: data.rotation,
            scale: data.scale
          };
          const instId = institutionStore.addInstitution(inst);
          inst.id = instId;
          broadcast({ type: 'addInstitution', institution: inst });
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'money', money: user.money }));
          }
        } else {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'not enough money' }));
          }
        }
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
