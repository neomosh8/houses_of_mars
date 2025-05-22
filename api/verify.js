const express = require('express');

module.exports = function(client, verifySid, userStore) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'email and code required' });
    }
    try {
      const check = await client.verify.v2
        .services(verifySid)
        .verificationChecks.create({ to: email, code });

      if (check.status !== 'approved') {
        return res.status(400).json({ error: 'invalid code' });
      }

      const users = userStore.loadUsers();
      if (!users[email]) {
        users[email] = {
          email,
          position: [70, 100, -50],
          money: 1000,
          health: 1000,
          hydration: 1000,
          oxygen: 1000
        };
      }
      userStore.saveUsers(users);
      res.json({ user: users[email] });
    } catch (e) {
      console.error('verify error', e);
      res.status(500).json({ error: 'verification failed' });
    }
  });

  return router;
};
