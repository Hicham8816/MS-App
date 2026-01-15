const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'db.json');

function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

// Simple atomic-ish write (write temp then rename)
function writeDB(db) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmp, DB_PATH);
}

function nextId(db, key) {
  db._ids = db._ids || {};
  db._ids[key] = (db._ids[key] || 0) + 1;
  return db._ids[key];
}

module.exports = { readDB, writeDB, nextId, DB_PATH };
