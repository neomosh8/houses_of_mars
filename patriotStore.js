const path = require('path');
const FileStore = require('./fileStore');

const FILE = path.join(__dirname, 'patriots.json');
const store = new FileStore(FILE, {});

function getPatriots(id) {
  const data = store.get();
  return data[id] || [];
}

function addPatriot(id, patriot) {
  let idx = null;
  store.update(data => {
    if (!data[id]) data[id] = [];
    data[id].push(patriot);
    idx = data[id].length - 1;
    return data;
  });
  return idx;
}

function removePatriots(id) {
  store.update(data => {
    if (data[id]) delete data[id];
    return data;
  });
}

module.exports = { getPatriots, addPatriot, removePatriots };
