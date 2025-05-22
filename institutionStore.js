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

function getInstitution(id) {
  const data = loadData();
  return data.list.find(i => i.id === id);
}

function addInstitution(inst) {
  const data = loadData();
  inst.id = data.nextId++;
  if (!inst.workforce) inst.workforce = [];
  data.list.push(inst);
  saveData(data);
  return inst.id;
}

function updateInstitution(id, updates) {
  const data = loadData();
  const inst = data.list.find(i => i.id === id);
  if (!inst) return null;
  Object.assign(inst, updates);
  saveData(data);
  return inst;
}

module.exports = {
  getInstitutions,
  addInstitution,
  updateInstitution,
  getInstitution,
};
