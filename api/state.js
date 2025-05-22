const express = require('express');

module.exports = function(userStore) {
  const router = express.Router();

  router.get('/:email', (req, res) => {
    const users = userStore.loadUsers();
    const user = users[req.params.email];
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({ position: user.position });
  });

  router.post('/:email', (req, res) => {
    const users = userStore.loadUsers();
    const email = req.params.email;
    if (!users[email]) {
      users[email] = { email, position: req.body.position || [0, 0, 0] };
    } else {
      users[email].position = req.body.position;
    }
    userStore.saveUsers(users);
    res.json({ ok: true });
  });

  return router;
};
