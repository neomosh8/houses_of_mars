const fs = require('fs');
const path = require('path');
const institutionStore = require('./institutionStore');
const defenceStore = require('./defenceBaseStore');

let OpenAI = null;
try {
  OpenAI = require('openai');
} catch (_) {}

const CHAT_FILE = path.join(__dirname, 'chatLogs.json');
const WORKFORCE_INTERVAL_MS = 2000; // 1 minute
const FIRST_PROMPTS = {
  WatOx:
    'You are employee in water-oxygen extraction facility in mars. How can we increase production? Give one concise idea. the idea should be either a device, or a facility/building. specification should be clear. i dont want plan or approach. i want machines or buildings/facilities If you need more info, ask one sentence. do not output more than 2 sentences ever. help shape ideas , start from broad and help your parties to specify and make project idea tangible and concrete. based on your expertise and resume, be creative.',
  'Defence Base':
    'You are a defence engineer on Mars. Suggest new weapons or defence systems. Keep responses short. When you are ready to propose, output JSON exactly like { "dialogue": "...", "is_proposal": true, "defprop": { "name": "Name", "look": "description for model", "category": "attack", "technology": "laser", "parameters": { "weight": 10, "ammo": 20, "force": 5, "fuel": 3 } } }. Otherwise reply with { "dialogue": "...", "is_proposal": false }. Always respond with valid JSON.'
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
        obj.is_proposal = !!obj.proposal || !!obj.defprop;
      }
      return { ...obj, raw };
    } catch {
      return { dialogue: raw, proposal: null, is_proposal: false, raw };
    }
  }

  async _step(key) {
    const chat = this.chats[key];
    if (!chat || chat.workers.length === 0) return;
    if (chat.pendingProposal) return;
    for (const worker of chat.workers) {
      const [owner, instName] = key.split('|');
      const inst = institutionStore.findInstitution(owner, instName);
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
      if (inst && inst.name === 'Defence Base') {
        instructions +=
          ' When you are ready to propose, reply with JSON exactly like { "dialogue": "...", "is_proposal": true, "defprop": { "name": "Name", "look": "description for model", "category": "attack or defence", "technology": {a one or more elements from [ laser,missile,bullet,drone, kamikaze]}, "parameters": { "weight": 10, "ammo": 20, "force": 5, "fuel": 3 } } }. Otherwise reply with { "dialogue": "...", "is_proposal": false }. Always respond with valid JSON.';
      } else {
        instructions +=
          ' When you are ready to propose, reply with JSON exactly like { "dialogue": "...", "is_proposal": true, "proposal": { "title": "Title", "description": "Details", "cost": 100, "prerequisites": [ { "type": "hire", "value": "Role" } ], "gains": { "hydration": 1 to 9, "oxygen": 1 to 9, "health": 1 to 9, "money": 100 to 100 }, "risk": "low" } }. Otherwise reply with { "dialogue": "...", "is_proposal": false, "proposal": null }. Always respond with valid JSON.';
      }
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
      } catch {
        continue;
      }

      if (result.dialogue) {
        if (worker.director) {
          chat.messages.push({
            worker: worker.name,
            text: {
              dialogue: result.dialogue,
              is_proposal: result.is_proposal,
              proposal: result.proposal || null,
              raw: result.raw
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
          if (inst.name === 'Defence Base' && result.defprop) {
            const idx = defenceStore.addProposal(inst.id, result.defprop);
            chat.pendingProposal = { instId: inst.id, index: idx };
          } else if (result.proposal) {
            const { index } = institutionStore.addProposal(inst.id, result.proposal);
            chat.pendingProposal = { instId: inst.id, index };
          }
        }
      }
    }
    this._save();
  }

  resolveProposal(instId, index, status, note = null) {
    const inst = institutionStore.getInstitution(instId);
    if (!inst) return;
    const key = this._key(inst.owner, inst.name);
    const chat = this.chats[key];
    if (!chat) return;
    if (chat.pendingProposal && chat.pendingProposal.instId === instId && chat.pendingProposal.index === index) {
      chat.pendingProposal = null;
      let msg = `Proposal ${status}`;
      if (note) msg += `: ${note}`;
      chat.messages.push({ worker: 'System', text: msg });
      this._save();
    }
  }
}

module.exports = new WorkforceChatManager();
