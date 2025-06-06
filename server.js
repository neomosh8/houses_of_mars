require('dotenv').config();
const PlanetEngine = require('./planetEngine');
const engine = new PlanetEngine('.', true); // saves PNGs in the current directory

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
if (!accountSid || !authToken || !verifySid) {
  console.warn('Twilio environment variables missing; SMS features may not work');
}

const userStore = require('./userStore');
const institutionStore = require('./institutionStore');
const defenceStore = require('./defenceBaseStore');
const chatManager = require('./workforceChatManager');
const planetHallStore = require('./planetHallStore');
const hallChatManager = require('./hallChatManager');
const referendumManager = require('./referendumManager');
const StateThrottle = require('./stateThrottle');

const INSTITUTION_PRICES = {
  WatOx: 100,
  agriFood: 200,
  Depot: 150,
  'Defence Base': 300
};

const loginRoute = require('./api/login')(client, verifySid);
const verifyRoute = require('./api/verify')(client, verifySid, userStore);
const stateRoute = require('./api/state')(userStore);
function sendToEmail(email, data) {
  const msg = JSON.stringify(data);
  for (const [id, ws] of clients.entries()) {
    if (emails.get(id) === email && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

const workforceRoute = require('./api/workforce')(institutionStore, userStore, engine, broadcast, sendToEmail);
const defenceRoute = require('./api/defence')(defenceStore, institutionStore, broadcast);
const planetHallRoute = require('./api/planetHall')(broadcast);
chatManager.initFromInstitutions(institutionStore.getInstitutions());

app.use('/api/login', loginRoute);
app.use('/api/verify', verifyRoute);
app.use('/api/state', stateRoute);
app.use('/api/workforce', workforceRoute);
app.use('/api/defence', defenceRoute);
app.use('/api/planethall', planetHallRoute);

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

const stateThrottle = new StateThrottle(broadcast);

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
    running: false,
    health: user.health,
    hydration: user.hydration,
    oxygen: user.oxygen,
    money: user.money,
    flag: user.flag || null
  });

  const players = [];
  for (const [pid, state] of states.entries()) {
    players.push({ id: pid, ...state });
  }
  const hallData = planetHallStore.getHallData();
  const hallInstitution = {
    id: hallData.id,
    name: 'Planet Hall',
    owner: 'Mars',
    position: hallData.position || [50, 0, 50],
    rotation: 0,
    scale: 1.5,
    funded: true,
    isPlanetHall: true
  };

  const institutions = institutionStore.getInstitutions()
    .map(inst => {
      if (inst.name === 'Defence Base') {
        return { ...inst, weapons: defenceStore.getWeapons(inst.id) };
      }
      return inst;
    })
    .concat([hallInstitution]);
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

  broadcast({ type: 'spawn', id, state: states.get(id) }, id);

   ws.on('message', message => {
     try {
       const data = JSON.parse(message);
      if (data.type === 'state') {
        const pos = Array.isArray(data.position) ? data.position.slice(0, 3) : [0, 0, 0];
        if (pos.length >= 2 && pos[1] < -300) pos[1] = 60;
        const prev = states.get(id) || {};
        states.set(id, {
          position: pos,
          rotation: data.rotation,
          moving: data.moving,
          running: data.running,
          health: data.health,
          hydration: data.hydration,
          oxygen: data.oxygen,
          money: data.money,
          flag: prev.flag || null
        });
        const users = userStore.loadUsers();
        if (users[email]) {
          users[email].position = pos;
          users[email].health = data.health;
          users[email].hydration = data.hydration;
          users[email].oxygen = data.oxygen;
          if (typeof data.money === 'number') {
            users[email].money = data.money;
          }
          userStore.saveUsers(users);
        }
        stateThrottle.update(id, {
          position: pos,
          rotation: data.rotation,
          moving: data.moving,
          running: data.running,
          health: data.health,
          hydration: data.hydration,
          oxygen: data.oxygen
        });
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
          state.running = false;
          state.moving = false;
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
            scale: data.scale,
            sharePrice: price,
            totalShares: 1,
            soldShares: 1,
            shares: { [email]: 1 },
            funded: true
          };
          const instId = institutionStore.addInstitution(inst);
          const storedInst = institutionStore.getInstitution(instId);
          const instData = storedInst.name === 'Defence Base'
            ? { ...storedInst, weapons: defenceStore.getWeapons(instId) }
            : storedInst;
          broadcast({ type: 'addInstitution', institution: instData });
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'money', money: user.money }));
          }
        } else {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'not enough money' }));
          }
        }
      } else if (data.type === 'addInstitutionApplication') {
        const price = INSTITUTION_PRICES[data.name] || 0;
        const users = userStore.loadUsers();
        const user = users[email];
        const cost = (data.myShares || 0) * (data.sharePrice || 0);
        if (user && user.money >= cost) {
          user.money -= cost;
          userStore.saveUsers(users);
          const inst = {
            owner: email,
            name: data.name,
            position: data.position,
            rotation: data.rotation,
            scale: data.scale,
            sharePrice: data.sharePrice,
            totalShares: data.totalShares,
            soldShares: data.myShares,
            shares: { [email]: data.myShares },
            funded: data.myShares * data.sharePrice >= price
          };
          const instId = institutionStore.addInstitution(inst);
          const storedInst = institutionStore.getInstitution(instId);
          const instData = storedInst.name === 'Defence Base'
            ? { ...storedInst, weapons: defenceStore.getWeapons(instId) }
            : storedInst;
          broadcast({ type: 'addInstitution', institution: instData });
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'money', money: user.money }));
          }
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'not enough money' }));
        }
      } else if (data.type === 'buyShares') {
        const inst = institutionStore.getInstitution(data.id);
        if (inst && !inst.funded) {
          const users = userStore.loadUsers();
          const user = users[email];
          const shares = Math.max(1, Math.floor(data.shares || 0));
          const cost = shares * inst.sharePrice;
          if (user && user.money >= cost) {
            user.money -= cost;
            userStore.saveUsers(users);
            const info = institutionStore.buyShares(inst.id, email, shares);
            if (info) {
              broadcast({ type: 'updateInstitutionShares', id: inst.id, info });
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'money', money: user.money }));
              }
            }
          } else if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'not enough money' }));
          }
        }
      } else if (data.type === 'destroyInstitution') {
        const inst = institutionStore.destroyInstitution(data.id);
        if (inst) {
          broadcast({ type: 'destroyInstitution', id: data.id });
        }
      } else if (data.type === 'target') {
        const pos = Array.isArray(data.position) ? data.position.slice(0,3) : null;
        if (pos) {
          const state = states.get(id) || {};
          state.flag = pos;
          states.set(id, state);
          const users = userStore.loadUsers();
          if (users[email]) {
            users[email].flag = pos;
            userStore.saveUsers(users);
          }
          broadcast({ type: 'flag', id, position: pos });
        }
      }
     } catch (err) {
       // Error is ignored for invalid message to prevent console noise
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
  console.log('Server listening on port', PORT);
});
