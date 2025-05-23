const fs = require('fs');
const path = require('path');
const institutionStore = require('./institutionStore');

let OpenAI = null;
try {
  OpenAI = require('openai');
} catch (_) {}

const CHAT_FILE = path.join(__dirname, 'chatLogs.json');
const WORKFORCE_INTERVAL_MS = 1000; // 1 minute
const FIRST_PROMPTS = {
  WatOx:
    'You are our water-oxygen extraction expert. How can we increase production? Give one concise idea. If you need more info, ask one sentence.'
};

class WorkforceChatManager {
  constructor() {
    this.chats = this._load();
    this.intervals = {};
    this.openai = OpenAI && process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
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
    return this.chats[key] || {
      messages: [],
      workers: [],
      firstPrompt: FIRST_PROMPTS[name] || 'Discuss improvements.',
      pendingProposal: null
    };
  }

  addWorker(email, name, worker) {
    const key = this._key(email, name);
    if (!this.chats[key]) {
      this.chats[key] = {
        messages: [],
        workers: [],
        firstPrompt: FIRST_PROMPTS[name] || 'Discuss improvements.',
        pendingProposal: null
      };
    }
    this.chats[key].workers.push({ ...worker, initialized: false });
    this._save();
    this._start(key);
  }

  _start(key) {
    if (this.intervals[key]) return;
    this.intervals[key] = setInterval(() => this._step(key), WORKFORCE_INTERVAL_MS);
  }

  async _query(instructions, input, isDirector) {
    if (!this.openai) {
      // Fake simple JSON response
      return { dialogue: '...', proposal: null, is_proposal: false };
    }
    const response = await this.openai.responses.create({
      model: 'gpt-4.1-nano-2025-04-14',
      input,
      instructions,
      text: isDirector
        ? { format: { type: 'json_object' } }
        : { format: { type: 'text' } },
      temperature: 1.26,
      max_output_tokens: 2048,
      top_p: 1,
      store: false
    });

    const raw =
      response?.output?.[0]?.content?.[0]?.text?.trim() || '';

    try {
      const obj = JSON.parse(raw);
      if (typeof obj.is_proposal !== 'boolean') {
        obj.is_proposal = !!obj.proposal;
      }
      return obj;
    } catch {
      return { dialogue: raw, proposal: null, is_proposal: false };
    }
  }

  async _step(key) {
    const chat = this.chats[key];
    if (!chat || chat.workers.length === 0) return;
    if (chat.pendingProposal) return;
    for (const worker of chat.workers) {
      const history = chat.messages
        .slice(-10)
        .map(m => `${m.worker}: ${
            typeof m.text === 'object'
              ? JSON.stringify(m.text)
              : m.text
          }`)
        .join('\n');

      let instructions = `You are ${worker.name}, ${worker.role}. Backstory: ${worker.backstory}. Resume: ${worker.resume}.`;
      if (worker.director) {
        instructions +=
          ' When you are ready to propose, reply with JSON exactly like { "dialogue": "...", "is_proposal": true, "proposal": { "title": "Title", "description": "Details", "cost": 100 } }. Otherwise reply with { "dialogue": "...", "is_proposal": false, "proposal": null }.';
      }

      const basePrompt = (!worker.initialized && history)
        ? `${history}\n${chat.firstPrompt}`
        : history || chat.firstPrompt;

      const prompt = worker.director
        ? `Please respond in valid JSON only. ${basePrompt}`
        : basePrompt;

      let result;
      try {
        result = await this._query(instructions, prompt, worker.director);
      } catch (err) {
        console.error('Chat generation failed:', err);
        continue;
      }

      if (result.dialogue) {
        if (worker.director) {
          chat.messages.push({
            worker: worker.name,
            text: {
              dialogue: result.dialogue,
              is_proposal: result.is_proposal,
              proposal: result.proposal || null
            }
          });
        } else {
          chat.messages.push({ worker: worker.name, text: result.dialogue });
        }
        worker.initialized = true;
      }

      if (worker.director && result.is_proposal) {
        const [owner, instName] = key.split('|');
        const inst = institutionStore.findInstitution(owner, instName);
        if (inst) {
          const { index } = institutionStore.addProposal(inst.id, result.proposal);
          chat.pendingProposal = { instId: inst.id, index };
        }
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
