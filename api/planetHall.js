const express = require('express');
const planetHallStore = require('../planetHallStore');
const hallChatManager = require('../hallChatManager');
const referendumManager = require('../referendumManager');
const referendumService = require('../referendumService');
const userStore = require('../userStore');

module.exports = function(broadcast) {
  const router = express.Router();

  router.get('/data', (req, res) => {
    res.json(planetHallStore.getHallData());
  });

  router.get('/board', (req, res) => {
    const hall = planetHallStore.getHallData();
    res.json({ boardMembers: hall.boardMembers });
  });

  router.get('/chat', (req, res) => {
    const messages = hallChatManager.getMessages();
    res.json({ messages });
  });

  router.post('/chat', (req, res) => {
    const { email, text } = req.body;
    if (!email || !text) return res.status(400).json({ error: 'email and text required' });
    const users = userStore.loadUsers();
    const user = users[email];
    if (!user) return res.status(404).json({ error: 'user not found' });
    const message = hallChatManager.addMessage(email, email, text);
    broadcast({ type: 'hallChat', message });
    res.json({ ok: true });
  });

  router.get('/policies', (req, res) => {
    const policies = planetHallStore.getPolicies();
    res.json({ policies });
  });

  router.post('/policies', (req, res) => {
    const { email, title, description } = req.body;
    if (!planetHallStore.isBoardMember(email)) {
      return res.status(403).json({ error: 'not a board member' });
    }
    const policy = planetHallStore.createPolicy(title, description, email);
    broadcast({ type: 'newPolicy', policy });
    res.json({ policy });
  });

  router.post('/policies/:id/vote', (req, res) => {
    const id = Number(req.params.id);
    const { email, vote } = req.body;
    const policy = planetHallStore.votePolicy(id, email, vote);
    if (!policy) return res.status(400).json({ error: 'invalid vote' });
    broadcast({ type: 'policyVote', policy });
    res.json({ policy });
  });

  router.get('/referendum', (req, res) => {
    res.json({
      active: referendumManager.getActiveReferendum(),
      history: referendumManager.getReferendumHistory()
    });
  });

  router.post('/referendum', async (req, res) => {
    const { type, data, email } = req.body;
    try {
      const ref = await referendumService.runReferendum(type, data, email, broadcast);
      res.json({ referendum: ref });
    } catch (err) {
      res.status(500).json({ error: 'failed' });
    }
  });

  return router;
};
