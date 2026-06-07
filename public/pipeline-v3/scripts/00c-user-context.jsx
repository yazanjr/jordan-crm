// Shared real-user context. Loaded right after 00-api.js on every pipeline-v3
// page so the sidebar user-switcher and window.CURRENT_USER are consistent
// everywhere — switch user on any page, no login needed.
//
// Usage from a React app:
//   useEffect(() => { window.loadRealUsers().then(ok => ok && forceRerender()); }, []);

(function () {
  const ROLE_LABEL = {
    admin: 'Admin', sales_manager: 'Sales Manager', salesman: 'Salesman',
    design_manager: 'Design Manager', designer: 'Designer',
    product_manager: 'Product Manager',
  };
  // Bumped whenever the user roster is replaced (e.g. the Commercial Pipeline
  // import). Forces a one-time reset of any stale demo id in localStorage.
  const STORAGE_VERSION = 'v2-commercial-pipeline';

  let _promise = null;

  // Fetch the real user roster once, replace the demo globals, resolve CURRENT_USER.
  // Returns a promise that resolves to the mapped user array (or null on failure).
  window.loadRealUsers = function loadRealUsers() {
    if (_promise) return _promise;
    _promise = window.api.get('/opportunities/meta/users')
      .then(rows => {
        if (!Array.isArray(rows) || !rows.length) return null;
        const mapped = rows.map(u => ({
          id:     `U${String(u.id).padStart(3, '0')}`,
          dbId:   u.id,
          name:   u.name,
          role:   ROLE_LABEL[u.role] || u.role,
          roleKey: u.role,         // raw snake_case role for backend-aware UI gating
          isSenior: !!u.is_senior, // senior designers can be assigned as reviewers
          email:  '',
          active: true,
        }));
        window.USERS      = mapped;
        window.SALES_TEAM = mapped.filter(u => /Sales|Salesman/.test(u.role));
        window.SALESMEN   = mapped.filter(u => u.role === 'Salesman');

        // Resolve CURRENT_USER from localStorage. One-time migration: stale demo
        // ids (U003 = Yazan, etc.) no longer map to the same person, so on the
        // first load after the import we reset to Admin; the user can then pick
        // anyone from the sidebar switcher.
        let storedId = null;
        try {
          if (localStorage.getItem('imgUserIdVersion') !== STORAGE_VERSION) {
            localStorage.removeItem('imgCurrentUserId');
            localStorage.setItem('imgUserIdVersion', STORAGE_VERSION);
          }
          storedId = localStorage.getItem('imgCurrentUserId');
        } catch {}
        let current = mapped.find(u => u.id === storedId)
                   || mapped.find(u => String(u.dbId) === String(storedId));
        if (!current) {
          current = mapped.find(u => u.role === 'Admin') || mapped[0];
          try { localStorage.setItem('imgCurrentUserId', current.id); } catch {}
        }
        window.CURRENT_USER = current;

        // Keep findUserByFirstName working against the real roster.
        window.findUserByFirstName = (firstName) =>
          mapped.find(u => u.name.split(' ')[0].toLowerCase() === String(firstName || '').toLowerCase()) || null;

        console.log(`Users: loaded ${mapped.length} real users; current = ${current.name} (${current.role})`);
        return mapped;
      })
      .catch(err => {
        console.warn('Users: could not load real roster — sidebar may show demo names.', err);
        return null;
      });
    return _promise;
  };
})();
