const OpenAI = require('openai');
let openai = null;

try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (initError) {
  // ignore initialization errors
}

async function judgeProposal(proposal, ecosystem) {
  if (!openai) {
    // simple fallback: return given gains or null if none
    return { feasible: true, gains: proposal.gains || null };
  }

  const messages = [
    {
      role: 'system',
      content:
        'in a game, we are in mars, your are the evaluator , based on the ecosystem situation ( ecosystem numbers which are from 0 to 1, so 1 and 0 is extreme and middle is good  ) and project details , decide is the project is feasible , and if yes what would be deterministic final gain results among the range  and it generate a json with key "feasible":bool and  "gains": { "hydration": 1 to 9, "oxygen": 1 to 9, "health": 1 to 9, "money": 100 to 100 } if it is not feasible , gains:reasoning on why not feasible'
    },
    { role: 'user', content: JSON.stringify({ ecosystem, proposal }) }
  ];

  try {
    const requestParams = {
      model: 'gpt-4.1',
      messages,
      response_format: { type: 'json_object' },
      temperature: 1,
      max_completion_tokens: 2048,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    const response = await openai.chat.completions.create(requestParams);
    const text = response?.choices?.[0]?.message?.content || '';

    if (!text) {
      return { feasible: false, gains: null };
    }

    const result = JSON.parse(text);
    return result;
  } catch (error) {
    if (error.response) {
      // ignore HTTP error detail
    }

    if (error.code) {
      // ignore error code detail
    }

    return { feasible: false, gains: null };
  }
}

module.exports = { judgeProposal };
