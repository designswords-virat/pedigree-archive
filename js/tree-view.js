// ============================================================
// TREE VIEW — read-only chart of the logged-in user's lineage,
// with a small inspector that shows kindred on click.
// ============================================================

(async function () {
  const $  = (s) => document.querySelector(s);

  await Auth.init();

  // No auth gate. If they haven't filled the form yet, route them through it.
  const sessionUser = Auth.currentUser();
  if (!sessionUser || !sessionUser.profile) { location.href = 'details.html'; return; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function titleCase(s) { return String(s || '').replace(/\b\w/g, c => c.toUpperCase()); }
  function yearOf(d) { return d ? parseInt(String(d).slice(0,4), 10) : null; }

  let people = [], byId = {};
  function load() {
    const u = Auth.currentUser();
    people = (u && Array.isArray(u.people)) ? u.people.map(p => ({
      ...p,
      // backfill legacy fields the renderer relies on
      birthYear: p.birthYear || yearOf(p.birthDate),
      deathYear: p.deathYear || yearOf(p.deathDate),
      affected: !!p.affected, carrier: !!p.carrier,
      gender: ['male','female','unknown'].includes(p.gender) ? p.gender : 'unknown',
      parentIds: Array.isArray(p.parentIds) ? p.parentIds : [],
      partnerIds: Array.isArray(p.partnerIds) ? p.partnerIds : [],
    })) : [];
    byId = {};
    people.forEach(p => byId[p.id] = p);
  }

  function parentsOf(p) { return (p.parentIds || []).map(id => byId[id]).filter(Boolean); }
  function partnersOf(p){ return (p.partnerIds || []).map(id => byId[id]).filter(Boolean); }
  function childrenOf(p){ return people.filter(c => (c.parentIds || []).includes(p.id)); }
  function siblingsOf(p){
    const par = (p.parentIds || []);
    if (par.length === 0) return [];
    return people.filter(s => s.id !== p.id && (s.parentIds || []).some(pid => par.includes(pid)));
  }
  function fatherOf(p) { return parentsOf(p).find(x => x.gender === 'male')   || null; }
  function motherOf(p) { return parentsOf(p).find(x => x.gender === 'female') || null; }

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

  function openInspector(personId) {
    const p = byId[personId];
    if (!p) return;
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

    const rel = $('#iRelations');
    rel.innerHTML = '<h3>Kindred</h3>';
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
    renderGroup('Father',   [fatherOf(p)].filter(Boolean));
    renderGroup('Mother',   [motherOf(p)].filter(Boolean));
    renderGroup('Spouse',   partnersOf(p));
    renderGroup('Children', childrenOf(p));
    renderGroup('Siblings', siblingsOf(p));
  }
  function closeInspector() {
    $('#inspector').classList.add('hidden');
    $('#stage').classList.remove('has-inspector');
  }

  function init() {
    load();
    const svg = $('#pedigreeSvg');
    Pedigree.init(svg, {
      editMode: false,
      scrollMode: true,                                // tall scrollable tree
      onSelect: (person) => openInspector(person.id),
    });
    Pedigree.render({ people, meta: { title: 'Your Tree' } });

    $('#statCount').textContent = String(people.length).padStart(2, '0');
    // generations
    const depth = {};
    const roots = people.filter(p => !p.parentIds || p.parentIds.length === 0 || !p.parentIds.some(id => byId[id]));
    roots.forEach(r => depth[r.id] = 0);
    let changed = true, guard = 0;
    while (changed && guard++ < 100) {
      changed = false;
      people.forEach(p => {
        if (depth[p.id] != null) return;
        const pd = (p.parentIds || []).map(id => depth[id]).filter(d => d != null);
        if (pd.length > 0) { depth[p.id] = Math.max(...pd) + 1; changed = true; }
      });
    }
    const gens = Math.max(0, ...Object.values(depth)) + 1;
    $('#statGens').textContent = String(gens).padStart(2, '0');

    // empty banner
    $('#canvasEmpty').classList.toggle('hidden', people.length > 0);

    $('#btnTop').addEventListener('click', () => {
      $('#stage').scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Layout toggle:
    //   Compact   = scrollMode + wrapped sub-rows (tall scrollable tree)
    //   Full tree = fit-to-canvas + every generation on one line (chart view)
    // Flipping both modes together makes the change unmistakable even for
    // tiny trees where wrap/no-wrap alone would render identically.
    //
    // The .scroll-mode class on .stage governs the OUTER scroll container
    // (overflow-y:auto and SVG height:auto). Without toggling it, switching
    // to Full Tree still left the stage scrollable, so the chart appeared
    // squashed into a scrollable strip instead of fitting the viewport.
    function applyLayout(mode) {
      const isFull = (mode === 'full');
      document.querySelectorAll('.vt-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.layout === mode));
      $('#stage').classList.toggle('scroll-mode', !isFull);
      if (Pedigree.setScrollMode)   Pedigree.setScrollMode(!isFull);
      if (Pedigree.setWrapSiblings) Pedigree.setWrapSiblings(!isFull);
      $('#stage').scrollTo({ top: 0 });
      // Defensive re-fit: render schedules its own fitToView at 50ms,
      // but on small trees the SVG hasn't always reflowed by then so
      // the bounding box ends up offset. A second fit at 300ms lands
      // on the settled layout. Idempotent for already-centred trees.
      if (!isFull) return;
      if (Pedigree.fitToView) {
        setTimeout(() => { try { Pedigree.fitToView(); } catch (_) {} }, 300);
      }
    }
    $('#btnLayoutWrap').addEventListener('click', () => applyLayout('wrap'));
    $('#btnLayoutFull').addEventListener('click', () => applyLayout('full'));

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
          // bgColor omitted -- exportImage reads the active theme's
          // --ink-0 token so the JPG inherits whichever palette is on.
          format: 'image/jpeg',
          quality: 0.92,
        });
        Sound.success();
      } catch (err) {
        alert('Download failed: ' + (err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
    $('#iClose').addEventListener('click', () => { closeInspector(); Sound.click(); });

    $('#stage').addEventListener('click', (e) => {
      if (e.target.closest('.inspector')) return;
      if (e.target.closest('.node-group')) return;
      if (e.target.closest('.toolbar')) return;
      closeInspector();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#inspector').classList.contains('hidden')) closeInspector();
    });

    const unlock = () => { Sound.unlock(); document.removeEventListener('click', unlock); };
    document.addEventListener('click', unlock);
  }

  init();
})();
