// User & permission administration — the "Users" and "Roles & Permissions" tabs
// of the admin Settings page. Permissions in this CRM are ROLE-BASED: a user's
// abilities come from their role, so "permissions per user" = pick the user's
// role (Users tab) + tune what each role can do (Roles & Permissions tab).
//
// Backend: GET/POST/PUT/DELETE /api/users, GET /api/roles, PUT /api/roles/:id/permissions.
// Exposes window.UsersTab and window.RolesTab; SettingsApp mounts them as tabs.

const UA_ROLE_LABELS = {
  admin: 'Admin', sales_manager: 'Sales Manager', salesman: 'Salesman',
  design_manager: 'Design Manager', designer: 'Designer', product_manager: 'Product Manager',
};
const uaRoleLabel = (name) => UA_ROLE_LABELS[name] || name;

// A soft coloured badge for a role name.
function UaRoleBadge({ role }) {
  const tone = role === 'admin'
    ? { bg: 'var(--img-orange-50)', bd: 'var(--img-orange-100)', fg: 'var(--img-orange-700)' }
    : { bg: 'var(--bg-sunken)', bd: 'var(--border-subtle)', fg: 'var(--fg-secondary)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--radius-full)',
      background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg,
      fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
    }}>{uaRoleLabel(role)}</span>
  );
}

