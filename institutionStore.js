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
  if (!inst.proposalHistory) inst.proposalHistory = [];
  if (!inst.extraEffects) {
    inst.extraEffects = { hydration: 0, oxygen: 0, health: 0, money: 0 };
  }
  if (!Array.isArray(inst.constructions)) inst.constructions = [];
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
  if (!Array.isArray(inst.proposalHistory)) inst.proposalHistory = [];
  const full = {
    project: proposal.project || proposal.title || 'Project',
    description: proposal.description || '',
    prerequisites: Array.isArray(proposal.prerequisites) ? proposal.prerequisites : [],
    cost: proposal.cost || 0,
    gains: proposal.gains || {},
    risk: proposal.risk || null,
    status: 'pending'
  };
  if (!Array.isArray(inst.proposals)) inst.proposals = [];
  inst.proposals.push(full);
  saveData(data);
  return { proposal: full, index: inst.proposals.length - 1 };
}

function getProposals(instId) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  if (!inst || !Array.isArray(inst.proposals)) return [];
  return inst.proposals.filter(p => p.status === 'pending');
}

function getProposalHistory(instId) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  if (!inst || !Array.isArray(inst.proposalHistory)) return [];
  return inst.proposalHistory;
}

function updateProposal(instId, index, updates) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  if (!inst || !inst.proposals || !inst.proposals[index]) return null;
  const proposal = Object.assign({}, inst.proposals[index], updates);
  if (!Array.isArray(inst.proposalHistory)) inst.proposalHistory = [];
  if (proposal.status !== 'pending') {
    inst.proposalHistory.push(proposal);
    inst.proposals.splice(index, 1);
  } else {
    inst.proposals[index] = proposal;
  }
  saveData(data);
  return proposal;
}

function addConstruction(instId, construction) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  if (!inst) return null;
  if (!Array.isArray(inst.constructions)) inst.constructions = [];
  inst.constructions.push(construction);
  saveData(data);
  return inst.constructions.length - 1;
}

function updateConstruction(instId, index, updates) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  if (!inst || !inst.constructions || !inst.constructions[index]) return null;
  Object.assign(inst.constructions[index], updates);
  saveData(data);
  return inst.constructions[index];
}

function addGains(instId, gains) {
  const data = loadData();
  const inst = data.list.find(i => i.id === instId);
  if (!inst) return null;
  if (!inst.extraEffects) {
    inst.extraEffects = { hydration: 0, oxygen: 0, health: 0, money: 0 };
  }
  for (const key of ['hydration', 'oxygen', 'health', 'money']) {
    if (gains && typeof gains[key] === 'number') {
      inst.extraEffects[key] += gains[key];
    }
  }
  saveData(data);
  return inst.extraEffects;
}

module.exports = {
  getInstitutions,
  addInstitution,
  updateInstitution,
  getInstitution,
  findInstitution,
  addProposal,
  getProposals,
  getProposalHistory,
  updateProposal,
  addConstruction,
  updateConstruction,
  addGains,
};
