// ============================================================
// CONFIG — kept as a harmless empty stub.
//
// The product is currently single-browser (localStorage only) and
// does not call any backend. This file remains so older code paths
// that read window.CONFIG don't throw.
//
// To re-introduce a backend later (e.g. Supabase), populate the
// fields below and re-wire js/auth.js / js/supa.js to use them.
// ============================================================

window.CONFIG = {
  SUPABASE_URL:      '',
  SUPABASE_ANON_KEY: '',
};
