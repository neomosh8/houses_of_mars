require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
// Set to true to skip AI image generation and use placeholder images
const USE_PLACEHOLDER_IMAGES = false;
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
module.exports = function(institutionStore, userStore, engine, broadcast) {
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

  async function generateWorkerWithAI(institutionName) {
    if (!openai) {
      return randomWorker();
    }

    try {
      // Generate worker profile with text using correct API
      const profileResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{
          role: "system",
          content: "You are an assistant that generates detailed worker profiles for a Mars colonization game. Always respond with valid JSON only, no additional text."
        }, {
          role: "user",
          content: `Generate a detailed worker profile for a Mars colonization game. The worker will be employed at a ${institutionName} facility.

          Please provide:
          1. A realistic full name
          2. A specific job role relevant to Mars colonization
          3. A compelling 2-sentence backstory
          4. A professional 2-sentence resume/skills summary
          5. A fair wage (10-50 credits per day)
          6. The resources they consume each day (oxygen, hydration, or health).

          Format the response as JSON with these exact keys: name, role, backstory, resume, wage, effects (where effects is an object with oxygen, hydration, health as numbers between -1 and 0).`
        }],
        temperature: 0.8,
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
            if (aiData.wage && typeof aiData.wage === 'number') workerData.wage = Math.max(10, Math.min(50, aiData.wage));
            if (aiData.effects && typeof aiData.effects === 'object') {
              workerData.effects = {
                oxygen: Math.min(0, Math.max(-1, aiData.effects.oxygen || 0)),
                hydration: Math.min(0, Math.max(-1, aiData.effects.hydration || 0)),
                health: Math.min(0, Math.max(-1, aiData.effects.health || 0))
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

  async function generateWorkers(num, institutionName = 'Mars Colony') {
    const workers = [];

    // Use Promise.all to generate workers in parallel for better performance
    const workerPromises = [];
    for (let i = 0; i < num; i++) {
      if (openai) {
        workerPromises.push(generateWorkerWithAI(institutionName));
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
      const institution = institutionStore.getInstitution(institutionId);

      const institutionName = institution ? institution.name : 'Mars Colony';
      const num = Math.floor(Math.random() * 5) + 1; // 1-5 workers

      const workers = await generateWorkers(num, institutionName);

      res.json({ workers });
    } catch {
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
      chatManager.addWorker(inst.owner, inst.name, worker);

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

  router.get('/chat/:email/:name', (req, res) => {
    try {
      const { email, name } = req.params;
      const chat = chatManager.getChat(email, name);
      res.json({ messages: chat.messages });
    } catch {
      res.status(500).json({ error: 'Failed to get chat' });
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

  router.post('/proposals/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { index, approve } = req.body;
      const status = approve ? 'approved' : 'denied';
      const proposal = institutionStore.updateProposal(id, index, { status });
      chatManager.resolveProposal(id, index, status);

      let result = null;
      if (approve) {
        const inst = institutionStore.getInstitution(id);
        if (inst) {
          const [x, , z] = inst.position || [0, 0, 0];
          const ecosystem = engine.getProperties(x, z);
          result = await judge.judgeProposal(proposal, ecosystem);
          if (result && result.feasible && result.gains) {
            const extra = institutionStore.addGains(id, result.gains);
            broadcast({ type: 'updateInstitution', id, extraEffects: extra, gains: result.gains });
          }
        }
      }

      res.json({ proposal, result });
    } catch (err) {
      res.status(500).json({ error: 'failed' });
    }
  });

  return router;
};