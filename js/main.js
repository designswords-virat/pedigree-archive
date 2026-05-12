// ============================================================
// LANDING PAGE — public hero
//   • Renders the demo pedigree as a decorative background
//   • Cycles a random spotlight subject every few seconds
//   • Floating caption follows the spotlighted portrait
// ============================================================

(function () {
  const $ = (sel) => document.querySelector(sel);

  const SPOTLIGHT_INTERVAL = 4200;   // ms between subject changes
  const FIRST_SPOTLIGHT_DELAY = 1400; // ms after render before the first spotlight

  let spotlightTimer = null;
  let lastSubjectId = null;
  let demoData = null;

  function captionMeta(person) {
    const bits = [];
    if (person.birthYear) bits.push('b. ' + person.birthYear);
    if (person.deceased && person.deathYear) bits.push('d. ' + person.deathYear);
    else if (person.deceased) bits.push('in memoriam');
    return bits.join(' · ');
  }

  // Pick a different subject from last time so the cycle visibly changes.
  function pickRandom(ids) {
    if (ids.length === 0) return null;
    if (ids.length === 1) return ids[0];
    let id;
    do { id = ids[Math.floor(Math.random() * ids.length)]; }
    while (id === lastSubjectId);
    return id;
  }

  function showSpotlight(personId) {
    const rect = Pedigree.spotlight(personId);
    if (!rect) return;
    const person = demoData.people.find(p => p.id === personId);
    if (!person) return;

    const caption = $('#spotlightCaption');
    $('#captionName').textContent = person.name;
    $('#captionMeta').textContent = captionMeta(person) || 'of the lineage';

    // make caption visible briefly so we can measure it
    caption.classList.add('visible');
    const captionH = caption.offsetHeight || 70;
    const captionW = caption.offsetWidth  || 200;

    // position above the portrait, centred horizontally on it
    const portraitCx = rect.left + rect.width / 2;
    let top = rect.top - captionH - 18;
    // if the portrait is too high in the viewport, drop the caption below instead
    if (top < 14) top = rect.bottom + 18;
    // keep it inside the viewport horizontally
    let left = portraitCx;
    const pad = 16;
    left = Math.max(captionW / 2 + pad, Math.min(window.innerWidth - captionW / 2 - pad, left));

    caption.style.top  = Math.round(top)  + 'px';
    caption.style.left = Math.round(left) + 'px';
    lastSubjectId = personId;
  }

  function hideCaption() {
    $('#spotlightCaption').classList.remove('visible');
  }

  function tickSpotlight() {
    const ids = Pedigree.nodeIds();
    const next = pickRandom(ids);
    if (!next) return;
    // briefly hide, then re-show on the new subject so the caption animates
    hideCaption();
    Pedigree.spotlight(null);
    setTimeout(() => showSpotlight(next), 280);
  }

  function startAutoplay() {
    if (spotlightTimer) return;
    // first spotlight after a settle delay (lets the tree finish drawing in)
    setTimeout(() => {
      const ids = Pedigree.nodeIds();
      const first = pickRandom(ids);
      if (first) showSpotlight(first);
      spotlightTimer = setInterval(tickSpotlight, SPOTLIGHT_INTERVAL);
    }, FIRST_SPOTLIGHT_DELAY);
  }

  function stopAutoplay() {
    if (spotlightTimer) { clearInterval(spotlightTimer); spotlightTimer = null; }
    hideCaption();
    Pedigree.spotlight(null);
  }

  // pause autoplay when the tab is hidden (saves cycles, doesn't burn battery)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoplay();
    else if (demoData) startAutoplay();
  });

  // re-position the caption on resize (the portrait moves with viewport changes)
  window.addEventListener('resize', () => {
    if (lastSubjectId) {
      // small delay so the tree's own resize/refit settles first
      setTimeout(() => { if (lastSubjectId) showSpotlight(lastSubjectId); }, 220);
    }
  });

  // re-render when the layout needs to flip (desktop ↔ mobile)
  window.addEventListener('pedigree-orient-change', () => {
    if (!demoData) return;
    Pedigree.render(demoData);
    sprinkleHeroGlow();
    // rendering wipes the spotlight; restart on a delay so the tree settles
    setTimeout(() => { if (lastSubjectId) showSpotlight(lastSubjectId); }, 350);
  });

  // Apply a random `--glow-delay` CSS variable to each branch / rose /
  // portrait in the hero tree so the CSS pulse animations stagger.
  function sprinkleHeroGlow() {
    const lines = document.querySelectorAll(
      '.landing .lines-layer .parent-branch, .landing .lines-layer .mating-line'
    );
    lines.forEach(el => {
      el.style.setProperty('--glow-delay', (Math.random() * 7).toFixed(2) + 's');
    });
    const roses = document.querySelectorAll('.landing .junction-rose-group .junction-rose');
    roses.forEach(el => {
      el.style.setProperty('--glow-delay', (Math.random() * 9).toFixed(2) + 's');
    });
    const nodes = document.querySelectorAll('.landing .nodes-layer .node-group');
    nodes.forEach(el => {
      el.style.setProperty('--glow-delay', (Math.random() * 10).toFixed(2) + 's');
    });
  }

  // Decorative landing tree — never the user's real lineage. An 11-person,
  // 3-generation anonymous family using stock portraits from /image so the
  // canvas reads as a "real" lineage chart without ever displaying the
  // visitor's own people. Generic names so nobody reads it as a real story.
  const LANDING_TREE = {
    meta: { title: 'A book of kindred' },
    people: [
      // Gen 1 — founders
      { id: 'aldwin', name: 'Aldwin', gender: 'male',   parentIds: [], partnerIds: ['avila'],
        photo: 'image/3af1391f1d8b9cb088a7328fe448d4ba.jpg', birthYear: 1949 },
      { id: 'avila',  name: 'Avila',  gender: 'female', parentIds: [], partnerIds: ['aldwin'],
        photo: 'image/0d14653854706dfaf7a36347955c36a6.jpg', birthYear: 1952 },

      // Gen 2 — three children + their spouses
      { id: 'thom',   name: 'Thom',   gender: 'male',   parentIds: ['aldwin','avila'], partnerIds: ['iris'],
        photo: 'image/b0d54b664bfb4071e713496c34508008.jpg', birthYear: 1975 },
      { id: 'iris',   name: 'Iris',   gender: 'female', parentIds: [], partnerIds: ['thom'],
        photo: 'image/62124012f713b001c3d3ac1a89258610.jpg', birthYear: 1978 },
      { id: 'eva',    name: 'Eva',    gender: 'female', parentIds: ['aldwin','avila'], partnerIds: ['wren'],
        photo: 'image/a25acfb8a8c059ddfa5abf9be5b491ba.jpg', birthYear: 1980 },
      { id: 'wren',   name: 'Wren',   gender: 'male',   parentIds: [], partnerIds: ['eva'],
        photo: 'image/06cee1a00fd4131369935943f021f3bc.jpg', birthYear: 1979 },
      { id: 'marcus', name: 'Marcus', gender: 'male',   parentIds: ['aldwin','avila'], partnerIds: ['mei'],
        photo: 'image/7cfd0a8912559c4c9067367998561112.jpg', birthYear: 1982 },
      { id: 'mei',    name: 'Mei',    gender: 'female', parentIds: [], partnerIds: ['marcus'],
        photo: 'image/f7e509e54dbb27427428e922d22255ae.jpg', birthYear: 1985 },

      // Gen 3 — grandchildren
      { id: 'liam',   name: 'Liam',   gender: 'male',   parentIds: ['thom','iris'],
        photo: 'image/bc4846a7f51d1100393359a0cb7ba81f.jpg', birthYear: 2002 },
      { id: 'amara',  name: 'Amara',  gender: 'female', parentIds: ['marcus','mei'],
        photo: 'image/109aa3b4a02a4dd88150ad269d5e5de8.jpg', birthYear: 2005 },
      { id: 'cole',   name: 'Cole',   gender: 'male',   parentIds: ['marcus','mei'],
        photo: 'image/2bcc55b3291035c4e53afbaa5dd1ae83.jpg', birthYear: 2007 },
    ],
  };

  async function init() {
    demoData = LANDING_TREE;

    const svg = $('#pedigreeSvg');
    Pedigree.init(svg, { interactive: false });
    // Render the hero tree the same way tree-view.html does in its
    // "Full Tree" mode: every generation on its own horizontal line
    // (no wrapped sub-rows), fitted to the viewport.
    if (Pedigree.setWrapSiblings) Pedigree.setWrapSiblings(false);
    if (Pedigree.setScrollMode)   Pedigree.setScrollMode(false);

    // LANDING_TREE is a tiny anonymous lineage so the canvas always
    // renders something. sprinkleHeroGlow staggers per-element delays.
    svg.style.display = '';
    Pedigree.render(demoData);
    sprinkleHeroGlow();

    // small entrance sound — soft chime on load (will be silent until the
    // visitor interacts, due to browser autoplay policy; that's fine)
    try { Sound.boot(); } catch (_) {}

    // unlock audio on first user gesture so subsequent clicks chime
    const unlock = () => { try { Sound.unlock(); } catch (_) {} document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock);

    // soft click chime on any actionable element
    document.addEventListener('click', (e) => {
      const t = e.target.closest('a, button, .btn, .hero-cta, .hero-sub-link');
      if (!t) return;
      try { Sound.click(); } catch (_) {}
    });

    // spotlight autoplay disabled — nothing to spotlight when the
    // hero tree is hidden.
  }

  window.addEventListener('DOMContentLoaded', init);
})();
