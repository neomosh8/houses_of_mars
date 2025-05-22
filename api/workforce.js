require('dotenv').config();

const express = require('express');
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
} catch (error) {
  console.log('OpenAI not available:', error.message);
}

module.exports = function(institutionStore, userStore) {
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

    return {
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
  }

  async function generateWorkerWithAI(institutionName) {
    if (!openai) {
      return randomWorker();
    }

    try {
      // Generate worker profile with text
      const profileResponse = await openai.responses.create({
        model: "gpt-4o-mini",
        input: `Generate a detailed worker profile for a Mars colonization game. The worker will be employed at a ${institutionName} facility.

        Please provide:
        1. A realistic full name
        2. A specific job role relevant to Mars colonization
        3. A compelling 2-sentence backstory
        4. A professional 2-sentence resume/skills summary
        5. A fair wage (10-50 credits per day)
        6. The resources they consume each day (oxygen, hydration, or health).

        Format the response as JSON with these exact keys: name, role, backstory, resume, wage, effects (where effects is an object with oxygen, hydration, health as numbers between -1 and 0).`
      });

      let workerData = randomWorker(); // fallback

      // Parse the AI response
      if (profileResponse.output && profileResponse.output.length > 0) {
        const textContent = profileResponse.output
          .filter(output => output.type === "message")
          .map(output => output.content)
          .flat()
          .filter(content => content.type === "text")
          .map(content => content.text)
          .join("");

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
          } catch (parseError) {
            console.log('Failed to parse AI response, using fallback');
          }
        }
      }

      if (!USE_PLACEHOLDER_IMAGES) {
        try {
          const imageResponse = await openai.responses.create({
            model: "gpt-4o-mini",
            input: `Generate a professional portrait image of a Mars colonist worker named ${workerData.name}, who works as a ${workerData.role}.

          Style: Realistic digital art portrait, professional headshot style
          Setting: Futuristic Mars colony environment
          Appearance: Wearing appropriate work uniform/suit for Mars environment
          Mood: Confident and professional
          Quality: High detail, good lighting

          The person should look competent and ready for Mars colonization work.`,
            tools: [{type: "image_generation"}]
          });

          const imageData = imageResponse.output
            .filter(output => output.type === "image_generation_call")
            .map(output => output.result);

          if (imageData.length > 0) {
            workerData.image = `data:image/png;base64,${imageData[0]}`;
            console.log(`Generated AI image for worker: ${workerData.name}`);
          }
        } catch (imageError) {
          console.log('Failed to generate worker image:', imageError.message);
        }
      } else {
        workerData.image = 'https://placehold.co/150x200?text=Worker';
      }

      return workerData;

    } catch (error) {
      console.log('AI worker generation failed:', error.message);
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
    } catch (error) {
      console.log('Batch worker generation failed, using fallbacks');
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

      console.log(`Generating ${num} workers for ${institutionName}...`);
      const workers = await generateWorkers(num, institutionName);

      res.json({ workers });
    } catch (error) {
      console.error('Worker generation error:', error);
      res.status(500).json({ error: 'Failed to generate workers' });
    }
  });

  router.post('/hire/:id', (req, res) => {
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

      // Add the worker
      inst.workforce.push(worker);

      // Update the institution
      institutionStore.updateInstitution(id, { workforce: inst.workforce });

      // Update user data if needed
      const users = userStore.loadUsers();
      const user = users[inst.owner];
      if (user) {
        userStore.saveUsers(users);
      }

      console.log(`Hired worker ${worker.name} at ${inst.name}`);
      res.json({ ok: true });
    } catch (error) {
      console.error('Worker hiring error:', error);
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
    } catch (error) {
      console.error('Get workforce error:', error);
      res.status(500).json({ error: 'Failed to get workforce' });
    }
  });

  return router;
};