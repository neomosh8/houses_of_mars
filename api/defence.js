const express = require('express');
const path = require('path');
const meshy = require('../meshy');
const chatManager = require('../workforceChatManager');

module.exports = function(store, institutionStore, broadcast) {
  const router = express.Router();
  // Default scaffolding model for new weapons. A scale of 6 keeps
  // generated weapons at a reasonable size if no scale is provided.
  const SCAFF = { url: 'defscof.glb', scale: 2 };

  router.get('/proposals/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      console.log('[DEFENCE API] GET proposals', { id });
      const proposals = store.getProposals(id);
      res.json({ proposals });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  router.post('/proposals/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { index, approve, email } = req.body;
      console.log('[DEFENCE API] POST proposals', { id, index, approve });
      const props = store.getProposals(id);
      const prop = props[index];
      if (!prop) return res.status(404).json({ error: 'not found' });

      prop.votes = prop.votes || {};
      prop.votes[email] = approve;
      store.updateProposal(id, index, { votes: prop.votes });

      const inst = institutionStore.getInstitution(id);
      const total = inst ? inst.totalShares || 1 : 1;
      let approveShares = 0;
      let denyShares = 0;
      if (inst) {
        for (const [em, val] of Object.entries(prop.votes)) {
          const s = inst.shares && inst.shares[em] ? inst.shares[em] : 0;
          if (val) approveShares += s; else denyShares += s;
        }
      }

      let status = 'pending';
      if (approveShares / total > 0.5 || denyShares / total > 0.5) {
        if (approveShares > denyShares) {
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
            category: prop.category,
            technology: prop.technology,
            parameters: prop.parameters,
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
                scale: weapon.scale || 6,
                category: prop.category,
                technology: prop.technology,
                parameters: prop.parameters,
              };
              store.updateWeapon(id, wIdx, final);
              broadcast({ type: 'updateWeapon', id, weapon: final, index: wIdx });
            })
            .catch(err => console.error('Meshy error:', err));
          status = 'approved';
        } else {
          status = 'denied';
        }

        store.updateProposal(id, index, { status, votes: prop.votes });
        chatManager.resolveProposal(id, index, status);
      }

      res.json({ status, votes: { approve: approveShares, deny: denyShares, total } });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  router.post('/proposals/add/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const proposal = req.body.proposal;
      if (!proposal) return res.status(400).json({ error: 'proposal required' });
      console.log('[DEFENCE API] ADD proposal', { id, proposal });
      const idx = store.addProposal(id, proposal);
      res.json({ index: idx });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  router.get('/weapons/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      console.log('[DEFENCE API] GET weapons', { id });
      const weapons = store.getWeapons(id);
      res.json({ weapons });
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  });

  return router;
};