// ============================================================
// USERS TAB
// ============================================================
function UsersTab({ onToast }) {
  const { useState, useEffect, useMemo } = React;
  const { Plus, Search } = window.Icons;

  const [users, setUsers]     = useState(null);
  const [roles, setRoles]     = useState([]);
  const [query, setQuery]     = useState('');
  const [modal, setModal]     = useState(null);   // { mode:'add'|'edit', user }
  const [confirm, setConfirm] = useState(null);   // { user, action:'deactivate'|'activate'|'delete' }

  const load = () => {
    window.api.get('/users').then(setUsers).catch(() => setUsers([]));
  };
  useEffect(() => {
    load();
    window.api.get('/roles').then(d => setRoles(d.roles || [])).catch(() => {});
  }, []);

  const currentUserId = (window.CURRENT_USER && window.CURRENT_USER.dbId) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users || [];
    if (!q) return list;
    return list.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      uaRoleLabel(u.role).toLowerCase().includes(q));
  }, [users, query]);

  const runConfirm = async () => {
    if (!confirm) return;
    const { user, action } = confirm;
    try {
      if (action === 'delete') {
        const r = await window.api.del('/users/' + user.id);
        onToast?.(r.deleted ? `Deleted ${user.name}` : `${user.name} has history — deactivated instead`, 'success');
      } else {
        // Activate / deactivate via a full PUT (endpoint updates all fields).
        await window.api.put('/users/' + user.id, {
          name: user.name, email: user.email, role_id: user.role_id,
          is_active: action === 'activate' ? 1 : 0,
        });
        onToast?.(action === 'activate' ? `Activated ${user.name}` : `Deactivated ${user.name}`, 'success');
      }
      setConfirm(null);
      load();
    } catch (e) {
      onToast?.(e?.message || 'Action failed', 'danger');
      setConfirm(null);
    }
  };

  const cell = { padding: '10px 14px', fontSize: 13, color: 'var(--fg-primary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', verticalAlign: 'middle' };
  const head = { padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', borderBottom: '1px solid var(--border-default)', textAlign: 'left', whiteSpace: 'nowrap' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
            People who can sign in to the CRM. A user’s permissions come from their role — change the role to change what they can do.
          </div>
        </div>
        <window.PopupShell.Btn kind="primary" icon={Plus} onClick={() => setModal({ mode: 'add' })}>Add user</window.PopupShell.Btn>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12, maxWidth: 300 }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-tertiary)', display: 'inline-flex' }}><Search size={15} /></span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search users…"
          style={{ height: 34, width: '100%', padding: '0 12px 0 32px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', fontSize: 13, color: 'var(--fg-primary)', outline: 'none' }}
          onFocus={e => { e.target.style.borderColor = 'var(--border-focus)'; e.target.style.boxShadow = 'var(--shadow-focus)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; }} />
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={head}>User</th>
              <th style={head}>Email</th>
              <th style={head}>Role</th>
              <th style={head}>Status</th>
              <th style={{ ...head, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users == null ? (
              <tr><td colSpan={5} style={{ ...cell, textAlign: 'center', color: 'var(--fg-tertiary)' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ ...cell, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No users found.</td></tr>
            ) : filtered.map(u => {
              const isSelf = currentUserId && String(u.id) === String(currentUserId);
              return (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.6 }}>
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <window.Avatar name={u.name} size={28} />
                      <span style={{ fontWeight: 600 }}>{u.name}{isSelf && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--fg-tertiary)' }}>(you)</span>}</span>
                    </div>
                  </td>
                  <td style={{ ...cell, color: 'var(--fg-secondary)' }}>{u.email}</td>
                  <td style={cell}><UaRoleBadge role={u.role} /></td>
                  <td style={cell}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: u.is_active ? 'var(--color-success)' : 'var(--fg-tertiary)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: u.is_active ? 'var(--color-success)' : 'var(--neutral-300)' }}></span>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                      <UaTextButton onClick={() => setModal({ mode: 'edit', user: u })}>Edit</UaTextButton>
                      {u.is_active ? (
                        <UaTextButton danger disabled={isSelf} title={isSelf ? "You can't deactivate yourself" : undefined}
                          onClick={() => !isSelf && setConfirm({ user: u, action: 'deactivate' })}>Deactivate</UaTextButton>
                      ) : (
                        <UaTextButton onClick={() => setConfirm({ user: u, action: 'activate' })}>Activate</UaTextButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserModal mode={modal.mode} user={modal.user} roles={roles}
          onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); load(); onToast?.(msg, 'success'); }}
          onError={(msg) => onToast?.(msg, 'danger')}
          onDelete={(u) => { setModal(null); setConfirm({ user: u, action: 'delete' }); }} />
      )}

      {confirm && (
        <UaConfirm
          title={confirm.action === 'delete' ? 'Delete user permanently?'
               : confirm.action === 'activate' ? 'Activate user?' : 'Deactivate user?'}
          body={confirm.action === 'delete'
                ? `This permanently removes ${confirm.user.name}. If they have deals or activity on record, they’ll be deactivated instead so history stays intact.`
              : confirm.action === 'activate'
                ? `${confirm.user.name} will be able to sign in and use the CRM again.`
                : `${confirm.user.name} will lose access immediately. You can re-activate them any time — nothing they created is deleted.`}
          confirmLabel={confirm.action === 'delete' ? 'Delete permanently' : confirm.action === 'activate' ? 'Activate' : 'Deactivate'}
          danger={confirm.action !== 'activate'}
          onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
      )}
    </div>
  );
}

function UaTextButton({ children, onClick, danger, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)', color: disabled ? 'var(--fg-disabled)' : danger ? 'var(--color-danger)' : 'var(--fg-primary)',
      fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = danger ? 'var(--color-danger-bg)' : 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; }}>
      {children}
    </button>
  );
}

