const institutionStore = require('./institutionStore');
const planetHallStore = require('./planetHallStore');
const referendumManager = require('./referendumManager');

let OpenAI = null;
try {
  OpenAI = require('openai');
} catch {}

const openai = OpenAI && process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function queryVote(worker, owner, question) {
  if (!openai) {
    return Math.random() < 0.5 ? 'yes' : 'no';
  }
  try {
    const messages = [
      { role: 'system', content: 'You are an AI worker voting in a referendum. Always reply with JSON like {"vote":"yes"} or {"vote":"no"}.' },
      { role: 'user', content: `Owner: ${owner}\nName: ${worker.name}\nRole: ${worker.role}\nResume: ${worker.resume}\nBackstory: ${worker.backstory}\nReferendum: ${question}` }
    ];
    const resp = await openai.chat.completions.create({
      model: 'gpt-4.1-nano-2025-04-14',
      messages,
      temperature: 1,
      max_tokens: 100
    });
    const text = resp.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const obj = JSON.parse(match[0]);
        const v = String(obj.vote || obj.answer || '').toLowerCase();
        if (v.includes('yes')) return 'yes';
        return 'no';
      } catch {}
    }
    return text.toLowerCase().includes('yes') ? 'yes' : 'no';
  } catch {
    return Math.random() < 0.5 ? 'yes' : 'no';
  }
}

async function runReferendum(type, data, proposedBy, broadcast) {
  const ref = referendumManager.createReferendum(type, data, proposedBy);
  const institutions = institutionStore.getInstitutions();
  const workers = [];
  institutions.forEach(inst => {
    if (Array.isArray(inst.workforce)) {
      inst.workforce.forEach(w => workers.push({ worker: w, owner: inst.owner }));
    }
  });
  ref.totalWorkers = workers.length;
  ref.votes = {};
  ref.voted = 0;
  ref.status = 'voting';
  referendumManager.updateActive(ref);
  if (broadcast) {
    broadcast({ type: 'referendumStart', referendum: { id: ref.id, type: ref.type, total: ref.totalWorkers } });
  }

  for (const entry of workers) {
    const vote = await queryVote(entry.worker, entry.owner, JSON.stringify({ type, data }));
    ref.votes[`${entry.owner}|${entry.worker.name}`] = vote === 'yes';
    ref.voted++;
    referendumManager.updateActive(ref);
    if (broadcast) {
      broadcast({ type: 'referendumProgress', votes: ref.voted, total: ref.totalWorkers });
    }
  }

  const yes = Object.values(ref.votes).filter(v => v).length;
  const no = Object.values(ref.votes).filter(v => !v).length;
  ref.result = { yes, no };
  ref.status = yes > no ? 'approved' : 'rejected';

  if (ref.status === 'approved') {
    if (type === 'candidate' && data.email && data.name) {
      planetHallStore.addBoardMember(data.email, data.name);
    } else if (type === 'fire' && data.email) {
      planetHallStore.removeBoardMember(data.email);
    }
  }

  referendumManager.finalize(ref);
  if (broadcast) {
    broadcast({ type: 'referendumResult', referendum: ref });
  }
  return ref;
}

module.exports = { runReferendum };
