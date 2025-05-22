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
        const users = userStore.loadUsers();
        if (users[email]) {
          users[email].position = data.position;
          userStore.saveUsers(users);
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
