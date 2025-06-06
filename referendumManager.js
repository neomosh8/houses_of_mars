const path = require('path');
const FileStore = require('./fileStore');

const FILE = path.join(__dirname, 'referendums.json');

class ReferendumManager {
  constructor() {
    this.store = new FileStore(FILE, {
      active: null,
      history: [],
      nextId: 1
    });
    this.data = this.store.get();
  }

  _save() {
    this.store.update(this.data);
  }

  createReferendum(type, data, proposedBy) {
    console.log('Creating referendum:', { type, data, proposedBy });
    const ref = {
      id: this.data.nextId++,
      type,
      data,
      proposedBy,
      status: 'pending'
    };
    this.data.active = ref;
    this._save();
    return ref;
  }

  updateActive(ref) {
    this.data.active = ref;
    this._save();
  }

  finalize(ref) {
    this.data.history.push(ref);
    this.data.active = null;
    this._save();
  }

  getActiveReferendum() {
    return this.data.active;
  }

  getReferendumHistory() {
    return this.data.history;
  }
}

module.exports = new ReferendumManager();
