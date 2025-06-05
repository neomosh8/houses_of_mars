const fs = require('fs');
const path = require('path');
const institutionStore = require('./institutionStore');
const defenceStore = require('./defenceBaseStore');

let OpenAI = null;
try {
  OpenAI = require('openai');
} catch (_) {}

const CHAT_FILE = path.join(__dirname, 'chatLogs.json');
const RESPONSE_DELAY_MS = 2000; // 2 seconds between each worker response
const INITIAL_DELAY_MS = 1000; // 1 second delay after user message
const FIRST_PROMPTS = {
  WatOx:
    'You are employee in water-oxygen extraction facility in mars. How can we increase production? Give one concise idea. the idea should be either a device, or a facility/building. specification should be clear. i dont want plan or approach. i want machines or buildings/facilities If you need more info, ask one sentence. do not output more than 2 sentences ever. help shape ideas , start from broad and help your parties to specify and make project idea tangible and concrete. based on your expertise and resume, be creative.',
  'Defence Base':
    'You are a defence engineer on Mars. Suggest new weapons or defence systems. Keep responses short. When you are ready to propose, output JSON exactly like { "dialogue": "...", "is_proposal": true, "defprop": { "name": "Name", "look": "description for model", "category": "attack", "technology": { "one of laser, drone, missile , bullet, kamikaze"}, "parameters": { "weight": 10, "ammo": 20, "force": 5, "fuel": 3 } } }. Otherwise reply with { "dialogue": "...", "is_proposal": false }. Always respond with valid JSON.'
};

