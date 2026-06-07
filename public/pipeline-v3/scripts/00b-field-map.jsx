// Shared field map — single source of truth for the deal field set.
// Used by: adaptOppFromApi (13-app.jsx), updateDeal, the deal-detail field list,
// the table column picker, and the filter menu.
// Loaded right after 00-api.js on every pipeline-v3 page.
//
// Each field: { key, api, label, type, editable }
//   key      — the property name on the frontend `deal` object
//   api      — the column name in the opportunities table / API payload
//   label    — default human label (table header, detail-row label)
//   type     — text | textarea | number | date | select | user | org | stage
//   editable — false means render read-only (no inline editor)

(function () {
  window.OPP_FIELDS = [
    { key: 'name',              api: 'title',              label: 'Project Name',                   type: 'text',     editable: true  },
    { key: 'owner',             api: 'salesman_id',        label: 'Sales Engineer',                 type: 'user',     editable: false },
    { key: 'segment',           api: 'segment',            label: 'Sector',                         type: 'text',     editable: true  },
    { key: 'account',           api: 'owner_name',         label: 'Owner',                          type: 'text',     editable: true  },
    { key: 'ownerRep',          api: 'owner_rep',          label: 'Owner Rep',                      type: 'text',     editable: true  },
    { key: 'engOffice',         api: 'eng_office',         label: 'Consultant',                     type: 'text',     editable: true  },
    { key: 'contractor',        api: 'contractor',         label: 'Contractor',                     type: 'text',     editable: true  },
    { key: 'nextAction',        api: 'next_action',        label: 'Next action',                    type: 'text',     editable: true  },
    { key: 'personResponsible', api: 'person_responsible', label: 'Person Responsible',             type: 'text',     editable: true  },
    { key: 'remarks',           api: 'remarks',            label: 'Remarks',                        type: 'textarea', editable: true  },
    { key: 'district',          api: 'district',           label: 'Project Location',               type: 'text',     editable: true  },
    { key: 'status',            api: 'status',             label: 'Status',                         type: 'select',   editable: true,
      options: ['Active', 'Won', 'Lost', 'On-Hold', 'De-Prioritized'] },
    { key: 'stage',             api: 'stage',              label: 'Stage',                          type: 'stage',    editable: false },
    { key: 'system',            api: 'system',             label: 'System',                         type: 'text',     editable: true  },
    { key: 'subSystem',         api: 'sub_system',         label: 'Sub-System',                     type: 'text',     editable: true  },
    { key: 'brand',             api: 'brand',              label: 'Brand',                          type: 'text',     editable: true  },
    { key: 'value',             api: 'expected_value',     label: 'Quotation Price List',           type: 'number',   editable: true  },
    { key: 'salesTax',          api: 'sales_tax',          label: 'Sales Tax',                      type: 'number',   editable: true  },
    { key: 'priceExempted',     api: 'price_exempted',     label: 'Quotation Price List (Exempted)', type: 'number',  editable: false },
    { key: 'installationBy',    api: 'installation_by',    label: 'Installation',                   type: 'text',     editable: true  },
    { key: 'expectedClosing',   api: 'expected_closing',   label: 'Expected Closing',               type: 'date',     editable: true  },
    { key: 'signingPrice',      api: 'signing_price',      label: 'Signing Price',                  type: 'number',   editable: true  },
    { key: 'lostNotes',         api: 'lost_notes',         label: 'Lost (Reason)',                  type: 'text',     editable: true  },
    { key: 'lostToWhom',        api: 'lost_to_whom',       label: 'Lost (To Whom)',                 type: 'text',     editable: true  },
    { key: 'notes',             api: 'notes',              label: 'Notes',                          type: 'textarea', editable: true  },
  ];

  window.OPP_FIELD_BY_KEY = Object.fromEntries(window.OPP_FIELDS.map(f => [f.key, f]));

  // Convert a frontend patch ({frontendKey: value}) into an API patch ({api_column: value}).
  // Excludes: unknown keys, the dedicated `stage` field (own endpoint), `priceExempted`
  // (server-calculated), and `owner`/`salesman_id` (needs a picker — not editable yet).
  window.toApiPatch = function toApiPatch(patch) {
    const out = {};
    for (const [key, value] of Object.entries(patch || {})) {
      const f = window.OPP_FIELD_BY_KEY[key];
      if (!f) continue;
      if (f.key === 'stage' || f.key === 'priceExempted' || f.editable === false) continue;
      out[f.api] = value;
    }
    return out;
  };

  // ── Table column config persistence (Phase 5) ────────────────────────────
  const COLS_KEY    = 'imgTableColumns';
  const LABELS_KEY  = 'imgTableLabels';
  const WIDTHS_KEY  = 'imgTableWidths';
  const VERSION_KEY = 'imgTableColumnsVersion';
  const COLS_VERSION = 'v1';

  // Columns shown by default in the table (the rest are available via the picker).
  const DEFAULT_VISIBLE = [
    'name', 'stage', 'owner', 'value', 'status', 'system', 'subSystem',
    'brand', 'district', 'contractor', 'nextAction', 'remarks',
  ];

  window.defaultTableColumns = function defaultTableColumns() {
    return window.OPP_FIELDS.map(f => ({ key: f.key, visible: DEFAULT_VISIBLE.includes(f.key) }));
  };

  window.loadTableConfig = function loadTableConfig() {
    let columns = window.defaultTableColumns();
    let labels = {};
    let widths = {};
    try {
      if (localStorage.getItem(VERSION_KEY) !== COLS_VERSION) {
        localStorage.removeItem(COLS_KEY);
        localStorage.removeItem(LABELS_KEY);
        localStorage.removeItem(WIDTHS_KEY);
        localStorage.setItem(VERSION_KEY, COLS_VERSION);
      }
      const rawCols = localStorage.getItem(COLS_KEY);
      if (rawCols) {
        const parsed = JSON.parse(rawCols);
        // Keep only keys that still exist in OPP_FIELDS; append any new fields as hidden.
        const known = new Set(window.OPP_FIELDS.map(f => f.key));
        const seen = new Set();
        columns = parsed.filter(c => known.has(c.key) && !seen.has(c.key) && seen.add(c.key));
        window.OPP_FIELDS.forEach(f => {
          if (!seen.has(f.key)) columns.push({ key: f.key, visible: false });
        });
      }
      const rawLabels = localStorage.getItem(LABELS_KEY);
      if (rawLabels) labels = JSON.parse(rawLabels) || {};
      const rawWidths = localStorage.getItem(WIDTHS_KEY);
      if (rawWidths) widths = JSON.parse(rawWidths) || {};
    } catch { /* corrupt storage — fall back to defaults */ }
    return { columns, labels, widths };
  };

  window.saveTableConfig = function saveTableConfig({ columns, labels, widths }) {
    try {
      if (columns) localStorage.setItem(COLS_KEY, JSON.stringify(columns));
      if (labels)  localStorage.setItem(LABELS_KEY, JSON.stringify(labels));
      if (widths)  localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths));
      localStorage.setItem(VERSION_KEY, COLS_VERSION);
    } catch { /* storage unavailable — non-fatal */ }
  };

  window.resetTableConfig = function resetTableConfig() {
    try {
      localStorage.removeItem(COLS_KEY);
      localStorage.removeItem(LABELS_KEY);
      localStorage.removeItem(WIDTHS_KEY);
    } catch {}
    return { columns: window.defaultTableColumns(), labels: {}, widths: {} };
  };
})();
