const OpenAI = require('openai');
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    console.log('Initializing OpenAI with API key...');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('OpenAI initialized successfully');
  } else {
    console.log('No OpenAI API key found');
  }
} catch (initError) {
  console.log('Failed to initialize OpenAI:', initError.message);
}

async function judgeProposal(proposal, ecosystem) {
  console.log('\n=== JUDGE PROPOSAL START ===');

  if (!openai) {
    console.log('No OpenAI available, using fallback');
    // simple fallback: return given gains or null if none
    return { feasible: true, gains: proposal.gains || null };
  }

  console.log('=== JUDGE INPUT ===');
  console.log('Ecosystem:', JSON.stringify(ecosystem, null, 2));
  console.log('Proposal:', JSON.stringify(proposal, null, 2));

  const messages = [
    { role: 'system', content: 'in a game, we are in mars, your are the evaluator , based on the ecosystem situation ( ecosystem numbers which are from 0 to 1, so 1 and 0 is extreme and middle is good  ) and project details , decide is the project is feasible , and if yes what would be deterministic final gain results among the range  and it generate a json with key "feasible":bool and  "gains": { "hydration": 1 to 9, "oxygen": 1 to 9, "health": 1 to 9, "money": 100 to 100 } if it is not feasible , gains:reasoning on why not feasible' },
    { role: 'user', content: JSON.stringify({ ecosystem, proposal }) }
  ];

  console.log('=== PREPARED MESSAGES ===');
  console.log('Messages:', JSON.stringify(messages, null, 2));

  try {
    console.log('=== MAKING API CALL ===');
    console.log('About to call OpenAI with model: gpt-4.1');

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

    console.log('Request parameters:', JSON.stringify(requestParams, null, 2));

    const response = await openai.chat.completions.create(requestParams);

    console.log('=== RAW API RESPONSE ===');
    console.log('Response object keys:', Object.keys(response));
    console.log('Response choices length:', response?.choices?.length);
    console.log('Full response:', JSON.stringify(response, null, 2));

    const text = response?.choices?.[0]?.message?.content || '';
    console.log('=== EXTRACTED TEXT ===');
    console.log('Response text length:', text.length);
    console.log('Response text:', text);

    if (!text) {
      console.log('ERROR: No content in response');
      return { feasible: false, gains: null };
    }

    console.log('=== PARSING JSON ===');
    const result = JSON.parse(text);
    console.log('=== JUDGE OUTPUT ===');
    console.log('Parsed result:', JSON.stringify(result, null, 2));

    console.log('=== JUDGE PROPOSAL END ===\n');
    return result;

  } catch (error) {
    console.log('=== JUDGE ERROR ===');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);

    if (error.response) {
      console.log('HTTP Response Status:', error.response.status);
      console.log('HTTP Response Data:', error.response.data);
    }

    if (error.code) {
      console.log('Error code:', error.code);
    }

    console.log('Full error object:', error);
    console.log('Error stack:', error.stack);

    console.log('=== JUDGE PROPOSAL END (ERROR) ===\n');
    return { feasible: false, gains: null };
  }
}

module.exports = { judgeProposal };