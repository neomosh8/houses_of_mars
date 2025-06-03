const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'defence_base.json');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return data;
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function ensure(data, id) {
  if (!data[id]) data[id] = { proposals: [], weapons: [] };
  return data[id];
}

function getProposals(id) {
  const data = load();
  const list = (data[id] && data[id].proposals) || [];
  console.log('[DEFENCE STORE] getProposals', { id, count: list.length });
  return list;
}

function addProposal(id, proposal) {
  const data = load();
  const entry = ensure(data, id);
  const full = Object.assign({ status: 'pending', votes: {} }, proposal);
  entry.proposals.push(full);
  console.log('[DEFENCE STORE] addProposal', { id, proposal: full });
  save(data);
  return entry.proposals.length - 1;
}

function updateProposal(id, index, updates) {
  const data = load();
  const entry = ensure(data, id);
  const p = entry.proposals[index];
  if (!p) return null;
  Object.assign(p, updates);
  if (p.status !== 'pending') {
    entry.proposals.splice(index, 1);
  }
  save(data);
  console.log('[DEFENCE STORE] updateProposal', { id, index, updates });
  return p;
}

function getWeapons(id) {
  const data = load();
  const list = (data[id] && data[id].weapons) || [];
  console.log('[DEFENCE STORE] getWeapons', { id, count: list.length });
  return list;
}

function addWeapon(id, weapon) {
  const data = load();
  const entry = ensure(data, id);
  entry.weapons.push(weapon);
  console.log('[DEFENCE STORE] addWeapon', { id, weapon });
  save(data);
  return entry.weapons.length - 1;
}

function updateWeapon(id, index, updates) {
  const data = load();
  const entry = ensure(data, id);
  const w = entry.weapons[index];
  if (!w) return null;
  Object.assign(w, updates);
  save(data);
  console.log('[DEFENCE STORE] updateWeapon', { id, index, updates });
  return w;
}

module.exports = {
  getProposals,
  addProposal,
  updateProposal,
  getWeapons,
  addWeapon,
  updateWeapon,
};
