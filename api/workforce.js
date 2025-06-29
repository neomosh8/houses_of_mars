require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const planetHallStore = require('../planetHallStore');
// Set to true to skip AI image generation and use placeholder images
const USE_PLACEHOLDER_IMAGES = true;
// Updated OpenAI import and initialization
let openai = null;
try {
  const OpenAI = require('openai');
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
} catch {
  // OpenAI not available
}

const chatManager = require('../workforceChatManager');
const judge = require('../judge');
const meshy = require('../meshy');

const SCAFF_MODELS = [
  { url: 'scof1.glb', scale: 6 },
  { url: 'scof2.glb', scale: 9 },
  { url: 'scof3.glb', scale: 4 }
];
const MODEL_DIR = path.join(__dirname, '..', 'generated_models');
if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR);
module.exports = function(institutionStore, userStore, engine, broadcast, sendToEmail) {
  const router = express.Router();

  function randomWorker() {
    const names = ['Alex Chen', 'Jordan Rivera', 'Taylor Kim', 'Morgan Singh', 'Riley Zhang', 'Casey Okafor', 'Jamie Santos'];
    const roles = ['Engineer', 'Scientist', 'Miner', 'Botanist', 'Medic', 'Pilot', 'Geologist'];
    const backstories = [
      'Veteran colonist from Earth with 5 years Mars experience.',
      'Dreams of pioneering sustainable life on Mars.',
      'Loves tinkering with atmospheric processors.',
      'Has a knack for survival in harsh environments.',
      'Recently graduated from the Mars Colonial Academy.',
      'Former asteroid miner with zero-G expertise.',
      'Specialized in Martian soil composition research.'
    ];
    const resumes = [
      'Skilled in robotics maintenance and atmospheric systems.',
      'Experienced in mineral extraction and geological surveys.',
      'Expert in life support systems and emergency protocols.',
      'Focus on hydroponic agriculture in low-gravity environments.',
      'Medical background with trauma and radiation exposure specialty.',
      'Certified pilot for Mars surface and orbital vehicles.',
      'Research background in terraforming technologies.'
    ];

    const worker = {
      name: names[Math.floor(Math.random() * names.length)],
      role: roles[Math.floor(Math.random() * roles.length)],
      image: 'https://placehold.co/150x200?text=Worker',
      backstory: backstories[Math.floor(Math.random() * backstories.length)],
      resume: resumes[Math.floor(Math.random() * resumes.length)],
      wage: Math.floor(Math.random() * 40) + 10,
      effects: {
        oxygen: Math.random() < 0.3 ? -0.5 : 0,
        hydration: Math.random() < 0.3 ? -0.5 : 0,
        health: Math.random() < 0.3 ? -0.5 : 0,
      }
    };
    worker.director = Math.random() < 0.2;
    if (worker.director) worker.wage = Math.floor(worker.wage * 1.5);
    return worker;
  }

  async function generateWorkerWithAI(institutionName, job) {
    if (!openai) {
      return randomWorker();
    }

    try {
      // Generate worker profile with text using correct API
      const approved = planetHallStore.getApprovedPolicies();
      const policyText = approved
        .map(p => `- ${p.title}: ${p.description}`)
        .join('\n');
      let systemPrompt =
        'You are an assistant that generates detailed worker profiles for a Mars colonization game. Always respond with valid JSON only, no additional text. respond in bullet point style, short, dont yap';
      if (policyText) {
        systemPrompt += `\nCurrent Policies:\n${policyText}`;
      }
      const profileResponse = await openai.chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [{
          role: "system",
          content: systemPrompt
        }, {
          role: "user",
          content: `Generate a  bullet point style, short, worker profile for a Mars colonization game. The worker will be employed at a ${institutionName} facility.${job && (job.title || job.description) ? ` The position is ${job.title || ''}. ${job.description || ''}` : ''}

          Please provide:
          1. A realistic full name
          2. A specific job role relevant to Mars colonization
          3. A coherent backstory bullet points - very casual about social behaviour, family relationship, very wierd interest, or past felony, emotional trauma, very positive or very negative incident
          4. A professional resume/skills  bullet points  -  what they can do very good? and what they built on earth?
          5. A fair wage (4-200 credits per day)
          6. The resources they consume each day (oxygen, hydration, or health).

          Format the response as JSON with these exact keys: name, role, backstory, resume, wage, effects (where effects is an object with oxygen, hydration, health as numbers between -5 and 0).`
        }],
        temperature: 1,
        max_tokens: 500
      });

      let workerData = randomWorker(); // fallback

      // Parse the AI response
      if (profileResponse.choices && profileResponse.choices.length > 0) {
        const textContent = profileResponse.choices[0].message.content;

        // Try to extract JSON from the response
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const aiData = JSON.parse(jsonMatch[0]);

            // Validate and merge AI data with fallback
            if (aiData.name) workerData.name = aiData.name;
            if (aiData.role) workerData.role = aiData.role;
            if (aiData.backstory) workerData.backstory = aiData.backstory;
            if (aiData.resume) workerData.resume = aiData.resume;
            if (aiData.wage && typeof aiData.wage === 'number') workerData.wage = Math.max(4, Math.min(200, aiData.wage));
            if (aiData.effects && typeof aiData.effects === 'object') {
              workerData.effects = {
                oxygen: Math.min(-5, Math.max(-1, aiData.effects.oxygen || 0)),
                hydration: Math.min(-5, Math.max(-1, aiData.effects.hydration || 0)),
                health: Math.min(-5, Math.max(-1, aiData.effects.health || 0))
              };
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      // Generate image using DALL-E 3
      if (!USE_PLACEHOLDER_IMAGES) {
        try {
          const imageResponse = await openai.images.generate({
            model: "dall-e-3",
            prompt: `Professional portrait of a Mars colonist worker named ${workerData.name}, who works as a ${workerData.role}.
            Style: Realistic digital art portrait, professional headshot style
            Setting: Futuristic Mars colony environment
            Appearance: Wearing appropriate work uniform/suit for Mars environment
            Mood: Confident and professional
            Quality: High detail, good lighting
            The person should look competent and ready for Mars colonization work.`,
            n: 1,
            size: "1024x1024",
            quality: "standard",
            response_format: "url"
          });

          if (imageResponse.data && imageResponse.data.length > 0) {
            workerData.image = imageResponse.data[0].url;
          }
        } catch (imageError) {
          workerData.image = 'https://placehold.co/150x200?text=Worker';
        }
      } else {
        workerData.image = 'https://placehold.co/150x200?text=Worker';
      }

      return workerData;

    } catch {
      return randomWorker();
    }
  }

  async function generateWorkers(num, institutionName = 'Mars Colony', job) {
    const workers = [];

    // Use Promise.all to generate workers in parallel for better performance
    const workerPromises = [];
    for (let i = 0; i < num; i++) {
      if (openai) {
        workerPromises.push(generateWorkerWithAI(institutionName, job));
      } else {
        workerPromises.push(Promise.resolve(randomWorker()));
      }
    }

    try {
      const generatedWorkers = await Promise.all(workerPromises);
      workers.push(...generatedWorkers);
    } catch {
      // Fill with random workers if AI generation fails
      for (let i = 0; i < num; i++) {
        workers.push(randomWorker());
      }
    }

    return workers;
  }

  router.post('/generate/:id', async (req, res) => {
    try {
      const institutionId = Number(req.params.id);
      console.log('Generating applicants for institution', institutionId);
      const institution = institutionStore.getInstitution(institutionId);

      const institutionName = institution ? institution.name : 'Mars Colony';
      const num = Math.floor(Math.random() * 5) + 1; // 1-5 workers
      const job = { title: req.body && req.body.title, description: req.body && req.body.description };

      const workers = await generateWorkers(num, institutionName, job);
      console.log('Workers generated:', workers);

      res.json({ workers });
    } catch (err) {
      console.error('Error generating workers:', err);
      res.status(500).json({ error: 'Failed to generate workers' });
    }
  });

  router.post('/hire/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const worker = req.body.worker;

      if (!worker) {
        return res.status(400).json({ error: 'worker required' });
      }

      const inst = institutionStore.getInstitution(id);
      if (!inst) {
        return res.status(404).json({ error: 'institution not found' });
      }

      // Initialize workforce array if it doesn't exist
      if (!inst.workforce) {
        inst.workforce = [];
      }

      // If the worker image is a remote URL, download it locally
      if (worker.image && worker.image.startsWith('http')) {
        try {
          const imagesDir = path.join(__dirname, '..', 'worker_images');
          await fs.promises.mkdir(imagesDir, { recursive: true });

          const url = new URL(worker.image);
          const ext = path.extname(url.pathname) || '.jpg';
          const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
          const filePath = path.join(imagesDir, fileName);

          const response = await fetch(worker.image);
          if (!response.ok) throw new Error(`failed to fetch ${worker.image}`);
          await fs.promises.writeFile(filePath, Buffer.from(await response.arrayBuffer()));

          worker.image = `/worker_images/${fileName}`;
        } catch {
          // ignore image download errors
        }
      }

      // Add the worker
      inst.workforce.push(worker);
      chatManager.addWorker(inst.owner, inst.name, id, worker);

      // Update the institution
      institutionStore.updateInstitution(id, { workforce: inst.workforce });

      // Update user data if needed
      const users = userStore.loadUsers();
      const user = users[inst.owner];
      if (user) {
        userStore.saveUsers(users);
      }

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to hire worker' });
    }
  });

  router.post('/fire/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const index = req.body.index;
      if (typeof index !== 'number') {
        return res.status(400).json({ error: 'index required' });
      }

      const inst = institutionStore.getInstitution(id);
      if (!inst || !Array.isArray(inst.workforce) || !inst.workforce[index]) {
        return res.status(404).json({ error: 'worker not found' });
      }

      const [worker] = inst.workforce.splice(index, 1);
      institutionStore.updateInstitution(id, { workforce: inst.workforce });
      chatManager.removeWorker(inst.owner, inst.name, worker);

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to fire worker' });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const inst = institutionStore.getInstitution(id);

      if (!inst) {
        return res.status(404).json({ error: 'institution not found' });
      }

      res.json({ workforce: inst.workforce || [] });
    } catch {
      res.status(500).json({ error: 'Failed to get workforce' });
    }
  });

  router.get('/chat/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const inst = institutionStore.getInstitution(id);
      if (!inst) return res.status(404).json({ error: 'not found' });
      const chat = chatManager.getChat(inst.owner, inst.name, id);
      res.json({ messages: chat.messages });
    } catch {
      res.status(500).json({ error: 'Failed to get chat' });
    }
  });

  router.post('/chat/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: 'text required' });
      const inst = institutionStore.getInstitution(id);
      if (!inst) return res.status(404).json({ error: 'not found' });
      chatManager.addUserMessage(inst.owner, inst.name, id, text);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  router.get('/proposals/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const proposals = institutionStore.getProposals(id);
      res.json({ proposals });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  router.get('/proposals/history/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const history = institutionStore.getProposalHistory(id);
      res.json({ history });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  router.post('/proposals/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { index, approve, email } = req.body;

      const inst = institutionStore.getInstitution(id);
      if (!inst || !inst.proposals || !inst.proposals[index]) {
        return res.status(404).json({ error: 'not found' });
      }

      const prop = inst.proposals[index];
      prop.votes = prop.votes || {};
      prop.votes[email] = approve;
      institutionStore.updateProposal(id, index, { votes: prop.votes });

      const total = inst.totalShares || 1;
      let approveShares = 0;
      let denyShares = 0;
      for (const [em, val] of Object.entries(prop.votes)) {
        const s = inst.shares && inst.shares[em] ? inst.shares[em] : 0;
        if (val) approveShares += s; else denyShares += s;
      }

      let status = 'pending';
      let result = null;
      let updatedMoney = null;
      if (approveShares / total > 0.5 || denyShares / total > 0.5) {
        if (approveShares > denyShares) {
          if (prop.cost) {
            const users = userStore.loadUsers();
            const user = users[inst.owner];
            if (user) {
              user.money = Math.max((user.money || 0) - prop.cost, 0);
              updatedMoney = user.money;
              userStore.saveUsers(users);
              if (typeof sendToEmail === 'function') {
                sendToEmail(inst.owner, { type: 'money', money: user.money });
              }
            }
          }
          const [x, , z] = inst.position || [0, 0, 0];
          const ecosystem = engine.getProperties(x, z);
          result = await judge.judgeProposal(prop, ecosystem);
          status = result && result.feasible ? 'approved' : 'rejected';
          if (result && result.feasible && result.gains) {
            const extra = institutionStore.addGains(id, result.gains);
            broadcast({ type: 'updateInstitution', id, extraEffects: extra, gains: result.gains });
          }
          if (result && result.feasible) {
            const scaff = SCAFF_MODELS[Math.floor(Math.random() * SCAFF_MODELS.length)];
            const existing = Array.isArray(inst.constructions) ? inst.constructions : [];
            function getOffset() {
              const angle = Math.random() * Math.PI * 2;
              const distance = 8 + Math.random() * 4;
              return [Math.cos(angle) * distance, 0, Math.sin(angle) * distance];
            }
            let offset = getOffset();
            for (let a = 0; a < 20; a++) {
              const [ox, , oz] = offset;
              const ok = !existing.some(c => Array.isArray(c.offset) && Math.hypot((c.offset[0] || 0) - ox, (c.offset[2] || 0) - oz) < 4);
              if (ok) break;
              offset = getOffset();
            }
            const construction = { status: 'scaffolding', url: scaff.url, scale: scaff.scale, offset };
            const idx = institutionStore.addConstruction(id, construction);
            broadcast({ type: 'updateInstitution', id, construction, index: idx });

            const prompt = `${prop.project || prop.title || ''} ${prop.description || ''}`.trim();
            const file = path.join(MODEL_DIR, `inst_${id}_${Date.now()}.glb`);
            meshy.generateModel(prompt, file)
              .then(fp => {
                const rel = path.relative(path.join(__dirname, '..'), fp).replace(/\\/g, '/');
                const done = { status: 'completed', url: rel, scale: scaff.scale, offset };
                institutionStore.updateConstruction(id, idx, done);
                broadcast({ type: 'updateInstitution', id, construction: done, index: idx });
              })
              .catch(err => console.error('Meshy generation failed:', err));
          }
        } else {
          status = 'denied';
        }

        institutionStore.updateProposal(id, index, { status, judgeResult: result, votes: prop.votes });
        const note = result && !result.feasible ? result.gains : null;
        chatManager.resolveProposal(id, index, status, note);
      }

      res.json({
        votes: { approve: approveShares, deny: denyShares, total },
        status,
        result,
        money: updatedMoney
      });
    } catch (err) {
      res.status(500).json({ error: 'failed' });
    }
  });

  return router;
};