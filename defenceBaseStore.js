const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'defence_base.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
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
  return (data[id] && data[id].proposals) || [];
}

function addProposal(id, proposal) {
  const data = load();
  const entry = ensure(data, id);
  const full = Object.assign({ status: 'pending' }, proposal);
  entry.proposals.push(full);
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
  return p;
}

function getWeapons(id) {
  const data = load();
  return (data[id] && data[id].weapons) || [];
}

function addWeapon(id, weapon) {
  const data = load();
  const entry = ensure(data, id);
  entry.weapons.push(weapon);
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
