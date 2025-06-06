const path = require('path');
const FileStore = require('./fileStore');

const FILE = path.join(__dirname, 'hallChat.json');
const MAX_MESSAGES = 100;

class HallChatManager {
  constructor() {
    this.store = new FileStore(FILE, []);
    this.messages = this.store.get();
  }

  _save() {
    this.store.update(this.messages);
  }

  addMessage(email, name, text) {
    const message = {
      email,
      name,
      text,
      timestamp: new Date().toISOString()
    };
    this.messages.push(message);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
    this._save();
    return message;
  }

  getMessages(limit = 50) {
    return this.messages.slice(-limit);
  }
}

module.exports = new HallChatManager();
