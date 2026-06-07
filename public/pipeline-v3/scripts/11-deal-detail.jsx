// Right-side deal-detail drawer. Shows when a deal is clicked.
// Every field is inline-editable: click → input, Enter/blur saves → persists to API.
// Header value, probability, name, and stage are also editable.

// Field groups for the drawer body. Keys reference window.OPP_FIELDS; name/stage/value
// live in the header and notes has its own section, so they're omitted here.
const DETAIL_GROUPS = [
  { title: 'Client & Team',  keys: ['account', 'ownerRep', 'owner', 'segment', 'district'] },
  { title: 'Partners',       keys: ['contractor', 'engOffice', 'personResponsible'] },
  { title: 'Classification', keys: ['system', 'subSystem', 'brand', 'installationBy'] },
  { title: 'Commercial',     keys: ['salesTax', 'priceExempted', 'signingPrice', 'expectedClosing', 'status'] },
  { title: 'Follow-up',      keys: ['nextAction', 'remarks'] },
  { title: 'If Lost',        keys: ['lostNotes', 'lostToWhom'] },
];

function DealDetail({ deal, onClose, onAdvance, onMore, onUpdate, onAction,
                     designRequests = [], onRequestDesign, onRequestModification, onRefreshDesign,
                     showActivity = true, showFiles = true }) {
  const { Close, Calendar, Mail, Phone, Building, File, Chat, Attach, More, Plus, Check, Edit, Sparkle } = window.Icons;
  if (!deal) return null;

  const save = (patch) => onUpdate?.(patch);
  const act = (a, payload) => onAction?.(a, payload);

  // ---- Design integration ----
  // Latest design request for this opp (any stage), and the latest released one (if any).
  const latestRequest = designRequests.length ? designRequests[0] : null;  // sorted DESC by version,id in API
  const releasedRequest = designRequests.find(r => r.design_stage === 'Released') || null;
  const releasedQuote = releasedRequest?.latest_quotation;
  // Request design: from Prospect when there is no live request yet, OR after
  // Sally returned the previous attempt (deal is back in Prospect, latest is 'Returned').
  // Submitting the form moves the deal to Design/Redesign automatically (server-side).
  // Modification: at any post-design stage with a prior design — Sally re-takes it,
  // releases again to Tender or Analysis when done.
  const latestIsClosed = latestRequest && ['Returned', 'Cancelled'].includes(latestRequest.design_stage);
  const canRequestNewDesign = deal.stage === 'prospect' && (!latestRequest || latestIsClosed);
  const canRequestModification = !!latestRequest && !latestIsClosed && ['tender', 'analysis', 'negotiation', 'closing'].includes(deal.stage);

  // Modification-in-flight: a newer request exists after a release and hasn't
  // settled yet. While true, the prior green "Quotation Ready" banner is
  // hidden in favour of a unified yellow/orange "Modification in progress" one.
  const modificationInFlight = !!releasedRequest
    && !!latestRequest && latestRequest.id !== releasedRequest.id
    && !['Released', 'Returned', 'Cancelled'].includes(latestRequest.design_stage);

  // Spec calls for purple In-Design chip across sub-stages, green for Released.
  // We keep the per-sub-stage label so the drawer reads "In Design — Incoming" etc.
  const PURPLE_BG = '#F2EAFB', PURPLE_FG = '#5B2F8C', PURPLE_BORDER = '#7A4FB8';
  const designStageMeta = {
    'Incoming':    { bg: PURPLE_BG, fg: PURPLE_FG, border: PURPLE_BORDER, label: 'Incoming' },
    'Queued':      { bg: PURPLE_BG, fg: PURPLE_FG, border: PURPLE_BORDER, label: 'Queued' },
    'In Progress': { bg: PURPLE_BG, fg: PURPLE_FG, border: PURPLE_BORDER, label: 'In Progress' },
    'Review':      { bg: PURPLE_BG, fg: PURPLE_FG, border: PURPLE_BORDER, label: 'In review' },
    'Approved':    { bg: PURPLE_BG, fg: PURPLE_FG, border: PURPLE_BORDER, label: 'Approved' },
    'Released':    { bg: 'var(--img-green-50)', fg: 'var(--img-green-700)', border: 'var(--img-green-700)', label: 'Quotation Ready' },
    'On Hold':     { bg: '#FFF7E0', fg: '#9A6B00', border: '#D4A017', label: 'On Hold' },
    'Cancelled':   { bg: '#FDECEC', fg: '#9B1C1C', border: '#9B1C1C', label: 'Cancelled' },
  };

  const Section = ({ title, action, children }) => (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="t-label">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );

  const probColor = deal.probability >= 70 ? 'var(--img-green)' :
                    deal.probability >= 40 ? 'var(--img-orange)' :
                                             'var(--neutral-400)';

  // Owners + scopes + stages — sourced from real data in 04-deals.jsx
  const OWNERS = (window.SALES_TEAM || []).map(u => u.name);
  const SCOPES = window.PRODUCT_GROUPS || [];
  const STAGES = ['prospect', 'tender', 'analysis', 'negotiation', 'closing', 'won', 'lost'];

  // The 4 people on this deal come from the enriched API response (deal.contacts):
  // each has a `role` of Owner / Owner Rep / Contractor / Consultant. Until the
  // enriched fetch resolves, deal.contacts is undefined — show a loading hint.
  const ROLE_ORDER = ['Owner', 'Owner Rep', 'Contractor', 'Consultant'];
  const dealContacts = Array.isArray(deal.contacts) ? deal.contacts : null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(40, 38, 36, 0.32)',
        zIndex: 100, animation: 'fadeIn 180ms cubic-bezier(0.2, 0, 0, 1)',
      }}></div>

      {/* Drawer */}
      <aside style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 460,
        background: 'var(--bg-surface)', boxShadow: 'var(--shadow-xl)',
        zIndex: 101, display: 'flex', flexDirection: 'column',
        animation: 'slideIn 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 4 }}>{deal.id}</div>

              {/* Editable deal name */}
              <EditableText
                value={deal.name}
                onSave={(v) => v.trim() && save({ name: v.trim() })}
                multiline
                style={{
                  margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--fg-primary)',
                  letterSpacing: '-0.01em', lineHeight: 1.3,
                }}
                hoverHint="Click to rename"
              />

              {/* Editable stage */}
              <div style={{ marginTop: 8, display: 'inline-block' }}>
                <EditableSelect
                  value={deal.stage}
                  options={STAGES.map(s => ({ value: s, label: window.STAGE_META[s]?.label || s }))}
                  onSave={(v) => save({ stage: v })}
                  renderDisplay={() => <window.StageChip stage={deal.stage} />}
                />
              </div>
            </div>
            <button onClick={onClose} title="Close" style={{
              width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent',
              color: 'var(--fg-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Close size={18} /></button>
          </div>

          {/* Big value — both fields editable */}
          <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--neutral-50)', borderRadius: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-secondary)', fontWeight: 500 }}>Deal value</span>
              <EditableNumber
                value={deal.value}
                onSave={(v) => save({ value: v })}
                format={(n) => window.formatJOD(n)}
                style={{
                  fontSize: 22, fontWeight: 700, color: 'var(--fg-primary)',
                  letterSpacing: '-0.02em',
                }}
                className="t-num"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-secondary)', fontWeight: 500 }}>Probability</span>
              <EditableNumber
                value={deal.probability}
                onSave={(v) => save({ probability: Math.max(0, Math.min(100, v)) })}
                format={(n) => `${n}%`}
                style={{
                  fontSize: 22, fontWeight: 700, color: probColor,
                  letterSpacing: '-0.02em',
                }}
                className="t-num"
                align="right"
                max={100}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {deal.stage === 'lead' ? (
              <button disabled title="Design controls this stage — Sally releases the deal when the design is approved" style={{
                flex: 1, padding: '7px 10px', height: 32, borderRadius: 7,
                background: 'var(--neutral-200)', color: 'var(--fg-tertiary)', border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'not-allowed',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>🔒 Design controls this stage</button>
            ) : (
              <button onClick={() => onAdvance?.(deal)} style={{
                flex: 1, padding: '7px 10px', height: 32, borderRadius: 7,
                background: 'var(--img-orange)', color: '#fff', border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}><Check size={14} /> Move to next stage</button>
            )}
            <button onClick={() => act('quote')} style={{
              padding: '7px 10px', height: 32, borderRadius: 7,
              background: 'var(--bg-surface)', color: 'var(--fg-primary)',
              border: '1px solid var(--border-default)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            ><File size={14} /> Quote</button>
            <button title="More" onClick={e => onMore?.(deal, e.currentTarget.getBoundingClientRect())} style={{
              width: 32, height: 32, borderRadius: 7,
              background: 'var(--bg-surface)', color: 'var(--fg-primary)',
              border: '1px solid var(--border-default)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><More size={14} /></button>
          </div>

          {/* Close / discount — only meaningful while the deal is still Active */}
          {deal.status === 'Active' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button onClick={() => act('closeWon')} style={{
                flex: 1, padding: '6px 10px', height: 30, borderRadius: 7,
                background: 'var(--img-green-50)', color: 'var(--img-green-700)',
                border: '1px solid var(--img-green-700)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              }}>Close as Won</button>
              <button onClick={() => act('closeLost')} style={{
                flex: 1, padding: '6px 10px', height: 30, borderRadius: 7,
                background: '#FDECEC', color: '#B0241D',
                border: '1px solid #B0241D', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              }}>Close as Lost</button>
              <button onClick={() => act('applyDiscount')} style={{
                padding: '6px 10px', height: 30, borderRadius: 7,
                background: 'var(--bg-surface)', color: 'var(--fg-primary)',
                border: '1px solid var(--border-default)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
              }}>Discount</button>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Data-driven field sections — every Excel column, grouped. Driven by
              window.OPP_FIELDS so the table column picker and this page stay in sync. */}
          {DETAIL_GROUPS.map(group => (
            <Section key={group.title} title={group.title}>
              {group.keys.map(key => {
                const f = (window.OPP_FIELD_BY_KEY || {})[key];
                if (!f) return null;
                const raw = deal[f.key];
                // Read-only fields (Sales Engineer, calculated Exempted price).
                if (f.editable === false) {
                  let shown = (raw != null && raw !== '') ? raw : '—';
                  if (f.key === 'priceExempted' && raw != null) shown = window.formatJOD(raw);
                  return (
                    <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '5px 0' }}>
                      <span style={{ fontSize: 12, color: 'var(--fg-secondary)', flexShrink: 0 }}>{f.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--fg-primary)', fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{shown}</span>
                    </div>
                  );
                }
                const efType = f.type === 'textarea' ? 'text' : f.type;
                const opts = f.options ? f.options.map(o => ({ value: o, label: o })) : undefined;
                const display = (f.type === 'number' && (f.key === 'signingPrice' || f.key === 'value') && raw != null)
                  ? window.formatJOD(raw)
                  : (f.type === 'date' && raw ? window.formatDate(raw) : undefined);
                return (
                  <EditableField key={f.key} label={f.label} type={efType}
                    value={raw == null ? '' : raw}
                    options={opts}
                    display={display}
                    onSave={(v) => save({ [f.key]: v })} />
                );
              })}
            </Section>
          ))}

          {/* Design — only shown if relevant to current opp stage OR a request exists */}
          {(latestRequest || canRequestNewDesign) && (
            <Section title="Design">
              {/* Modification in flight — replaces the green Quotation Ready banner. */}
              {modificationInFlight && (
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: 'var(--color-warning-bg, #FFF7E0)', border: '1px solid #E89211',
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Edit size={14} style={{ color: '#B7710F' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#B7710F' }}>
                      Modification of released quote V{releasedRequest.version} — now V{latestRequest.version} in {latestRequest.design_stage}
                    </span>
                  </div>
                  {latestRequest.modification_reason && (
                    <div style={{ fontSize: 11, color: '#7A4D08', marginTop: 2 }}>
                      Reason: <b>{latestRequest.modification_reason}</b>
                    </div>
                  )}
                  {latestRequest.designer_name && (
                    <div style={{ fontSize: 11, color: '#7A4D08', marginTop: 2 }}>
                      With {latestRequest.designer_name}
                      {latestRequest.due_date ? ` · due ${window.formatDate(latestRequest.due_date)}` : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Released → green Quotation Ready badge */}
              {releasedRequest && !modificationInFlight && (
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: 'var(--img-green-50)', border: '1px solid var(--img-green)',
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Check size={14} style={{ color: 'var(--img-green-700)' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--img-green-700)' }}>Quotation Ready</span>
                    {releasedQuote?.version_number && (
                      <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: 'var(--img-green-700)', color: '#fff' }}>V{releasedQuote.version_number}</span>
                    )}
                  </div>
                  {releasedQuote?.total_value != null && (
                    <div className="t-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>
                      {window.formatJOD(releasedQuote.total_value)}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--img-green-700)', marginTop: 2 }}>
                    Ready to move to Tender / continue negotiation
                  </div>
                  {releasedRequest.released_to_stage && (
                    <div style={{
                      marginTop: 6, fontSize: 11, fontWeight: 700,
                      color: 'var(--img-green-700)',
                    }}>
                      Released to <span style={{
                        padding: '1px 7px', borderRadius: 999,
                        background: releasedRequest.released_to_stage === 'Tender' ? 'var(--stage-tender-bg)' : 'var(--stage-analysis-bg)',
                        color:      releasedRequest.released_to_stage === 'Tender' ? 'var(--stage-tender)'    : 'var(--stage-analysis)',
                      }}>{releasedRequest.released_to_stage}</span>
                    </div>
                  )}
                  {/* Inline discount editor — global %, effective %, and per-item drawer.
                      Replaces the old "Edit discounts ↗" link out to the Quotation page. */}
                  {releasedQuote && (
                    <window.DiscountEditor
                      quote={releasedQuote}
                      releasedRequestId={releasedRequest.id}
                      onSaved={() => onRefreshDesign?.()}
                    />
                  )}
                </div>
              )}

              {/* Phase 2 — Sally returned the request: prominent red banner with reason */}
              {latestRequest && latestRequest.design_stage === 'Returned' && (
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: '#FDECEC', border: '1px solid #B0241D',
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#B0241D' }}>↩ Design returned by Sally</span>
                  </div>
                  {latestRequest.returned_reason && (
                    <div style={{ fontSize: 12, color: '#7A1A14', lineHeight: 1.4 }}>
                      <b>Reason:</b> {latestRequest.returned_reason}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#B0241D', marginTop: 4 }}>
                    The deal is back in Prospect. Fix the issue and re-request design from there.
                  </div>
                </div>
              )}

              {/* Active (non-released, non-returned) request shows status chip.
                  Hidden when modificationInFlight is true (the orange banner above already covers it). */}
              {latestRequest && !releasedRequest && !modificationInFlight && latestRequest.design_stage !== 'Returned' && (() => {
                const sm = designStageMeta[latestRequest.design_stage] || {};
                return (
                  <div style={{
                    padding: 12, borderRadius: 8,
                    background: sm.bg, border: `1px solid ${sm.fg}33`,
                    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <Sparkle size={14} style={{ color: sm.fg }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: sm.fg }}>
                        In Design — {sm.label}
                      </div>
                      <div style={{ fontSize: 11, color: sm.fg, opacity: 0.85, marginTop: 2 }}>
                        V{latestRequest.version}
                        {latestRequest.designer_name ? ` · ${latestRequest.designer_name}` : ' · awaiting assignment'}
                        {latestRequest.due_date ? ` · due ${window.formatDate(latestRequest.due_date)}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Action buttons */}
              {canRequestNewDesign && (
                <button onClick={() => onRequestDesign?.()} style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7,
                  background: 'var(--img-orange)', color: '#fff', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Sparkle size={14} /> Request design
                </button>
              )}
              {canRequestModification && (
                <button onClick={() => onRequestModification?.(latestRequest.id)} style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7,
                  background: 'var(--bg-surface)', color: 'var(--img-orange-700)',
                  border: '1px solid var(--img-orange)', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Edit size={14} /> Request modification
                </button>
              )}

              {/* The full filled-form summary — collapsed by default to keep the
                  drawer scannable. Sally also sees this on the Design Board. */}
              {latestRequest && latestRequest.form_data && Object.keys(latestRequest.form_data).length > 0 && (
                <DesignFormDetails request={latestRequest} />
              )}

              {/* Shared notes thread — salesman ↔ Sally before assignment;
                  salesman ↔ designer after. */}
              {latestRequest && window.DesignRequestThread && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border-subtle)' }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
                  }}>Notes thread</div>
                  <window.DesignRequestThread request={window.adaptDesignRequest
                    ? window.adaptDesignRequest(latestRequest)
                    : latestRequest} />
                </div>
              )}
            </Section>
          )}

          <Section title={`Contacts${dealContacts ? ` (${dealContacts.length})` : ''}`} action={
            <button onClick={() => act('addContact')} style={{ background: 'transparent', border: 'none', color: 'var(--img-orange-700)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--img-orange)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--img-orange-700)'}
            ><Plus size={11} />Add</button>
          }>
            {dealContacts === null ? (
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', padding: '4px 0' }}>Loading contacts…</div>
            ) : dealContacts.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', padding: '4px 0' }}>
                No people linked to this deal yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...dealContacts]
                  .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
                  .map(c => {
                    const phone = (c.phones && c.phones[0]) || '';
                    const email = (c.emails && c.emails[0]) || '';
                    return (
                      <div key={`${c.role}-${c.id}`}
                        onClick={() => act('openContact', c)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
                        <window.Avatar name={c.name} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{c.name}</span>
                            {/* Phase 6 — blacklist warning */}
                            {c.is_blacklisted ? (
                              <span title={c.blacklist_reason || 'Blacklisted'} style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                background: '#FDECEC', color: '#B0241D',
                              }}>🚫 BLACKLISTED</span>
                            ) : null}
                            {/* Phase 6 — shared-contact badge (this contact is on another salesman's deal too) */}
                            {c.shared_with > 0 ? (
                              <span title={`Also on ${c.shared_with} other salesman's deal${c.shared_with > 1 ? 's' : ''}`} style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                background: '#FFF4D6', color: '#9A6B00',
                              }}>⚠ SHARED</span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--img-orange-700)' }}>{c.role}</span>
                            {c.org_name ? ` · ${c.org_name}` : ''}
                          </div>
                        </div>
                        {email && (
                          <a href={`mailto:${email}`} title={`Email ${email}`}
                            onClick={(e) => { e.stopPropagation(); act('email', c); }}
                            style={{ ...iconBtn, textDecoration: 'none' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--img-orange-50)'; e.currentTarget.style.color = 'var(--img-orange-700)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--fg-secondary)'; }}
                          ><Mail size={14} /></a>
                        )}
                        {phone && (
                          <a href={`tel:${String(phone).replace(/\s+/g, '')}`} title={`Call ${phone}`}
                            onClick={(e) => { e.stopPropagation(); act('call', c); }}
                            style={{ ...iconBtn, textDecoration: 'none' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--img-orange-50)'; e.currentTarget.style.color = 'var(--img-orange-700)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--fg-secondary)'; }}
                          ><Phone size={14} /></a>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </Section>

          <Section title="Notes">
            <EditableText
              value={deal.notes || ''}
              multiline
              hoverHint="Click to edit notes"
              onSave={(v) => save({ notes: v })}
              style={{ fontSize: 12, color: 'var(--fg-primary)', lineHeight: 1.5, minHeight: 36, display: 'block' }}
            />
          </Section>

          {showActivity && (
            <Section title="Activity">
              {/* Phase 4 — unified events feed: stage moves + design events + contact links */}
              {!Array.isArray(deal.events) || deal.events.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', padding: '4px 0' }}>
                  No activity logged yet. Stage moves, design events, and contact links will appear here.
                </div>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {deal.events.map((ev, i) => {
                    const dotColor =
                      ev.type === 'stage'            ? 'var(--img-orange)' :
                      ev.type === 'design'           ? '#7A4FB8' :
                      ev.type === 'design_returned'  ? '#B0241D' :
                      ev.type === 'design_released'  ? 'var(--img-green-700)' :
                      ev.type === 'contact_added'    ? 'var(--neutral-400)' :
                                                       'var(--neutral-400)';
                    return (
                      <li key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < deal.events.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                        <span style={{ flexShrink: 0, width: 8, height: 8, marginTop: 6, borderRadius: '50%', background: dotColor }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'var(--fg-primary)', lineHeight: 1.4 }}>{ev.summary}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--fg-tertiary)', marginTop: 2 }}>
                            {ev.by ? `${ev.by} · ` : ''}{window.formatDate ? window.formatDate(ev.at) : ev.at}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Section>
          )}

          {showFiles && (
            <Section title="Files" action={
              <button onClick={() => act('attach')} style={{ background: 'transparent', border: 'none', color: 'var(--img-orange-700)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--img-orange)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--img-orange-700)'}
              ><Plus size={11} />Attach</button>
            }>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', padding: '4px 0' }}>
                No files attached yet.
              </div>
            </Section>
          )}
        </div>
      </aside>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}

// =================================================================
// Editable primitives
// =================================================================

// Inline-editable text (single or multi-line). Click → input. Enter saves; Esc cancels.
function EditableText({ value, onSave, multiline, style, hoverHint, className }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select?.(); }
  }, [editing]);

  const commit = () => { setEditing(false); if (draft !== value) onSave?.(draft); };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (editing) {
    const Tag = multiline ? 'textarea' : 'input';
    return (
      <Tag
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          else if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
          else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
        }}
        rows={multiline ? 2 : undefined}
        className={className}
        style={{
          ...style,
          width: '100%', resize: 'none',
          background: 'var(--bg-surface)',
          border: '1px solid var(--img-orange)',
          boxShadow: 'var(--shadow-focus)',
          borderRadius: 6, padding: '4px 6px',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }
  return (
    <EditableHover hint={hoverHint}>
      <div
        onClick={() => setEditing(true)}
        className={className}
        style={{ ...style, cursor: 'text', borderRadius: 4, padding: '2px 4px', margin: '-2px -4px' }}
      >{value || <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>Click to add…</span>}</div>
    </EditableHover>
  );
}

// Inline-editable number. Same UX as EditableText, formatted on blur.
function EditableNumber({ value, onSave, format, style, className, align, max }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select?.(); }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = +draft;
    if (!isNaN(n) && n !== value) onSave?.(n);
  };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (editing) {
    return (
      <input
        ref={ref}
        type="number"
        value={draft}
        max={max}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          else if (e.key === 'Enter') { e.preventDefault(); commit(); }
        }}
        className={className}
        style={{
          ...style,
          width: '100%', textAlign: align === 'right' ? 'right' : 'left',
          background: 'var(--bg-surface)',
          border: '1px solid var(--img-orange)',
          boxShadow: 'var(--shadow-focus)',
          borderRadius: 6, padding: '2px 6px',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }
  return (
    <EditableHover hint="Click to edit">
      <div
        onClick={() => setEditing(true)}
        className={className}
        style={{ ...style, cursor: 'text', borderRadius: 4, padding: '0 4px', margin: '0 -4px' }}
      >{format ? format(value) : value}</div>
    </EditableHover>
  );
}

// Inline-editable select. Click renders a real <select> that auto-opens.
function EditableSelect({ value, options, onSave, renderDisplay }) {
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      // Try to programmatically open the menu (works in most browsers)
      try {
        const ev = document.createEvent('MouseEvents');
        ev.initMouseEvent('mousedown', true, true, window);
        ref.current.dispatchEvent(ev);
      } catch {}
    }
  }, [editing]);

  if (editing) {
    return (
      <select
        ref={ref}
        defaultValue={value}
        onChange={e => { onSave?.(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        style={{
          height: 28, padding: '0 8px',
          border: '1px solid var(--img-orange)', borderRadius: 6,
          fontSize: 12, fontWeight: 500, color: 'var(--fg-primary)',
          background: 'var(--bg-surface)', boxShadow: 'var(--shadow-focus)',
          outline: 'none', fontFamily: 'inherit', maxWidth: '100%',
        }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <EditableHover hint="Click to change">
      <span onClick={() => setEditing(true)} style={{ cursor: 'pointer', display: 'inline-block' }}>
        {renderDisplay ? renderDisplay() : (options.find(o => o.value === value)?.label ?? value)}
      </span>
    </EditableHover>
  );
}

// One row in "Details" — label on top, editable value below, both left-aligned.
// Long values wrap rather than truncate so everything is always legible.
function EditableField({ label, type, value, options, onSave, suffix, display }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select?.(); }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    let next = draft;
    if (type === 'number') {
      next = +draft;
      if (isNaN(next)) return;
    }
    if (next !== value) onSave?.(next);
  };
  const cancel = () => { setEditing(false); setDraft(value); };

  let editor = null;
  const baseInputStyle = {
    height: 28, width: '100%', padding: '0 8px',
    border: '1px solid var(--img-orange)', borderRadius: 6,
    fontSize: 12, color: 'var(--fg-primary)', background: 'var(--bg-surface)',
    boxShadow: 'var(--shadow-focus)', outline: 'none', fontFamily: 'inherit',
    textAlign: 'left',
  };
  if (editing) {
    if (type === 'select') {
      editor = (
        <select ref={ref} defaultValue={value}
          onChange={e => { onSave?.(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          style={baseInputStyle}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    } else if (type === 'date') {
      editor = (
        <input ref={ref} type="date" value={draft || ''}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Enter') commit(); }}
          style={baseInputStyle} />
      );
    } else if (type === 'number') {
      editor = (
        <input ref={ref} type="number" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Enter') commit(); }}
          style={baseInputStyle} />
      );
    } else {
      editor = (
        <input ref={ref} type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Enter') commit(); }}
          style={baseInputStyle} />
      );
    }
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '110px 1fr',
      alignItems: 'baseline', columnGap: 12, rowGap: 2,
      padding: '8px 0', fontSize: 12,
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{
        color: 'var(--fg-secondary)', fontWeight: 500,
        paddingTop: editing ? 6 : 2,
      }}>{label}</span>
      {editing ? (
        <div style={{ minWidth: 0 }}>{editor}</div>
      ) : (
        <EditableHover hint="Click to edit" block>
          <button onClick={() => setEditing(true)} style={{
            background: 'transparent', border: 'none', cursor: 'text',
            padding: '2px 6px', borderRadius: 4, margin: '-2px -6px',
            color: 'var(--fg-primary)', fontWeight: 500, fontSize: 12,
            textAlign: 'left', width: '100%',
            wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45,
            display: 'block',
          }}>
            {display ?? (value !== '' && value != null
              ? value
              : <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>—</span>)}
            {value != null && suffix}
          </button>
        </EditableHover>
      )}
    </div>
  );
}

// Hover wrapper — shows a subtle dotted underline + tooltip on hover, signalling editability.
function EditableHover({ children, hint, align, block }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', display: block ? 'block' : 'inline-block',
        background: hover ? 'var(--img-orange-50)' : 'transparent',
        borderRadius: 5, transition: 'background 100ms',
      }}
    >
      {children}
      {hover && hint && (
        <span style={{
          position: 'absolute',
          top: '100%', marginTop: 4,
          [align === 'right' ? 'right' : 'left']: 0,
          background: 'var(--neutral-900)', color: '#fff',
          fontSize: 10, fontWeight: 500, padding: '3px 6px', borderRadius: 4,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 30,
        }}>{hint}</span>
      )}
    </span>
  );
}

const iconBtn = {
  width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)', color: 'var(--fg-secondary)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

// Collapsible "Design request details" — renders the full saved form via
// window.DesignRequestSummary (defined in scripts/20-design-request-form.jsx).
function DesignFormDetails({ request }) {
  const [open, setOpen] = React.useState(false);
  const formType = request.form_data?.form_type;
  const Summary = window.DesignRequestSummary;
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 12px', border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-primary)' }}>Design request form</span>
          {formType && (
            <span style={{
              padding: '1px 7px', borderRadius: 999,
              background: 'var(--neutral-100)', color: 'var(--fg-secondary)',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>{formType}</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>· V{request.version} · {request.requested_by_name}</span>
        </div>
        <span style={{
          fontSize: 14, color: 'var(--fg-tertiary)',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 160ms',
        }}>›</span>
      </button>
      {open && (
        <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)', background: 'var(--neutral-25)' }}>
          {Summary
            ? <Summary form={request.form_data} />
            : <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>Form summary component not loaded.</div>}
        </div>
      )}
    </div>
  );
}

// Inline discount editor — lives inside the green "Quotation Ready" card.
// • Global % field (debounced save).
// • Effective % derived from line totals (handles mixed per-item discounts).
// • Expandable per-item table with per-line discount inputs.
// • Confirm modal when global changes and per-item overrides exist.
function DiscountEditor({ quote, releasedRequestId, onSaved }) {
  const { useState, useMemo } = React;
  const [globalPct,  setGlobalPct]  = useState(Math.round((quote.discount_pct_global || 0) * 100 * 100) / 100);
  const [lines,      setLines]      = useState(() => (quote.line_items || []).map(li => ({
    ...li, _pct: Math.round((li.discount_pct || 0) * 100 * 100) / 100,
  })));
  const [open,       setOpen]       = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);
  const [confirm,    setConfirm]    = useState(null);  // { newGlobal, customCount }

  // Recompute lines from the latest quote on every prop change so a refetched
  // quote redraws here too.
  React.useEffect(() => {
    setGlobalPct(Math.round((quote.discount_pct_global || 0) * 100 * 100) / 100);
    setLines((quote.line_items || []).map(li => ({
      ...li, _pct: Math.round((li.discount_pct || 0) * 100 * 100) / 100,
    })));
  }, [quote]);

  const grossList = useMemo(() => lines.reduce((s, li) => s + ((+li.qty || 0) * (+li.list_price || 0)), 0), [lines]);
  const total     = useMemo(() => lines.reduce((s, li) => s + (+li.subtotal || 0), 0), [lines]);
  const effective = grossList > 0 ? (1 - total / grossList) : 0;

  const priorGlobal = Number(quote.discount_pct_global) || 0;
  const customCount = lines.filter(li => Math.abs((+li.discount_pct || 0) - priorGlobal) > 0.0005).length;

  const patchDiscount = async (body) => {
    setSaving(true); setError(null);
    try {
      const r = await window.api.patch(`/quotation-versions/${quote.id}/discount`, body);
      // Update local lines immediately so the user sees feedback before the parent refetch lands.
      if (Array.isArray(r.line_items)) {
        setLines(curr => curr.map(li => {
          const u = r.line_items.find(x => x.id === li.id);
          return u ? { ...li, discount_pct: u.discount_pct, unit_price: u.unit_price, subtotal: u.subtotal, _pct: Math.round(u.discount_pct * 100 * 100) / 100 } : li;
        }));
      }
      if (r.discount_pct_global != null) setGlobalPct(Math.round(r.discount_pct_global * 100 * 100) / 100);
      onSaved?.();
    } catch (e) {
      if (e?.data?.over_cap) {
        const lines = e.data.over_cap.map(o => `${o.model} → ${(o.requested_pct * 100).toFixed(1)}%`).join('; ');
        setError(`${e.data.error} Over cap: ${lines}`);
      } else {
        setError(e?.message || 'Save failed.');
      }
    } finally { setSaving(false); }
  };

  const onGlobalCommit = () => {
    const v = Math.max(0, Math.min(30, Number(globalPct) || 0)) / 100;
    if (Math.abs(v - priorGlobal) < 0.0005) return;  // no change
    if (customCount > 0) {
      setConfirm({ newGlobal: v, customCount });
    } else {
      patchDiscount({ global_pct: v, mode: 'overwrite_all' });
    }
  };

  const applyChoice = (mode) => {
    const v = confirm.newGlobal;
    setConfirm(null);
    patchDiscount({ global_pct: v, mode });
  };

  const saveLine = (lineId, pct) => {
    const v = Math.max(0, Math.min(30, Number(pct) || 0)) / 100;
    patchDiscount({ line_discounts: { [lineId]: v } });
  };

  const inputStyle = {
    width: 64, height: 26, padding: '0 6px', borderRadius: 6,
    border: '1px solid var(--border-default)', fontSize: 12, fontFamily: 'inherit',
    textAlign: 'right', background: '#fff',
  };

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', background: '#fff', borderRadius: 7, border: '1px solid var(--img-green-200, #B7E1C4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Discount</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--fg-primary)' }}>
          Global
          <input type="number" min={0} max={30} step={0.5}
            value={globalPct}
            onChange={e => setGlobalPct(e.target.value)}
            onBlur={onGlobalCommit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            disabled={saving}
            style={inputStyle}
            title="Internal global discount %. Max 30%." />
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>%</span>
        </label>
        <span title="Weighted across all items — what the customer effectively pays."
          style={{ fontSize: 11.5, color: 'var(--fg-secondary)' }}>
          Effective: <b style={{ color: 'var(--fg-primary)' }}>{(effective * 100).toFixed(1)}%</b>
        </span>
        <span style={{ flex: 1 }}></span>
        <button onClick={() => setOpen(true)}
          style={{
            padding: '4px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600,
            background: 'var(--bg-surface)', color: 'var(--fg-primary)',
            border: '1px solid var(--border-default)', cursor: 'pointer',
          }}>
          Edit per-item ({lines.length})
        </button>
      </div>

      {customCount > 0 && (
        <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--img-orange-700, #B8680E)' }}>
          {customCount} item{customCount === 1 ? '' : 's'} have custom discount overrides.
        </div>
      )}

      {error && (
        <div style={{ marginTop: 6, padding: 6, fontSize: 11, color: '#B0241D', background: '#FDECEC', border: '1px solid #F5B6B1', borderRadius: 5 }}>
          {error}
        </div>
      )}

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(40,38,36,0.45)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-surface)', borderRadius: 10, padding: 20,
            width: 'min(720px, 92vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: 'var(--shadow-xl)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Per-item discounts</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)', marginTop: 2 }}>
                  Global {globalPct}% · Effective {(effective * 100).toFixed(1)}% · {lines.length} items
                </div>
              </div>
              <button onClick={() => setOpen(false)} title="Close"
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 14 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 7 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 50px 80px 78px 100px',
                gap: 8, padding: '8px 12px', background: 'var(--neutral-25)',
                fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, zIndex: 1,
              }}>
                <span>Item</span>
                <span style={{ textAlign: 'right' }}>Qty</span>
                <span style={{ textAlign: 'right' }}>List</span>
                <span style={{ textAlign: 'right' }}>%</span>
                <span style={{ textAlign: 'right' }}>Subtotal</span>
              </div>
              {lines.map(li => (
                <div key={li.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 50px 80px 78px 100px',
                  gap: 8, padding: '8px 12px', alignItems: 'center', fontSize: 12,
                  borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t-mono" style={{ fontWeight: 600, overflowWrap: 'anywhere', lineHeight: 1.3 }} title={li.model}>{li.model}</div>
                    {li.description && (
                      <div style={{ fontSize: 10.5, color: 'var(--fg-secondary)', marginTop: 2, lineHeight: 1.35, whiteSpace: 'normal', overflowWrap: 'anywhere' }} title={li.description}>{li.description}</div>
                    )}
                  </div>
                  <span className="t-num" style={{ textAlign: 'right', color: 'var(--fg-secondary)' }}>{li.qty}</span>
                  <span className="t-num" style={{ textAlign: 'right', color: 'var(--fg-secondary)' }}>{(+li.list_price || 0).toLocaleString()}</span>
                  <input type="number" min={0} max={30} step={0.5}
                    value={li._pct}
                    onChange={e => setLines(curr => curr.map(x => x.id === li.id ? { ...x, _pct: e.target.value } : x))}
                    onBlur={e => saveLine(li.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    disabled={saving}
                    style={{ ...inputStyle, width: '100%' }} />
                  <span className="t-num" style={{ textAlign: 'right', fontWeight: 600 }}>{(+li.subtotal || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                Total: <span className="t-num">{window.formatJOD ? window.formatJOD(total) : `JOD ${total.toLocaleString()}`}</span>
              </span>
              <button onClick={() => setOpen(false)} style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 700,
                background: 'var(--img-orange)', color: '#fff', border: '1px solid var(--img-orange)', cursor: 'pointer',
              }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div onClick={() => setConfirm(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(40,38,36,0.45)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-surface)', borderRadius: 10, padding: 18, width: 380,
            boxShadow: 'var(--shadow-xl)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
              {confirm.customCount} item{confirm.customCount === 1 ? '' : 's'} have custom discounts
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-secondary)', marginBottom: 14 }}>
              Apply the new global discount ({(confirm.newGlobal * 100).toFixed(1)}%) to all items, or keep your per-item overrides as they are?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirm(null)} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={() => applyChoice('overwrite_unmarked')} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'var(--bg-surface)', color: 'var(--img-orange-700, #B8680E)', border: '1px solid var(--img-orange)', cursor: 'pointer',
              }}>Keep custom items</button>
              <button onClick={() => applyChoice('overwrite_all')} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                background: 'var(--img-orange)', color: '#fff', border: '1px solid var(--img-orange)', cursor: 'pointer',
              }}>Apply to all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.DiscountEditor = DiscountEditor;
window.DealDetail = DealDetail;
// Exported so the Table view (10-table.jsx) can reuse the same inline editors.
window.EditableText   = EditableText;
window.EditableNumber = EditableNumber;
window.EditableSelect = EditableSelect;
window.EditableField  = EditableField;
