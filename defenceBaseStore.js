const path = require('path');
const FileStore = require('./fileStore');

const FILE = path.join(__dirname, 'defence_base.json');
const store = new FileStore(FILE, {});

function ensure(data, id) {
  if (!data[id]) data[id] = { proposals: [], weapons: [] };
  return data[id];
}

function getProposals(id) {
  const data = store.get();
  const list = (data[id] && data[id].proposals) || [];
  console.log('[DEFENCE STORE] getProposals', { id, count: list.length });
  return list;
}

function addProposal(id, proposal) {
  let index = null;
  store.update(data => {
    const entry = ensure(data, id);
    const full = Object.assign({ status: 'pending', votes: {} }, proposal);
    entry.proposals.push(full);
    console.log('[DEFENCE STORE] addProposal', { id, proposal: full });
    index = entry.proposals.length - 1;
    return data;
  });
  return index;
}

function updateProposal(id, index, updates) {
  let p = null;
  store.update(data => {
    const entry = ensure(data, id);
    p = entry.proposals[index];
    if (!p) return data;
    Object.assign(p, updates);
    if (p.status !== 'pending') {
      entry.proposals.splice(index, 1);
    }
    console.log('[DEFENCE STORE] updateProposal', { id, index, updates });
    return data;
  });
  return p;
}

function getWeapons(id) {
  const data = store.get();
  const list = (data[id] && data[id].weapons) || [];
  console.log('[DEFENCE STORE] getWeapons', { id, count: list.length });
  return list;
}

function addWeapon(id, weapon) {
  let index = null;
  store.update(data => {
    const entry = ensure(data, id);
    entry.weapons.push(weapon);
    console.log('[DEFENCE STORE] addWeapon', { id, weapon });
    index = entry.weapons.length - 1;
    return data;
  });
  return index;
}

function updateWeapon(id, index, updates) {
  let w = null;
  store.update(data => {
    const entry = ensure(data, id);
    w = entry.weapons[index];
    if (!w) return data;
    Object.assign(w, updates);
    console.log('[DEFENCE STORE] updateWeapon', { id, index, updates });
    return data;
  });
  return w;
}

function consumeWeapon(id, index) {
  let w = null;
  store.update(data => {
    const entry = ensure(data, id);
    w = entry.weapons[index];
    if (!w) return data;
    w.consumed = true;
    console.log('[DEFENCE STORE] consumeWeapon', { id, index });
    return data;
  });
  return w;
}

function cloneWeapon(id, index) {
  let weapon = null;
  let newIdx = null;
  store.update(data => {
    const entry = ensure(data, id);
    const src = entry.weapons[index];
    if (!src) return data;
    weapon = { ...src, consumed: false };
    entry.weapons.push(weapon);
    newIdx = entry.weapons.length - 1;
    console.log('[DEFENCE STORE] cloneWeapon', { id, index, newIdx });
    return data;
  });
  return { weapon, index: newIdx };
}

module.exports = {
  getProposals,
  addProposal,
  updateProposal,
  getWeapons,
  addWeapon,
  updateWeapon,
  consumeWeapon,
  cloneWeapon,
};
