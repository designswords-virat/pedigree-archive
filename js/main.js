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

  // Bundled hero demo — a richly populated family tree (22 people with
  // photos) loaded from js/hero-demo.js. Shown on the public landing
  // for any visitor without a saved book of their own. If hero-demo.js
  // somehow fails to load, fall back to a tiny generic placeholder so
  // the hero still renders something.
  const PLACEHOLDER_TREE = (typeof window.HeroDemo !== 'undefined' && window.HeroDemo)
    ? window.HeroDemo
    : {
        meta: { title: 'A book of kindred' },
        people: [
          { id: 'g_m', name: 'Grandfather', gender: 'male',   parentIds: [],          partnerIds: ['g_f'] },
          { id: 'g_f', name: 'Grandmother', gender: 'female', parentIds: [],          partnerIds: ['g_m'] },
          { id: 'p_m', name: 'Father',      gender: 'male',   parentIds: ['g_m','g_f'], partnerIds: ['p_f'] },
          { id: 'p_f', name: 'Mother',      gender: 'female', parentIds: [],          partnerIds: ['p_m'] },
          { id: 'c_a', name: 'Sibling',     gender: 'female', parentIds: ['p_m','p_f'] },
          { id: 'c_b', name: 'You',         gender: 'unknown',parentIds: ['p_m','p_f'] },
          { id: 'c_c', name: 'Sibling',     gender: 'male',   parentIds: ['p_m','p_f'] },
        ],
      };

  // ---- INIT ----
  // Hero shows the LARGEST book from the user's library on this browser
  // (active book or any saved snapshot). This way a brand-new "+ New
  // project" empty active book doesn't hide a richer tree the user
  // built earlier. Falls back to a generic placeholder if the whole
  // library is empty.
  function safeRead(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (_) { return null; }
  }

  function pickLargestBook() {
    const candidates = [];
    const active = safeRead('pa_local_v1');
    if (active && Array.isArray(active.people) && active.people.length) {
      candidates.push({ book: active, people: active.people });
    }
    const idx = safeRead('pa_books_index');
    if (idx && Array.isArray(idx.books)) {
      idx.books.forEach(b => {
        const snap = safeRead('pa_book_' + b.id);
        if (snap && Array.isArray(snap.people) && snap.people.length) {
          candidates.push({ book: snap, people: snap.people });
        }
      });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.people.length - a.people.length);
    return candidates[0];
  }

  async function chooseHeroData() {
    // The hero has a radial mask cutting a hole around the headline.
    // A 1- or 2-person tree falls entirely inside that hole and looks
    // invisible. So only use the user's data if it has at least as
    // many people as the bundled hero demo — otherwise the bundled
    // 22-person tree fills the canvas properly.
    const demoCount = (PLACEHOLDER_TREE.people || []).length;
    if (typeof Auth === 'undefined') return PLACEHOLDER_TREE;
    try {
      await Auth.init();
      const pick = pickLargestBook();
      if (pick && pick.people.length >= demoCount) {
        const fullName = pick.book.profile && pick.book.profile.fullName;
        const title = fullName ? (fullName + '’s lineage') : 'Your lineage';
        return { people: pick.people, meta: { title } };
      }
    } catch (_) {}
    return PLACEHOLDER_TREE;
  }

  async function init() {
    demoData = await chooseHeroData();

    const svg = $('#pedigreeSvg');
    Pedigree.init(svg, { interactive: false });
    // Render the hero tree the same way tree-view.html does in its
    // "Full Tree" mode: every generation on its own horizontal line
    // (no wrapped sub-rows), fitted to the viewport.
    if (Pedigree.setWrapSiblings) Pedigree.setWrapSiblings(false);
    if (Pedigree.setScrollMode)   Pedigree.setScrollMode(false);

    // chooseHeroData() always returns *some* tree (saved or placeholder),
    // so we always render. Glow staggers branches asynchronously.
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
