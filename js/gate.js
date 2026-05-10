// ============================================================
// SINGLE-ADMIN GATE
// One ID + password gates the private pages. Credentials live in
// localStorage as { id, hash } — hash is SHA-256(password). Session
// is just a boolean flag in the same store.
//
// First run: there are no credentials yet. The login page detects this
// and switches to a "create your access" form instead. After that,
// future visits show the login form.
//
// Public API exposed on window.Gate:
//   isOpen()        — true if the user is currently logged in
//   hasCredentials()— true once an admin has been set up
//   create(id, pw)  — store credentials (only allowed if none exist yet)
//   login(id, pw)   — verify, open session if it matches
//   logout()        — close the session
//   require()       — redirect to login.html if the session is closed
//                     (call this on every protected page near the top)
// ============================================================
(function () {
  const KEY = 'pa_gate';
  const DEFAULT = { id: '', hash: '', open: false };

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT, ...parsed };
    } catch (_) { return { ...DEFAULT }; }
  }
  function write(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
  }

  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function create(id, pw) {
    if (!id || !pw) throw new Error('ID and password are required.');
    const cur = read();
    if (cur.id && cur.hash) throw new Error('Access has already been set up. Use Login instead.');
    const hash = await sha256(pw);
    write({ id: String(id).trim(), hash, open: true });
    return true;
  }

  async function login(id, pw) {
    const cur = read();
    if (!cur.id || !cur.hash) throw new Error('No access has been set up yet.');
    const hash = await sha256(pw);
    if (String(id).trim() !== cur.id || hash !== cur.hash) {
      throw new Error('Wrong ID or password.');
    }
    write({ ...cur, open: true });
    return true;
  }

  function logout() {
    const cur = read();
    write({ ...cur, open: false });
  }

  function isOpen()         { return !!read().open; }
  function hasCredentials() { const s = read(); return !!(s.id && s.hash); }
  function currentId()      { return read().id; }

  function require() {
    // call from protected pages. If no credentials exist OR the session
    // is closed, kick to login.html. login.html itself does NOT call this.
    const s = read();
    const here = location.pathname.split('/').pop().toLowerCase();
    if (here === 'login.html') return;       // never gate the login page
    if (!s.id || !s.hash || !s.open) {
      // preserve where the user wanted to go so we can return after login
      try { sessionStorage.setItem('pa_gate_returnTo', location.href); } catch (_) {}
      location.replace('login.html');
    }
  }

  window.Gate = {
    isOpen, hasCredentials, currentId,
    create, login, logout, require,
  };
})();
