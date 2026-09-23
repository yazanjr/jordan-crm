// utils/notifications.js
// ONE place that decides who gets notified. Every event has:
//   - "involved people": the specific users the action is about (the deal's
//     salesman, the assigned designer, the reviewer, the requester …) — the
//     route passes their ids;
//   - roles: every active user in these roles is added on top.
// Admins edit both per event in Settings → Notifications (stored as the
// `notification_rules` setting). The person who performed the action is never
// notified about it. Delivery is in-app (bell + live socket push).
const db = require('../database/db');

const EVENTS = [
  // Deals
  { type: 'new_opportunity',     group: 'Deals',   label: 'New deal created',                      involved: '',                          roles: ['sales_manager'] },
  { type: 'stage_change',        group: 'Deals',   label: 'Deal moved to another stage',           involved: 'The deal\'s salesman',      roles: [] },
  { type: 'assignment',          group: 'Deals',   label: 'Salesman / designer assigned to a deal', involved: 'The person assigned',      roles: [] },
  { type: 'opportunity_closed',  group: 'Deals',   label: 'Deal closed (won / lost)',              involved: 'Salesman + designer',       roles: ['sales_manager', 'admin'] },
  // Design requests
  { type: 'design_request_created',       group: 'Design', label: 'Design requested by sales',        involved: '',                                roles: ['design_manager', 'sales_manager'] },
  { type: 'design_assigned',              group: 'Design', label: 'Designer assigned to a request',   involved: 'The designer',                    roles: [] },
  { type: 'design_review_assigned',       group: 'Design', label: 'Reviewer assigned to a request',   involved: 'The reviewer',                    roles: [] },
  { type: 'design_started',               group: 'Design', label: 'Designer started work',            involved: '',                                roles: ['design_manager'] },
  { type: 'design_submitted',             group: 'Design', label: 'Design submitted for review',      involved: 'The assigned reviewer',           roles: ['design_manager'] },
  { type: 'design_revision_requested',    group: 'Design', label: 'Revision requested',               involved: 'The designer',                    roles: [] },
  { type: 'design_approved',              group: 'Design', label: 'Design approved',                  involved: 'The designer',                    roles: [] },
  { type: 'design_released',              group: 'Design', label: 'Quotation released to sales',      involved: 'The deal\'s salesman',            roles: ['design_manager'] },
  { type: 'design_returned',              group: 'Design', label: 'Request returned to sales',        involved: 'The deal\'s salesman',            roles: [] },
  { type: 'design_modification_requested', group: 'Design', label: 'Modification requested',          involved: '',                                roles: ['design_manager', 'sales_manager'] },
  { type: 'design_comment',               group: 'Design', label: 'Comment posted on a request',      involved: 'Salesman + designer of the request', roles: ['design_manager'] },
  // Quotations & discounts
  { type: 'quotation_submitted', group: 'Quotations', label: 'Quotation submitted for review',       involved: '',                                roles: ['design_manager'] },
  { type: 'sales_revision',      group: 'Quotations', label: 'Sales revised the quotation discount', involved: 'Designer + reviewer',             roles: ['design_manager', 'product_manager'] },
  { type: 'discount_edited',     group: 'Quotations', label: 'Discount edited on a quotation',       involved: 'Designer + reviewer',             roles: ['design_manager'] },
  { type: 'discount_request',    group: 'Quotations', label: 'Discount above the limit requested',   involved: '',                                roles: ['sales_manager', 'admin'] },
  { type: 'discount_response',   group: 'Quotations', label: 'Discount request approved / rejected', involved: 'The person who asked',            roles: [] },
];
const DEFAULTS = Object.fromEntries(EVENTS.map(e => [e.type, { involved: !!e.involved, roles: e.roles }]));

function getRules() {
  let saved = {};
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'notification_rules'`).get();
    saved = row && row.value ? JSON.parse(row.value) : {};
  } catch { saved = {}; }
  const out = {};
  EVENTS.forEach((e) => {
    const s = saved[e.type] || {};
    out[e.type] = {
      involved: e.involved ? (s.involved != null ? !!s.involved : DEFAULTS[e.type].involved) : false,
      roles: Array.isArray(s.roles) ? s.roles : DEFAULTS[e.type].roles,
    };
  });
  return out;
}

function saveRules(rules, userId) {
  const clean = {};
  EVENTS.forEach((e) => {
    const s = (rules || {})[e.type] || {};
    clean[e.type] = { involved: !!s.involved, roles: Array.isArray(s.roles) ? s.roles.map(String) : [] };
  });
  db.prepare(`INSERT INTO settings (key, value, type, description) VALUES ('notification_rules', ?, 'json', 'Who is notified for each event')
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = ?, updated_at = datetime('now')`)
    .run(JSON.stringify(clean), userId || null);
  return getRules();
}

function usersWithRoles(roleNames) {
  if (!roleNames || !roleNames.length) return [];
  const q = roleNames.map(() => '?').join(',');
  return db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN (${q}) AND u.is_active = 1`).all(...roleNames).map(u => u.id);
}

// Resolve + store + push. `involvedIds` = the specific people the event is about.
function send(io, actorId, involvedIds, type, message, ref = {}) {
  const rule = getRules()[type] || { involved: true, roles: [] };
  const ids = new Set();
  if (rule.involved || !DEFAULTS[type]) (involvedIds || []).forEach(id => id && ids.add(+id));
  usersWithRoles(rule.roles).forEach(id => ids.add(+id));
  if (actorId) ids.delete(+actorId);
  if (!ids.size) return 0;
  const insert = db.prepare(`INSERT INTO notifications (user_id, type, message, opp_id) VALUES (?, ?, ?, ?)`);
  ids.forEach((uid) => {
    insert.run(uid, type, message, ref.oppId || null);
    if (io) io.to(`user:${uid}`).emit('notification', { type, message, requestId: ref.requestId, oppId: ref.oppId });
  });
  return ids.size;
}

module.exports = { EVENTS, DEFAULTS, getRules, saveRules, send };
