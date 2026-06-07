// Shared notes thread on a design request.
//   - Before a designer is assigned: salesman ↔ Sally (design_manager).
//   - After a designer is assigned : salesman ↔ assigned designer.
//   - Sally (design_manager) and admin always have full access.
//
// One component, three host surfaces:
//   - 18-design-board.jsx (Sally's drawer)
//   - 11-deal-detail.jsx  (salesman's deal view)
//   - 19-my-tasks.jsx     (designer's task drawer)
//
// Backend: GET/POST /api/design-requests/:id/comments (see routes/design.js).

(function () {
  const ROLE_BADGE = {
    admin:          { label: 'Admin',     bg: '#F2EAFB', fg: '#5B2F8C' },
    sales_manager:  { label: 'Sales Mgr', bg: 'var(--img-orange-50)', fg: 'var(--img-orange-700, #B8680E)' },
    salesman:       { label: 'Salesman',  bg: 'var(--stage-tender-bg)', fg: 'var(--stage-tender)' },
    design_manager: { label: 'Sally',     bg: 'var(--color-success-bg)', fg: 'var(--img-green-700)' },
    designer:       { label: 'Designer',  bg: 'var(--stage-analysis-bg)', fg: 'var(--stage-analysis)' },
  };

  function fmt(ts) {
    try {
      const d = new Date(ts + (ts.endsWith && ts.endsWith('Z') ? '' : 'Z'));
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (sameDay) return `Today ${t}`;
      return `${d.toLocaleDateString()} ${t}`;
    } catch { return ts; }
  }

  // currentUserRole comes from window.CURRENT_USER (label like 'Design Manager').
  // We map the label back to the snake_case role used in author_role.
  function currentRoleKey() {
    const r = window.CURRENT_USER?.role || '';
    const map = {
      'Admin': 'admin', 'Sales Manager': 'sales_manager', 'Salesman': 'salesman',
      'Design Manager': 'design_manager', 'Designer': 'designer',
    };
    return map[r] || r.toLowerCase().replace(/\s+/g, '_');
  }

  function bannerText(request) {
    const role = currentRoleKey();
    const designer = request?.assignment?.designer;
    if (role === 'salesman' || role === 'sales_manager') {
      return designer ? `Conversation with ${designer}` : 'Conversation with Sally (design manager)';
    }
    if (role === 'design_manager' || role === 'admin') {
      return designer ? `Salesman ↔ ${designer} (you can also post)` : 'Salesman ↔ Sally';
    }
    if (role === 'designer') return 'Conversation with the salesman';
    return 'Notes thread';
  }

  function DesignRequestThread({ request }) {
    const requestId = request?.id;
    const [comments, setComments] = React.useState([]);
    const [draft, setDraft] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [posting, setPosting] = React.useState(false);
    const listRef = React.useRef(null);

    const role = currentRoleKey();
    const myId = window.CURRENT_USER?.dbId;
    // Designers who aren't on this task can read but not post — backend will 403 anyway.
    const designerOnTask = request?.assignment?.designerId === myId;
    const canPost = role === 'admin' || role === 'design_manager' || role === 'sales_manager'
                 || role === 'salesman' || (role === 'designer' && designerOnTask);

    const [history, setHistory] = React.useState([]);  // prior requests (excluding current)

    const load = React.useCallback(async () => {
      if (!requestId) return;
      try {
        setLoading(true);
        // /history returns the full chain (oldest first), with comments on each
        // entry. The last entry is the current request — split it out so the
        // input box still posts to it.
        const chain = await window.api.get(`/design-requests/${requestId}/history`);
        if (Array.isArray(chain) && chain.length) {
          const last = chain[chain.length - 1];
          setComments(last.comments || []);
          setHistory(chain.slice(0, -1));
        } else {
          const rows = await window.api.get(`/design-requests/${requestId}/comments`);
          setComments(Array.isArray(rows) ? rows : []);
          setHistory([]);
        }
        setError(null);
      } catch (e) {
        setError(e.message || 'Could not load thread.');
      } finally {
        setLoading(false);
      }
    }, [requestId]);

    React.useEffect(() => { load(); }, [load]);

    // Scroll to bottom whenever new comments arrive.
    React.useEffect(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [comments.length]);

    const send = async () => {
      const msg = draft.trim();
      if (!msg || posting) return;
      setPosting(true);
      try {
        const row = await window.api.post(`/design-requests/${requestId}/comments`, { message: msg });
        setComments(prev => [...prev, row]);
        setDraft('');
      } catch (e) {
        setError(e.message || 'Could not send.');
      } finally {
        setPosting(false);
      }
    };

    const canDelete = (c) => !c.deleted_at && (
      c.author_id === myId || role === 'design_manager' || role === 'admin'
    );

    const deleteMsg = async (c) => {
      if (!canDelete(c)) return;
      if (!window.confirm('Delete this message? It will be marked as deleted but the slot stays in the thread.')) return;
      try {
        await window.api.del(`/design-request-comments/${c.id}`);
        await load();
      } catch (e) {
        setError(e.message || 'Could not delete.');
      }
    };

    function Tombstone({ c }) {
      return (
        <div style={{
          padding: '6px 9px', borderRadius: 6, fontSize: 11.5,
          background: 'var(--neutral-50)', border: '1px dashed var(--border-default)',
          color: 'var(--fg-tertiary)', fontStyle: 'italic',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>🗑 message deleted by <b style={{ fontStyle: 'normal' }}>{c.deleted_by_name || 'someone'}</b>{c.deleted_at ? ` on ${fmt(c.deleted_at)}` : ''}</div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          fontSize: 11.5, color: 'var(--fg-secondary)',
          padding: '6px 10px', background: 'var(--neutral-25)',
          border: '1px solid var(--border-subtle)', borderRadius: 6,
        }}>{bannerText(request)}</div>

        <div ref={listRef} style={{
          maxHeight: 320, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: 2,
        }}>
          {loading && <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>Loading…</div>}

          {history.map(h => (
            <div key={h.id} style={{
              padding: '6px 8px', borderLeft: '2px solid var(--neutral-200)',
              background: 'var(--neutral-25)', borderRadius: '0 6px 6px 0',
              fontSize: 11, color: 'var(--fg-secondary)',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--fg-secondary)', marginBottom: 4 }}>
                Previous · V{h.version} · {h.request_type} · {h.design_stage}
                {h.modification_reason && ` · Reason: ${h.modification_reason}`}
                {h.returned_reason && ` · Returned: ${h.returned_reason}`}
              </div>
              {(h.comments || []).length === 0 ? (
                <div style={{ fontStyle: 'italic', color: 'var(--fg-tertiary)' }}>No messages on this version.</div>
              ) : (h.comments || []).map(c => {
                const badge = ROLE_BADGE[c.author_role] || ROLE_BADGE.salesman;
                const deleted = !!c.deleted_at;
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '2px 0', opacity: deleted ? 0.7 : 1 }}>
                    <span style={{ fontWeight: 600, color: 'var(--fg-primary)' }}>{c.author_name}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999,
                      background: badge.bg, color: badge.fg, textTransform: 'uppercase',
                    }}>{badge.label}</span>
                    {deleted ? (
                      <span style={{ flex: 1, fontStyle: 'italic', color: 'var(--fg-tertiary)' }}>
                        🗑 deleted by {c.deleted_by_name || 'someone'}{c.deleted_at ? ` · ${fmt(c.deleted_at)}` : ''}
                      </span>
                    ) : (
                      <>
                        <span style={{ flex: 1 }}>{c.message}</span>
                        {canDelete(c) && (
                          <button onClick={() => deleteMsg(c)} title="Delete this message" style={{
                            border: 'none', background: 'transparent', color: 'var(--fg-tertiary)',
                            cursor: 'pointer', fontSize: 13, padding: '0 4px',
                          }}>×</button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {!loading && comments.length === 0 && history.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No messages yet. Start the conversation below.</div>
          )}
          {comments.map(c => {
            const mine = c.author_id === myId;
            const badge = ROLE_BADGE[c.author_role] || ROLE_BADGE.salesman;
            const deleted = !!c.deleted_at;
            return (
              <div key={c.id} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                opacity: deleted ? 0.75 : 1,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center',
                  justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg-primary)' }}>
                    {c.author_name || 'Unknown'}
                  </span>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                    background: badge.bg, color: badge.fg,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{badge.label}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--fg-tertiary)' }}>{fmt(c.created_at)}</span>
                  {canDelete(c) && (
                    <button onClick={() => deleteMsg(c)} title="Delete this message" style={{
                      border: 'none', background: 'transparent', color: 'var(--fg-tertiary)',
                      cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px',
                    }}>×</button>
                  )}
                </div>
                {deleted ? <Tombstone c={c} /> : (
                  <div style={{
                    padding: '8px 10px', borderRadius: 8,
                    background: mine ? 'var(--img-orange-50)' : 'var(--neutral-50)',
                    border: `1px solid ${mine ? 'var(--img-orange)' : 'var(--border-subtle)'}`,
                    fontSize: 12.5, color: 'var(--fg-primary)', lineHeight: 1.45,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>{c.message}</div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ fontSize: 11.5, color: '#B0241D', padding: '4px 8px',
            background: 'var(--color-danger-bg)', borderRadius: 5 }}>{error}</div>
        )}

        {canPost ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
              }}
              placeholder="Write a note… (Ctrl/⌘+Enter to send)"
              rows={2}
              style={{
                flex: 1, padding: 9, fontSize: 12.5, fontFamily: 'inherit',
                border: '1px solid var(--border-default)', borderRadius: 6,
                resize: 'vertical', minHeight: 44, background: 'var(--bg-surface)',
                color: 'var(--fg-primary)',
              }}
            />
            <button onClick={send} disabled={!draft.trim() || posting} style={{
              padding: '8px 14px', borderRadius: 6, border: 'none',
              background: !draft.trim() || posting ? 'var(--neutral-200)' : 'var(--img-orange)',
              color: '#fff', fontWeight: 600, fontSize: 12.5,
              cursor: !draft.trim() || posting ? 'default' : 'pointer',
            }}>{posting ? 'Sending…' : 'Send'}</button>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>
            Read-only — you're not on this thread.
          </div>
        )}
      </div>
    );
  }

  window.DesignRequestThread = DesignRequestThread;
})();
