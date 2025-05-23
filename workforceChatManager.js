const fs = require('fs');
const path = require('path');
const institutionStore = require('./institutionStore');

let OpenAI;
try {
  OpenAI = require('openai');
} catch (_) {
  OpenAI = null;
}

let openai = null;
if (OpenAI && process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const FILE = path.join(__dirname, 'workforceChats.json');
function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}
function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

const chats = load();

function key(email, kind) {
  return `${email}-${kind}`;
}

function getWorkers(email, kind) {
  const institutions = institutionStore.getInstitutions();
  const workers = [];
  institutions.forEach(i => {
    if (i.owner === email && i.name === kind && Array.isArray(i.workforce)) {
      workers.push(...i.workforce);
    }
  });
  return workers;
}

async function runChat(email, kind, initialPrompt, turns = 1) {
  const chatKey = key(email, kind);
  let chat = chats[chatKey];
  if (!chat) {
    chat = { messages: [] };
    chats[chatKey] = chat;
  }
  const workers = getWorkers(email, kind);
  const prompts = workers.map(
    w => `You are ${w.name}, a ${w.role}. BACKSTORY: ${w.backstory} RESUME: ${w.resume}`
  );
  if (chat.messages.length === 0 && initialPrompt) {
    chat.messages.push({ sender: 'user', content: initialPrompt });
  }

  for (let t = 0; t < turns; t++) {
    for (let i = 0; i < workers.length; i++) {
      const worker = workers[i];
      const history = [
        { role: 'system', content: prompts[i] },
        ...chat.messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.content }))
      ];
      let content = '';
      if (!openai) {
        content = `${worker.name} thinks about "${initialPrompt}"`;
      } else {
        try {
          const resp = await openai.responses.create({
            model: 'gpt-4.1-nano-2025-04-14',
            input: history,
            text: { format: { type: 'text' } },
            temperature: 1.26,
            max_output_tokens: 2048,
            top_p: 1,
            store: false
          });
          content = resp.output[0].content[0].text;
        } catch (err) {
          console.error('Chat error', err.message);
          content = `${worker.name} is silent.`;
        }
      }
      chat.messages.push({ sender: worker.name, content });
    }
  }

  save(chats);
  return chat.messages;
}

function getChat(email, kind) {
  const chatKey = key(email, kind);
  return chats[chatKey]?.messages || [];
}

module.exports = { runChat, getChat };
