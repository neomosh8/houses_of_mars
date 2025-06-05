const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'hallChat.json');
const MAX_MESSAGES = 100;

class HallChatManager {
  constructor() {
    this.messages = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
      return [];
    }
  }

  _save() {
    fs.writeFileSync(FILE, JSON.stringify(this.messages, null, 2));
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
