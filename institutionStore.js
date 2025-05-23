const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'institutions.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { nextId: 1, list: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getInstitutions() {
  const data = loadData();
  return data.list;
}

function getInstitution(id) {
  const data = loadData();
  return data.list.find(i => i.id === id);
}

function addInstitution(inst) {
  const data = loadData();
  inst.id = data.nextId++;
  if (!inst.workforce) inst.workforce = [];
  if (!inst.proposals) inst.proposals = [];
  data.list.push(inst);
  saveData(data);
  return inst.id;
}

function updateInstitution(id, updates) {
  const data = loadData();
  const inst = data.list.find(i => i.id === id);
  if (!inst) return null;
  Object.assign(inst, updates);
  saveData(data);
  return inst;
}

function findInstitution(owner, name) {
  const data = loadData();
  return data.list.find(i => i.owner === owner && i.name === name);
}

function addProposal(instId, proposal) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  if (!inst) return null;
  if (!inst.proposals) inst.proposals = [];
  inst.proposals.push(proposal);
  saveData(data);
  return proposal;
}

function getProposals(instId) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  return inst && inst.proposals ? inst.proposals : [];
}

function updateProposal(instId, index, updates) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  if (!inst || !inst.proposals || !inst.proposals[index]) return null;
  Object.assign(inst.proposals[index], updates);
  saveData(data);
  return inst.proposals[index];
}

module.exports = {
  getInstitutions,
  addInstitution,
  updateInstitution,
  getInstitution,
  findInstitution,
  addProposal,
  getProposals,
  updateProposal,
};
