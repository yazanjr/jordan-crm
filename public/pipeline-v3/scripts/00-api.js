// Tiny fetch wrapper that injects the demo-auth header from localStorage.
// Loaded first by every page so window.api is available everywhere.

window.api = (function () {
  const BASE = '/api';

  function userId() {
    try {
      const raw = localStorage.getItem('imgCurrentUserId');
      return raw || 'U003';  // default Yazan, matching CURRENT_USER fallback in 04-deals.jsx
    } catch { return 'U003'; }
  }

  async function req(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-demo-user-id': userId(),
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(BASE + path, opts);
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) {
      const err = new Error(data?.error || r.statusText);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    get:   (path)        => req('GET', path),
    post:  (path, body)  => req('POST', path, body),
    put:   (path, body)  => req('PUT', path, body),
    patch: (path, body)  => req('PATCH', path, body),
    del:   (path)        => req('DELETE', path),
    userId,
  };
})();
