// ============================================================
// ADMIN CONSOLE LOGIC
// ============================================================

(function () {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let currentId = null;       // selected person id (null = new)
  let formDirty = false;

  // ---- TOAST ----
  function toast(msg, kind = '') {
    const stack = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2900);
  }

  // ---- AUTH ----
  function showLogin() {
    $('#loginScreen').style.display = '';
    $('#adminShell').style.display = 'none';
    setTimeout(() => $('#loginPass').focus(), 100);
  }
  function showApp() {
    $('#loginScreen').style.display = 'none';
    $('#adminShell').style.display = '';
    renderList();
    renderHeaderStats();
  }

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = $('#loginPass').value;
    if (Data.login(pass)) {
      Sound.success();
      toast('ACCESS GRANTED', 'success');
      showApp();
    } else {
      Sound.error();
      toast('ACCESS DENIED — INVALID KEY', 'error');
      $('#loginPass').value = '';
      $('#loginPass').focus();
    }
  });

  $('#btnLogout').addEventListener('click', () => {
    Data.logout();
    Sound.click();
    showLogin();
    toast('SESSION TERMINATED');
  });

  // ---- LIST ----
  function renderList() {
    const data = Data.load();
    const filter = ($('#searchBox').value || '').trim().toLowerCase();
    const list = $('#personList');
    list.innerHTML = '';
    const filtered = filter
      ? data.people.filter(p => p.name.toLowerCase().includes(filter) || p.id.toLowerCase().includes(filter))
      : data.people;

    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'person-card' + (p.id === currentId ? ' selected' : '');
      const tags = [];
      if (p.deceased) tags.push('†');
      const yrs = p.birthYear ? p.birthYear : '';
      const photoUrl = Data.resolvePhoto(p);
      const thumb = photoUrl
        ? `<img class="card-thumb ${p.gender}" src="${escapeHtml(photoUrl)}" alt="" onerror="this.style.opacity=0.2;" />`
        : `<div class="card-thumb placeholder ${p.gender}"></div>`;
      card.innerHTML = `
        ${thumb}
        <div class="card-text">
          <div class="pname">${escapeHtml(p.name)}</div>
          <div class="pmeta">${p.gender.toUpperCase()} · ${p.id.toUpperCase()}${yrs ? ' · ' + yrs : ''}${tags.length ? ' · ' + tags.join(' ') : ''}</div>
        </div>
      `;
      card.addEventListener('click', () => { selectPerson(p.id); });
      card.addEventListener('mouseenter', () => Sound.hover());
      list.appendChild(card);
    });
    $('#adminCount').textContent = String(data.people.length).padStart(2, '0');
  }

  function renderHeaderStats() {
    const data = Data.load();
    $('#adminCount').textContent = String(data.people.length).padStart(2, '0');
  }

  $('#searchBox').addEventListener('input', () => renderList());

  // ---- FORM ----
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function selectGender(val) {
    $$('#genderPicker .tag-pick').forEach(t => t.classList.toggle('active', t.dataset.val === val));
  }
  function getGender() {
    const a = $('#genderPicker .tag-pick.active');
    return a ? a.dataset.val : 'unknown';
  }
  $$('#genderPicker .tag-pick').forEach(t => {
    t.addEventListener('click', () => { selectGender(t.dataset.val); Sound.click(); formDirty = true; });
  });

  function renderRelPickers(currentPersonId, selectedParents = [], selectedPartners = []) {
    const data = Data.load();
    const pp = $('#parentPicker');
    const pt = $('#partnerPicker');
    pp.innerHTML = '';
    pt.innerHTML = '';

    const others = data.people.filter(p => p.id !== currentPersonId);
    if (others.length === 0) {
      pp.innerHTML = '<span style="color:var(--text-faint);font-size:11px;letter-spacing:0.2em;">NO OTHER SUBJECTS</span>';
      pt.innerHTML = '<span style="color:var(--text-faint);font-size:11px;letter-spacing:0.2em;">NO OTHER SUBJECTS</span>';
      return;
    }

    others.forEach(p => {
      const t1 = document.createElement('div');
      t1.className = 'tag-pick' + (selectedParents.includes(p.id) ? ' active' : '');
      t1.textContent = p.name;
      t1.dataset.id = p.id;
      t1.addEventListener('click', () => {
        if (t1.classList.contains('active')) {
          t1.classList.remove('active');
        } else {
          // max 2 parents
          const active = $$('#parentPicker .tag-pick.active').length;
          if (active >= 2) { Sound.error(); toast('MAX 2 PARENTS', 'error'); return; }
          t1.classList.add('active');
        }
        Sound.click();
        formDirty = true;
      });
      pp.appendChild(t1);

      const t2 = document.createElement('div');
      t2.className = 'tag-pick' + (selectedPartners.includes(p.id) ? ' active' : '');
      t2.textContent = p.name;
      t2.dataset.id = p.id;
      t2.addEventListener('click', () => {
        t2.classList.toggle('active');
        Sound.click();
        formDirty = true;
      });
      pt.appendChild(t2);
    });
  }

  function updatePhotoPreview() {
    const v = ($('#pPhoto').value || '').trim();
    const p = $('#pPhotoPreview');
    p.innerHTML = '';
    if (!v) {
      const empty = document.createElement('span');
      empty.className = 'none';
      empty.textContent = '— NO PHOTO —';
      p.appendChild(empty);
      return;
    }
    const img = document.createElement('img');
    img.src = Data.resolvePhoto(v);
    img.onerror = () => { img.style.opacity = '0.3'; img.title = 'IMAGE NOT FOUND — CHECK FILENAME'; };
    p.appendChild(img);
    if (v.startsWith('data:')) {
      const lbl = document.createElement('span');
      lbl.className = 'none';
      lbl.textContent = '⚡ EMBEDDED (' + Math.round(v.length / 1024) + ' KB)';
      p.appendChild(lbl);
    }
  }

  function selectPerson(id) {
    if (formDirty && !confirm('UNSAVED CHANGES WILL BE LOST. CONTINUE?')) return;
    Sound.select();
    const data = Data.load();
    const p = data.people.find(x => x.id === id);
    if (!p) return;

    currentId = id;
    $('#emptyState').style.display = 'none';
    $('#personForm').style.display = '';
    $('#formTitle').textContent = 'EDIT // ' + p.name.toUpperCase();
    $('#pId').value = p.id;
    $('#pName').value = p.name;
    selectGender(p.gender);
    $('#pBirth').value = p.birthYear || '';
    $('#pDeath').value = p.deathYear || '';
    $('#pDeceased').checked = p.deceased;
    $('#pNotes').value = p.notes || '';
    $('#pPhoto').value = p.photo || '';
    $('#pPhotoFile').value = '';
    updatePhotoPreview();
    renderRelPickers(p.id, p.parentIds, p.partnerIds);
    $('#btnDelete').style.display = '';
    formDirty = false;
    renderList();
  }

  function newPerson() {
    if (formDirty && !confirm('UNSAVED CHANGES WILL BE LOST. CONTINUE?')) return;
    Sound.select();
    currentId = null;
    $('#emptyState').style.display = 'none';
    $('#personForm').style.display = '';
    $('#formTitle').textContent = 'NEW SUBJECT // PENDING ASSIGNMENT';
    $('#pId').value = Data.newId();
    $('#pName').value = '';
    selectGender('unknown');
    $('#pBirth').value = '';
    $('#pDeath').value = '';
    $('#pDeceased').checked = false;
    $('#pNotes').value = '';
    $('#pPhoto').value = '';
    $('#pPhotoFile').value = '';
    updatePhotoPreview();
    renderRelPickers(null, [], []);
    $('#btnDelete').style.display = 'none';
    formDirty = false;
    $('#pName').focus();
  }

  // photo field + file picker handlers
  $('#pPhoto').addEventListener('input', () => { formDirty = true; updatePhotoPreview(); });
  $('#pPhotoFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) {
      Sound.error();
      toast('FILE > 1.5MB — PLACE IN Profiles/ AND USE FILENAME', 'error');
      e.target.value = '';
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      $('#pPhoto').value = r.result;
      formDirty = true;
      updatePhotoPreview();
      Sound.blip();
    };
    r.readAsDataURL(f);
  });
  $('#btnPhotoClear').addEventListener('click', () => {
    $('#pPhoto').value = '';
    $('#pPhotoFile').value = '';
    formDirty = true;
    updatePhotoPreview();
    Sound.click();
  });

  $('#btnNew').addEventListener('click', newPerson);
  $('#btnCancel').addEventListener('click', () => {
    Sound.click();
    $('#emptyState').style.display = '';
    $('#personForm').style.display = 'none';
    currentId = null;
    formDirty = false;
    renderList();
  });

  $('#btnDelete').addEventListener('click', () => {
    if (!currentId) return;
    if (!confirm('DELETE THIS SUBJECT? RELATIONS WILL BE UNLINKED.')) return;
    Data.deletePerson(currentId);
    Sound.glitch();
    toast('SUBJECT PURGED', 'error');
    currentId = null;
    formDirty = false;
    $('#emptyState').style.display = '';
    $('#personForm').style.display = 'none';
    renderList();
  });

  $('#personForm').addEventListener('input', () => { formDirty = true; });

  $('#personForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('#pId').value;
    const parentIds  = $$('#parentPicker .tag-pick.active').map(t => t.dataset.id);
    const partnerIds = $$('#partnerPicker .tag-pick.active').map(t => t.dataset.id);
    const data = {
      id,
      name: $('#pName').value,
      gender: getGender(),
      birthYear: $('#pBirth').value,
      deathYear: $('#pDeath').value,
      deceased: $('#pDeceased').checked,
      notes:    $('#pNotes').value,
      photo:    $('#pPhoto').value,
      parentIds,
      partnerIds,
    };

    if (currentId) {
      Data.updatePerson(currentId, data);
      toast('RECORD UPDATED', 'success');
    } else {
      Data.addPerson(data);
      toast('NEW SUBJECT REGISTERED', 'success');
      currentId = id;
    }

    // reflect partner symmetry: if A → partner B, also B → partner A
    syncPartnerSymmetry();

    Sound.success();
    formDirty = false;
    renderList();
    selectPerson(currentId);
    renderHeaderStats();
  });

  function syncPartnerSymmetry() {
    const data = Data.load();
    let mutated = false;
    data.people.forEach(p => {
      (p.partnerIds || []).forEach(pid => {
        const partner = data.people.find(x => x.id === pid);
        if (partner && !(partner.partnerIds || []).includes(p.id)) {
          partner.partnerIds = [ ...(partner.partnerIds || []), p.id ];
          mutated = true;
        }
      });
    });
    if (mutated) Data.save(data);
  }

  // ---- EXPORT / IMPORT ----
  $('#btnExport').addEventListener('click', () => {
    Sound.click();
    const text = Data.exportJSON();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'genosys_pedigree_' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('ARCHIVE EXPORTED', 'success');
  });

  $('#btnImport').addEventListener('click', () => {
    Sound.click();
    $('#importText').value = '';
    $('#importDialog').style.display = '';
  });
  $('#btnImportCancel').addEventListener('click', () => {
    Sound.click();
    $('#importDialog').style.display = 'none';
  });
  $('#btnImportConfirm').addEventListener('click', () => {
    try {
      Data.importJSON($('#importText').value);
      Sound.success();
      toast('ARCHIVE IMPORTED', 'success');
      $('#importDialog').style.display = 'none';
      currentId = null;
      $('#emptyState').style.display = '';
      $('#personForm').style.display = 'none';
      renderList();
      renderHeaderStats();
    } catch (e) {
      Sound.error();
      toast('IMPORT FAILED — ' + e.message, 'error');
    }
  });

  // ---- CHANGE PASSWORD ----
  let passTarget = 'admin'; // 'admin' or 'user'
  function openPassDialog(target) {
    passTarget = target;
    $('#newPass').value = '';
    $('#newPass2').value = '';
    const title = $('#passDialog h1');
    if (title) title.textContent = target === 'user' ? 'CHANGE USER KEY' : 'CHANGE ADMIN KEY';
    $('#passDialog').style.display = '';
    setTimeout(() => $('#newPass').focus(), 100);
  }
  $('#btnChangePass').addEventListener('click', () => { Sound.click(); openPassDialog('admin'); });
  $('#btnChangeUserPass').addEventListener('click', () => { Sound.click(); openPassDialog('user'); });
  $('#btnPassCancel').addEventListener('click', () => {
    Sound.click();
    $('#passDialog').style.display = 'none';
  });
  $('#passForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const a = $('#newPass').value, b = $('#newPass2').value;
    if (a.length < 4) { Sound.error(); toast('KEY TOO SHORT (MIN 4)', 'error'); return; }
    if (a !== b)      { Sound.error(); toast('KEYS DO NOT MATCH', 'error'); return; }
    if (passTarget === 'user') {
      Data.setUserPass(a);
      toast('USER KEY UPDATED', 'success');
    } else {
      Data.setAdminPass(a);
      toast('ADMIN KEY UPDATED', 'success');
    }
    Sound.success();
    $('#passDialog').style.display = 'none';
  });

  // ---- RESET ----
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('RESET ALL DATA TO SAMPLE FAMILY? THIS CANNOT BE UNDONE.')) return;
    Data.reset();
    Sound.glitch();
    toast('ARCHIVE RESET', 'error');
    currentId = null;
    $('#emptyState').style.display = '';
    $('#personForm').style.display = 'none';
    renderList();
    renderHeaderStats();
  });

  // hover sounds for buttons
  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t.matches && t.matches('.btn, .tag-pick, .person-card')) {
      // already handled per-element where needed; keep light here to avoid spam
    }
  });

  // unlock audio on first gesture
  const unlock = () => { Sound.unlock(); document.removeEventListener('click', unlock); };
  document.addEventListener('click', unlock);

  // boot
  if (Data.isLoggedIn()) {
    showApp();
  } else {
    showLogin();
  }
})();
