// ============================================================
// MAIN VIEWER LOGIC
// ============================================================

(function () {
  const $ = (sel) => document.querySelector(sel);

  // ---- BOOT SEQUENCE ----
  const BOOT_LINES = [
    { t: 'genosys.kernel @ 0xFFFE :: ',                    s: 'INIT'   },
    { t: 'loading pedigree.dna engine ...... ',            s: 'OK'     },
    { t: 'mounting datastore [localStorage] ',             s: 'OK'     },
    { t: 'cryosys :: thawing 10 subject records ........ ', s: 'OK'    },
    { t: 'audio.synth // Web Audio API attached ........ ', s: 'OK'    },
    { t: 'rendering.svg :: layout solver pass 1 ........ ', s: 'OK'    },
    { t: 'security // archive class: CLASSIFIED ........ ', s: 'OK'    },
    { t: 'genome.scan :: marker analysis complete ...... ', s: 'OK'    },
    { t: 'establishing biometric link to operator ...... ', s: 'OK'    },
    { t: '> ARCHIVE READY. AWAITING OPERATOR INPUT.',      s: ''       },
  ];

  function runBoot(done) {
    const log = $('#bootLog');
    let i = 0;
    function next() {
      if (i >= BOOT_LINES.length) { setTimeout(done, 500); return; }
      const ln = document.createElement('div');
      ln.className = 'ln';
      const status = BOOT_LINES[i].s;
      const cls = status === 'OK' ? 'ok' : status === 'FAIL' ? 'err' : '';
      ln.innerHTML = '<span>' + BOOT_LINES[i].t + '</span><span class="' + cls + '">' + status + '</span>';
      log.appendChild(ln);
      Sound.typing();
      i++;
      setTimeout(next, 240);
    }
    next();
  }

  // ---- TOAST ----
  function toast(msg, kind = '') {
    const stack = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2900);
  }

  // ---- INSPECTOR ----
  let currentPerson = null;

  function showInspector(person, data) {
    currentPerson = person;
    const insp = $('#inspector');
    insp.classList.remove('hidden');
    $('#iName').textContent = person.name;
    $('#iId').textContent = '// ' + person.id.toUpperCase();
    $('#iGender').textContent = person.gender.toUpperCase();

    // photo
    const photoUrl = Data.resolvePhoto(person);
    const wrap = $('#iPhotoWrap');
    const img  = $('#iPhoto');
    if (photoUrl) {
      img.className = 'i-photo ' + person.gender;
      // restart the entrance animation
      img.style.animation = 'none';
      img.offsetHeight; // force reflow
      img.style.animation = '';
      img.src = photoUrl;
      wrap.style.display = '';
    } else {
      wrap.style.display = 'none';
      img.removeAttribute('src');
    }
    const yrs = [];
    if (person.birthYear) yrs.push('B. ' + person.birthYear);
    if (person.deceased && person.deathYear) yrs.push('D. ' + person.deathYear);
    $('#iBorn').textContent = yrs.length ? yrs.join('  ') : 'UNKNOWN';
    $('#iAlive').innerHTML = person.deceased
      ? '<span style="color:var(--red)">DECEASED</span>'
      : '<span style="color:var(--green)">LIVING</span>';
    $('#iNotes').textContent = person.notes || '— NO RECORDED NOTES —';

    const status = $('#iStatus');
    status.innerHTML = '';
    const tag = (txt, kind) => {
      const t = document.createElement('span');
      t.className = 'tag ' + (kind || '');
      t.textContent = txt;
      status.appendChild(t);
    };
    if (person.deceased) tag('DECEASED', 'muted');
    else tag('LIVING', 'green');

    const byId = {};
    data.people.forEach(p => byId[p.id] = p);
    const renderRels = (containerId, ids) => {
      const c = $(containerId);
      c.innerHTML = '';
      const valid = (ids || []).map(id => byId[id]).filter(Boolean);
      if (valid.length === 0) {
        const e = document.createElement('span');
        e.className = 'rel-empty';
        e.textContent = '— NONE —';
        c.appendChild(e);
        return;
      }
      valid.forEach(p => {
        const el = document.createElement('span');
        el.className = 'rel-link';
        el.textContent = p.name;
        el.title = 'JUMP TO ' + p.name.toUpperCase();
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          showInspector(p, Data.load());
          Pedigree.highlight(p.id);
          Pedigree.panToNode(p.id);
          Sound.blip();
        });
        el.addEventListener('mouseenter', () => {
          Pedigree.hoverHighlight(p.id);
          Sound.hover();
        });
        el.addEventListener('mouseleave', () => {
          Pedigree.hoverHighlight(null);
        });
        c.appendChild(el);
      });
    };
    renderRels('#iParents', person.parentIds);
    renderRels('#iPartner', person.partnerIds);

    const children = data.people.filter(c => (c.parentIds || []).includes(person.id));
    renderRels('#iChildren', children.map(c => c.id));
  }

  // ---- FULLSCREEN SUBJECT FILE ----
  let fcTimerHandle = null, fcTimerStart = 0;

  function startFcTimer() {
    fcTimerStart = Date.now();
    const update = () => {
      const e = Date.now() - fcTimerStart;
      const h = Math.floor(e / 3600000);
      const m = Math.floor((e % 3600000) / 60000);
      const s = Math.floor((e % 60000) / 1000);
      $('#fcTimer').textContent =
        String(h).padStart(2, '0') + ':' +
        String(m).padStart(2, '0') + ':' +
        String(s).padStart(2, '0');
    };
    update();
    if (fcTimerHandle) clearInterval(fcTimerHandle);
    fcTimerHandle = setInterval(update, 1000);
  }
  function stopFcTimer() { if (fcTimerHandle) clearInterval(fcTimerHandle); fcTimerHandle = null; }

  function buildGraph(data) {
    const byId = {};
    data.people.forEach(p => byId[p.id] = p);
    const depth = {};
    const roots = data.people.filter(p => !p.parentIds || p.parentIds.length === 0 || !p.parentIds.some(pid => byId[pid]));
    roots.forEach(r => depth[r.id] = 0);
    let changed = true, guard = 0;
    while (changed && guard++ < 100) {
      changed = false;
      data.people.forEach(p => {
        if (depth[p.id] != null) return;
        const pd = (p.parentIds || []).map(id => depth[id]).filter(d => d != null);
        if (pd.length > 0) { depth[p.id] = Math.max(...pd) + 1; changed = true; }
      });
    }
    return { byId, depth, roots };
  }

  function relationsOf(person, data, graph) {
    const { byId } = graph || buildGraph(data);

    // ancestors (BFS up)
    const ancestors = new Set();
    let q = [...(person.parentIds || [])];
    while (q.length) {
      const id = q.shift();
      if (!id || ancestors.has(id) || !byId[id]) continue;
      ancestors.add(id);
      (byId[id].parentIds || []).forEach(pid => q.push(pid));
    }

    // descendants (BFS down)
    const descendants = new Set();
    q = data.people.filter(p => (p.parentIds || []).includes(person.id)).map(p => p.id);
    while (q.length) {
      const id = q.shift();
      if (descendants.has(id)) continue;
      descendants.add(id);
      data.people.forEach(p => { if ((p.parentIds || []).includes(id)) q.push(p.id); });
    }

    // siblings (share at least one parent)
    const siblings = data.people.filter(p =>
      p.id !== person.id &&
      (person.parentIds || []).length > 0 &&
      (p.parentIds || []).some(pid => (person.parentIds || []).includes(pid))
    );

    // grandparents
    const gpSet = new Set();
    (person.parentIds || []).forEach(pid => {
      const par = byId[pid];
      if (par) (par.parentIds || []).forEach(gpid => { if (byId[gpid]) gpSet.add(gpid); });
    });
    const grandparents = [...gpSet].map(id => byId[id]);

    const children = data.people.filter(p => (p.parentIds || []).includes(person.id));
    const partners = (person.partnerIds || []).map(id => byId[id]).filter(Boolean);

    // root of bloodline (walk up via first parent)
    let root = person, cursor = person, safe = 0;
    while (cursor.parentIds && cursor.parentIds.length > 0 && byId[cursor.parentIds[0]] && safe++ < 50) {
      cursor = byId[cursor.parentIds[0]];
      root = cursor;
    }

    // branch root: gen-1 ancestor (direct child of root that's an ancestor of person, or person if person is gen-1)
    let branchRoot = null;
    if (root.id !== person.id) {
      // walk up until parent is root
      let c = person;
      while (c.parentIds && c.parentIds.length > 0 && byId[c.parentIds[0]] && safe++ < 50) {
        const par = byId[c.parentIds[0]];
        if (par.id === root.id) { branchRoot = c; break; }
        c = par;
      }
    } else {
      branchRoot = person;
    }

    return {
      ancestors:    [...ancestors].map(id => byId[id]).filter(Boolean),
      descendants:  [...descendants].map(id => byId[id]).filter(Boolean),
      siblings, grandparents, children, partners,
      root, branchRoot,
    };
  }

  function genOf(id, data) {
    const g = buildGraph(data);
    return g.depth[id] != null ? g.depth[id] + 1 : 1;
  }

  // 3-letter branch code from a person's name (first letters of each word, padded)
  function code3(name) {
    return (name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3).padEnd(3, 'X');
  }
  // hash an id to a stable 3-digit number (for evocative serial codes)
  function idHash(id) {
    return (id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) * 41) % 1000;
  }
  const pad = (n, w) => String(n).padStart(w, '0');

  function openFullCard(person) {
    if (!person) return;
    const data = Data.load();
    const graph = buildGraph(data);
    const rel   = relationsOf(person, data, graph);
    const gen   = (graph.depth[person.id] != null ? graph.depth[person.id] : 0) + 1;

    // family-wide caps so each storage bar is a percentile vs the whole tree
    const allRel = data.people.map(p => relationsOf(p, data, graph));
    const cap = {
      anc: Math.max(1, ...allRel.map(r => r.ancestors.length)),
      dsc: Math.max(1, ...allRel.map(r => r.descendants.length)),
      sib: Math.max(1, ...allRel.map(r => r.siblings.length)),
      prt: Math.max(1, ...data.people.map(p => (p.partnerIds || []).length)),
    };

    const fc = $('#fullCard');
    fc.classList.remove('hidden');
    fc.setAttribute('aria-hidden', 'false');

    // ---------- PHOTO ----------
    const photoUrl = Data.resolvePhoto(person);
    const fcPhoto = $('#fcPhoto');
    const fcNoPhoto = $('#fcNoPhoto');
    if (photoUrl) {
      fcPhoto.style.display = '';
      fcPhoto.src = photoUrl;
      fcNoPhoto.style.display = 'none';
    } else {
      fcPhoto.style.display = 'none';
      fcPhoto.removeAttribute('src');
      fcNoPhoto.style.display = '';
    }

    // ---------- DERIVED CODES ----------
    const idH        = idHash(person.id);
    const branchName = rel.branchRoot ? rel.branchRoot.name : rel.root.name;
    const branchAbbr = code3(branchName);
    const rootAbbr   = code3(rel.root.name);
    const totalRel   = rel.grandparents.length + (person.parentIds || []).length
                     + rel.siblings.length + rel.partners.length + rel.children.length;
    const livingDesc = rel.descendants.filter(p => !p.deceased).length;
    const isRoot     = rel.root.id === person.id;
    const isBranch   = rel.branchRoot && rel.branchRoot.id === person.id;
    const personAbbr = code3(person.name);

    // ---------- TOP STRIP ----------
    $('#fcPillEm').textContent =
      '// ' + person.id.toUpperCase() + ' · GEN-' + pad(gen, 2) + ' · BR-' + branchAbbr;

    // 4 codes — each column means something different but reads like a tracking serial
    $('#fcCode1').textContent = 'J-' + personAbbr + pad(idH, 3) + '-' + pad(gen, 3);
    $('#fcCode2').textContent = 'D-' + branchAbbr + '-' + pad(rel.ancestors.length, 2) + pad(rel.descendants.length, 2);
    $('#fcCode3').textContent = 'B-' + rootAbbr + '-' + pad(rel.siblings.length, 2) + pad(rel.partners.length, 1);
    $('#fcCode4').textContent = 'S-' + personAbbr + '-' + pad(totalRel, 2) + pad(livingDesc, 2);

    // ---------- TABS (top right) ----------
    $('#fcTab1').textContent = '« BRANCH · ' + branchName.toUpperCase() + ' »';
    $('#fcTab2').textContent = '« LINEAGE · ' + rel.root.name.toUpperCase() + ' »';
    $('#fcTab3').textContent = '« GEN-' + pad(gen, 2) + ' · ' + (isRoot ? 'ROOT' : isBranch ? 'BRANCH-HEAD' : 'NODE') + ' »';

    // ---------- LEFT BLOCKS ----------
    $('#fcCom1').textContent     = person.id.toUpperCase() + ' // SUB-LEVEL ' + pad(gen, 2) + 'A · AUTH ' + pad(idH, 3);
    $('#fcBackup').textContent   = 'PRIMARY ROUTE :: ' + rel.root.name.toUpperCase() + ' → ' + branchName.toUpperCase();
    $('#fcMission').textContent  = (rel.ancestors.length === 0)
        ? 'ROOT NODE · ORIGIN POINT · NO ANCESTRAL TRACE'
        : 'TRACE :: ' + [rel.root.name, rel.branchRoot && rel.branchRoot.name, person.name === rel.branchRoot?.name ? null : person.name]
            .filter(Boolean).map(s => s.toUpperCase()).join(' › ');
    $('#fcStability').textContent = 'DESCENDANTS: ' + pad(rel.descendants.length, 2)
        + '  LIVING: ' + pad(livingDesc, 2)
        + '  SIBS: ' + pad(rel.siblings.length, 2);
    $('#fcStorageHdr').textContent = 'STORAGE :: ACCT ' + pad(idH, 4) + pad(rel.descendants.length, 3);

    // ---------- STORAGE BARS (network-percentile) ----------
    const setBar = (fillId, valId, val, capVal) => {
      const pct = Math.round((val / capVal) * 100);
      const fill = $(fillId);
      fill.style.setProperty('--w', pct + '%');
      fill.style.animation = 'none'; fill.offsetHeight; fill.style.animation = '';
      $(valId).textContent = pad(val, 2);
    };
    setBar('#fcS1F', '#fcS1V', rel.ancestors.length,    cap.anc);
    setBar('#fcS2F', '#fcS2V', rel.descendants.length,  cap.dsc);
    setBar('#fcS3F', '#fcS3V', rel.siblings.length,     cap.sib);
    setBar('#fcS4F', '#fcS4V', rel.partners.length,     cap.prt);

    // ---------- SUBJECT PROFILE LIST ----------
    $('#fcAlive').textContent = person.deceased ? 'DECEASED' : 'LIVING';
    $('#fcAlive').style.color = person.deceased ? 'var(--red)' : 'var(--green)';

    $('#fcInfTag').textContent  = person.gender.toUpperCase() + '-CONFIRMED';
    $('#fcRecord').textContent  = pad(totalRel, 2) + ' RELATIONAL TIES';
    $('#fcLocal').textContent   = isRoot ? 'ORIGIN' : ('BRANCH ' + branchAbbr);
    $('#fcIpf').textContent     = pad(rel.ancestors.length, 2) + ' ANC · ' + pad(rel.descendants.length, 2) + ' DSC';
    $('#fcProcess').textContent = photoUrl ? 'VERIFIED' : 'AWAITING IMG';
    $('#fcProcess').style.color = photoUrl ? 'var(--green)' : 'var(--amber)';

    // ---------- CENTER: ALPHA + STATUS + DATA GRID ----------
    const cls = person.gender === 'female' ? 'BETA' : person.gender === 'male' ? 'ALPHA' : 'GAMMA';
    $('#fcAlphaName').textContent = cls;
    $('#fcAlphaSub').textContent  = 'CLASSIFICATION CERTIFIED // ' + cls + '-' + personAbbr;

    const subjStat = person.deceased ? 'INACTIVE' : 'ACTIVE';
    $('#fcSubjectStat').textContent = subjStat;
    $('#fcCat').textContent         = 'CAT ' + (gen <= 1 ? 'I' : gen === 2 ? 'II' : 'III') + '  ' + pad(idH * 7 + 1000000, 7).slice(0, 10);
    $('#fcPhotoId').textContent     = 'FILE :: ' + branchAbbr + '-' + pad(idH, 4);

    $('#fcName').textContent    = person.name.toUpperCase();
    $('#fcGender').textContent  = person.gender.toUpperCase();
    $('#fcBorn').textContent    = person.birthYear ? String(person.birthYear) : 'UNKNOWN';
    $('#fcStatus').textContent  = person.deceased ? 'DECEASED' : 'LIVING';
    $('#fcStatus').style.color  = person.deceased ? 'var(--red)' : 'var(--green)';
    $('#fcId').textContent      = person.id.toUpperCase();
    $('#fcLineage').textContent = rel.root.name.toUpperCase();
    $('#fcGen').textContent     = pad(gen, 2);
    $('#fcNotes').textContent   = person.notes || '— No recorded observations —';

    // ---------- RIGHT MICRO COLUMN ----------
    $('#fcN1').textContent   = pad(rel.ancestors.length, 3)   + '.' + pad(rel.descendants.length, 2);
    $('#fcN2').textContent   = pad(gen, 3)                    + '.' + pad(rel.siblings.length, 2);
    $('#fcN3').textContent   = pad(rel.partners.length, 3)    + '.' + pad(rel.children.length, 2);
    $('#fcN4').textContent   = pad(idH, 3)                    + '.' + pad(totalRel, 2);
    $('#fcTagId').textContent = (person.id.toUpperCase().replace(/[^A-Z0-9]/g, '') + 'XXXX').slice(0, 6);

    // ---------- BOTTOM TABS ----------
    $('#fcB1').textContent = 'BRANCH · ' + branchName.toUpperCase();
    $('#fcB2').textContent = 'LINEAGE OF ' + rel.root.name.toUpperCase();
    $('#fcB3').textContent = 'GEN-' + pad(gen, 2) + ' OF ' + pad(Math.max(...Object.values(graph.depth)) + 1, 2);
    $('#fcB4').textContent = pad(rel.descendants.length, 2) + ' DESCENDANTS · ' + pad(totalRel, 2) + ' TIES';

    // ---------- RELATIONS (clickable network) ----------
    const renderFcRels = (containerId, people) => {
      const c = $(containerId);
      c.innerHTML = '';
      if (!people || people.length === 0) {
        const e = document.createElement('span');
        e.className = 'fc-rel-empty';
        e.textContent = '— NONE —';
        c.appendChild(e);
        return;
      }
      people.forEach(p => {
        const el = document.createElement('span');
        el.className = 'fc-rel-link';
        el.textContent = p.name;
        el.title = p.gender.toUpperCase() + ' · ' + p.id.toUpperCase();
        el.addEventListener('click', () => { Sound.blip(); openFullCard(p); });
        el.addEventListener('mouseenter', () => Sound.hover());
        c.appendChild(el);
      });
    };
    const byId = graph.byId;
    renderFcRels('#fcGrandparents', rel.grandparents);
    renderFcRels('#fcParents',      (person.parentIds || []).map(id => byId[id]).filter(Boolean));
    renderFcRels('#fcSiblings',     rel.siblings);
    renderFcRels('#fcPartner',      rel.partners);
    renderFcRels('#fcChildren',     rel.children);

    startFcTimer();
    Sound.boot();
  }

  function closeFullCard() {
    const fc = $('#fullCard');
    fc.classList.add('hidden');
    fc.setAttribute('aria-hidden', 'true');
    stopFcTimer();
    Sound.whoosh();
  }

  // ---- STATS ----
  function computeStats(data) {
    const total = data.people.length;
    const affected = data.people.filter(p => p.affected).length;
    const carriers = data.people.filter(p => p.carrier).length;

    // generations: BFS depth from roots
    const byId = {};
    data.people.forEach(p => byId[p.id] = p);
    const depth = {};
    const roots = data.people.filter(p => !p.parentIds || p.parentIds.length === 0 || !p.parentIds.some(id => byId[id]));
    roots.forEach(r => depth[r.id] = 0);
    let changed = true, guard = 0;
    while (changed && guard++ < 100) {
      changed = false;
      data.people.forEach(p => {
        if (depth[p.id] != null) return;
        const parentDepths = (p.parentIds || []).map(id => depth[id]).filter(d => d != null);
        if (parentDepths.length > 0) {
          depth[p.id] = Math.max(...parentDepths) + 1;
          changed = true;
        }
      });
    }
    const gens = Math.max(0, ...Object.values(depth)) + 1;
    return { total, affected, carriers, gens };
  }

  function renderStats(data) {
    const s = computeStats(data);
    const living = data.people.filter(p => !p.deceased).length;
    // branches = direct children of the bloodline root (gen-1 founders)
    const byId = {};
    data.people.forEach(p => byId[p.id] = p);
    const root = data.people.find(p => !p.parentIds || p.parentIds.length === 0);
    const branches = root ? data.people.filter(p => (p.parentIds || []).includes(root.id)).length : 0;

    $('#statCount').textContent    = String(s.total).padStart(2, '0');
    $('#statGens').textContent     = String(s.gens).padStart(2, '0');
    $('#statLiving').textContent   = String(living).padStart(2, '0');
    $('#statBranches').textContent = String(branches).padStart(2, '0');

    // also feed the corner HUD
    const nodesEl = document.getElementById('hudNodes');
    if (nodesEl) nodesEl.textContent = String(s.total).padStart(3, '0');
  }

  // ---- ATMOSPHERE: starfield + ticking HUD ----
  function generateStarfield() {
    const sf = $('#starfield');
    if (!sf || sf.dataset.done) return;
    sf.dataset.done = '1';
    const STAR_COUNT = 90;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < STAR_COUNT; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      const size = Math.random() < 0.85 ? 1 : 2;
      s.style.setProperty('--s', size + 'px');
      s.style.setProperty('--g', (size * 3 + Math.random() * 4).toFixed(1) + 'px');
      s.style.setProperty('--o', (0.25 + Math.random() * 0.45).toFixed(2));
      s.style.setProperty('--d', (3 + Math.random() * 5).toFixed(1) + 's');
      s.style.setProperty('--delay', (-Math.random() * 6).toFixed(1) + 's');
      s.style.left = (Math.random() * 100).toFixed(2) + '%';
      s.style.top  = (Math.random() * 100).toFixed(2) + '%';
      frag.appendChild(s);
    }
    sf.appendChild(frag);
  }

  let hudTickHandle = null;
  function startHudTicker() {
    if (hudTickHandle) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const padN = (n, w) => String(n).padStart(w, '0');
    const tick = () => {
      set('hudHdg',   padN(Math.floor(Math.random() * 360), 3) + '°');
      set('hudFreq',  (12 + Math.random() * 4).toFixed(2) + ' GHz');
      set('hudPwr',   (84 + Math.floor(Math.random() * 14)) + '%');
      set('hudCh',    'A-' + padN(Math.floor(Math.random() * 16), 2));
      set('hudFlux',  (Math.random() * 9.99).toFixed(2) + ' μT');
      // signal bars wobble between 4 and 5 filled
      set('hudSig',   Math.random() < 0.85 ? '▮▮▮▮▮' : '▮▮▮▮▯');
      set('hudSync',  (97 + Math.floor(Math.random() * 4)) + '%');
      // tiny coordinate jitter to feel "live"
      const lat = (28.61 + (Math.random() - 0.5) * 0.0008).toFixed(4);
      const lon = (77.20 + (Math.random() - 0.5) * 0.0008).toFixed(4);
      set('hudCoord', lat + '°N · ' + lon + '°E');
    };
    tick();
    hudTickHandle = setInterval(tick, 1700);
  }

  // ---- INIT ----
  function init() {
    const data = Data.load();
    if (data.meta) {
      $('#brandTitle').textContent = data.meta.title || 'PEDIGREE ARCHIVE';
      $('#brandSubtitle').textContent = data.meta.subtitle || '';
    }

    const svg = $('#pedigreeSvg');
    Pedigree.init(svg, {
      onSelect: (person) => showInspector(person, Data.load())
    });
    Pedigree.render(data);
    renderStats(data);

    // Topbar buttons
    $('#btnZoomIn').addEventListener('click', () => Pedigree.zoomIn());
    $('#btnZoomOut').addEventListener('click', () => Pedigree.zoomOut());
    $('#btnFit').addEventListener('click', () => Pedigree.reset());
    $('#btnAdmin').addEventListener('click', () => Sound.click());
    $('#btnOrigin').addEventListener('click', () => { Sound.whoosh(); toast('OPENING ORIGIN COORDINATES …'); });
    $('#btnLogout').addEventListener('click', () => {
      if (!confirm('END SESSION? YOU WILL NEED TO RE-AUTHENTICATE.')) return;
      Sound.glitch();
      Data.userLogout();
      Data.adminLogout();
      setTimeout(() => location.reload(), 350);
    });

    const btnMute = $('#btnMute');
    btnMute.addEventListener('click', () => {
      Sound.setMuted(!Sound.isMuted());
      btnMute.textContent = Sound.isMuted() ? '✕' : '♪';
      btnMute.style.color = Sound.isMuted() ? 'var(--red)' : '';
      toast(Sound.isMuted() ? 'AUDIO MUTED' : 'AUDIO ENABLED');
    });

    // hover sounds for toolbar
    document.querySelectorAll('.btn').forEach(b => {
      b.addEventListener('mouseenter', () => Sound.hover());
      b.addEventListener('click', () => Sound.click());
    });

    // zoom (open fullscreen subject file)
    $('#iZoom').addEventListener('click', () => {
      if (currentPerson) openFullCard(currentPerson);
    });

    // fullscreen card close
    $('#fcClose').addEventListener('click', closeFullCard);
    $('#fullCard').addEventListener('click', (e) => {
      // click on the dimmed background closes the card
      if (e.target.id === 'fullCard' || e.target.classList.contains('fc-bg')) closeFullCard();
    });

    // global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#fullCard').classList.contains('hidden')) { closeFullCard(); return; }
        if (!$('#inspector').classList.contains('hidden')) { $('#iClose').click(); return; }
      }
      if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
        const focusInForm = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement && document.activeElement.tagName);
        if (focusInForm) return;
        if (!$('#fullCard').classList.contains('hidden')) return;
        if (currentPerson) {
          $('#iZoom').click();
        }
      }
    });

    // close inspector
    $('#iClose').addEventListener('click', () => {
      $('#inspector').classList.add('hidden');
      Pedigree.hoverHighlight(null);
      Sound.click();
    });
    $('#stage').addEventListener('click', (e) => {
      if (e.target.closest('.inspector')) return;
      if (e.target.closest('.node-group')) return;
      if (e.target.closest('.toolbar')) return;
      $('#inspector').classList.add('hidden');
    });

    // refresh on storage change (e.g. from admin in another tab)
    window.addEventListener('storage', (e) => {
      if (e.key === 'genosys_family_tree_v1') {
        const fresh = Data.load();
        Pedigree.render(fresh);
        renderStats(fresh);
        toast('ARCHIVE SYNCED');
      }
    });

    // unlock audio on first gesture (browser policy)
    const unlock = () => { Sound.unlock(); document.removeEventListener('click', unlock); document.removeEventListener('keydown', unlock); };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);

    // atmospheric extras
    generateStarfield();
    startHudTicker();

    // toast welcome
    setTimeout(() => toast('SCAN COMPLETE — ' + data.people.length + ' SUBJECTS LOADED', 'success'), 200);
  }

  // ---- LOGIN + BOOT ----
  function showUserLogin() {
    $('#userLogin').classList.remove('hidden');
    $('#boot').classList.add('hidden');
    setTimeout(() => $('#userPass').focus(), 80);
  }

  function startBootAndInit() {
    $('#userLogin').classList.add('hidden');
    $('#boot').classList.remove('hidden');
    runBoot(() => {
      $('#boot').classList.add('done');
      setTimeout(init, 400);
      try { Sound.boot(); } catch (e) {}
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (Data.isUserLoggedIn()) {
      startBootAndInit();
    } else {
      showUserLogin();
    }

    $('#userLoginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#userPass').value;
      if (Data.userLogin(v)) {
        try { Sound.success(); } catch (_) {}
        startBootAndInit();
      } else {
        try { Sound.error(); } catch (_) {}
        const box = $('#userLogin .login-box');
        box.style.animation = 'none'; box.offsetHeight; box.style.animation = 'shake 0.4s';
        $('#userPass').value = '';
        $('#userPass').focus();
      }
    });
  });
})();
