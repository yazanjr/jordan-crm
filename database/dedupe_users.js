// Merge duplicate user rows. Pairs are detected by matching first-name on
// active rows; the canonical winner is the one with the higher-rights role.
// Loser's FK references get reassigned to the winner, then the loser is
// soft-deleted (is_active=0) so any stale id reference still resolves.
//
// Idempotent: safe to re-run; no-op when no dups remain.
//
//   node database/dedupe_users.js

require('dotenv').config();
const db = require('./db');

const ROLE_RANK = {
  admin: 100, sales_manager: 80, design_manager: 80, product_manager: 80,
  designer: 60, salesman: 50,
};

// Pairs to merge: { keepName, mergeName } — explicit list so we don't merge
// unrelated people with the same first name by mistake.
const EXPLICIT_PAIRS = [
  { keep: 'Sally Haddad', drop: 'Sally' },
  // Hilal Miqdadi / Omar Al Ajlouni are the canonical commercial-import rows.
  // The seed users (Hilal / Omar) are stubs from the early demo — merge.
  { keep: 'Hilal Miqdadi',   drop: 'Hilal' },
  { keep: 'Omar Al Ajlouni', drop: 'Omar' },
];

function findUser(name) {
  return db.prepare(`SELECT u.id, u.name, u.email, u.is_active, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.name = ?`).get(name);
}

function reassign(loserId, winnerId) {
  const ops = [
    `UPDATE opportunities SET salesman_id = ? WHERE salesman_id = ?`,
    `UPDATE opportunities SET created_by = ? WHERE created_by = ?`,
    `UPDATE design_requests SET assigned_designer_id = ? WHERE assigned_designer_id = ?`,
    `UPDATE design_requests SET assigned_reviewer_id = ? WHERE assigned_reviewer_id = ?`,
    `UPDATE design_requests SET assigned_by = ? WHERE assigned_by = ?`,
    `UPDATE design_requests SET requested_by = ? WHERE requested_by = ?`,
    `UPDATE design_request_comments SET author_id = ? WHERE author_id = ?`,
    `UPDATE design_request_comments SET deleted_by = ? WHERE deleted_by = ?`,
    `UPDATE design_stage_history SET changed_by = ? WHERE changed_by = ?`,
    `UPDATE stage_history SET changed_by = ? WHERE changed_by = ?`,
    `UPDATE quotation_versions SET created_by = ? WHERE created_by = ?`,
    `UPDATE quotation_versions SET reviewed_by = ? WHERE reviewed_by = ?`,
    `UPDATE notifications SET user_id = ? WHERE user_id = ?`,
    `UPDATE pricelist_versions SET uploaded_by = ? WHERE uploaded_by = ?`,
  ];
  for (const sql of ops) {
    try { db.prepare(sql).run(winnerId, loserId); } catch (e) { /* table may not exist on this DB */ }
  }
}

let merges = 0;
for (const pair of EXPLICIT_PAIRS) {
  const a = findUser(pair.keep);
  const b = findUser(pair.drop);
  if (!a || !b) { console.log(`Pair (${pair.keep}, ${pair.drop}) — at least one missing, skipping`); continue; }
  if (a.id === b.id) continue;
  // Choose winner by role rank; tiebreak by older id.
  const rankA = ROLE_RANK[a.role] || 0;
  const rankB = ROLE_RANK[b.role] || 0;
  let winner, loser;
  if (rankA !== rankB) { winner = rankA > rankB ? a : b; loser = winner === a ? b : a; }
  else { winner = a.id < b.id ? a : b; loser = winner === a ? b : a; }

  console.log(`Merging "${loser.name}" (id ${loser.id}, ${loser.role}) → "${winner.name}" (id ${winner.id}, ${winner.role})`);
  db.exec('BEGIN');
  try {
    reassign(loser.id, winner.id);
    db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(loser.id);
    db.exec('COMMIT');
    merges++;
  } catch (e) {
    db.exec('ROLLBACK');
    console.error(`  Failed: ${e.message}`);
  }
}

console.log(`\n✅  Dedupe done. ${merges} pair(s) merged.`);

// Also report any remaining users with overlapping first names so the operator
// can decide whether to add them to EXPLICIT_PAIRS.
const dupFirsts = db.prepare(`
  SELECT lower(substr(name, 1, instr(name||' ', ' ') - 1)) AS fn, COUNT(*) AS n
  FROM users WHERE is_active = 1 GROUP BY fn HAVING n > 1
`).all();
if (dupFirsts.length) {
  console.log('\nHeads-up — other users share a first name (not auto-merged):');
  dupFirsts.forEach(d => {
    const rows = db.prepare(`SELECT id, name, email FROM users WHERE is_active=1 AND lower(name) LIKE ?`).all(d.fn + '%');
    console.log(`  ${d.fn}:`, rows.map(r => `${r.name} (id ${r.id})`).join(' · '));
  });
}
