const path = require('path');
const FileStore = require('./fileStore');

const FILE = path.join(__dirname, 'institutions.json');
const store = new FileStore(FILE, { nextId: 1, list: [] });

function getInstitutions() {
  return store.get().list;
}

function getInstitution(id) {
  const data = store.get();
  return data.list.find(i => i.id === id);
}

function addInstitution(inst) {
  store.update(data => {
    inst.id = data.nextId++;
    if (!inst.workforce) inst.workforce = [];
    if (!inst.proposals) inst.proposals = [];
    if (!inst.proposalHistory) inst.proposalHistory = [];
    if (!inst.extraEffects) {
      inst.extraEffects = { hydration: 0, oxygen: 0, health: 0, money: 0 };
    }
    if (!Array.isArray(inst.constructions)) inst.constructions = [];
    if (typeof inst.funded !== 'boolean') inst.funded = true;
    if (typeof inst.totalShares !== 'number') inst.totalShares = 1;
    if (typeof inst.sharePrice !== 'number') inst.sharePrice = 0;
    if (typeof inst.soldShares !== 'number') inst.soldShares = inst.totalShares;
    if (!inst.shares || typeof inst.shares !== 'object') {
      inst.shares = { [inst.owner]: inst.soldShares };
    }
    data.list.push(inst);
    return data;
  });
  return inst.id;
}

function updateInstitution(id, updates) {
  let inst = null;
  store.update(data => {
    inst = data.list.find(i => i.id === id);
    if (inst) Object.assign(inst, updates);
    return data;
  });
  return inst;
}

function findInstitution(owner, name) {
  const data = store.get();
  return data.list.find(i => i.owner === owner && i.name === name);
}

function addProposal(instId, proposal) {
  let result = null;
  store.update(data => {
    const inst = data.list.find(i => i.id === instId);
    if (!inst) return data;
    if (!Array.isArray(inst.proposalHistory)) inst.proposalHistory = [];
    const full = {
      project: proposal.project || proposal.title || 'Project',
      description: proposal.description || '',
      prerequisites: Array.isArray(proposal.prerequisites)
        ? proposal.prerequisites
        : [],
      cost: proposal.cost || 0,
      gains: proposal.gains || {},
      risk: proposal.risk || null,
      status: 'pending',
      votes: {}
    };
    if (!Array.isArray(inst.proposals)) inst.proposals = [];
    inst.proposals.push(full);
    result = { proposal: full, index: inst.proposals.length - 1 };
    return data;
  });
  return result;
}

function getProposals(instId) {
  const data = store.get();
  const inst = data.list.find(i => i.id === instId);
  if (!inst || !Array.isArray(inst.proposals)) return [];
  return inst.proposals.filter(p => p.status === 'pending');
}

function getProposalHistory(instId) {
  const data = store.get();
  const inst = data.list.find(i => i.id === instId);
  if (!inst || !Array.isArray(inst.proposalHistory)) return [];
  return inst.proposalHistory;
}

function updateProposal(instId, index, updates) {
  let proposal = null;
  store.update(data => {
    const inst = data.list.find(i => i.id === instId);
    if (!inst || !inst.proposals || !inst.proposals[index]) return data;
    proposal = Object.assign({}, inst.proposals[index], updates);
    if (!Array.isArray(inst.proposalHistory)) inst.proposalHistory = [];
    if (proposal.status !== 'pending') {
      inst.proposalHistory.push(proposal);
      inst.proposals.splice(index, 1);
    } else {
      inst.proposals[index] = proposal;
    }
    return data;
  });
  return proposal;
}

function addConstruction(instId, construction) {
  let index = null;
  store.update(data => {
    const inst = data.list.find(i => i.id === instId);
    if (!inst) return data;
    if (!Array.isArray(inst.constructions)) inst.constructions = [];
    inst.constructions.push(construction);
    index = inst.constructions.length - 1;
    return data;
  });
  return index;
}

function updateConstruction(instId, idx, updates) {
  let result = null;
  store.update(data => {
    const inst = data.list.find(i => i.id === instId);
    if (!inst || !inst.constructions || !inst.constructions[idx]) return data;
    Object.assign(inst.constructions[idx], updates);
    result = inst.constructions[idx];
    return data;
  });
  return result;
}

function addGains(instId, gains) {
  let effects = null;
  store.update(data => {
    const inst = data.list.find(i => i.id === instId);
    if (!inst) return data;
    if (!inst.extraEffects) {
      inst.extraEffects = { hydration: 0, oxygen: 0, health: 0, money: 0 };
    }
    for (const key of ['hydration', 'oxygen', 'health', 'money']) {
      if (gains && typeof gains[key] === 'number') {
        inst.extraEffects[key] += gains[key];
      }
    }
    effects = inst.extraEffects;
    return data;
  });
  return effects;
}

function destroyInstitution(id) {
  let inst = null;
  store.update(data => {
    inst = data.list.find(i => i.id === id);
    if (!inst) return data;
    inst.destroyed = true;
    inst.workforce = [];
    inst.proposals = [];
    inst.proposalHistory = [];
    inst.constructions = [];
    inst.extraEffects = { hydration: 0, oxygen: 0, health: 0, money: 0 };
    return data;
  });
  return inst;
}

function buyShares(id, email, shares) {
  let info = null;
  store.update(data => {
    const inst = data.list.find(i => i.id === id);
    if (!inst || inst.funded || shares <= 0) return data;
    if (!inst.shares) inst.shares = {};
    const available = inst.totalShares - inst.soldShares;
    const buy = Math.min(shares, available);
    inst.soldShares += buy;
    inst.shares[email] = (inst.shares[email] || 0) + buy;
    if (inst.soldShares >= inst.totalShares) inst.funded = true;
    info = {
      shares: inst.shares[email],
      soldShares: inst.soldShares,
      funded: inst.funded,
      sharePrice: inst.sharePrice,
      totalShares: inst.totalShares
    };
    return data;
  });
  return info;
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
  destroyInstitution,
  buyShares,
};
