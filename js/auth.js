// ============================================================
// AUTH — localStorage-only, no signup or login.
//
// Each browser is its own world. The site is open to anyone who
// arrives — they go straight from landing → details → dashboard
// without registering. All their data (profile, extended details,
// family tree) lives in this one localStorage key.
//
// Same public API as the previous Supabase-backed version, so the
// rest of the app didn't have to change. Auth.init() is a no-op,
// every call returns immediately, and isLoggedIn() is always true.
// ============================================================

const Auth = (() => {
  const KEY = 'pa_local_v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) { /* fall through */ }
    return { profile: null, extended: null, people: [] };
  }
  function persist(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) {
      // Most likely QuotaExceededError from too many big base64 photos.
      throw new Error('Browser storage is full — please remove some uploaded photos.');
    }
  }

  let _user = load();

  return {
    // ----- session (no-ops in single-user mode) -----
    async init() { _user = load(); return _user; },
    isLoggedIn:    () => true,
    currentUser:   () => _user,
    currentEmail:  () => '',
    isAdmin:       () => true,
    isAdminLoggedIn() { return true; },

    // ----- signup / login / logout — kept as harmless no-ops so any
    //       leftover call sites don't crash -----
    async signup() { return { user: _user, requiresEmailConfirmation: false }; },
    async login()  { return _user; },
    async logout() {
      if (!confirm('Clear all of your data from this browser? This cannot be undone.')) return;
      try { localStorage.removeItem(KEY); } catch (e) {}
      _user = { profile: null, extended: null, people: [] };
    },
    async resetPassword() { /* no-op */ },

    // ----- profile / tree persistence -----
    async saveProfile(profile) {
      _user = { ..._user, profile };
      persist(_user);
      return profile;
    },
    async saveExtended(extended) {
      _user = { ..._user, extended };
      persist(_user);
    },
    async saveTree(people) {
      _user = { ..._user, people: Array.isArray(people) ? people : [] };
      persist(_user);
    },

    // ----- legacy admin stubs (single-user mode has no admin needs) -----
    async listAllUsers() { return [{
      user_id: 'local',
      email: '',
      profile: _user.profile,
      extended: _user.extended,
      people: _user.people,
      created_at: null,
      is_admin: true,
    }]; },
    async deleteUser() { return this.logout(); },
    async adminLogin() { return true; },
    adminLogout() { /* no-op */ },
    async setAdminPassword() { /* no-op */ },
  };
})();
