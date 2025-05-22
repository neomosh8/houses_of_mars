const express = require('express');
// Placeholder random generation; optionally use OpenAI if API key provided
let openai = null;
try {
  const { Configuration, OpenAIApi } = require('openai');
  if (process.env.OPENAI_API_KEY) {
    const conf = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
    openai = new OpenAIApi(conf);
  }
} catch {}

module.exports = function(institutionStore, userStore) {
  const router = express.Router();

  function randomWorker() {
    const names = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Jamie'];
    const roles = ['Engineer', 'Scientist', 'Miner', 'Botanist', 'Medic'];
    const backstories = [
      'Veteran colonist from Earth.',
      'Dreams of pioneering Mars.',
      'Loves tinkering with machines.',
      'Has a knack for survival.',
      'Recently graduated from space academy.'
    ];
    const resumes = [
      'Skilled in robotics and maintenance.',
      'Experienced in geology and excavation.',
      'Expert in life support systems.',
      'Focus on agriculture in harsh climates.',
      'Medical background with trauma specialty.'
    ];
    return {
      name: names[Math.floor(Math.random()*names.length)],
      image: 'https://placehold.co/150x200?text=Worker',
      backstory: backstories[Math.floor(Math.random()*backstories.length)],
      resume: resumes[Math.floor(Math.random()*resumes.length)],
      wage: Math.floor(Math.random()*40)+10,
      effects: {
        oxygen: Math.random() < 0.3 ? 0.5 : 0,
        hydration: Math.random() < 0.3 ? 0.5 : 0,
        health: Math.random() < 0.3 ? 0.5 : 0,
      }
    };
  }

  async function generateWorkers(num) {
    const workers = [];
    for (let i=0;i<num;i++) {
      if (openai) {
        // Placeholder call - simplified prompt
        try {
          const completion = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Generate a worker profile with name, backstory and resume.' }],
            max_tokens: 100
          });
          const text = completion.data.choices[0].message.content;
          workers.push({
            name: `Worker ${i+1}`,
            image: 'https://placehold.co/150x200?text=Worker',
            backstory: text,
            resume: text,
            wage: Math.floor(Math.random()*40)+10,
            effects: { oxygen: 0, hydration: 0, health: 0 }
          });
        } catch {
          workers.push(randomWorker());
        }
      } else {
        workers.push(randomWorker());
      }
    }
    return workers;
  }

  router.post('/generate/:id', async (req,res) => {
    const num = Math.floor(Math.random()*5)+1;
    const workers = await generateWorkers(num);
    res.json({ workers });
  });

  router.post('/hire/:id', (req,res) => {
    const id = Number(req.params.id);
    const worker = req.body.worker;
    if (!worker) return res.status(400).json({ error: 'worker required' });
    const inst = institutionStore.getInstitution(id);
    if (!inst) return res.status(404).json({ error: 'not found' });
    inst.workforce = inst.workforce || [];
    inst.workforce.push(worker);
    institutionStore.updateInstitution(id, { workforce: inst.workforce });

    const users = userStore.loadUsers();
    const user = users[inst.owner];
    if (user) {
      userStore.saveUsers(users);
    }
    res.json({ ok: true });
  });

  router.get('/:id', (req,res) => {
    const id = Number(req.params.id);
    const inst = institutionStore.getInstitution(id);
    if (!inst) return res.status(404).json({ error: 'not found' });
    res.json({ workforce: inst.workforce || [] });
  });

  return router;
};
