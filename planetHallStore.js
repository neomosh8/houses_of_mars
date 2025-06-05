const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'planetHall.json');
const TERRAIN_FILE = path.join(__dirname, 'terrain.gltf');
const TERRAIN_SCALE = 50; // must match scale used in client and engine

function loadTerrainBounds() {
  try {
    const data = JSON.parse(fs.readFileSync(TERRAIN_FILE, 'utf8'));
    const accessor = data.accessors && data.accessors[0];
    if (accessor && accessor.min && accessor.max) {
      return {
        minX: accessor.min[0] * TERRAIN_SCALE,
        maxX: accessor.max[0] * TERRAIN_SCALE,
        minZ: accessor.min[2] * TERRAIN_SCALE,
        maxZ: accessor.max[2] * TERRAIN_SCALE
      };
    }
  } catch (err) {}
  return { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
}

class PlanetHallStore {
  constructor() {
    this.data = this._load();
    this._ensureStructure();
    if (!Array.isArray(this.data.position) || this.data.position.every(v => v === 0)) {
      const bounds = loadTerrainBounds();
      const randRange = (min, max) => Math.random() * (max - min) + min;
      const x = randRange(bounds.minX, bounds.maxX);
      const z = randRange(bounds.minZ, bounds.maxZ);
      this.data.position = [x, 0, z];
      this._save();
    }
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
      return this._getDefaultData();
    }
  }

  _getDefaultData() {
    return {
      id: 999999,
      position: [0, 0, 0],
      boardMembers: [],
      policies: [],
      nextPolicyId: 1
    };
  }

  _ensureStructure() {
    if (!this.data.boardMembers) this.data.boardMembers = [];
    if (!this.data.policies) this.data.policies = [];
    if (!this.data.nextPolicyId) this.data.nextPolicyId = 1;
    this._save();
  }

  _save() {
    fs.writeFileSync(FILE, JSON.stringify(this.data, null, 2));
  }

  getHallData() {
    return { ...this.data };
  }

  updatePosition(position) {
    this.data.position = position;
    this._save();
  }

  addBoardMember(email, name) {
    if (this.data.boardMembers.length >= 5) return false;
    if (this.data.boardMembers.find(m => m.email === email)) return false;
    this.data.boardMembers.push({
      email,
      name,
      electedDate: new Date().toISOString()
    });
    this._save();
    return true;
  }

  removeBoardMember(email) {
    const index = this.data.boardMembers.findIndex(m => m.email === email);
    if (index === -1) return false;
    this.data.boardMembers.splice(index, 1);
    this._save();
    return true;
  }

  isBoardMember(email) {
    return this.data.boardMembers.some(m => m.email === email);
  }

  createPolicy(title, description, proposedBy) {
    const policy = {
      id: this.data.nextPolicyId++,
      title,
      description,
      proposedBy,
      votes: {},
      status: 'voting',
      createdDate: new Date().toISOString()
    };
    this.data.policies.push(policy);
    this._save();
    return policy;
  }

  votePolicy(policyId, email, vote) {
    const policy = this.data.policies.find(p => p.id === policyId);
    if (!policy || policy.status !== 'voting') return null;
    if (!this.isBoardMember(email)) return null;

    policy.votes[email] = vote;

    const boardCount = this.data.boardMembers.length;
    const yesVotes = Object.values(policy.votes).filter(v => v).length;
    const noVotes = Object.values(policy.votes).filter(v => !v).length;

    if (yesVotes > boardCount / 2) {
      policy.status = 'approved';
      policy.approvedDate = new Date().toISOString();
    } else if (noVotes >= boardCount / 2) {
      policy.status = 'rejected';
    }

    this._save();
    return policy;
  }

  getPolicies() {
    return [...this.data.policies];
  }

  getApprovedPolicies() {
    return this.data.policies.filter(p => p.status === 'approved');
  }
}

module.exports = new PlanetHallStore();
