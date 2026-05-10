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

  // One-shot cleanup: drop the legacy localStorage keys from the old
  // multi-user / GENOSYS builds so they can never re-migrate into the
  // current key. Safe and idempotent.
  try {
    localStorage.removeItem('pa_users_v1');
    localStorage.removeItem('genosys_family_tree_v2');
  } catch (_) {}

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) { /* fall through */ }
    // No legacy migration — every visitor starts from a blank book.
    return { profile: null, extended: null, people: [] };
  }

  // Profile lives in `state.profile`; the tree renderer reads from `state.people`.
  // We bridge them so the user appears as a node — but we DON'T re-sync on every
  // load (that would clobber edits made via the tree's edit-person form). Instead:
  //   - seedSelfIfMissing: one-shot bootstrap when no isSelf person exists
  //   - profileToSelf:    write-through after a profile save
  //   - selfToProfile:    write-through after a tree save (keeps profile current
  //                       so the dashboard/landing reflect the latest name etc.)
  const yearOf = (d) => d ? parseInt(String(d).slice(0, 4), 10) : null;

  function profileFields(prof) {
    return {
      name:       prof.fullName || '',
      nickname:   prof.nickname || '',
      gender:     ['male','female','unknown'].includes(prof.gender) ? prof.gender : 'unknown',
      birthDate:  prof.birthDate || null,
      birthYear:  yearOf(prof.birthDate),
      birthPlace: prof.birthPlace || '',
      deceased:   prof.status === 'deceased',
      deathDate:  prof.deathDate || null,
      deathYear:  yearOf(prof.deathDate),
      deathPlace: prof.deathPlace || '',
      photo:      prof.photo || '',
      notes:      prof.notes || '',
    };
  }

  function seedSelfIfMissing(state) {
    const prof = state && state.profile;
    if (!prof || !prof.fullName) return state;
    const people = Array.isArray(state.people) ? state.people.slice() : [];
    if (people.some(p => p && p.isSelf)) return state;
    const id = 'p_self_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    people.unshift({
      id, ...profileFields(prof),
      parentIds: [], parentMeta: {},
      partnerIds: [], partnerMeta: {},
      affected: false, carrier: false,
      isSelf: true,
    });
    return { ...state, people };
  }

  function profileToSelf(state) {
    const prof = state && state.profile;
    if (!prof || !prof.fullName) return state;
    const people = Array.isArray(state.people) ? state.people.slice() : [];
    const selfIdx = people.findIndex(p => p && p.isSelf);
    if (selfIdx === -1) return seedSelfIfMissing(state);
    people[selfIdx] = { ...people[selfIdx], ...profileFields(prof), isSelf: true };
    return { ...state, people };
  }

  function selfToProfile(state) {
    if (!state || !Array.isArray(state.people)) return state;
    const self = state.people.find(p => p && p.isSelf);
    if (!self) return state;
    const profile = { ...(state.profile || {}) };
    profile.fullName   = self.name || '';
    profile.nickname   = self.nickname || '';
    profile.gender     = self.gender || 'unknown';
    profile.birthDate  = self.birthDate || null;
    profile.birthPlace = self.birthPlace || '';
    profile.status     = self.deceased ? 'deceased' : 'alive';
    profile.deathDate  = self.deathDate || null;
    profile.deathPlace = self.deathPlace || '';
    profile.photo      = self.photo || '';
    profile.notes      = self.notes || '';
    return { ...state, profile };
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
    async init() {
      _user = load();
      const synced = seedSelfIfMissing(_user);
      if (synced !== _user) {
        _user = synced;
        try { persist(_user); } catch (e) { /* surfaced elsewhere */ }
      }
      return _user;
    },
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
      _user = profileToSelf({ ..._user, profile });
      persist(_user);
      return profile;
    },
    async saveExtended(extended) {
      _user = { ..._user, extended };
      persist(_user);
    },
    async saveTree(people) {
      _user = selfToProfile({ ..._user, people: Array.isArray(people) ? people : [] });
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
