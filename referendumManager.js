const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'referendums.json');

class ReferendumManager {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
      return {
        active: null,
        history: [],
        nextId: 1
      };
    }
  }

  _save() {
    fs.writeFileSync(FILE, JSON.stringify(this.data, null, 2));
  }

  createReferendum(type, data, proposedBy) {
    console.log('Creating referendum:', { type, data, proposedBy });
    const ref = { id: this.data.nextId++, type, data, proposedBy, status: 'pending' };
    this.data.active = ref;
    this._save();
    return ref;
  }

  getActiveReferendum() {
    return this.data.active;
  }

  getReferendumHistory() {
    return this.data.history;
  }
}

module.exports = new ReferendumManager();
