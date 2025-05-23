const express = require('express');
const chat = require('../workforceChatManager');

const INITIAL_PROMPTS = {
  WatOx: 'your water oxygen extraction and manufacturing expert, how do we can increase production'
};

module.exports = function() {
  const router = express.Router();

  router.post('/:kind', async (req, res) => {
    const { email } = req.body;
    const { kind } = req.params;
    if (!email) return res.status(400).json({ error: 'email required' });
    const prompt = INITIAL_PROMPTS[kind] || 'Discuss work.';
    try {
      const messages = await chat.runChat(email, kind, prompt, 1);
      res.json({ messages });
    } catch (err) {
      console.error('chat error', err);
      res.status(500).json({ error: 'chat failed' });
    }
  });

  router.get('/:kind', (req, res) => {
    const { email } = req.query;
    const { kind } = req.params;
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      const messages = chat.getChat(email, kind);
      res.json({ messages });
    } catch (err) {
      console.error('chat get error', err);
      res.status(500).json({ error: 'get failed' });
    }
  });

  return router;
};
