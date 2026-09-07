// Consistent, hot backup of the CRM SQLite database.
//
// Uses SQLite's `VACUUM INTO`, which produces a clean, fully-consistent copy of
// the database even while the app is running and people are using the CRM — it
// never catches a half-written transaction (unlike a plain file copy).
//
// Writes timestamped copies into a `backups/` folder next to crm.db and keeps
// the most recent BACKUP_KEEP of them (default 30). On the NAS the DB lives at
// /app/data/crm.db (mounted from /volume1/Projects/crm-data), so the backups
// land in /volume1/Projects/crm-data/backups — visible in File Station and
// swept up by Hyper Backup.
//
// Run:  node scripts/backup-db.js         (or:  npm run backup)
// On the NAS, on a schedule:
//   cd /volume1/Projects/jordan-crm && docker-compose exec -T img-crm npm run backup

const { DatabaseSync } = require('node:sqlite');
const fs   = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'crm.db');
const KEEP    = Math.max(1, parseInt(process.env.BACKUP_KEEP || '30', 10) || 30);
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(path.resolve(DB_PATH)), 'backups');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`✗ Database not found at ${DB_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const outFile = path.join(BACKUP_DIR, `crm-${stamp()}.db`);
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    // Single quotes in the path must be escaped for the SQL string literal.
    db.exec(`VACUUM INTO '${outFile.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  // Verify the copy opens and has data before we trust it.
  const check = new DatabaseSync(outFile, { readOnly: true });
  const deals = check.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c;
  check.close();
  const sizeKB = Math.round(fs.statSync(outFile).size / 1024);
  console.log(`✅  Backup written: ${outFile}  (${sizeKB} KB, ${deals} deals)`);

  // Rotate — keep the newest KEEP files, delete the rest.
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^crm-.*\.db$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const remove = backups.slice(KEEP);
  for (const { f } of remove) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
  }
  if (remove.length) console.log(`    Rotated out ${remove.length} old backup(s); keeping ${KEEP}.`);
}

main();
