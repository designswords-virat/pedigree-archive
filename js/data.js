// ============================================================
// DATA LAYER — localStorage-backed family tree store
// ============================================================

const STORAGE_KEY = 'genosys_family_tree_v2';
const ADMIN_KEY = 'genosys_admin_pass_v1';
const PHOTO_MIGRATION_KEY = 'genosys_photo_migration_v5';
const DEFAULT_ADMIN_PASS = 'dineshdhawan123';

// Maps person.name → filename in Profiles/ folder. Used by the one-time
// photo migration so newly-dropped photos auto-attach to existing data
// without wiping localStorage. Bump PHOTO_MIGRATION_KEY when adding new
// entries so the migration re-runs once.
const PHOTO_MAP = {
  // gen 0
  'Bhiva Ram':           'Bhiva Ram (M).png',
  'Chota Devi':          'Chota Devi (F).png',
  // gen 1
  'Kalyan Sahai Bairwa': 'Kalyan Sahai bairwa (M).png',
  'Kusum':               'Kusum (F).jpeg',
  'Omprakash':           'Omprakash (M).png',
  'Meera Devi':          'Meera Devi (F).png',
  'Ramesh':              'Ramesh (M).png',
  'Neeru':               'Neeru (F).png',
  'Anokh':               'Anokh (F).png',
  'Ramphool':            'Ramphool (M).png',
  'Krishna':             'Krishna (F).png',
  'Dayaram':             'Dayaram (M).png',
  'Ajay':                'Ajay (M).png',
  'Kusum Lata':          'Kusum Lata (F).png',
  'Anand':               'Anand (M).png',
  'Kiran':               'Kiran (F).png',
  // gen 2
  'Naman':               'Naman (M).jpeg',
  'Sandhya':             'Sandhya (F).jpeg',
  'Dinesh Kumar Dhawan': 'Dinesh Kumar Dhawan (M).png',
  'Manish Dhawan':       'Manish Dhawan (M).png',
  'Manisha':             'Manisha (F).png',
  'Amit Dhawan':         'Amit Dhawan (M).png',
  'Shubham':             'Shubham (M).jpeg',
  'Boby':                'Boby (M).png',
  'Amar':                'Amar (M).jpeg',
  'Sanjay':              'Sanjay (M).jpeg',
  'Mamta':               'Mamta (F).png',
  'Vijay':               'Vijay (M).jpeg',
  'Mohit':               'Mohit (M).png',
  'Priyanka':            'Priyanka (F).png',
  'Jiya':                'Jiya (F).png',
  'Pakhu':               'Pakhu (F).png',
  'Aaditya (Gunnu)':     'Aaditya (M) urf Gunnu.jpeg',
  'Ishika':              'Ishika (F).jpeg',
};

