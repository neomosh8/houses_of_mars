const OpenAI = require('openai');
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch {}

async function judgeProposal(proposal, ecosystem) {
  if (!openai) {
    // simple fallback: return given gains or null if none
    return { feasible: true, gains: proposal.gains || null };
  }
  const messages = [
    { role: 'system', content: 'You are a strict project feasibility judge for a Mars colony. Reply only in JSON.' },
    { role: 'user', content: JSON.stringify({ ecosystem, proposal }) }
  ];
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages,
      response_format: { type: 'json_object' },
      temperature: 1,
      max_completion_tokens: 2048,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    });
    const text = response?.choices?.[0]?.message?.content || '';
    return JSON.parse(text);
  } catch {
    return { feasible: false, gains: null };
  }
}

module.exports = { judgeProposal };
