// ============================================================
// BOOKS — multiple family trees per browser/account.
//
// Storage shape:
//   pa_local_v1     — the ACTIVE book (untouched by older code)
//   pa_book_<id>    — a snapshot of one named book (same shape as pa_local_v1)
//   pa_books_index  — { active: <id|null>, books: [{id, name, savedAt, summary}] }
//
// Active book stays in pa_local_v1 so all the existing pages
// (auth.js, tree-edit, tree-view, details, dashboard) keep working
// without rewrites. Switching books snapshots the current pa_local_v1
// to its registered slot, then loads the chosen slot into pa_local_v1
// and reloads the page.
// ============================================================
(function () {
  const ACTIVE_KEY = 'pa_local_v1';
  const INDEX_KEY  = 'pa_books_index';
  const BOOK_PREFIX = 'pa_book_';

  function readJSON(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (_) { return null; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { throw new Error('Browser storage is full — remove some uploaded photos first.'); }
  }

  function readIndex() {
    const idx = readJSON(INDEX_KEY);
    if (idx && Array.isArray(idx.books)) return idx;
    return { active: null, books: [] };
  }
  function writeIndex(idx) { writeJSON(INDEX_KEY, idx); }

  function summaryOf(book) {
    if (!book) return { name: '—', count: 0 };
    const profile = book.profile || {};
    return {
      name:  profile.fullName || 'Untitled book',
      count: Array.isArray(book.people) ? book.people.length : 0,
    };
  }

  function newId() {
    return 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  // List all known books, with the active one first.
  function list() {
    const idx = readIndex();
    const active = readJSON(ACTIVE_KEY);
    const summary = summaryOf(active);
    const out = [{
      id:        idx.active || null,
      name:      summary.name,
      count:     summary.count,
      isActive:  true,
      isUnsaved: !idx.active,    // true when current active book hasn't been registered yet
    }];
    idx.books.forEach(b => {
      if (b.id === idx.active) return;        // already added as active
      out.push({ ...b, isActive: false, isUnsaved: false });
    });
    return out;
  }

  // Snapshot the current active book into the registry under a new
  // (or existing) id with a chosen name. Idempotent: re-saves overwrite
  // the same slot if id already exists.
  function snapshot(id, name) {
    const active = readJSON(ACTIVE_KEY);
    if (!active) throw new Error('No active book to save.');
    writeJSON(BOOK_PREFIX + id, active);
    const idx = readIndex();
    const existing = idx.books.find(b => b.id === id);
    const summary = summaryOf(active);
    const entry = {
      id,
      name:    name || summary.name,
      savedAt: new Date().toISOString(),
      count:   summary.count,
    };
    if (existing) Object.assign(existing, entry);
    else          idx.books.push(entry);
    idx.active = id;
    writeIndex(idx);
    return entry;
  }

  // Switch to an existing book. Auto-snapshots the current active book
  // first if it's unregistered (so nothing is lost).
  function switchTo(id) {
    const idx = readIndex();
    const target = idx.books.find(b => b.id === id);
    if (!target) throw new Error('That book is no longer in the registry.');

    // safeguard — if there's an active book that isn't yet snapshotted,
    // save it under its profile name so we never silently drop work.
    const active = readJSON(ACTIVE_KEY);
    const haveActiveData = !!(active && (active.profile || (active.people && active.people.length)));
    if (haveActiveData && !idx.active) {
      const s = summaryOf(active);
      snapshot(newId(), s.name + ' (auto-saved)');
    }

    const next = readJSON(BOOK_PREFIX + id);
    if (!next) throw new Error('That book\'s contents are missing.');
    writeJSON(ACTIVE_KEY, next);
    const fresh = readIndex();
    fresh.active = id;
    writeIndex(fresh);
    return target;
  }

  // Start a fresh empty book. Auto-saves the current one if it has data.
  function createNew(name) {
    const active = readJSON(ACTIVE_KEY);
    const haveActiveData = !!(active && (active.profile || (active.people && active.people.length)));
    const idx = readIndex();
    if (haveActiveData) {
      const id = idx.active || newId();
      const s  = summaryOf(active);
      snapshot(id, s.name);
    }
    // wipe active to a clean slate
    writeJSON(ACTIVE_KEY, { profile: null, extended: null, people: [] });
    const fresh = readIndex();
    fresh.active = null;       // new book is unregistered until first save / switch
    writeIndex(fresh);
    return { name: name || 'New book' };
  }

  function rename(id, newName) {
    const idx = readIndex();
    const b = idx.books.find(x => x.id === id);
    if (!b) throw new Error('Book not found.');
    b.name = newName;
    writeIndex(idx);
  }

  function remove(id) {
    const idx = readIndex();
    idx.books = idx.books.filter(b => b.id !== id);
    if (idx.active === id) idx.active = null;
    writeIndex(idx);
    try { localStorage.removeItem(BOOK_PREFIX + id); } catch (_) {}
  }

  window.Books = { list, snapshot, switchTo, createNew, rename, remove, newId };
})();
