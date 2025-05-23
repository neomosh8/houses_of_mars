const fs = require('fs');
const path = require('path');
const institutionStore = require('./institutionStore');

let OpenAI = null;
try {
  OpenAI = require('openai');
} catch (_) {}

const CHAT_FILE = path.join(__dirname, 'chatLogs.json');
const WORKFORCE_INTERVAL_MS = 60000; // default 1 minute
const FIRST_PROMPTS = {
  WatOx: 'your water oxygen extraction and manufacturing expert, how do we can increase production, one sentence, conssie idea, if you have a question, need sth, make that one sentence a requrest, if not give idea, or comment'
};

class WorkforceChatManager {
  constructor() {
    this.chats = this._load();
    this.intervals = {};
    if (OpenAI && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else {
      this.openai = null;
    }
    for (const key of Object.keys(this.chats)) {
      if ((this.chats[key].workers || []).length > 0) {
        this._start(key);
      }
    }
  }

  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
      // ensure pendingProposal key for each chat
      Object.values(data).forEach(chat => {
        if (!('pendingProposal' in chat)) chat.pendingProposal = null;
      });
      return data;
    } catch {
      return {};
    }
  }

  _save() {
    fs.writeFileSync(CHAT_FILE, JSON.stringify(this.chats, null, 2));
  }

  _key(email, name) {
    return `${email}|${name}`;
  }

  initFromInstitutions(list) {
    list.forEach(inst => {
      if (Array.isArray(inst.workforce) && inst.workforce.length > 0) {
        inst.workforce.forEach(w => this.addWorker(inst.owner, inst.name, w));
      }
    });
  }

  getChat(email, name) {
    const key = this._key(email, name);
    return this.chats[key] || { messages: [], workers: [], firstPrompt: FIRST_PROMPTS[name] || 'Discuss improvements.' };
  }

  addWorker(email, name, worker) {
    const key = this._key(email, name);
    let chat = this.chats[key];
    if (!chat) {
      chat = { messages: [], workers: [], firstPrompt: FIRST_PROMPTS[name] || 'Discuss improvements.', pendingProposal: null };
      this.chats[key] = chat;
    }
    chat.workers.push({ ...worker, initialized: false });
    this._save();
    this._start(key);
  }

  _start(key) {
    if (this.intervals[key]) return;
    this.intervals[key] = setInterval(() => this._step(key), WORKFORCE_INTERVAL_MS);
  }

  async _query(instructions, input) {
    if (!this.openai) {
      // Fake simple JSON response
      return { dialogue: '...', proposal: null, is_proposal: false };
    }
    const response = await this.openai.responses.create({
      model: 'gpt-4.1-nano-2025-04-14',
      input,
      instructions,
      text: { format: { type: 'text' } },
      temperature: 1.26,
      max_output_tokens: 2048,
      top_p: 1,
      store: false
    });
    if (
      response &&
      response.output &&
      response.output[0] &&
      response.output[0].content &&
      response.output[0].content[0]
    ) {
      const raw = response.output[0].content[0].text.trim();
      try {
        const obj = JSON.parse(raw);
        if (typeof obj.is_proposal !== 'boolean') obj.is_proposal = !!obj.proposal;
        return obj;
      } catch {
        return { dialogue: raw, proposal: null, is_proposal: false };
      }
    }
    return { dialogue: '', proposal: null, is_proposal: false };
  }

  async _step(key) {
    const chat = this.chats[key];
    if (!chat || chat.workers.length === 0) return;
    if (chat.pendingProposal) return;
    for (const worker of chat.workers) {
      const history = chat.messages.slice(-10).map(m => `${m.worker}: ${m.text}`).join('\n');
      let instructions = `You are ${worker.name}, ${worker.role}. Backstory: ${worker.backstory}. Resume: ${worker.resume}.`;
      if (worker.director) {
        instructions += ' If you agree with an idea, reply with JSON {"dialogue":"...","is_proposal":true,"proposal":{...}}. '
          + 'For normal dialogue reply with {"dialogue":"...","is_proposal":false}.';
      }
      let prompt;
      if (!worker.initialized) {
        prompt = history ? `${history}\n${chat.firstPrompt}` : chat.firstPrompt;
      } else {
        prompt = history || chat.firstPrompt;
      }
      try {
        const result = await this._query(instructions, prompt);
        if (result && result.dialogue) {
          chat.messages.push({ worker: worker.name, text: result.dialogue });
          worker.initialized = true;
        }
        if (result && result.is_proposal && worker.director) {
          const [owner, name] = key.split('|');
          const inst = institutionStore.findInstitution(owner, name);
          if (inst) {
            const { index } = institutionStore.addProposal(inst.id, result.proposal || {});
            chat.pendingProposal = { instId: inst.id, index };
          }
        }
      } catch (err) {
        console.log('Chat generation failed:', err.message);
      }
    }
    this._save();
  }

  resolveProposal(instId, index, status) {
    const inst = institutionStore.getInstitution(instId);
    if (!inst) return;
    const key = this._key(inst.owner, inst.name);
    const chat = this.chats[key];
    if (!chat) return;
    if (chat.pendingProposal && chat.pendingProposal.instId === instId && chat.pendingProposal.index === index) {
      chat.pendingProposal = null;
      chat.messages.push({ worker: 'System', text: `Proposal ${status}` });
      this._save();
    }
  }
}

module.exports = new WorkforceChatManager();
