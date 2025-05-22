const express = require('express');

module.exports = function(userStore) {
  const router = express.Router();

  router.get('/:email', (req, res) => {
    const users = userStore.loadUsers();
    const user = users[req.params.email];
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({
      position: user.position,
      money: user.money,
      health: user.health || 1000,
      hydration: user.hydration || 100,
      oxygen: user.oxygen || 100
    });
  });

  router.post('/:email', (req, res) => {
    const users = userStore.loadUsers();
    const email = req.params.email;
    if (!users[email]) {
      users[email] = {
        email,
        position: req.body.position || [0, 0, 0],
        money: req.body.money || 1000,
        health: 100,
        hydration: 100,
        oxygen: 100
      };
    } else {
      if (req.body.position) users[email].position = req.body.position;
      if (typeof req.body.money === 'number') users[email].money = req.body.money;
      if (typeof req.body.health === 'number') users[email].health = req.body.health;
      if (typeof req.body.hydration === 'number') users[email].hydration = req.body.hydration;
      if (typeof req.body.oxygen === 'number') users[email].oxygen = req.body.oxygen;
    }
    userStore.saveUsers(users);
    res.json({ ok: true });
  });

  return router;
};