class WorkforceChatManager {
  constructor() {
    this.chats = this._load();
    this.timers = {};
    this.responseRounds = {}; // Track active response rounds
    this.openai = OpenAI && process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
      Object.values(data).forEach(chat => {
        if (!Array.isArray(chat.messages)) chat.messages = [];
        if (!Array.isArray(chat.workers)) chat.workers = [];
        if (!Array.isArray(chat.ids)) chat.ids = [];
        chat.currentId = typeof chat.currentId === 'number' ? chat.currentId : (chat.ids[0] || null);
        chat.nextIndex = chat.nextIndex || 0;
        chat.workers.sort((a, b) => (a.director === b.director ? 0 : a.director ? 1 : -1));
      });
      return data;
    } catch {
      return {};
    }
  }

  _save() {
    fs.writeFileSync(CHAT_FILE, JSON.stringify(this.chats, null, 2));
  }

  _key(email, name, id) {
    return `${email}|${name}`;
  }

  initFromInstitutions(list) {
    list.forEach(inst => {
      if (Array.isArray(inst.workforce) && inst.workforce.length > 0) {
        inst.workforce.forEach(w =>
          this.addWorker(inst.owner, inst.name, inst.id, w)
        );
      }
    });
  }

  getChat(email, name, id) {
    const key = this._key(email, name, id);
    const chat = this.chats[key] || {
      messages: [],
      workers: [],
      nextIndex: 0,
      firstPrompt: FIRST_PROMPTS[name] || 'Discuss improvements.',
      ids: [],
      currentId: null,
    };
    if (!this.chats[key]) this.chats[key] = chat;
    if (!chat.ids.includes(id)) chat.ids.push(id);
    chat.currentId = id;
    return chat;
  }

  addWorker(email, name, id, worker) {
    const key = this._key(email, name);
    if (!this.chats[key]) {
      this.chats[key] = {
        messages: [],
        workers: [],
        nextIndex: 0,
        firstPrompt: FIRST_PROMPTS[name] || 'Discuss improvements.',
        ids: [],
        currentId: id,
      };
    }
    const chat = this.chats[key];
    if (!chat.ids.includes(id)) chat.ids.push(id);
    chat.currentId = id;
    chat.workers.push({ ...worker, initialized: false });
    chat.workers.sort((a,b)=> (a.director===b.director?0:(a.director?1:-1)));
    this._save();
  }

  removeWorker(email, name, worker) {
    const key = this._key(email, name);
    const chat = this.chats[key];
    if (!chat) return;
    const idx = chat.workers.findIndex(
      w => w.name === worker.name && w.role === worker.role
    );
    if (idx === -1) return;
    chat.workers.splice(idx, 1);

    // Cancel any active response round
    if (this.responseRounds[key]) {
      this._cancelResponseRound(key);
    }

    this._save();
  }

  addUserMessage(email, name, id, text) {
    const key = this._key(email, name);
    if (!this.chats[key]) {
      this.chats[key] = {
        messages: [],
        workers: [],
        nextIndex: 0,
        firstPrompt: FIRST_PROMPTS[name] || 'Discuss improvements.',
        ids: [],
        currentId: id,
      };
    }
    const chat = this.chats[key];
    if (!chat.ids.includes(id)) chat.ids.push(id);
    chat.currentId = id;
    chat.messages.push({ worker: 'User', text });
    this._save();

    // Cancel any existing response round and start a new one
    this._cancelResponseRound(key);
    this._startResponseRound(key);
  }

  _cancelResponseRound(key) {
    if (this.timers[key]) {
      clearTimeout(this.timers[key]);
      delete this.timers[key];
    }
    if (this.responseRounds[key]) {
      delete this.responseRounds[key];
    }
  }

  _startResponseRound(key) {
    const chat = this.chats[key];
    if (!chat || chat.workers.length === 0) return;

    // Initialize response round
    this.responseRounds[key] = {
      workerIndex: 0,
      totalWorkers: chat.workers.length
    };

    // Start with initial delay
    this.timers[key] = setTimeout(() => {
      this._processNextWorker(key);
    }, INITIAL_DELAY_MS);
  }

  async _processNextWorker(key) {
    const round = this.responseRounds[key];
    if (!round) return;

    const chat = this.chats[key];
    if (!chat || chat.workers.length === 0) return;

    // Process current worker
    const worker = chat.workers[round.workerIndex];
    await this._generateWorkerResponse(key, worker);

    // Move to next worker
    round.workerIndex++;

    // Check if round is complete
    if (round.workerIndex >= round.totalWorkers) {
      // Round complete, clean up
      delete this.responseRounds[key];
      delete this.timers[key];
      return;
    }

    // Schedule next worker
    this.timers[key] = setTimeout(() => {
      this._processNextWorker(key);
    }, RESPONSE_DELAY_MS);
  }

  async _generateWorkerResponse(key, worker) {
    const chat = this.chats[key];
    const [owner, instName] = key.split('|');
    let instId = chat.currentId;
    let inst = institutionStore.getInstitution(instId);

    if (!inst && chat.ids.length > 0) {
      chat.currentId = chat.ids[0];
      instId = chat.currentId;
      inst = institutionStore.getInstitution(instId);
    }

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
          ' When you are ready to propose, reply with JSON exactly like { "dialogue": "...", "is_proposal": true, "defprop": { "name": "Name", "look": "description for model", "category": "attack", "technology": {one of laser,missile,bullet,drone, kamikaze}, "parameters": { "weight": 10, "ammo": 20, "force": 5, "fuel": 3 } } }. Otherwise reply with { "dialogue": "...", "is_proposal": false }. Always respond with valid JSON.';
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
      return;
    }

    if (result.dialogue) {
      const propData = result.proposal || result.defprop || null;
      if (worker.director) {
        chat.messages.push({
          worker: worker.name,
          text: {
            dialogue: result.dialogue,
            is_proposal: result.is_proposal,
            proposal: propData,
            raw: result.raw
          }
        });
      } else {
        chat.messages.push({ worker: worker.name, text: result.dialogue });
      }
      worker.initialized = true;

      if (result.is_proposal && propData && inst) {
        if (inst.name === 'Defence Base') {
          console.log('[WORKFORCE] adding defence proposal', {
            institution: inst.id,
            proposal: propData
          });
          defenceStore.addProposal(inst.id, propData);
        } else {
          institutionStore.addProposal(inst.id, propData);
        }
      }
    }
    this._save();
  }

  async _query(instructions, input, isDirector) {
    if (!this.openai) {
      // Fake simple JSON response
      return { dialogue: 'I think we should focus on improving efficiency.', proposal: null, is_proposal: false };
    }
    const response = await this.openai.responses.create({
      model: 'gpt-4o',
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

    const raw = response?.output?.[0]?.content?.[0]?.text?.trim() || '';

    try {
      const obj = JSON.parse(raw);
      if (typeof obj.is_proposal !== 'boolean') {
        obj.is_proposal = !!obj.proposal || !!obj.defprop;
      }
      return { ...obj, raw };
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const obj = JSON.parse(match[0]);
          if (typeof obj.is_proposal !== 'boolean') {
            obj.is_proposal = !!obj.proposal || !!obj.defprop;
          }
          return { ...obj, raw };
        } catch {}
      }
      return { dialogue: raw, proposal: null, is_proposal: false, raw };
    }
  }

  resolveProposal(instId, index, status, note = null) {
    const inst = institutionStore.getInstitution(instId);
    if (!inst) return;
    const key = this._key(inst.owner, inst.name);
    const chat = this.chats[key];
    if (!chat) return;
    if (!chat.ids.includes(instId)) chat.ids.push(instId);
    chat.currentId = instId;
    let msg = `Proposal ${status}`;
    if (note) msg += `: ${note}`;
    chat.messages.push({ worker: 'System', text: msg });
    this._save();
  }
}

module.exports = new WorkforceChatManager();