const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });
const clients = new Map(); // id -> ws
const states = new Map();  // id -> { position, rotation, moving }
let nextId = 1;

function broadcast(data, excludeId) {
  const msg = JSON.stringify(data);
  for (const [id, ws] of clients.entries()) {
    if (id === excludeId) continue;
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wss.on('connection', ws => {
  const id = nextId++;
  clients.set(id, ws);

  // Send welcome message with existing players
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

console.log('WebSocket server running on ws://localhost:3000');