// Add / edit user modal.
function UserModal({ mode, user, roles, onClose, onSaved, onError, onDelete }) {
  const { useState } = React;
  const { Field, TextInput, Select, Btn } = window.PopupShell;
  const isEdit = mode === 'edit';

  const [name, setName]   = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [roleId, setRoleId] = useState(user?.role_id || (roles[0] && roles[0].id) || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave = name.trim() && emailOk && roleId && (isEdit || password.trim().length >= 4);

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEdit) {
        const body = { name: name.trim(), email: email.trim(), role_id: Number(roleId), is_active: user.is_active };
        if (password.trim()) body.password = password.trim();
        await window.api.put('/users/' + user.id, body);
        onSaved(`Updated ${name.trim()}`);
      } else {
        await window.api.post('/users', { name: name.trim(), email: email.trim(), password: password.trim(), role_id: Number(roleId) });
        onSaved(`Added ${name.trim()}`);
      }
    } catch (e) {
      onError?.(e?.message || 'Could not save user');
      setSaving(false);
    }
  };

  const roleOptions = roles.map(r => ({ value: r.id, label: uaRoleLabel(r.name) }));

  return (
    <window.PopupShell.ModalShell
      title={isEdit ? 'Edit user' : 'Add user'}
      subtitle={isEdit ? user.email : 'Create a new CRM account'}
      width={460}
      onClose={onClose}
      footer={<>
        {isEdit && <div style={{ flex: 1, display: 'flex' }}>
          <Btn kind="ghost" onClick={() => onDelete(user)}><span style={{ color: 'var(--color-danger)' }}>Delete…</span></Btn>
        </div>}
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!canSave || saving} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add user'}</Btn>
      </>}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Full name" required>
          <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sara Haddad" />
        </Field>
        <Field label="Email" required hint={!email || emailOk ? undefined : 'Enter a valid email address.'}>
          <TextInput value={email} onChange={e => setEmail(e.target.value)} placeholder="name@img.com" type="email" />
        </Field>
        <Field label="Role" required hint="Determines what this person can see and do.">
          <Select value={roleId} onChange={e => setRoleId(e.target.value)} options={roleOptions} />
        </Field>
        <Field label={isEdit ? 'Reset password' : 'Password'} required={!isEdit}
          hint={isEdit ? 'Leave blank to keep the current password.' : 'At least 4 characters.'}>
          <TextInput value={password} onChange={e => setPassword(e.target.value)} placeholder={isEdit ? '••••••••' : 'Set a password'} type="text" autoComplete="new-password" />
        </Field>
      </div>
    </window.PopupShell.ModalShell>
  );
}

