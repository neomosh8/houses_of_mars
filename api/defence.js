const express = require('express');
const path = require('path');
const meshy = require('../meshy');

module.exports = function(store, broadcast) {
  const router = express.Router();
  // Default scaffolding model for new weapons. A scale of 6 keeps
  // generated weapons at a reasonable size if no scale is provided.
  const SCAFF = { url: 'scof1.glb', scale: 6 };

  router.get('/proposals/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const proposals = store.getProposals(id);
      res.json({ proposals });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  router.post('/proposals/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { index, approve } = req.body;
      const props = store.getProposals(id);
      const prop = props[index];
      if (!prop) return res.status(404).json({ error: 'not found' });

      let status = 'denied';
      if (approve) {
        const p = prop.parameters || {};
        const weight = p.weight || 1;
        const force = p.force || 0;
        const fuel = p.fuel || 0;
        const movement = weight > 0 ? (force / weight) * fuel : 0;
        function getOffset() {
          const angle = Math.random() * Math.PI * 2;
          const distance = 8 + Math.random() * 4;
          return [Math.cos(angle) * distance, 0, Math.sin(angle) * distance];
        }
        const offset = getOffset();
        const weapon = {
          name: prop.name,
          model: SCAFF.url,
          movement,
          status: 'scaffolding',
          scale: SCAFF.scale,
          offset,
        };
        const wIdx = store.addWeapon(id, weapon);
        broadcast({ type: 'updateWeapon', id, weapon, index: wIdx });

        const prompt = prop.look || prop.name;
        const fileRel = path.join('generated_models', `weapon_${id}_${Date.now()}.glb`);
        const file = path.join(__dirname, '..', fileRel);
        meshy.generateModel(prompt, file)
          .then(() => {
            const final = {
              ...weapon,
              model: fileRel.replace(/\\/g, '/'),
              status: 'completed',
              // Ensure all generated weapons include a scale property
              scale: weapon.scale || 6,
            };
            store.updateWeapon(id, wIdx, final);
            broadcast({ type: 'updateWeapon', id, weapon: final, index: wIdx });
          })
          .catch(err => console.error('Meshy error:', err));
        status = 'approved';
      }

      store.updateProposal(id, index, { status });
      res.json({ status });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  router.post('/proposals/add/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const proposal = req.body.proposal;
      if (!proposal) return res.status(400).json({ error: 'proposal required' });
      const idx = store.addProposal(id, proposal);
      res.json({ index: idx });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  router.get('/weapons/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const weapons = store.getWeapons(id);
      res.json({ weapons });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  return router;
};
