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

  // ── Indexes ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opps_salesman   ON opportunities(salesman_id);
    CREATE INDEX IF NOT EXISTS idx_opps_stage      ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_opps_status     ON opportunities(status);
    CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_quot_opp        ON quotations(opp_id);
    CREATE INDEX IF NOT EXISTS idx_stage_hist_opp  ON stage_history(opp_id);
  `);
};
