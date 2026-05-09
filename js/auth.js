// ============================================================
// AUTH — Supabase backend.
//
// Same API surface as the old localStorage version so the rest of
// the app doesn't change much. The one new thing every page must do
// is call `await Auth.init()` once at boot, which fetches the
// current session and the matching profiles row and caches them.
// After that, the synchronous getters (currentUser / isLoggedIn /
// isAdmin) work as before.
// ============================================================

const Auth = (() => {
  let _user = null;            // cached profile row (incl. user_id, email, profile, extended, people, is_admin)
  let _initPromise = null;
  let _authSubscription = null;

  function supa() { return window.supabaseClient; }

  function friendly(err) {
    const msg = (err && err.message) || String(err || '');
    if (/already registered|already exists/i.test(msg)) return 'An account with that email already exists.';
    if (/Invalid login/i.test(msg)) return 'Incorrect email or password.';
    if (/Email not confirmed/i.test(msg)) return 'Please confirm your email before signing in (check your inbox).';
    if (/Password should be at least/i.test(msg)) return 'Password must be at least 6 characters.';
    if (/rate limit/i.test(msg)) return 'Too many attempts — please wait a minute and try again.';
    return msg;
  }

  // Re-fetches the profile row for the current authed user. Returns null if signed out.
  async function loadCurrent() {
    const s = supa();
    if (!s) return null;
    const { data: { user }, error: uErr } = await s.auth.getUser();
    if (uErr || !user) return null;

    const { data, error } = await s
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('profiles fetch failed', error);
      return null;
    }
    if (data) return data;

    // Fallback: trigger should have created the row, but if it didn't (e.g.
    // schema not applied yet), make a best-effort insert.
    const { data: inserted } = await s
      .from('profiles')
      .insert({ user_id: user.id, email: user.email })
      .select()
      .maybeSingle();
    return inserted || { user_id: user.id, email: user.email, people: [] };
  }

  function bindAuthListener() {
    if (_authSubscription) return;
    const s = supa();
    if (!s) return;
    _authSubscription = s.auth.onAuthStateChange(async (event /* , session */) => {
      if (event === 'SIGNED_OUT') { _user = null; return; }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        _user = await loadCurrent();
      }
    });
  }

  return {
    /** Call once on every page load before any sync getters. Idempotent. */
    async init() {
      if (_initPromise) return _initPromise;
      _initPromise = (async () => {
        bindAuthListener();
        _user = await loadCurrent();
        return _user;
      })();
      return _initPromise;
    },

    // ----- session getters (sync, use after init()) -----
    isLoggedIn:    () => !!_user,
    currentUser:   () => _user,
    currentEmail:  () => _user && _user.email,
    isAdmin:       () => !!(_user && _user.is_admin),
    // legacy alias used by some pages
    isAdminLoggedIn: function () { return this.isAdmin(); },

    // ----- signup / login / logout -----
    async signup(email, password) {
      const s = supa();
      if (!s) throw new Error('Supabase not configured');
      email = String(email || '').trim().toLowerCase();
      const { data, error } = await s.auth.signUp({ email, password });
      if (error) throw new Error(friendly(error));

      // The trigger creates the profile row; reload our cached state.
      _initPromise = null;
      _user = await loadCurrent();

      // If email confirmation is required, the user object exists but no
      // session yet. Surface that so the UI can tell the user to check inbox.
      const sessionExists = !!(data && data.session);
      return { user: _user, requiresEmailConfirmation: !sessionExists };
    },

    async login(email, password) {
      const s = supa();
      if (!s) throw new Error('Supabase not configured');
      email = String(email || '').trim().toLowerCase();
      const { error } = await s.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendly(error));
      _initPromise = null;
      _user = await loadCurrent();
      return _user;
    },

    async logout() {
      const s = supa();
      if (s) await s.auth.signOut();
      _user = null;
      _initPromise = null;
    },

    async resetPassword(email) {
      const s = supa();
      if (!s) throw new Error('Supabase not configured');
      email = String(email || '').trim().toLowerCase();
      const redirectTo = location.origin + '/signup.html?mode=login';
      const { error } = await s.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new Error(friendly(error));
    },

    // ----- profile / tree persistence -----
    async saveProfile(profile) {
      const s = supa();
      if (!_user) throw new Error('Not signed in');
      const updates = {
        profile,
        updated_at: new Date().toISOString(),
      };
      const { error } = await s.from('profiles').update(updates).eq('user_id', _user.user_id);
      if (error) throw error;
      _user = { ..._user, ...updates };
      return profile;
    },

    async saveExtended(extended) {
      const s = supa();
      if (!_user) throw new Error('Not signed in');
      const updates = {
        extended,
        updated_at: new Date().toISOString(),
      };
      const { error } = await s.from('profiles').update(updates).eq('user_id', _user.user_id);
      if (error) throw error;
      _user = { ..._user, ...updates };
    },

    async saveTree(people) {
      const s = supa();
      if (!_user) throw new Error('Not signed in');
      const updates = {
        people: Array.isArray(people) ? people : [],
        updated_at: new Date().toISOString(),
      };
      const { error } = await s.from('profiles').update(updates).eq('user_id', _user.user_id);
      if (error) throw error;
      _user = { ..._user, ...updates };
    },

    // ----- admin (anyone with profiles.is_admin = true) -----
    async listAllUsers() {
      const s = supa();
      const { data, error } = await s.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    /**
     * Delete a user's profile row. The corresponding auth.users entry needs
     * to be removed via the Supabase dashboard (or a server-side Edge
     * Function with the service-role key) — we can only remove what RLS
     * policies allow with the anon key.
     */
    async deleteUser(userId) {
      const s = supa();
      const { error } = await s.from('profiles').delete().eq('user_id', userId);
      if (error) throw error;
    },

    // legacy stubs used by old admin code — admin is now a flag, not a key
    async adminLogin() { return this.isAdmin(); },
    adminLogout() { /* no-op; signing out clears it */ },
  };
})();
