// ============================================================
// TREE EDITOR — kinship-add panel + per-person edit/delete
//
// State lives in Auth (the logged-in user's `people` array). On every
// change we mutate the array and call Auth.saveTree(), then re-render.
// Partnership and parent links are kept symmetric (A ↔ B) automatically.
// ============================================================

(async function () {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  await Auth.init();

  // ---- gate ----
  if (!Auth.isLoggedIn()) { location.href = 'signup.html'; return; }
  const sessionUser = Auth.currentUser();
  if (!sessionUser) { await Auth.logout(); location.href = 'signup.html'; return; }
  if (!sessionUser.profile) { location.href = 'profile.html'; return; }

  // ---- helpers ----
  function newId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function titleCase(s) { return String(s || '').replace(/\b\w/g, c => c.toUpperCase()); }
  function yearOf(dateStr) { return dateStr ? parseInt(String(dateStr).slice(0, 4), 10) : null; }

  function toast(msg, kind = '') {
    const stack = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2900);
  }

  // ---- tree state ----
  let people = [];               // working copy
  let byId   = {};

  function loadTree() {
    const u = Auth.currentUser();
    people = (u && Array.isArray(u.people)) ? u.people.slice() : [];
    rebuildIndex();
    // Heal any pre-existing data that was saved before the co-parent /
    // partner-symmetry rules existed (or before they were correct).
    reconcile();
    persist();
  }
  function rebuildIndex() {
    byId = {};
    people.forEach(p => { byId[p.id] = p; });
  }
  function persist() {
    rebuildIndex();
    // fire-and-forget save; surface errors via toast
    Auth.saveTree(people).catch(err => toast('Save failed: ' + err.message, 'error'));
  }

  // Normalise person object to the shape pedigree.js expects.
  function normalise(p) {
    return {
      id: p.id,
      name: (p.name || 'Unknown').toString(),
      nickname: p.nickname || '',
      gender: ['male','female','unknown'].includes(p.gender) ? p.gender : 'unknown',
      affected: !!p.affected,
      carrier:  !!p.carrier,
      deceased: !!p.deceased,
      birthYear: p.birthYear || yearOf(p.birthDate),
      deathYear: p.deathYear || yearOf(p.deathDate),
      birthDate: p.birthDate || null,
      birthPlace: p.birthPlace || '',
      deathDate: p.deathDate || null,
      deathPlace: p.deathPlace || '',
      notes: (p.notes || '').toString(),
      photo: (p.photo || '').toString(),
      parentIds:  Array.isArray(p.parentIds)  ? p.parentIds.filter(Boolean)  : [],
      parentMeta: p.parentMeta  && typeof p.parentMeta  === 'object' ? p.parentMeta  : {},
      partnerIds: Array.isArray(p.partnerIds) ? p.partnerIds.filter(Boolean) : [],
      partnerMeta: p.partnerMeta && typeof p.partnerMeta === 'object' ? p.partnerMeta : {},
      isSelf: !!p.isSelf,
    };
  }

  // After every mutation: keep partner & parent links symmetric, infer
  // co-parents as partners (so the layout draws them as a couple), and
  // prune ghost references.
  function reconcile() {
    const validIds = new Set(people.map(p => p.id));
    people.forEach(p => {
      p.parentIds  = (p.parentIds  || []).filter(id => validIds.has(id));
      p.partnerIds = (p.partnerIds || []).filter(id => validIds.has(id));
      if (p.parentMeta)  Object.keys(p.parentMeta).forEach(k => { if (!validIds.has(k)) delete p.parentMeta[k]; });
      if (p.partnerMeta) Object.keys(p.partnerMeta).forEach(k => { if (!validIds.has(k)) delete p.partnerMeta[k]; });
    });

    rebuildIndex();

    // Co-parents are partners. If any child lists two people as parents, those
    // two should be linked as partners — otherwise the layout treats them as
    // unrelated roots and the tree falls apart. This is the rule that makes
    // "add Father" + "add Mother" produce a connected couple.
    people.forEach(child => {
      const pars = (child.parentIds || []).filter(id => byId[id]);
      for (let i = 0; i < pars.length; i++) {
        for (let j = i + 1; j < pars.length; j++) {
          const a = byId[pars[i]];
          const b = byId[pars[j]];
          if (!a || !b) continue;
          if (!a.partnerIds) a.partnerIds = [];
          if (!b.partnerIds) b.partnerIds = [];
          if (!a.partnerIds.includes(b.id)) a.partnerIds.push(b.id);
          if (!b.partnerIds.includes(a.id)) b.partnerIds.push(a.id);
        }
      }
    });

    // Ensure declared partner links are symmetric and propagate marriage meta.
    people.forEach(p => {
      (p.partnerIds || []).forEach(pid => {
        const partner = byId[pid];
        if (!partner) return;
        if (!partner.partnerIds) partner.partnerIds = [];
        if (!partner.partnerIds.includes(p.id)) partner.partnerIds.push(p.id);
        if (p.partnerMeta && p.partnerMeta[pid]) {
          if (!partner.partnerMeta) partner.partnerMeta = {};
          if (!partner.partnerMeta[p.id]) partner.partnerMeta[p.id] = { ...p.partnerMeta[pid] };
        }
      });
    });
  }

  // ---- relationship analysis ----
  function parentsOf(p)   { return (p.parentIds  || []).map(id => byId[id]).filter(Boolean); }
  function partnersOf(p)  { return (p.partnerIds || []).map(id => byId[id]).filter(Boolean); }
  function childrenOf(p)  { return people.filter(c => (c.parentIds || []).includes(p.id)); }
  function siblingsOf(p) {
    const par = (p.parentIds || []);
    if (par.length === 0) return [];
    return people.filter(s => s.id !== p.id && (s.parentIds || []).some(pid => par.includes(pid)));
  }
  function fatherOf(p)    { return parentsOf(p).find(x => x.gender === 'male')   || null; }
  function motherOf(p)    { return parentsOf(p).find(x => x.gender === 'female') || null; }

  // ---- pedigree adapter (renderer expects {people, meta}) ----
  function treeForRender() {
    return { people: people.map(normalise), meta: { title: 'Your Tree' } };
  }

  // ============================================================
  //   RENDER
  // ============================================================
  let svgEl, anchorPerson = null, panelOpen = false;

  function renderTree() {
    const data = treeForRender();
    Pedigree.render(data);
    $('#statCount').textContent = String(people.length).padStart(2, '0');
    // generations
    const depth = {};
    const idx = {}; data.people.forEach(p => idx[p.id] = p);
    const roots = data.people.filter(p => !p.parentIds || p.parentIds.length === 0 || !p.parentIds.some(id => idx[id]));
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
    const gens = Math.max(0, ...Object.values(depth)) + 1;
    $('#statGens').textContent = String(gens).padStart(2, '0');

    // empty banner
    $('#canvasEmpty').classList.toggle('hidden', people.length > 0);
  }

  function init() {
    svgEl = $('#pedigreeSvg');
    Pedigree.init(svgEl, {
      editMode: true,
      wrapSiblings: false,                              // edit canvas keeps strict gen rows
      onSelect: (person) => openInspector(person.id),
      onAdd:    (person) => openKinPanel(person.id),
    });
    loadTree();
    renderTree();

    // header buttons
    $('#btnZoomIn').addEventListener('click', () => Pedigree.zoomIn());
    $('#btnZoomOut').addEventListener('click', () => Pedigree.zoomOut());
    $('#btnFit').addEventListener('click', () => Pedigree.reset());
    $('#btnDownload').addEventListener('click', async () => {
      const btn = $('#btnDownload');
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Preparing…';
      try {
        const u = Auth.currentUser();
        const stem = (u && u.profile && u.profile.fullName)
          ? u.profile.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
          : 'family-tree';
        await Pedigree.exportImage({
          filename: stem + '-tree.jpg',
          scale: 2,
          bgColor: '#0a0805',
          format: 'image/jpeg',
          quality: 0.92,
        });
        toast('Tree saved to your downloads', 'success');
      } catch (err) {
        toast('Download failed: ' + (err.message || err), 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
    $('#btnSignout').addEventListener('click', async () => {
      if (!confirm('Sign out?')) return;
      await Auth.logout();
      location.href = 'index.html';
    });

    // close panel / inspector via stage click + esc
    $('#stage').addEventListener('click', (e) => {
      if (e.target.closest('.kin-panel')) return;
      if (e.target.closest('.inspector')) return;
      if (e.target.closest('.node-group')) return;
      if (e.target.closest('.toolbar')) return;
      if (e.target.closest('.kp-modal')) return;
      closeInspector();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#editModal').classList.contains('hidden')) { closeEditModal(); return; }
        if (panelOpen) { closeKinPanel(); return; }
        if (!$('#inspector').classList.contains('hidden')) { closeInspector(); return; }
      }
    });

    wireKinPanel();
    wireEditModal();
    wireInspector();

    // unlock audio on first gesture
    const unlock = () => { Sound.unlock(); document.removeEventListener('click', unlock); };
    document.addEventListener('click', unlock);
  }

  // ============================================================
  //   INSPECTOR (small read-only summary on click)
  // ============================================================
  let activeInspectorId = null;

  function openInspector(personId) {
    const p = byId[personId];
    if (!p) return;
    // close the kin-panel if it's open — they share the right-side slot
    if (panelOpen) closeKinPanel();
    activeInspectorId = personId;

    const insp = $('#inspector');
    insp.classList.remove('hidden');
    $('#stage').classList.add('has-inspector');

    $('#iName').textContent = p.name;
    $('#iRel').textContent  = describeRelationToSelf(p);

    if (p.photo) {
      $('#iPhotoWrap').style.display = '';
      $('#iPhoto').src = p.photo;
    } else {
      $('#iPhotoWrap').style.display = 'none';
      $('#iPhoto').removeAttribute('src');
    }

    const yrs = [];
    if (p.birthDate) yrs.push('b. ' + p.birthDate);
    else if (p.birthYear) yrs.push('b. ' + p.birthYear);
    if (p.deceased && p.deathDate) yrs.push('d. ' + p.deathDate);
    else if (p.deceased && p.deathYear) yrs.push('d. ' + p.deathYear);
    $('#iBorn').textContent = yrs.length ? yrs.join('  ·  ') : 'Unrecorded';
    $('#iBornPlace').textContent = p.birthPlace || '—';
    $('#iGender').textContent = titleCase(p.gender);
    $('#iAlive').innerHTML = p.deceased
      ? '<span style="color:var(--rose)">Departed</span>'
      : '<span style="color:#b3d6a3">Living</span>';
    $('#iNotes').textContent = p.notes || '— No note recorded —';

    const status = $('#iStatus');
    status.innerHTML = '';
    if (p.deceased) {
      const t = document.createElement('span');
      t.className = 'tag muted'; t.textContent = 'In memoriam'; status.appendChild(t);
    }
    if (p.isSelf) {
      const t = document.createElement('span');
      t.className = 'tag warn'; t.textContent = 'You'; status.appendChild(t);
    }

    // relations (clickable jump)
    const rel = $('#iRelations');
    rel.innerHTML = '';
    const renderGroup = (label, list) => {
      const group = document.createElement('div');
      group.className = 'rel-group';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = label + ':';
      group.appendChild(k);
      if (!list || list.length === 0) {
        const e = document.createElement('span');
        e.className = 'rel-empty';
        e.textContent = '— none —';
        group.appendChild(e);
      } else {
        list.forEach(person => {
          const a = document.createElement('span');
          a.className = 'rel-link';
          a.textContent = person.name;
          a.title = 'Open ' + person.name;
          a.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openInspector(person.id);
            Pedigree.highlight(person.id);
            Pedigree.panToNode(person.id);
            Sound.blip();
          });
          group.appendChild(a);
        });
      }
      rel.appendChild(group);
    };

    rel.innerHTML = '<h3>Kindred</h3>';
    renderGroup('Father',   [fatherOf(p)].filter(Boolean));
    renderGroup('Mother',   [motherOf(p)].filter(Boolean));
    renderGroup('Spouse',   partnersOf(p));
    renderGroup('Children', childrenOf(p));
    renderGroup('Siblings', siblingsOf(p));
  }
  function closeInspector() {
    $('#inspector').classList.add('hidden');
    $('#stage').classList.remove('has-inspector');
    activeInspectorId = null;
  }

  // Heuristic short label like "Mother", "Brother", "You". Used in the inspector
  // sub-line to give a quick sense of where this person sits relative to the user.
  function describeRelationToSelf(person) {
    const self = people.find(p => p.isSelf);
    if (!self) return '';
    if (person.id === self.id) return 'You';
    if ((self.parentIds || []).includes(person.id)) return person.gender === 'female' ? 'Mother' : person.gender === 'male' ? 'Father' : 'Parent';
    if ((self.partnerIds || []).includes(person.id)) return 'Spouse';
    if ((person.parentIds || []).includes(self.id)) return person.gender === 'female' ? 'Daughter' : person.gender === 'male' ? 'Son' : 'Child';
    if (siblingsOf(self).some(s => s.id === person.id)) return person.gender === 'female' ? 'Sister' : person.gender === 'male' ? 'Brother' : 'Sibling';
    return '';
  }

  function wireInspector() {
    $('#iClose').addEventListener('click', () => { closeInspector(); Sound.click(); });
    // EDIT now opens the full multi-tab details editor (Basic + 6 sections).
    // The simple in-modal editor is no longer used; one editor everywhere.
    $('#iEdit').addEventListener('click', () => {
      if (!activeInspectorId) return;
      Sound.click();
      location.href = 'details.html?source=person&id=' + encodeURIComponent(activeInspectorId);
    });
    $('#iAddKin').addEventListener('click', () => {
      if (activeInspectorId) openKinPanel(activeInspectorId);
    });
    $('#iDelete').addEventListener('click', () => {
      if (!activeInspectorId) return;
      const p = byId[activeInspectorId];
      if (!p) return;
      if (p.isSelf) {
        toast('You cannot remove yourself from your own book.', 'error');
        return;
      }
      if (!confirm('Remove ' + p.name + ' from your tree? Their kinship links will be unlinked.')) return;
      people = people.filter(x => x.id !== activeInspectorId);
      reconcile();
      persist();
      closeInspector();
      renderTree();
      toast('Removed', 'error');
    });
  }

  // ============================================================
  //   KINSHIP-ADD PANEL
  // ============================================================
  let activeRel = null;          // 'father', 'mother', 'spouse', etc.
  let activeQualifier = null;    // e.g. for grandparent: which parent's line; for cousin: which aunt/uncle
  let kpPhotoData = '';

  function openKinPanel(personId) {
    const p = byId[personId];
    if (!p) return;
    // close inspector if open — they share the right-side slot
    if (activeInspectorId) closeInspector();
    anchorPerson = p;
    panelOpen = true;
    activeRel = null;
    activeQualifier = null;
    kpPhotoData = '';

    $('#kinPanel').classList.remove('hidden');
    $('#stage').classList.add('has-inspector');     // re-use the dimming overlay on mobile
    $('#kpToName').textContent = p.name;

    showKpStep('type');
    refreshRelationButtons();
  }
  function closeKinPanel() {
    panelOpen = false;
    $('#kinPanel').classList.add('hidden');
    $('#stage').classList.remove('has-inspector');
    anchorPerson = null;
    activeRel = null;
    activeQualifier = null;
    kpPhotoData = '';
    $('#kpStatus').className = 'auth-status';
    $('#kpStatus').textContent = '';
  }
  function showKpStep(step) {
    $('#kpStepType').classList.toggle('hidden', step !== 'type');
    $('#kpStepQualifier').classList.toggle('hidden', step !== 'qualifier');
    $('#kpStepForm').classList.toggle('hidden', step !== 'form');
  }

  // Enable/disable relation buttons based on what's possible given anchor's existing kin.
  function refreshRelationButtons() {
    const p = anchorPerson;
    const father = fatherOf(p);
    const mother = motherOf(p);
    const allParents = parentsOf(p);

    const sibSlot = siblingsOfCanBeAdded(p);   // sibling needs at least one parent
    const grandSlot = allParents.length > 0;
    const cousinSlot = allParents.some(pp => siblingsOf(pp).length > 0);

    const setBtn = (rel, ok, hint) => {
      const btn = document.querySelector(`.kp-rel[data-rel="${rel}"]`);
      if (!btn) return;
      btn.disabled = !ok;
      if (hint) btn.title = hint;
    };

    setBtn('father',  !father, father ? 'A father is already recorded' : 'Add a father');
    setBtn('mother',  !mother, mother ? 'A mother is already recorded' : 'Add a mother');
    setBtn('spouse',  true,    'Add a husband or wife');
    setBtn('child',   true,    'Add a son or daughter');
    setBtn('sibling', sibSlot, sibSlot ? 'Add a brother or sister (shares parents)' : 'Add a parent first to enable siblings');
    setBtn('grandparent', grandSlot, grandSlot ? 'Add a parent of one of this person’s parents' : 'Add a parent first to enable grandparents');
    setBtn('cousin', cousinSlot, cousinSlot ? 'Add a child of one of this person’s aunts or uncles' : 'Add a sibling to one of this person’s parents first');

    $('#kpHint').textContent = '';
  }
  function siblingsOfCanBeAdded(p) {
    return parentsOf(p).length > 0;
  }

  function wireKinPanel() {
    $('#kpClose').addEventListener('click', () => { closeKinPanel(); Sound.click(); });

    // relation buttons
    $$('.kp-rel').forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return;
      activeRel = b.dataset.rel;
      Sound.select();
      // does this relation need a qualifier?
      if (activeRel === 'grandparent') {
        showQualifier('grandparent');
      } else if (activeRel === 'cousin') {
        showQualifier('cousin');
      } else {
        prepareForm();
        showKpStep('form');
      }
    }));

    // qualifier back
    $('#kpQualBack').addEventListener('click', () => { showKpStep('type'); activeQualifier = null; Sound.click(); });
    $('#kpFormBack').addEventListener('click', () => {
      // back to qualifier or type depending on current relation
      Sound.click();
      if (activeRel === 'grandparent' || activeRel === 'cousin') showKpStep('qualifier');
      else { showKpStep('type'); activeRel = null; }
      activeQualifier = null;
    });

    // gender / status pickers
    $$('#kpGenderPicker .tag-pick').forEach(t => t.addEventListener('click', () => {
      $$('#kpGenderPicker .tag-pick').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    }));
    $$('#kpStatusPicker .tag-pick').forEach(t => t.addEventListener('click', () => {
      $$('#kpStatusPicker .tag-pick').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const dec = t.dataset.val === 'deceased';
      document.querySelectorAll('#kinPanel .death-only').forEach(el => el.style.display = dec ? '' : 'none');
    }));
    $$('#kpRelTypePicker .tag-pick').forEach(t => t.addEventListener('click', () => {
      $$('#kpRelTypePicker .tag-pick').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    }));

    // photo — uploads to Supabase Storage immediately, stores URL
    $('#kpPhotoFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast('Image too large (max 8 MB).', 'error'); e.target.value = ''; return; }
      try {
        toast('Uploading photo…', '');
        kpPhotoData = await Photos.upload(f);
        renderKpPhoto();
      } catch (err) {
        toast('Upload failed: ' + err.message, 'error');
        e.target.value = '';
      }
    });
    $('#kpPhotoClear').addEventListener('click', () => {
      if (kpPhotoData) Photos.deleteByUrl(kpPhotoData);
      kpPhotoData = '';
      $('#kpPhotoFile').value = '';
      renderKpPhoto();
    });

    // submit
    $('#kpForm').addEventListener('submit', onKpSubmit);
  }
  function renderKpPhoto() {
    const p = $('#kpPhotoPreview');
    if (kpPhotoData) {
      p.innerHTML = '';
      const img = document.createElement('img');
      img.src = kpPhotoData;
      p.appendChild(img);
    } else {
      p.innerHTML = '<span class="ph">No likeness</span>';
    }
  }

  function showQualifier(kind) {
    const head = $('#kpQualHead');
    const opts = $('#kpQualOptions');
    opts.innerHTML = '';
    if (kind === 'grandparent') {
      head.textContent = 'Through which line?';
      const f = fatherOf(anchorPerson), m = motherOf(anchorPerson);
      const ps = [f, m].filter(Boolean);
      ps.forEach(par => {
        const b = document.createElement('button');
        b.className = 'kp-qual-opt';
        b.innerHTML = `<strong>Through ${par.gender === 'female' ? 'mother' : 'father'}</strong><span>${escapeHtml(par.name)}</span>`;
        b.addEventListener('click', () => {
          activeQualifier = par.id;
          prepareForm();
          showKpStep('form');
          Sound.select();
        });
        opts.appendChild(b);
      });
    } else if (kind === 'cousin') {
      head.textContent = 'Whose child are they?';
      const aunts = [];
      parentsOf(anchorPerson).forEach(par => {
        siblingsOf(par).forEach(s => aunts.push(s));
      });
      const seen = new Set();
      aunts.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; }).forEach(au => {
        const b = document.createElement('button');
        b.className = 'kp-qual-opt';
        const role = au.gender === 'female' ? 'aunt' : au.gender === 'male' ? 'uncle' : 'aunt/uncle';
        b.innerHTML = `<strong>Child of ${role}</strong><span>${escapeHtml(au.name)}</span>`;
        b.addEventListener('click', () => {
          activeQualifier = au.id;
          prepareForm();
          showKpStep('form');
          Sound.select();
        });
        opts.appendChild(b);
      });
    }
    showKpStep('qualifier');
  }

  function prepareForm() {
    // reset form values
    $('#kpForm').reset();
    kpPhotoData = '';
    renderKpPhoto();

    // set defaults based on active relation
    let presetGender = 'unknown';
    let formHead = 'Particulars';
    let showRelType = false;
    let showSpouse = false;

    switch (activeRel) {
      case 'father':      presetGender = 'male';   formHead = 'A new father';       showRelType = true; break;
      case 'mother':      presetGender = 'female'; formHead = 'A new mother';       showRelType = true; break;
      case 'spouse':
        // heuristic: opposite of anchor's gender
        if (anchorPerson.gender === 'male') presetGender = 'female';
        else if (anchorPerson.gender === 'female') presetGender = 'male';
        formHead = 'A new spouse'; showSpouse = true; break;
      case 'child':       presetGender = 'unknown'; formHead = 'A new child'; break;
      case 'sibling':     presetGender = 'unknown'; formHead = 'A new sibling'; break;
      case 'grandparent': presetGender = 'unknown'; formHead = 'A new grandparent'; showRelType = true; break;
      case 'cousin':      presetGender = 'unknown'; formHead = 'A new cousin'; break;
    }

    $('#kpFormHead').textContent = formHead;

    // gender picker
    $$('#kpGenderPicker .tag-pick').forEach(t => t.classList.toggle('active', t.dataset.val === presetGender));
    // status default to alive
    $$('#kpStatusPicker .tag-pick').forEach(t => t.classList.toggle('active', t.dataset.val === 'alive'));
    document.querySelectorAll('#kinPanel .death-only').forEach(el => el.style.display = 'none');

    // toggle conditional groups
    $('#kpRelTypeGroup').style.display = showRelType ? '' : 'none';
    document.querySelectorAll('#kinPanel .spouse-only').forEach(el => el.style.display = showSpouse ? '' : 'none');

    // reset relationship-type picker to biological
    $$('#kpRelTypePicker .tag-pick').forEach(t => t.classList.toggle('active', t.dataset.val === 'biological'));

    setTimeout(() => $('#kpName').focus(), 50);
  }

  function getKpGender() {
    const a = $('#kpGenderPicker .tag-pick.active');
    return a ? a.dataset.val : 'unknown';
  }
  function getKpStatus() {
    const a = $('#kpStatusPicker .tag-pick.active');
    return a ? a.dataset.val : 'alive';
  }
  function getKpRelType() {
    const a = $('#kpRelTypePicker .tag-pick.active');
    return a ? a.dataset.val : 'biological';
  }

  function onKpSubmit(e) {
    e.preventDefault();
    const name = $('#kpName').value.trim();
    if (!name) {
      $('#kpStatus').className = 'auth-status error'; $('#kpStatus').textContent = 'Please enter a name.';
      return;
    }
    const gender = getKpGender();
    const status = getKpStatus();
    const newPerson = normalise({
      id: newId(),
      name,
      nickname: $('#kpNick').value.trim(),
      gender,
      birthDate: $('#kpBirthDate').value || null,
      birthPlace: $('#kpBirthPlace').value.trim(),
      deceased: status === 'deceased',
      deathDate: status === 'deceased' ? ($('#kpDeathDate').value || null) : null,
      deathPlace: status === 'deceased' ? $('#kpDeathPlace').value.trim() : '',
      photo: kpPhotoData,
      notes: $('#kpNotes').value.trim(),
      parentIds: [], partnerIds: [],
      parentMeta: {}, partnerMeta: {},
    });

    // Now connect them according to the active relation
    try {
      attachKinship(newPerson, activeRel, activeQualifier);
    } catch (err) {
      $('#kpStatus').className = 'auth-status error'; $('#kpStatus').textContent = err.message;
      return;
    }

    people.push(newPerson);
    reconcile();
    persist();
    Sound.success();
    toast('Added — ' + newPerson.name, 'success');
    closeKinPanel();
    renderTree();
    setTimeout(() => Pedigree.panToNode(newPerson.id), 380);
  }

  // Wire the new person into the graph based on the chosen relation.
  // Mutates newPerson and the existing anchor in-place (and any qualifier target).
  function attachKinship(newPerson, rel, qualifier) {
    const a = anchorPerson;
    const relType = getKpRelType();
    const marriageDate = $('#kpMarriageDate').value || null;
    const divorceDate  = $('#kpDivorceDate').value || null;

    switch (rel) {
      case 'father':
      case 'mother': {
        // anchor gets newPerson as parent
        if (!a.parentIds) a.parentIds = [];
        a.parentIds.push(newPerson.id);
        if (!a.parentMeta) a.parentMeta = {};
        a.parentMeta[newPerson.id] = { type: relType };
        break;
      }
      case 'spouse': {
        // bilateral partnership with marriage meta
        if (!a.partnerIds) a.partnerIds = [];
        a.partnerIds.push(newPerson.id);
        if (!a.partnerMeta) a.partnerMeta = {};
        a.partnerMeta[newPerson.id] = { marriedDate: marriageDate, divorcedDate: divorceDate };
        if (!newPerson.partnerIds) newPerson.partnerIds = [];
        newPerson.partnerIds.push(a.id);
        if (!newPerson.partnerMeta) newPerson.partnerMeta = {};
        newPerson.partnerMeta[a.id] = { marriedDate: marriageDate, divorcedDate: divorceDate };
        break;
      }
      case 'child': {
        // newPerson's parents = anchor (+ anchor's partner if exactly one)
        const partners = partnersOf(a);
        if (!newPerson.parentIds) newPerson.parentIds = [];
        newPerson.parentIds.push(a.id);
        if (partners.length === 1) {
          newPerson.parentIds.push(partners[0].id);
        }
        break;
      }
      case 'sibling': {
        // share parents with anchor
        if ((a.parentIds || []).length === 0) throw new Error('No parents on this person — add a parent first.');
        newPerson.parentIds = (a.parentIds || []).slice();
        // mirror parentMeta default (biological) for the new sibling
        newPerson.parentMeta = {};
        newPerson.parentIds.forEach(pid => { newPerson.parentMeta[pid] = { type: 'biological' }; });
        break;
      }
      case 'grandparent': {
        // qualifier = the parent's id we're climbing through
        const parent = byId[qualifier];
        if (!parent) throw new Error('That parent is no longer in the tree — reopen the panel.');
        if (!parent.parentIds) parent.parentIds = [];
        // refuse if a same-sex grandparent on that side already exists (a person has at most one father / one mother)
        const existingSameSex = parent.parentIds.map(id => byId[id]).filter(Boolean).find(g => g && g.gender === newPerson.gender && g.gender !== 'unknown');
        if (existingSameSex) throw new Error('A ' + (newPerson.gender === 'male' ? 'father' : 'mother') + ' for ' + parent.name + ' is already recorded.');
        parent.parentIds.push(newPerson.id);
        if (!parent.parentMeta) parent.parentMeta = {};
        parent.parentMeta[newPerson.id] = { type: relType };
        break;
      }
      case 'cousin': {
        // qualifier = aunt/uncle id; new person is their child
        const au = byId[qualifier];
        if (!au) throw new Error('That aunt or uncle is no longer in the tree — reopen the panel.');
        const auPartners = partnersOf(au);
        if (!newPerson.parentIds) newPerson.parentIds = [];
        newPerson.parentIds.push(au.id);
        if (auPartners.length === 1) newPerson.parentIds.push(auPartners[0].id);
        break;
      }
      default:
        throw new Error('Unknown relation: ' + rel);
    }
  }

  // ============================================================
  //   EDIT-PERSON MODAL
  // ============================================================
  let emActiveId = null;
  let emPhotoData = '';

  function openEditModal(personId) {
    const p = byId[personId];
    if (!p) return;
    emActiveId = personId;

    $('#emHeadName').textContent = p.name;
    $('#emName').value      = p.name      || '';
    $('#emNick').value      = p.nickname  || '';
    $('#emBirthDate').value = p.birthDate || '';
    $('#emBirthPlace').value = p.birthPlace || '';
    $('#emDeathDate').value = p.deathDate || '';
    $('#emDeathPlace').value = p.deathPlace || '';
    $('#emNotes').value     = p.notes     || '';
    $$('#emGenderPicker .tag-pick').forEach(t => t.classList.toggle('active', t.dataset.val === (p.gender || 'unknown')));
    const status = p.deceased ? 'deceased' : 'alive';
    $$('#emStatusPicker .tag-pick').forEach(t => t.classList.toggle('active', t.dataset.val === status));
    document.querySelectorAll('.em-death-only').forEach(el => el.style.display = p.deceased ? '' : 'none');
    emPhotoData = p.photo || '';
    renderEmPhoto();

    $('#editModal').classList.remove('hidden');
    $('#emStatus').className = 'auth-status'; $('#emStatus').textContent = '';
    setTimeout(() => $('#emName').focus(), 60);
  }
  function closeEditModal() {
    $('#editModal').classList.add('hidden');
    emActiveId = null; emPhotoData = '';
  }
  function renderEmPhoto() {
    const p = $('#emPhotoPreview');
    if (emPhotoData) {
      p.innerHTML = '';
      const img = document.createElement('img');
      img.src = emPhotoData;
      p.appendChild(img);
    } else {
      p.innerHTML = '<span class="ph">No likeness</span>';
    }
  }
  function wireEditModal() {
    $('#emClose').addEventListener('click', closeEditModal);
    $('#emCancel').addEventListener('click', closeEditModal);
    $$('#emGenderPicker .tag-pick').forEach(t => t.addEventListener('click', () => {
      $$('#emGenderPicker .tag-pick').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    }));
    $$('#emStatusPicker .tag-pick').forEach(t => t.addEventListener('click', () => {
      $$('#emStatusPicker .tag-pick').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const dec = t.dataset.val === 'deceased';
      document.querySelectorAll('.em-death-only').forEach(el => el.style.display = dec ? '' : 'none');
    }));
    $('#emPhotoFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast('Image too large (max 8 MB).', 'error'); e.target.value = ''; return; }
      try {
        toast('Uploading photo…', '');
        emPhotoData = await Photos.upload(f);
        renderEmPhoto();
      } catch (err) {
        toast('Upload failed: ' + err.message, 'error');
        e.target.value = '';
      }
    });
    $('#emPhotoClear').addEventListener('click', () => {
      if (emPhotoData) Photos.deleteByUrl(emPhotoData);
      emPhotoData = '';
      $('#emPhotoFile').value = '';
      renderEmPhoto();
    });

    $('#emForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!emActiveId) return;
      const p = byId[emActiveId];
      if (!p) return;
      const status = ($('#emStatusPicker .tag-pick.active') || {dataset:{val:'alive'}}).dataset.val;
      const updates = {
        name:       $('#emName').value.trim(),
        nickname:   $('#emNick').value.trim(),
        gender:     ($('#emGenderPicker .tag-pick.active') || {dataset:{val:'unknown'}}).dataset.val,
        birthDate:  $('#emBirthDate').value || null,
        birthPlace: $('#emBirthPlace').value.trim(),
        deceased:   status === 'deceased',
        deathDate:  status === 'deceased' ? ($('#emDeathDate').value || null) : null,
        deathPlace: status === 'deceased' ? $('#emDeathPlace').value.trim() : '',
        notes:      $('#emNotes').value.trim(),
        photo:      emPhotoData,
      };
      if (!updates.name) {
        $('#emStatus').className = 'auth-status error'; $('#emStatus').textContent = 'Name cannot be empty.';
        return;
      }
      Object.assign(p, updates);
      // refresh derived legacy fields
      p.birthYear = yearOf(updates.birthDate);
      p.deathYear = yearOf(updates.deathDate);
      reconcile();
      persist();
      Sound.success();
      toast('Saved', 'success');
      closeEditModal();
      renderTree();
      // reopen inspector with updated values
      openInspector(p.id);
    });
  }

  // ===== boot =====
  init();
})();