// === BHIVA RAM LINEAGE — sourced from Family pedigree.xlsx ===
const SAMPLE_DATA = {
  people: [
    // Gen 0 — Grandparents (Dada, Dadi)
    { id: 'g1m', name: 'Bhiva Ram',  gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Dada — founder of the lineage.', photo: 'Bhiva Ram (M).png',  parentIds: [], partnerIds: ['g1f'] },
    { id: 'g1f', name: 'Chota Devi', gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Dadi — founder of the lineage.', photo: 'Chota Devi (F).png', parentIds: [], partnerIds: ['g1m'] },

    // Gen 1 — Children of Bhiva Ram & Chota Devi (and their spouses)
    { id: 'c1',  name: 'Kalyan Sahai Bairwa', gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Kalyan Sahai bairwa (M).png', parentIds: ['g1m','g1f'], partnerIds: ['c1s'] },
    { id: 'c1s', name: 'Kusum',                gender: 'female', affected: false, carrier: false, deceased: true,  birthYear: null, deathYear: null, notes: 'Married into family.', photo: 'Kusum (F).jpeg', parentIds: [],            partnerIds: ['c1']  },

    { id: 'c2',  name: 'Omprakash',            gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '',                      photo: 'Omprakash (M).png',  parentIds: ['g1m','g1f'], partnerIds: ['c2s'] },
    { id: 'c2s', name: 'Meera Devi',           gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Married into family.', photo: 'Meera Devi (F).png', parentIds: [],            partnerIds: ['c2']  },

    { id: 'c3',  name: 'Ramesh',               gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '',                      photo: 'Ramesh (M).png',     parentIds: ['g1m','g1f'], partnerIds: ['c3s'] },
    { id: 'c3s', name: 'Neeru',                gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Married into family.', photo: 'Neeru (F).png',     parentIds: [],            partnerIds: ['c3']  },

    { id: 'c4',  name: 'Anokh',                gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '',                      photo: 'Anokh (F).png',      parentIds: ['g1m','g1f'], partnerIds: ['c4s'] },
    { id: 'c4s', name: 'Ramphool',             gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Married into family.', photo: 'Ramphool (M).png',   parentIds: [],            partnerIds: ['c4']  },

    { id: 'c5',  name: 'Krishna',              gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '',                      photo: 'Krishna (F).png',    parentIds: ['g1m','g1f'], partnerIds: ['c5s'] },
    { id: 'c5s', name: 'Dayaram',              gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Married into family.', photo: 'Dayaram (M).png',    parentIds: [],            partnerIds: ['c5']  },

    { id: 'c6',  name: 'Ajay',                 gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '',                      photo: 'Ajay (M).png',       parentIds: ['g1m','g1f'], partnerIds: ['c6s'] },
    { id: 'c6s', name: 'Kusum Lata',           gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Married into family.', photo: 'Kusum Lata (F).png', parentIds: [],            partnerIds: ['c6']  },

    { id: 'c7',  name: 'Anand',                gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '',                      photo: 'Anand (M).png',      parentIds: ['g1m','g1f'], partnerIds: ['c7s'] },
    { id: 'c7s', name: 'Kiran',                gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Married into family.', photo: 'Kiran (F).png',     parentIds: [],            partnerIds: ['c7']  },

    // Gen 2 — Grandchildren
    // Kalyan Sahai + Kusum
    { id: 'gc1_1', name: 'Naman',              gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Naman (M).jpeg',   parentIds: ['c1','c1s'], partnerIds: [] },
    { id: 'gc1_2', name: 'Sandhya',            gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Sandhya (F).jpeg', parentIds: ['c1','c1s'], partnerIds: [] },

    // Omprakash + Meera Devi
    { id: 'gc2_1',  name: 'Dinesh Kumar Dhawan', gender: 'male', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Dinesh Kumar Dhawan (M).png', parentIds: ['c2','c2s'], partnerIds: [] },
    { id: 'gc2_2',  name: 'Manish Dhawan',     gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Manish Dhawan (M).png', parentIds: ['c2','c2s'], partnerIds: ['gc2_2s'] },
    { id: 'gc2_2s', name: 'Manisha',           gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Married into family.', photo: 'Manisha (F).png', parentIds: [], partnerIds: ['gc2_2'] },
    { id: 'gc2_3',  name: 'Amit Dhawan',       gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Amit Dhawan (M).png', parentIds: ['c2','c2s'], partnerIds: [] },

    // Ramesh + Neeru
    { id: 'gc3_1', name: 'Shubham',            gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Shubham (M).jpeg', parentIds: ['c3','c3s'], partnerIds: [] },
    { id: 'gc3_2', name: 'Boby',               gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Boby (M).png', parentIds: ['c3','c3s'], partnerIds: [] },

    // Anokh + Ramphool
    { id: 'gc4_1', name: 'Amar',               gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Amar (M).jpeg',   parentIds: ['c4','c4s'], partnerIds: [] },
    { id: 'gc4_2', name: 'Sanjay',             gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Sanjay (M).jpeg', parentIds: ['c4','c4s'], partnerIds: [] },
    { id: 'gc4_3', name: 'Mamta',              gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Mamta (F).png', parentIds: ['c4','c4s'], partnerIds: [] },

    // Krishna + Dayaram
    { id: 'gc5_1', name: 'Vijay',              gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Vijay (M).jpeg', parentIds: ['c5','c5s'], partnerIds: [] },
    { id: 'gc5_2', name: 'Mohit',              gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Mohit (M).png',    parentIds: ['c5','c5s'], partnerIds: [] },
    { id: 'gc5_3', name: 'Priyanka',           gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Priyanka (F).png', parentIds: ['c5','c5s'], partnerIds: [] },

    // Ajay + Kusum Lata
    { id: 'gc6_1', name: 'Jiya',               gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Jiya (F).png',  parentIds: ['c6','c6s'], partnerIds: [] },
    { id: 'gc7_1', name: 'Pakhu',              gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Pakhu (F).png', parentIds: ['c6','c6s'], partnerIds: [] },

    // Anand + Kiran
    { id: 'gc7_2', name: 'Aaditya (Gunnu)',    gender: 'male',   affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: 'Also known as Gunnu.', photo: 'Aaditya (M) urf Gunnu.jpeg', parentIds: ['c7','c7s'], partnerIds: [] },
    { id: 'gc7_3', name: 'Ishika',             gender: 'female', affected: false, carrier: false, deceased: false, birthYear: null, deathYear: null, notes: '', photo: 'Ishika (F).jpeg', parentIds: ['c7','c7s'], partnerIds: [] },
  ],
  meta: { title: 'BHIVA RAM LINEAGE', subtitle: 'PEDIGREE ARCHIVE // FAMILY OF BHIVA RAM & CHOTA DEVI' }
};

const Data = {
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    let data;
    if (!raw) {
      data = JSON.parse(JSON.stringify(SAMPLE_DATA));
      this.save(data);
    } else {
      try { data = JSON.parse(raw); }
      catch (e) {
        data = JSON.parse(JSON.stringify(SAMPLE_DATA));
        this.save(data);
      }
    }

    // Always-run photo backfill: any person without a photo whose name is
    // in PHOTO_MAP gets the matching file. Idempotent — only fills blanks,
    // never overwrites a manually-set photo.
    let photoMutated = false;
    data.people.forEach(p => {
      if (!p.photo && PHOTO_MAP[p.name]) {
        p.photo = PHOTO_MAP[p.name];
        photoMutated = true;
      }
    });
    if (photoMutated) this.save(data);
    localStorage.setItem(PHOTO_MIGRATION_KEY, '1');

    // One-time admin-key reset: any browser still using the old default
    // 'admin123' gets quietly bumped to the new default. A user who has
    // explicitly chosen a different password is left alone.
    const ADMIN_RESET_KEY = 'genosys_admin_reset_v1';
    if (!localStorage.getItem(ADMIN_RESET_KEY)) {
      const cur = localStorage.getItem(ADMIN_KEY);
      if (!cur || cur === 'admin123') {
        localStorage.setItem(ADMIN_KEY, DEFAULT_ADMIN_PASS);
      }
      localStorage.setItem(ADMIN_RESET_KEY, '1');
    }

    // One-time structure fixes — bump the version key when adding new ones.
    const STRUCT_FIX_KEY = 'genosys_struct_fix_v2';
    if (!localStorage.getItem(STRUCT_FIX_KEY)) {
      let mutated = false;
      // Pakhu was originally placed under Anand+Kiran by column; she's actually
      // a daughter of Ajay+Kusum Lata.
      const pakhu = data.people.find(p => p.id === 'gc7_1' || p.name === 'Pakhu');
      if (pakhu && Array.isArray(pakhu.parentIds) && pakhu.parentIds.includes('c7')) {
        pakhu.parentIds = ['c6', 'c6s'];
        mutated = true;
      }
      // Kusum (Kalyan Sahai's wife) passed away.
      const kusum = data.people.find(p => p.id === 'c1s');
      if (kusum && !kusum.deceased) {
        kusum.deceased = true;
        mutated = true;
      }
      if (mutated) this.save(data);
      localStorage.setItem(STRUCT_FIX_KEY, '1');
    }

    return data;
  },
  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    return this.load();
  },

  newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  addPerson(person) {
    const data = this.load();
    if (!person.id) person.id = this.newId();
    data.people.push(this._normalize(person));
    this.save(data);
    return person;
  },

  updatePerson(id, updates) {
    const data = this.load();
    const idx = data.people.findIndex(p => p.id === id);
    if (idx === -1) return null;
    data.people[idx] = this._normalize({ ...data.people[idx], ...updates, id });
    this.save(data);
    return data.people[idx];
  },

  deletePerson(id) {
    const data = this.load();
    data.people = data.people.filter(p => p.id !== id);
    // remove references
    data.people.forEach(p => {
      p.parentIds  = (p.parentIds  || []).filter(x => x !== id);
      p.partnerIds = (p.partnerIds || []).filter(x => x !== id);
    });
    this.save(data);
  },

  setMeta(meta) {
    const data = this.load();
    data.meta = { ...data.meta, ...meta };
    this.save(data);
  },

  exportJSON() {
    return JSON.stringify(this.load(), null, 2);
  },

  importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj.people || !Array.isArray(obj.people)) throw new Error('Invalid data: missing people[]');
    obj.people = obj.people.map(p => this._normalize(p));
    if (!obj.meta) obj.meta = SAMPLE_DATA.meta;
    this.save(obj);
    return obj;
  },

  // Resolve a person.photo string to a usable URL. Treats data: and http(s):
  // as absolute, and any other value as a filename inside Profiles/.
  resolvePhoto(photoOrPerson) {
    const v = (typeof photoOrPerson === 'string' ? photoOrPerson : photoOrPerson && photoOrPerson.photo) || '';
    if (!v) return null;
    if (/^(https?:|data:)/i.test(v)) return v;
    return 'Profiles/' + v.split('/').map(encodeURIComponent).join('/');
  },

  _normalize(p) {
    return {
      id: p.id,
      name: (p.name || '').trim() || 'UNKNOWN',
      gender: ['male','female','unknown'].includes(p.gender) ? p.gender : 'unknown',
      affected: !!p.affected,
      carrier:  !!p.carrier,
      deceased: !!p.deceased,
      birthYear: p.birthYear ? parseInt(p.birthYear, 10) : null,
      deathYear: p.deathYear ? parseInt(p.deathYear, 10) : null,
      notes: (p.notes || '').trim(),
      photo: (p.photo || '').trim(),
      parentIds:  Array.isArray(p.parentIds)  ? p.parentIds.filter(Boolean)  : [],
      partnerIds: Array.isArray(p.partnerIds) ? p.partnerIds.filter(Boolean) : [],
    };
  },

  // ---------- AUTH ----------
  // Two-tier access:
  //   USER  — view-only, can open the family tree viewer
  //   ADMIN — view + edit, can open the admin console
  // Admin login also grants user access (admin > user).

  getUserPass()  { return localStorage.getItem('genosys_user_pass_v1')  || 'family123'; },
  setUserPass(p) { localStorage.setItem('genosys_user_pass_v1', p); },
  getAdminPass() { return localStorage.getItem(ADMIN_KEY)               || DEFAULT_ADMIN_PASS; },
  setAdminPass(p){ localStorage.setItem(ADMIN_KEY, p); },

  isUserLoggedIn()  { return sessionStorage.getItem('genosys_user_session') === '1'; },
  isAdminLoggedIn() { return sessionStorage.getItem('genosys_session')      === '1'; },

  userLogin(p) {
    if (p === this.getUserPass() || p === this.getAdminPass()) {
      sessionStorage.setItem('genosys_user_session', '1');
      return true;
    }
    return false;
  },
  adminLogin(p) {
    if (p === this.getAdminPass()) {
      sessionStorage.setItem('genosys_session', '1');
      sessionStorage.setItem('genosys_user_session', '1'); // admin includes viewer access
      return true;
    }
    return false;
  },

  userLogout()  { sessionStorage.removeItem('genosys_user_session'); },
  adminLogout() {
    sessionStorage.removeItem('genosys_session');
    sessionStorage.removeItem('genosys_user_session');
  },

  // Backwards-compat aliases — admin.js still calls these names
  login(p)        { return this.adminLogin(p); },
  isLoggedIn()    { return this.isAdminLoggedIn(); },
  logout()        { return this.adminLogout(); },
};

// Run all migrations as soon as data.js is parsed, so they fire before any
// login screen ever asks for a password. (Login flows previously skipped
// Data.load() until *after* authentication, leaving the admin-key migration
// dormant for users who landed straight on the login screen.)
Data.load();
