const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'institutions.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { nextId: 1, list: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getInstitutions() {
  const data = loadData();
  return data.list;
}

function addInstitution(inst) {
  const data = loadData();
  inst.id = data.nextId++;
  data.list.push(inst);
  saveData(data);
  return inst.id;
}

module.exports = { getInstitutions, addInstitution };
