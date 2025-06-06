const fs = require('fs').promises;

class FileStore {
  constructor(filePath, defaultData = {}) {
    this.filePath = filePath;
    this.data = null;
    this.saveTimer = null;
    this.saveDelay = 1000; // Save after 1 second of no changes
    this._loadSync(defaultData);
  }

  _loadSync(defaultData) {
    try {
      this.data = JSON.parse(require('fs').readFileSync(this.filePath, 'utf8'));
    } catch {
      this.data = defaultData;
      this._scheduleSave();
    }
  }

  get() {
    return this.data;
  }

  update(updater) {
    if (typeof updater === 'function') {
      this.data = updater(this.data);
    } else {
      this.data = updater;
    }
    this._scheduleSave();
    return this.data;
  }

  _scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this._save(), this.saveDelay);
  }

  async _save() {
    try {
      const temp = `${this.filePath}.tmp`;
      await fs.writeFile(temp, JSON.stringify(this.data, null, 2));
      await fs.rename(temp, this.filePath);
    } catch (err) {
      console.error('Save failed:', this.filePath, err);
    }
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this._save();
  }
}

module.exports = FileStore;
