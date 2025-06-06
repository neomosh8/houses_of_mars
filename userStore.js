const path = require('path');
const FileStore = require('./fileStore');

const USERS_FILE = path.join(__dirname, 'users.json');
const store = new FileStore(USERS_FILE, {});

function loadUsers() {
  return { ...store.get() };
}

function saveUsers(users) {
  store.update(users);
}

module.exports = { loadUsers, saveUsers };