// Small confirm dialog.
function UaConfirm({ title, body, confirmLabel, danger, onCancel, onConfirm }) {
  const { Btn } = window.PopupShell;
  const [busy, setBusy] = React.useState(false);
  const go = async () => { setBusy(true); await onConfirm(); };
  return (
    <window.PopupShell.ModalShell title={title} width={420} onClose={onCancel}
      footer={<>
        <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn kind={danger ? 'danger' : 'primary'} disabled={busy} onClick={go}>{busy ? 'Working…' : confirmLabel}</Btn>
      </>}>
      <div style={{ padding: 20, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>{body}</div>
    </window.PopupShell.ModalShell>
  );
}

// ============================================================
// ROLES & PERMISSIONS TAB
// ============================================================
function RolesTab({ onToast }) {
  const { useState, useEffect, useMemo } = React;
  const { Check } = window.Icons;

  const [data, setData]         = useState(null);   // { roles, permissions, matrix }
  const [selectedRole, setSelectedRole] = useState(null);
  const [original, setOriginal] = useState(new Set());
  const [edited, setEdited]     = useState(new Set());
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    window.api.get('/roles').then(d => {
      setData(d);
      const first = (d.roles || [])[0];
      if (first) selectRole(first.id, d);
    }).catch(() => setData({ roles: [], permissions: [], matrix: [] }));
  }, []);

  const selectRole = (roleId, d = data) => {
    const set = new Set((d.matrix || []).filter(m => m.role_id === roleId).map(m => m.permission_id));
    setSelectedRole(roleId);
    setOriginal(new Set(set));
    setEdited(new Set(set));
  };

  const role = useMemo(() => (data?.roles || []).find(r => r.id === selectedRole), [data, selectedRole]);
  const isAdminRole = role?.name === 'admin';

  // Permissions grouped by category.
  const grouped = useMemo(() => {
    const g = {};
    (data?.permissions || []).forEach(p => { (g[p.category] = g[p.category] || []).push(p); });
    return g;
  }, [data]);

  const dirty = useMemo(() => {
    if (original.size !== edited.size) return true;
    for (const id of edited) if (!original.has(id)) return true;
    return false;
  }, [original, edited]);

  const toggle = (pid) => {
    if (isAdminRole) return;
    setEdited(prev => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  };
  const setCategory = (perms, on) => {
    if (isAdminRole) return;
    setEdited(prev => { const n = new Set(prev); perms.forEach(p => on ? n.add(p.id) : n.delete(p.id)); return n; });
  };

  const save = async () => {
    if (!dirty || saving || !selectedRole) return;
    setSaving(true);
    try {
      await window.api.put(`/roles/${selectedRole}/permissions`, { permissionIds: [...edited] });
      setOriginal(new Set(edited));
      onToast?.(`Saved ${uaRoleLabel(role.name)} permissions`, 'success');
    } catch (e) {
      onToast?.(e?.message || 'Could not save permissions', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-tertiary)' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 24px 120px' }}>
      <div style={{ fontSize: 12.5, color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: 18 }}>
        Choose a role, then tick the things people with that role are allowed to do. Everyone assigned to the role gets these permissions.
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Role list */}
        <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(data.roles || []).map(r => {
            const active = r.id === selectedRole;
            return (
              <button key={r.id} onClick={() => { if (dirty && !window.confirm('Discard unsaved permission changes?')) return; selectRole(r.id); }}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  border: '1px solid ' + (active ? 'var(--img-orange-100)' : 'transparent'),
                  background: active ? 'var(--img-orange-50)' : 'transparent',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--img-orange-700)' : 'var(--fg-primary)' }}>{uaRoleLabel(r.name)}</div>
                {r.description && <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2, lineHeight: 1.35 }}>{r.description}</div>}
              </button>
            );
          })}
        </div>

        {/* Permission grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isAdminRole && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--img-orange-50)', border: '1px solid var(--img-orange-100)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: 'var(--img-orange-700)' }}>
              <Check size={15} /> Admins always have full access — these permissions can’t be turned off.
            </div>
          )}
          {Object.keys(grouped).map(cat => {
            const perms = grouped[cat];
            const allOn = perms.every(p => edited.has(p.id) || isAdminRole);
            const someOn = perms.some(p => edited.has(p.id) || isAdminRole);
            return (
              <div key={cat} style={{ marginBottom: 18, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--neutral-25)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-secondary)', flex: 1 }}>{cat}</span>
                  {!isAdminRole && (
                    <button onClick={() => setCategory(perms, !allOn)} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg-link)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      {allOn ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>
                <div>
                  {perms.map(p => {
                    const on = isAdminRole || edited.has(p.id);
                    return (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderTop: '1px solid var(--border-subtle)', cursor: isAdminRole ? 'default' : 'pointer' }}>
                        <UaCheckbox checked={on} disabled={isAdminRole} onChange={() => toggle(p.id)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{p.description || p.key}</div>
                          <div className="t-mono" style={{ fontSize: 10.5, color: 'var(--fg-tertiary)' }}>{p.key}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dirty && !isAdminRole && (
        <div style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 0 20px' }}>
          <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--fg-primary)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '8px 8px 8px 18px', boxShadow: 'var(--shadow-lg)' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Unsaved changes to {uaRoleLabel(role.name)}</span>
            <button onClick={() => setEdited(new Set(original))} disabled={saving} style={{ height: 32, padding: '0 14px', borderRadius: 'var(--radius-full)', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Discard</button>
            <button onClick={save} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 16px', borderRadius: 'var(--radius-full)', border: 'none', background: 'var(--img-orange)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <Check size={15} /> {saving ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UaCheckbox({ checked, disabled, onChange }) {
  const { Check } = window.Icons;
  return (
    <span onClick={disabled ? undefined : onChange} style={{
      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
      border: '1.5px solid ' + (checked ? 'var(--img-orange)' : 'var(--border-strong)'),
      background: checked ? 'var(--img-orange)' : 'var(--bg-surface)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', cursor: disabled ? 'default' : 'pointer', opacity: disabled && !checked ? 0.5 : 1,
    }}>
      {checked && <Check size={12} />}
    </span>
  );
}

window.UsersTab = UsersTab;
window.RolesTab = RolesTab;
