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
    // rendering wipes the spotlight; restart on a delay so the tree settles
    setTimeout(() => { if (lastSubjectId) showSpotlight(lastSubjectId); }, 350);
  });

  // ---- INIT ----
  // Pick the data to show in the hero. If this browser has the user's
  // own family tree saved (via Auth), use it as the hero background so
  // the spotlight cycles through real members. Otherwise fall back to
  // the bundled demo lineage so first-time visitors see something rich.
  async function chooseHeroData() {
    if (typeof Auth === 'undefined') return Data.demo();
    try {
      await Auth.init();
      const u = Auth.currentUser();
      const myPeople = u && Array.isArray(u.people) ? u.people : [];
      if (myPeople.length >= 2) {
        const title = (u.profile && u.profile.fullName)
          ? (u.profile.fullName + '’s lineage')
          : 'Your lineage';
        return { people: myPeople, meta: { title } };
      }
    } catch (_) { /* fall through to demo */ }
    return Data.demo();
  }

  async function init() {
    demoData = await chooseHeroData();

    const svg = $('#pedigreeSvg');
    Pedigree.init(svg, { interactive: false });
    Pedigree.render(demoData);

    // small entrance sound — soft chime on load (will be silent until the
    // visitor interacts, due to browser autoplay policy; that's fine)
    try { Sound.boot(); } catch (_) {}

    startAutoplay();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
