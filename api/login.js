const express = require('express');

module.exports = function(client, verifySid) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      await client.verify.v2
        .services(verifySid)
        .verifications.create({ channel: 'email', to: email });
      res.json({ status: 'pending' });
    } catch (e) {
      console.error('verify start error', e);
      res.status(500).json({ error: 'failed to start verification' });
    }
  });

  return router;
};
