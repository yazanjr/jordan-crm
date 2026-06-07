require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path       = require('path');
const fs         = require('fs');
const applySchema = require('./schema');

const DB_PATH = process.env.DB_PATH || './data/crm.db';
const dir     = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(path.resolve(DB_PATH));
db.exec('PRAGMA journal_mode = DELETE');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA synchronous = NORMAL');

applySchema(db);

console.log(`✅  SQLite ready: ${path.resolve(DB_PATH)}`);

module.exports = db;
