module.exports = function applySchema(db) {

  // ── Core ──────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT NOT NULL UNIQUE,
      description TEXT,
      category    TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id       INTEGER NOT NULL REFERENCES roles(id),
      is_active     INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT NOT NULL UNIQUE,
      value       TEXT,
      type        TEXT DEFAULT 'text',
      description TEXT,
      updated_by  INTEGER REFERENCES users(id),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Contacts & Orgs ───────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      address    TEXT,
      phone      TEXT,
      email      TEXT,
      type       TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      phones          TEXT DEFAULT '[]',
      emails          TEXT DEFAULT '[]',
      organization_id INTEGER REFERENCES organizations(id),
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Pipeline ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS labels (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      color     TEXT NOT NULL DEFAULT '#6B7280',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS lost_reasons (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      label     TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    -- Managed list of project locations / areas (Amman neighbourhoods). Backs the
    -- opportunity "Project Location" (district) picker + filter. Grows when a
    -- salesman types a new area in the New Deal form (search-or-create).
    CREATE TABLE IF NOT EXISTS areas (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1
    );

    -- ── Project (diagnostic layer, H1 market access) ────────────────────────
    -- A piece of construction in the MARKET that needs HVAC. Exists whether or
    -- not we pursue it. One Project → zero..many Deals (opportunities.project_id).
    -- Deliberately distinct from opportunities (our pursuit) and from
    -- design_requests.project_type (a design-work-type enum, unrelated).
    -- Note the event-vs-awareness date pairs: what happened vs when we learned it.
    CREATE TABLE IF NOT EXISTS projects (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      name                      TEXT NOT NULL,
      client_contact_id         INTEGER REFERENCES contacts(id),
      client_free_text          TEXT,
      mep_consultant_contact_id INTEGER REFERENCES contacts(id),
      awarding_party            TEXT,
      estimated_hvac_value      REAL,
      awareness_stage           TEXT CHECK (awareness_stage IS NULL OR awareness_stage IN
                                  ('unaware','aware-late','aware-early','involved-in-spec')),
      source                    TEXT CHECK (source IS NULL OR source IN
                                  ('consultant relationship','contractor relationship','public tender','referral','walk-in','unknown')),
      outcome                   TEXT DEFAULT 'pending' CHECK (outcome IS NULL OR outcome IN
                                  ('pending','won by us','lost to competitor','cancelled','unknown')),
      winning_competitor        TEXT,
      pursued                   INTEGER DEFAULT 1,
      not_pursued_reason        TEXT,
      -- Event dates (what happened) vs awareness dates (when we learned it).
      date_awareness_gained     TEXT,
      date_spec_locked          TEXT,
      date_awarded              TEXT,
      date_outcome_learned      TEXT,
      created_by                INTEGER REFERENCES users(id),
      created_at                TEXT DEFAULT (datetime('now')),
      updated_at                TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_projects_outcome   ON projects(outcome);
    CREATE INDEX IF NOT EXISTS idx_projects_awareness ON projects(awareness_stage);

    CREATE TABLE IF NOT EXISTS opportunities (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL,
      contact_id       INTEGER REFERENCES contacts(id),
      org_id           INTEGER REFERENCES organizations(id),
      source           TEXT,
      segment          TEXT,
      district         TEXT,
      product_group    TEXT,
      eng_office       TEXT,
      contractor       TEXT,
      plumber          TEXT,
      location_url     TEXT,
      expected_value   REAL DEFAULT 0,
      currency         TEXT DEFAULT 'JOD',
      close_date       TEXT,
      stage            TEXT NOT NULL DEFAULT 'Prospect',
      status           TEXT NOT NULL DEFAULT 'Active',
      salesman_id      INTEGER REFERENCES users(id),
      designer_id      INTEGER REFERENCES users(id),
      discount_pct     REAL DEFAULT 0,
      lost_reason_id   INTEGER REFERENCES lost_reasons(id),
      lost_notes       TEXT,
      notes            TEXT,
      created_by       INTEGER REFERENCES users(id),
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS opp_labels (
      opp_id   INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (opp_id, label_id)
    );

    CREATE TABLE IF NOT EXISTS stage_history (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      opp_id              INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      from_stage          TEXT,
      to_stage            TEXT NOT NULL,
      changed_by          INTEGER REFERENCES users(id),
      changed_at          TEXT DEFAULT (datetime('now')),
      seconds_in_prev     INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      opp_id       INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      filename     TEXT NOT NULL,
      stored_name  TEXT NOT NULL,
      size         INTEGER DEFAULT 0,
      uploaded_by  INTEGER REFERENCES users(id),
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Quotations & Approvals ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      opp_id      INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      version     INTEGER NOT NULL DEFAULT 1,
      total_value REAL DEFAULT 0,
      discount_pct REAL DEFAULT 0,
      final_value REAL DEFAULT 0,
      designer_id INTEGER REFERENCES users(id),
      reviewed_by INTEGER REFERENCES users(id),
      status      TEXT NOT NULL DEFAULT 'Draft',
      files       TEXT DEFAULT '[]',
      notes       TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      released_at TEXT
    );

    CREATE TABLE IF NOT EXISTS discount_approvals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      opp_id        INTEGER REFERENCES opportunities(id),
      quotation_id  INTEGER REFERENCES quotations(id),
      requested_by  INTEGER REFERENCES users(id),
      approved_by   INTEGER REFERENCES users(id),
      status        TEXT NOT NULL DEFAULT 'Pending',
      requested_pct REAL NOT NULL,
      approved_pct  REAL,
      request_date  TEXT DEFAULT (datetime('now')),
      response_date TEXT,
      notes         TEXT
    );
  `);

  // ── Activities & Notifications ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      opp_id       INTEGER REFERENCES opportunities(id),
      contact_id   INTEGER REFERENCES contacts(id),
      org_id       INTEGER REFERENCES organizations(id),
      type         TEXT NOT NULL DEFAULT 'Task',
      title        TEXT NOT NULL,
      start_dt     TEXT,
      end_dt       TEXT,
      priority     TEXT DEFAULT 'Medium',
      assigned_to  INTEGER REFERENCES users(id),
      performed_by INTEGER REFERENCES users(id),
      status       TEXT NOT NULL DEFAULT 'Scheduled',
      notes        TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      message    TEXT NOT NULL,
      opp_id     INTEGER REFERENCES opportunities(id),
      is_read    INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Design Workflow (Request → Assignment → Stages → Quotation review) ───
  // design_requests: a single design ask tied to one opportunity. Salesman creates;
  // Sally (design manager) assigns; designer works; Sally approves/releases.
  // design_stage_history: SECRET timestamped audit of every stage transition.
  //   Never exposed to designers — only Admin + Sales Manager via reports.
  // quotation_versions: V1/V2/V3 quotations submitted by the designer.
  db.exec(`
    CREATE TABLE IF NOT EXISTS design_requests (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id        INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      request_type          TEXT NOT NULL DEFAULT 'New',          -- 'New' | 'Modification'
      requested_by          INTEGER NOT NULL REFERENCES users(id),
      project_type          TEXT NOT NULL,                         -- 'New Design' | 'Modification' | 'As-Built'
      urgency               TEXT NOT NULL DEFAULT 'Standard',      -- 'Standard' | 'Urgent' | 'Critical'
      site_plans            TEXT DEFAULT '[]',                     -- JSON array of {name, size, stored}
      salesman_notes        TEXT,
      -- Digitized IMG paper-form data. JSON blob of every Step-2/3 field.
      -- Schema is owned by the frontend (scripts/20-design-request-form.jsx).
      form_type             TEXT,                                  -- 'AC' | 'Heating'  (mirror of form_data.form_type for queries)
      form_data             TEXT DEFAULT '{}',                     -- full filled form, JSON
      -- Top-level filterable mirrors of common form fields:
      system_type           TEXT,                                  -- 'VRF' | 'LCAC' | 'RAC' | 'Applied' (AC) or NULL
      has_pool              INTEGER DEFAULT 0,                     -- 0/1, heating only
      has_solar             INTEGER DEFAULT 0,                     -- 0/1, heating only
      design_stage          TEXT NOT NULL DEFAULT 'Incoming',      -- Incoming | Queued | In Progress | Review | Approved | Released | On Hold | Cancelled
      assigned_designer_id  INTEGER REFERENCES users(id),
      assigned_by           INTEGER REFERENCES users(id),
      priority              INTEGER,                               -- 1..4
      estimated_hours       INTEGER,
      due_date              TEXT,
      design_notes          TEXT,
      version               INTEGER NOT NULL DEFAULT 1,
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS design_stage_history (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id              INTEGER NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
      from_stage              TEXT,
      to_stage                TEXT NOT NULL,
      changed_by              INTEGER REFERENCES users(id),
      changed_at              TEXT DEFAULT (datetime('now')),
      time_in_previous_stage  INTEGER DEFAULT 0,                   -- minutes
      notes                   TEXT
    );

    CREATE TABLE IF NOT EXISTS quotation_versions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id      INTEGER NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
      version_number  INTEGER NOT NULL,
      total_value     REAL DEFAULT 0,
      files           TEXT DEFAULT '[]',                            -- JSON array
      designer_notes  TEXT,
      created_by      INTEGER REFERENCES users(id),
      submitted_at    TEXT DEFAULT (datetime('now')),
      reviewed_by     INTEGER REFERENCES users(id),
      review_status   TEXT DEFAULT 'Submitted',                     -- Draft | Submitted | Approved | Revision Requested
      review_notes    TEXT,
      reviewed_at     TEXT,
      released_at     TEXT
    );

    -- Structured quotation line items (Phase 6, 2026-05-17).
    -- Replaces the old "designer types a single total" workflow. The server
    -- recomputes quotation_versions.total_value from sum(qty * unit_price) on
    -- every POST so the total is always the source of truth.
    CREATE TABLE IF NOT EXISTS quotation_line_items (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_version_id  INTEGER NOT NULL REFERENCES quotation_versions(id) ON DELETE CASCADE,
      line_num              INTEGER NOT NULL,
      category              TEXT,
      description           TEXT,
      qty                   REAL DEFAULT 0,
      unit                  TEXT,
      unit_price            REAL DEFAULT 0,
      subtotal              REAL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_qli_version ON quotation_line_items(quotation_version_id);

    -- Shared notes thread on each design request.
    -- Before a designer is assigned: salesman ↔ Sally.
    -- After a designer is assigned : salesman ↔ designer (Sally still reads/posts).
    -- author_role is snapshotted at write time so role changes don't rewrite history.
    CREATE TABLE IF NOT EXISTS design_request_comments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id   INTEGER NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
      author_id    INTEGER NOT NULL REFERENCES users(id),
      author_role  TEXT NOT NULL,
      message      TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_drc_request ON design_request_comments(request_id, created_at);
  `);

  // ── Migrations: add columns missing from older DBs ────────────────────────
  // SQLite ignores CREATE TABLE IF NOT EXISTS for existing tables, so any
  // column added after the initial release needs an ALTER. Wrap in try/catch
  // because SQLite has no "ADD COLUMN IF NOT EXISTS".
  function addColumnIfMissing(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    // Guard: on a FRESH database some migrations below run before their table is
    // created further down this file. PRAGMA returns [] for a missing table, which
    // used to fall through to an ALTER on a non-existent table and crash the boot.
    // Skipping is safe — any table created later already declares these columns.
    if (cols.length === 0) return;
    if (!cols.some(c => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  addColumnIfMissing('design_requests', 'form_type',   `TEXT`);
  addColumnIfMissing('design_requests', 'form_data',   `TEXT DEFAULT '{}'`);
  addColumnIfMissing('design_requests', 'system_type', `TEXT`);
  addColumnIfMissing('design_requests', 'has_pool',    `INTEGER DEFAULT 0`);
  addColumnIfMissing('design_requests', 'has_solar',   `INTEGER DEFAULT 0`);

  // Real-data columns added during the Commercial Pipeline import (2026-05-13).
  addColumnIfMissing('opportunities', 'system',          `TEXT`);
  addColumnIfMissing('opportunities', 'sub_system',      `TEXT`);
  addColumnIfMissing('opportunities', 'brand',           `TEXT`);
  addColumnIfMissing('opportunities', 'owner_rep',       `TEXT`);
  addColumnIfMissing('opportunities', 'installation_by', `TEXT`);
  addColumnIfMissing('opportunities', 'signing_price',   `REAL`);
  addColumnIfMissing('opportunities', 'lost_to_whom',    `TEXT`);
  addColumnIfMissing('opportunities', 'next_action',     `TEXT`);
  addColumnIfMissing('opportunities', 'remarks',         `TEXT`);

  // Excel-parity columns added 2026-05-14.
  addColumnIfMissing('opportunities', 'person_responsible', `TEXT`);
  addColumnIfMissing('opportunities', 'sales_tax',          `REAL`);
  addColumnIfMissing('opportunities', 'price_exempted',     `REAL`);
  addColumnIfMissing('opportunities', 'expected_closing',   `TEXT`);
  addColumnIfMissing('opportunities', 'owner_name',         `TEXT`);

  // Management-feedback columns added 2026-05-17.
  addColumnIfMissing('design_requests', 'returned_reason',     `TEXT`);   // Phase 2: Sally's return-to-sales note
  addColumnIfMissing('design_requests', 'released_to_stage',   `TEXT`);   // Phase 2: where the deal goes after release
  addColumnIfMissing('design_requests', 'modification_reason', `TEXT`);   // Phase 3: required when request_type='Modification'
  // Sales-scorecard rework analysis: orthogonal "cause" dimension on top of
  // modification_reason, so reports can separate our-fault rework from
  // client/commercial-driven iterations. Required when request_type='Modification'.
  // Values: 'Internal — sizing/selection error' | 'External — client/consultant change' | 'Commercial — price/value engineering'
  addColumnIfMissing('design_requests', 'modification_cause',  `TEXT`);
  // Phase 5 (2026-05-17): chain re-requests after Return/Cancel and modifications
  // to the prior request, so the full history is preserved for reports.
  addColumnIfMissing('design_requests', 'parent_request_id',   `INTEGER REFERENCES design_requests(id)`);
  // Phase 6 (2026-05-17): Sally can delegate review to another DM or a senior designer.
  addColumnIfMissing('design_requests', 'assigned_reviewer_id', `INTEGER REFERENCES users(id)`);
  addColumnIfMissing('users',            'is_senior',           `INTEGER DEFAULT 0`);
  // Phase 7 (2026-05-17): soft-delete on thread messages — preserves the slot
  // as a tombstone so the conversation context isn't lost.
  addColumnIfMissing('design_request_comments', 'deleted_at',      `TEXT`);
  addColumnIfMissing('design_request_comments', 'deleted_by',      `INTEGER REFERENCES users(id)`);
  addColumnIfMissing('design_request_comments', 'deleted_by_name', `TEXT`);

  // ─── Phase 8 (2026-05-18): Product Management module ──────────────────────
  // Pricelist is the cost source of truth. PM uploads supplier pricelist;
  // designer picks SKUs in the quotation builder; cost is hidden from
  // designer/sally/salesman/sales_manager — only PM + admin + high mgmt see it.
  addColumnIfMissing('users', 'can_view_costs', `INTEGER DEFAULT 0`);

  // ─── Reporting data top-ups (2026-05-21, go-live Phase 0) ─────────────────
  // Explicit close + activity-completion timestamps so performance reports
  // (Phase 8) have accurate history from launch day. `updated_at` was being
  // reused for "closed at" but it changes on any edit, so it can't measure
  // sales-cycle length. These columns are stamped at the close / done moment.
  addColumnIfMissing('opportunities', 'closed_at', `TEXT`);
  addColumnIfMissing('opportunities', 'closed_by', `INTEGER REFERENCES users(id)`);
  addColumnIfMissing('activities',    'done_at',   `TEXT`);

  // ─── Diagnostic reporting layer (H1 access · H2 discount · H3 retention · H4 capacity) ───
  // All additive. CHECKs allow NULL so pre-existing rows stay valid and updatable.
  // Revenue model decision: there is no Invoice entity — a "revenue event" is a Won
  // opportunity (closed_at = date, signing_price = amount, org_id = customer).

  // A. Account (organizations). first/last purchase, lifetime revenue and silent_since
  //    are DERIVED on read from Won deals — deliberately NOT stored (no sync bugs).
  addColumnIfMissing('organizations', 'account_code',          `TEXT`);
  addColumnIfMissing('organizations', 'customer_type',         `TEXT CHECK (customer_type IS NULL OR customer_type IN
    ('one-time project buyer','repeat institutional','mechanical contractor','residential','internal/owner-related','other'))`);
  addColumnIfMissing('organizations', 'is_internal',           `INTEGER DEFAULT 0`);   // excluded from every report by default
  addColumnIfMissing('organizations', 'churn_reason',          `TEXT CHECK (churn_reason IS NULL OR churn_reason IN
    ('price','competitor','project pipeline dried up','quality/service','relationship lost','moved in-house','went silent - unknown','other'))`);
  addColumnIfMissing('organizations', 'churn_reason_note',     `TEXT`);
  addColumnIfMissing('organizations', 'churn_reason_set_at',   `TEXT`);
  addColumnIfMissing('organizations', 'churn_reason_set_by',   `INTEGER REFERENCES users(id)`);
  // Stable identifier, distinct from name. Unique index (ALTER can't add a UNIQUE constraint).
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_account_code ON organizations(account_code) WHERE account_code IS NOT NULL;`); } catch (e) { /* optional */ }
  // Give existing accounts a code so the field is usable immediately (ACC-0001…).
  const orgsNeedingCode = db.prepare(`SELECT id FROM organizations WHERE account_code IS NULL ORDER BY id`).all();
  if (orgsNeedingCode.length) {
    const setCode = db.prepare(`UPDATE organizations SET account_code = ? WHERE id = ?`);
    for (const o of orgsNeedingCode) setCode.run('ACC-' + String(o.id).padStart(4, '0'), o.id);
  }

  // B. Contact — per-PERSON profession/influence. (deal_contacts.role stays the per-DEAL role.)
  addColumnIfMissing('contacts', 'role',           `TEXT CHECK (role IS NULL OR role IN
    ('MEP consultant','civil contractor','mechanical contractor','client-side decision maker','client-side technical','government procurement','other'))`);
  addColumnIfMissing('contacts', 'influence_tier', `TEXT CHECK (influence_tier IS NULL OR influence_tier IN ('high','medium','low'))`);
  addColumnIfMissing('contacts', 'key_target',     `INTEGER DEFAULT 0`);   // top-N influencer watchlist (report 8)

  // C. Deal → Project link (NULL = residential / direct sale, by design) + win reason.
  addColumnIfMissing('opportunities', 'project_id', `INTEGER REFERENCES projects(id)`);
  addColumnIfMissing('opportunities', 'won_reason', `TEXT CHECK (won_reason IS NULL OR won_reason IN
    ('price','product fit','delivery time','relationship','spec locked to us','incumbent','other'))`);
  addColumnIfMissing('opportunities', 'won_note',   `TEXT`);

  // D. Stage transitions must carry a reason (Phase 5 principle #1). Until now
  //    stage_history had NO reason column — design.js even passed one and it was dropped.
  addColumnIfMissing('stage_history', 'reason',      `TEXT`);
  addColumnIfMissing('stage_history', 'reason_note', `TEXT`);

  // E. Salesman lifecycle (H4). `is_active` is an undated boolean and stays for
  //    back-compat; `status` + dates are the reporting source of truth.
  addColumnIfMissing('users', 'status',           `TEXT CHECK (status IS NULL OR status IN ('active','inactive','departed'))`);
  addColumnIfMissing('users', 'hire_date',        `TEXT`);
  addColumnIfMissing('users', 'departure_date',   `TEXT`);
  addColumnIfMissing('users', 'departure_reason', `TEXT CHECK (departure_reason IS NULL OR departure_reason IN
    ('resigned','terminated','transferred','retired','other'))`);
  addColumnIfMissing('users', 'departure_note',   `TEXT`);
  // One-time sync of current state from the legacy boolean (not a history backfill —
  // we cannot know WHEN anyone joined or left; report 14 accrues from today forward).
  db.prepare(`UPDATE users SET status = CASE WHEN COALESCE(is_active, 1) = 1 THEN 'active' ELSE 'inactive' END WHERE status IS NULL`).run();

  // F. Activity — add the Project dimension (opp/contact/org already exist).
  addColumnIfMissing('activities', 'project_id', `INTEGER REFERENCES projects(id)`);

  // G. Discount approvals — the approver's note currently OVERWRITES the requester's
  //    rationale (single `notes` column, two authors). Split them so H2 keeps its evidence.
  addColumnIfMissing('discount_approvals', 'response_note', `TEXT`);

  // ─── Sales targets (2026-06-02) — drive the dashboard target gauges. ───────
  // One row per (scope, salesman_id, year). scope='company' → salesman_id NULL.
  // monthly_amount NULL means "annual ÷ 12".
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_targets (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      scope          TEXT NOT NULL DEFAULT 'company',
      salesman_id    INTEGER REFERENCES users(id),
      year           INTEGER NOT NULL,
      annual_amount  REAL DEFAULT 0,
      monthly_amount REAL,
      updated_by     INTEGER REFERENCES users(id),
      updated_at     TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_targets_year ON sales_targets(year, scope, salesman_id);
  `);

  // ─── 3-layer product categories (2026-05-21) ──────────────────────────────
  // The reference pricelist defines categories as Layer 1 (division) ›
  // Layer 2 (group) › Layer 3 (family). Store all three; keep `category` as a
  // back-compat single label (mirrors Layer 3).
  addColumnIfMissing('product_skus', 'category_l1', `TEXT`);
  addColumnIfMissing('product_skus', 'category_l2', `TEXT`);
  addColumnIfMissing('product_skus', 'category_l3', `TEXT`);
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_skus_layers ON product_skus(price_book_id, category_l2, category_l3, active);`);
  } catch (e) { /* index optional */ }

  // ── Brands & Price Books (Phase 8.1, 2026-05-19) ─────────────────────────
  // Hierarchy: Brand → Price Book → Pricelist Version → SKUs.
  // Each brand can have many books (e.g. Gree: GMV6 Inc., GMV X, …).
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      active      INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS price_books (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id    INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      active      INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now')),
      created_by  INTEGER REFERENCES users(id),
      UNIQUE(brand_id, name)
    );
  `);
  addColumnIfMissing('pricelist_versions', 'price_book_id', `INTEGER REFERENCES price_books(id)`);
  addColumnIfMissing('product_skus',       'price_book_id', `INTEGER REFERENCES price_books(id)`);

  // Seed Gree + default GMV6 Inc. book, then backfill existing rows.
  const greeBrand = db.prepare(`SELECT id FROM brands WHERE name = 'Gree'`).get();
  let greeBrandId;
  if (!greeBrand) {
    greeBrandId = db.prepare(`INSERT INTO brands (name, description) VALUES ('Gree', 'Gree air-conditioning systems')`).run().lastInsertRowid;
  } else {
    greeBrandId = greeBrand.id;
  }
  const defaultBook = db.prepare(`SELECT id FROM price_books WHERE brand_id = ? AND name = 'GMV6 Inc.'`).get(greeBrandId);
  let defaultBookId;
  if (!defaultBook) {
    defaultBookId = db.prepare(`INSERT INTO price_books (brand_id, name, description) VALUES (?, 'GMV6 Inc.', 'Initial seed — auto-created from Pricelist demo1.xlsx')`).run(greeBrandId).lastInsertRowid;
  } else {
    defaultBookId = defaultBook.id;
  }
  // Backfill old rows that have no book yet. Guarded: on a FRESH database these two
  // tables are created further down this file, and there is nothing to backfill anyway.
  try {
    db.prepare(`UPDATE pricelist_versions SET price_book_id = ? WHERE price_book_id IS NULL AND brand = 'Gree'`).run(defaultBookId);
    db.prepare(`UPDATE product_skus       SET price_book_id = ? WHERE price_book_id IS NULL AND brand = 'Gree'`).run(defaultBookId);
  } catch (e) { /* fresh DB — tables not created yet, no rows to backfill */ }

  // ── Designer-released workflow (Phase 8.1) ────────────────────────────────
  // Designer pre-picks where the released quote goes (Tender / Analysis) at
  // submission time. On approval, the server auto-transitions to Released.
  addColumnIfMissing('quotation_versions', 'target_release_stage', `TEXT`);
  addColumnIfMissing('quotation_versions', 'released_by',          `INTEGER REFERENCES users(id)`);
  addColumnIfMissing('quotation_versions', 'approved_by',          `INTEGER REFERENCES users(id)`);

  // Track whether the deal value was auto-set by a released quotation.
  addColumnIfMissing('opportunities', 'value_source',           `TEXT`);   // 'manual' (default) | 'quotation:V<n>'
  addColumnIfMissing('opportunities', 'value_source_quote_id',  `INTEGER REFERENCES quotation_versions(id)`);

  // Phase 8.2 (2026-05-19): salesman-side discount revisions + PM what-if.
  addColumnIfMissing('quotation_versions', 'revision_type',     `TEXT DEFAULT 'design'`);  // 'design' | 'sales'
  addColumnIfMissing('quotation_versions', 'parent_version_id', `INTEGER REFERENCES quotation_versions(id)`);
  db.prepare(`UPDATE quotation_versions SET revision_type = 'design' WHERE revision_type IS NULL`).run();

  db.exec(`
    -- PM playground. Scenarios are detached "what-ifs" — never replace the
    -- canonical quotation_versions.total_value, never touch deal value.
    CREATE TABLE IF NOT EXISTS quotation_scenarios (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_version_id  INTEGER NOT NULL REFERENCES quotation_versions(id) ON DELETE CASCADE,
      name                  TEXT NOT NULL,
      payload               TEXT NOT NULL,    -- JSON { line_overrides: { <line_id>: { qty?, unit_price?, discount_pct? } } }
      total_cost            REAL,
      total_revenue         REAL,
      gross_profit          REAL,
      gross_pct             REAL,
      created_by            INTEGER REFERENCES users(id),
      created_at            TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scen_version ON quotation_scenarios(quotation_version_id, id DESC);
  `);

  db.exec(`
    -- One row per pricelist upload. Snapshots the 6 global multipliers so
    -- that historical quotations can be reconstructed exactly even after PM
    -- uploads a newer pricelist.
    CREATE TABLE IF NOT EXISTS pricelist_versions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      uploaded_at           TEXT DEFAULT (datetime('now')),
      uploaded_by           INTEGER REFERENCES users(id),
      source_filename       TEXT,
      brand                 TEXT,
      mfg_discount_pct      REAL DEFAULT 0,
      usd_to_jod            REAL DEFAULT 1,
      shipping_pct          REAL DEFAULT 0,
      customs_duties_pct    REAL DEFAULT 0,
      extra_multi_pct       REAL DEFAULT 0,
      sales_tax_pct         REAL DEFAULT 0,
      is_active             INTEGER DEFAULT 1,   -- 1 = the live pricelist for that brand
      notes                 TEXT,
      price_book_id         INTEGER REFERENCES price_books(id)   -- declared here for FRESH DBs; existing DBs get it via ALTER above
    );

    -- Catalogue. One row per SKU. Cost columns are PM-only on the API layer.
    CREATE TABLE IF NOT EXISTS product_skus (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      pricelist_version_id     INTEGER REFERENCES pricelist_versions(id),
      brand                    TEXT,
      category                 TEXT NOT NULL,   -- back-compat single label (= Layer 3 family)
      category_l1              TEXT,            -- e.g. AC  (division)
      category_l2              TEXT,            -- e.g. Indoor Units - Cassette  (group)
      category_l3              TEXT,            -- e.g. 4-way Cassette  (family)
      erp_code                 TEXT,
      model                    TEXT NOT NULL,
      description              TEXT,
      unit                     TEXT DEFAULT 'pc',
      -- Cost build-up (PM-only)
      fob_price_usd            REAL,
      fob_net_usd              REAL,
      fob_net_jod              REAL,
      cost_with_shipping       REAL,
      cost_with_customs        REAL,
      cost_with_extra_multi    REAL,
      cost_jod                 REAL,            -- final JOD-tax-inclusive cost
      -- Customer-facing
      list_price               REAL NOT NULL,
      -- Discount tiers from the pricelist sheet (kept for reference / UI hints)
      max_se_discount_pct      REAL DEFAULT 0.25,
      max_mgr_discount_pct     REAL DEFAULT 0.40,
      active                   INTEGER DEFAULT 1,
      created_at               TEXT DEFAULT (datetime('now')),
      updated_at               TEXT DEFAULT (datetime('now')),
      price_book_id            INTEGER REFERENCES price_books(id)   -- declared here for FRESH DBs; existing DBs get it via ALTER above
    );
    CREATE INDEX IF NOT EXISTS idx_skus_category ON product_skus(category, active);
    CREATE INDEX IF NOT EXISTS idx_skus_model    ON product_skus(model);
  `);

  // Extend quotation_versions with the customer-facing header fields. All
  // editable by the designer because they appear on the PDF the customer sees.
  addColumnIfMissing('quotation_versions', 'reference',           `TEXT`);
  addColumnIfMissing('quotation_versions', 'quote_date',          `TEXT`);
  addColumnIfMissing('quotation_versions', 'project_name',        `TEXT`);
  addColumnIfMissing('quotation_versions', 'city',                `TEXT`);
  addColumnIfMissing('quotation_versions', 'project_type',        `TEXT`);
  addColumnIfMissing('quotation_versions', 'pricing_mode',        `TEXT`);
  addColumnIfMissing('quotation_versions', 'sales_engineer_name', `TEXT`);
  addColumnIfMissing('quotation_versions', 'design_engineer_name',`TEXT`);
  addColumnIfMissing('quotation_versions', 'brand',               `TEXT`);
  addColumnIfMissing('quotation_versions', 'intro_text',          `TEXT`);
  addColumnIfMissing('quotation_versions', 'maintenance_text',    `TEXT`);
  addColumnIfMissing('quotation_versions', 'tnc_text',            `TEXT`);
  addColumnIfMissing('quotation_versions', 'discount_pct_global', `REAL DEFAULT 0`);

  // Extend quotation_line_items with SKU linkage + audit fields.
  addColumnIfMissing('quotation_line_items', 'sku_id',          `INTEGER REFERENCES product_skus(id)`);
  addColumnIfMissing('quotation_line_items', 'model',           `TEXT`);
  addColumnIfMissing('quotation_line_items', 'list_price',      `REAL`);
  addColumnIfMissing('quotation_line_items', 'discount_pct',    `REAL DEFAULT 0`);
  addColumnIfMissing('quotation_line_items', 'is_override',     `INTEGER DEFAULT 0`);
  addColumnIfMissing('quotation_line_items', 'cost_snapshot',   `REAL`);    // PM-only at read time
  // Phase 4: timestamp for the activity feed. SQLite's ALTER TABLE doesn't accept
  // a non-constant default, so the column is plain TEXT; new rows write the timestamp
  // explicitly in routes/dealContacts.js, existing rows stay null (filtered in enrichOpp).
  addColumnIfMissing('deal_contacts',   'created_at',          `TEXT`);
  addColumnIfMissing('contacts',        'is_blacklisted',      `INTEGER DEFAULT 0`);   // Phase 6
  addColumnIfMissing('contacts',        'blacklist_reason',    `TEXT`);                 // Phase 6

  // ── Deal ↔ Contact ↔ Role join (unified people model, 2026-05-14) ─────────
  // Each deal names up to 4 people (Owner, Owner Rep, Contractor, Consultant).
  // A person is one contact row; deal_contacts records which roles they play
  // on which deals, so a single contact profile shows every connection.
  db.exec(`
    CREATE TABLE IF NOT EXISTS deal_contacts (
      opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      contact_id     INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      role           TEXT NOT NULL,
      created_at     TEXT,                          -- declared here for FRESH DBs; existing DBs get it via ALTER above
      PRIMARY KEY (opportunity_id, contact_id, role)
    );
    CREATE INDEX IF NOT EXISTS idx_deal_contacts_contact ON deal_contacts(contact_id);
    CREATE INDEX IF NOT EXISTS idx_deal_contacts_opp     ON deal_contacts(opportunity_id);
  `);

  // ── Seed the areas list (Amman + neighbourhoods) once, in display order. ──
  // INSERT OR IGNORE keeps the UNIQUE(name) rows idempotent across restarts.
  const seedAreas = ['Amman', 'دابوق', 'عبدون', 'الكرسي', 'الحمر', 'خلدا', 'أم أذينة', 'طريق المطار'];
  const insertArea = db.prepare(`INSERT OR IGNORE INTO areas (name) VALUES (?)`);
  for (const a of seedAreas) insertArea.run(a);

  // ── Indexes ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opps_salesman    ON opportunities(salesman_id);
    CREATE INDEX IF NOT EXISTS idx_opps_stage       ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_opps_status      ON opportunities(status);
    CREATE INDEX IF NOT EXISTS idx_notif_user       ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_quot_opp         ON quotations(opp_id);
    CREATE INDEX IF NOT EXISTS idx_stage_hist_opp   ON stage_history(opp_id);
    CREATE INDEX IF NOT EXISTS idx_dreq_opp         ON design_requests(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_dreq_stage       ON design_requests(design_stage);
    CREATE INDEX IF NOT EXISTS idx_dreq_designer    ON design_requests(assigned_designer_id);
    CREATE INDEX IF NOT EXISTS idx_dhist_request    ON design_stage_history(request_id);
    CREATE INDEX IF NOT EXISTS idx_qver_request     ON quotation_versions(request_id);
  `);
};
