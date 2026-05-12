// ============================================================
// TREE VIEW — read-only chart of the logged-in user's lineage,
// with a small inspector that shows kindred on click.
// ============================================================

(async function () {
  const $  = (s) => document.querySelector(s);

  await Auth.init();

  // No redirect away from the chart -- if the user has no profile yet
  // (e.g. came straight from the landing CTA), we still show whatever
  // people exist in the active book (which tree-edit auto-seeds).
  const sessionUser = Auth.currentUser();

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

  // Sibling categories derived from parentIds / partnerIds.
  //   full      — every parent in common (the everyday meaning of "sibling")
  //   half      — at least one parent in common but not all
  //   step      — no parents in common, but one of my parents is married
  //                to a person whose child this is (no shared blood)
  function fullSiblingsOf(p) {
    const par = new Set(p.parentIds || []);
    if (!par.size) return [];
    return people.filter(s => {
      if (s.id === p.id) return false;
      const sp = s.parentIds || [];
      return sp.length === par.size && sp.every(pid => par.has(pid));
    });
  }
  function halfSiblingsOf(p) {
    const par = new Set(p.parentIds || []);
    if (!par.size) return [];
    return people.filter(s => {
      if (s.id === p.id) return false;
      const sp = s.parentIds || [];
      if (!sp.length) return false;
      const shared = sp.filter(pid => par.has(pid)).length;
      const sameSet = sp.length === par.size && sp.every(pid => par.has(pid));
      return shared > 0 && !sameSet;
    });
  }
  function stepSiblingsOf(p) {
    const myParents = new Set(p.parentIds || []);
    const out = new Set();
    parentsOf(p).forEach(par => {
      (par.partnerIds || [])
        .filter(pid => !myParents.has(pid) && pid !== p.id)
        .map(pid => byId[pid]).filter(Boolean)
        .forEach(sp => {
          childrenOf(sp).forEach(c => {
            if (c.id === p.id) return;
            const shared = (c.parentIds || []).some(pid => myParents.has(pid));
            if (!shared) out.add(c.id);
          });
        });
    });
    return Array.from(out).map(id => byId[id]).filter(Boolean);
  }
  // Combined sibling list (used wherever the legacy code just said "siblings").
  function siblingsOf(p) {
    return [...fullSiblingsOf(p), ...halfSiblingsOf(p)];
  }

  // Step-parent: a partner of one of my biological parents who is NOT a
  // biological parent of mine. Includes ex-partners too — the data model
  // keeps every partnerIds entry.
  function stepParentsOf(p) {
    const myParents = new Set(p.parentIds || []);
    const out = new Set();
    parentsOf(p).forEach(par => {
      (par.partnerIds || []).forEach(pid => {
        if (!myParents.has(pid) && pid !== p.id) out.add(pid);
      });
    });
    return Array.from(out).map(id => byId[id]).filter(Boolean);
  }
  // Step-child: any child of one of my partners who is NOT also my child.
  function stepChildrenOf(p) {
    const out = new Set();
    partnersOf(p).forEach(partner => {
      childrenOf(partner).forEach(c => {
        if (!(c.parentIds || []).includes(p.id)) out.add(c.id);
      });
    });
    return Array.from(out).map(id => byId[id]).filter(Boolean);
  }
  function fatherOf(p) { return parentsOf(p).find(x => x.gender === 'male')   || null; }
  function motherOf(p) { return parentsOf(p).find(x => x.gender === 'female') || null; }

  function describeRelationToSelf(person) {
    const self = people.find(p => p.isSelf);
    if (!self) return '';
    if (person.id === self.id) return 'You';
    if ((self.parentIds || []).includes(person.id)) return person.gender === 'female' ? 'Mother' : person.gender === 'male' ? 'Father' : 'Parent';
    if (stepParentsOf(self).some(s => s.id === person.id)) return person.gender === 'female' ? 'Step-mother' : person.gender === 'male' ? 'Step-father' : 'Step-parent';
    if ((self.partnerIds || []).includes(person.id)) return 'Spouse';
    if ((person.parentIds || []).includes(self.id)) return person.gender === 'female' ? 'Daughter' : person.gender === 'male' ? 'Son' : 'Child';
    if (stepChildrenOf(self).some(s => s.id === person.id)) return person.gender === 'female' ? 'Step-daughter' : person.gender === 'male' ? 'Step-son' : 'Step-child';
    if (fullSiblingsOf(self).some(s => s.id === person.id)) return person.gender === 'female' ? 'Sister' : person.gender === 'male' ? 'Brother' : 'Sibling';
    if (halfSiblingsOf(self).some(s => s.id === person.id)) return person.gender === 'female' ? 'Half-sister' : person.gender === 'male' ? 'Half-brother' : 'Half-sibling';
    if (stepSiblingsOf(self).some(s => s.id === person.id)) return person.gender === 'female' ? 'Step-sister' : person.gender === 'male' ? 'Step-brother' : 'Step-sibling';
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
    // Biological parents first, then any step-parents (partners of those
    // parents who aren't blood-parents themselves).
    renderGroup('Father',         [fatherOf(p)].filter(Boolean));
    renderGroup('Mother',         [motherOf(p)].filter(Boolean));
    const sp = stepParentsOf(p);
    const stepMothers = sp.filter(x => x.gender === 'female');
    const stepFathers = sp.filter(x => x.gender === 'male');
    const stepOther   = sp.filter(x => x.gender !== 'male' && x.gender !== 'female');
    if (stepFathers.length) renderGroup('Step-father', stepFathers);
    if (stepMothers.length) renderGroup('Step-mother', stepMothers);
    if (stepOther.length)   renderGroup('Step-parent', stepOther);

    renderGroup('Spouse',         partnersOf(p));
    renderGroup('Children',       childrenOf(p));
    const sc = stepChildrenOf(p);
    if (sc.length) renderGroup('Step-children', sc);

    // Three flavours of sibling — only render the ones that exist so the
    // panel doesn't fill up with empty rows for the common case.
    renderGroup('Siblings',       fullSiblingsOf(p));
    const halfs = halfSiblingsOf(p);
    const steps = stepSiblingsOf(p);
    if (halfs.length) renderGroup('Half-siblings', halfs);
    if (steps.length) renderGroup('Step-siblings', steps);
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
    // restore the persisted branch-style choice before first render
    const savedBranch = (() => {
      try { return localStorage.getItem('pa_branch_style'); } catch (_) { return null; }
    })();
    if (savedBranch === 'angular' && Pedigree.setBranchStyle) {
      Pedigree.setBranchStyle('angular');
      document.querySelectorAll('#btnBranchCurve, #btnBranchAngular').forEach(b =>
        b.classList.toggle('active', b.dataset.branch === 'angular'));
    }
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

    function applyBranchStyle(style) {
      document.querySelectorAll('#btnBranchCurve, #btnBranchAngular').forEach(b =>
        b.classList.toggle('active', b.dataset.branch === style));
      if (Pedigree.setBranchStyle) Pedigree.setBranchStyle(style);
      try { localStorage.setItem('pa_branch_style', style); } catch (_) {}
    }
    $('#btnBranchCurve')  .addEventListener('click', () => applyBranchStyle('curve'));
    $('#btnBranchAngular').addEventListener('click', () => applyBranchStyle('angular'));

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
