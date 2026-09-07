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
    BASE,
  };
})();

// Download a binary response (Excel/Word) to the user's disk. window.api is
// JSON-only, so file downloads carry the demo-user header via a raw fetch, then
// trigger a browser save. `path` should start with "/api". Returns nothing;
// throws with the server's error message on a non-2xx response.
window.downloadBlob = async function downloadBlob(path, filename) {
  const url = path.startsWith('http') ? path : path;
  const r = await fetch(url, { headers: { 'x-demo-user-id': window.api.userId() } });
  if (!r.ok) {
    let msg = 'Download failed';
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  // Guard: a misrouted request can return the app's HTML (e.g. the login page)
  // with a 200. Never save that as a file — surface it as an error instead.
  const ctype = r.headers.get('content-type') || '';
  if (ctype.includes('text/html')) {
    throw new Error('The server returned a web page instead of a file — it may be running an older build. Restart the server and try again.');
  }
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl; a.download = filename || 'download';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
};

// Multipart upload with the demo-user header (do NOT set Content-Type — the
// browser adds the multipart boundary). Returns parsed JSON; throws on non-2xx.
window.uploadForm = async function uploadForm(path, formData) {
  const r = await fetch(path, { method: 'POST', headers: { 'x-demo-user-id': window.api.userId() }, body: formData });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) { const e = new Error(data?.error || r.statusText); e.status = r.status; e.data = data; throw e; }
  return data;
};
