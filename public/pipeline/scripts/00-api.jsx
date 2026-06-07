// IMG CRM API client — bridges the design's data shape to the SQLite backend.
// Loaded BEFORE the design scripts so window.IMG_API is available everywhere.

(function () {
  const TOKEN_KEY = 'img_token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
  }

  // Decode the JWT payload (base64url) so we can show the logged-in user
  // in the sidebar/user menu without an extra API roundtrip.
  function decodeJwt(token) {
    if (!token) return null;
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = part + '==='.slice(0, (4 - (part.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch { return null; }
  }

  async function apiFetch(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
    if (res.status === 401) {
      window.location.href = '/index.html';
      return Promise.reject(new Error('Unauthorized'));
    }
    if (res.status === 204) return null;
    if (!res.ok) {
      let msg = 'API ' + res.status;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    if (res.status === 200) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return res.json();
    }
    return null;
  }

  // Probability per stage when DB doesn't carry one.
  const STAGE_PROBABILITY = {
    prospect: 15, tender: 35, analysis: 55, negotiation: 75, closing: 90, won: 100, lost: 0,
  };

  function mapStage(opp) {
    if (opp.status === 'Won')  return 'won';
    if (opp.status === 'Lost') return 'lost';
    return (opp.stage || 'Prospect').toLowerCase();
  }

  function ageInDays(iso) {
    if (!iso) return 0;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  function toDeal(opp) {
    const stage = mapStage(opp);
    return {
      id:          'D-' + String(opp.id).padStart(4, '0'),
      _dbId:       opp.id,
      _salesmanId: opp.salesman_id || null,
      name:        opp.title || '(untitled)',
      account:     opp.org_name || opp.contractor || opp.eng_office || '—',
      value:       Number(opp.expected_value) || 0,
      stage,
      owner:       opp.salesman_name || 'Unassigned',
      probability: STAGE_PROBABILITY[stage] ?? 0,
      scope:       opp.product_group || '—',
      closeDate:   opp.close_date || null,
      age:         ageInDays(opp.updated_at || opp.created_at),
      _status:     opp.status,
      _lostReason: opp.lost_reason_label,
      _notes:      opp.notes || '',
    };
  }

  // Capitalize the lowercase design stage back to DB shape.
  function toDbStage(designStage) {
    if (!designStage) return 'Prospect';
    return designStage.charAt(0).toUpperCase() + designStage.slice(1);
  }

  // Convert a NewDealModal payload into POST /api/opportunities body
  function dealFormToApi(form, usersByName) {
    const owner = usersByName[form.owner];
    return {
      title:          form.name,
      contractor:     form.account || null,
      product_group:  form.scope || null,
      expected_value: Number(form.value) || 0,
      currency:      'JOD',
      close_date:     form.closeDate || null,
      salesman_id:    owner ? owner.id : undefined,
      notes:          form.notes || null,
    };
  }

  // Convert a DealDetail patch into PUT body. The detail panel sends keys
  // matching the design shape (name/account/value/scope/closeDate/probability),
  // so we map them back to DB columns.
  function patchToApi(patch) {
    const out = {};
    if ('name'      in patch) out.title          = patch.name;
    if ('account'   in patch) out.contractor     = patch.account;
    if ('value'     in patch) out.expected_value = Number(patch.value) || 0;
    if ('scope'     in patch) out.product_group  = patch.scope;
    if ('closeDate' in patch) out.close_date     = patch.closeDate || null;
    if ('notes'     in patch) out.notes          = patch.notes;
    return out;
  }

  window.IMG_API = {
    getToken,
    authHeaders,
    apiFetch,
    toDeal,
    toDbStage,
    dealFormToApi,
    patchToApi,
    STAGE_PROBABILITY,

    me() {
      return decodeJwt(getToken());
    },

    async loadDeals() {
      const opps = await apiFetch('/api/opportunities');
      return opps.map(toDeal);
    },

    async loadDeal(dbId) {
      const opp = await apiFetch('/api/opportunities/' + dbId);
      return toDeal(opp);
    },

    async createDeal(form, usersByName) {
      const body = dealFormToApi(form, usersByName || {});
      const created = await apiFetch('/api/opportunities', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      // Re-fetch enriched record so we get joined names back
      return await this.loadDeal(created.id);
    },

    async updateDeal(dbId, patch) {
      const body = patchToApi(patch);
      // PUT requires a full payload — fetch existing first, merge, send all.
      const existing = await apiFetch('/api/opportunities/' + dbId);
      const merged = { ...existing, ...body };
      await apiFetch('/api/opportunities/' + dbId, {
        method: 'PUT',
        body: JSON.stringify(merged),
      });
      return await this.loadDeal(dbId);
    },

    async changeStage(dbId, designStage) {
      return apiFetch(`/api/opportunities/${dbId}/stage`, {
        method: 'POST',
        body: JSON.stringify({ to_stage: toDbStage(designStage) }),
      });
    },

    async closeDeal(dbId, outcome, lostReasonId, lostNotes) {
      // outcome: 'Won' | 'Lost'
      const body = { outcome };
      if (outcome === 'Lost') {
        body.lost_reason_id = lostReasonId;
        body.lost_notes = lostNotes || null;
      }
      return apiFetch(`/api/opportunities/${dbId}/close`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    async deleteDeal(dbId) {
      return apiFetch(`/api/opportunities/${dbId}`, { method: 'DELETE' });
    },

    async assignSalesman(dbId, salesmanId) {
      return apiFetch(`/api/opportunities/${dbId}/assign-salesman`, {
        method: 'POST',
        body: JSON.stringify({ salesman_id: salesmanId }),
      });
    },

    async loadUsers() {
      return apiFetch('/api/opportunities/meta/users');
    },

    async loadLostReasons() {
      return apiFetch('/api/opportunities/meta/lost-reasons');
    },

    async loadNotifications() {
      return apiFetch('/api/notifications');
    },

    async markAllNotificationsRead() {
      return apiFetch('/api/notifications/read-all', { method: 'PUT' });
    },

    async markNotificationRead(id) {
      return apiFetch('/api/notifications/' + id + '/read', { method: 'PUT' });
    },

    signOut() {
      try { localStorage.removeItem(TOKEN_KEY); } catch {}
      window.location.href = '/index.html';
    },
  };
})();
