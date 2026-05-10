// ============================================================
// Global click chime. Unlocks audio on first gesture, then plays
// the soft Sound.click() chime on any actionable element click.
// Safe to include on any page — silently no-ops if Sound is missing.
// ============================================================
(function () {
  if (typeof Sound === 'undefined') return;

  const unlock = () => {
    try { Sound.unlock(); } catch (_) {}
    document.removeEventListener('pointerdown', unlock);
  };
  document.addEventListener('pointerdown', unlock);

  document.addEventListener('click', (e) => {
    const t = e.target.closest('a, button, .btn, .tag-pick, .details-tab, .vt-btn, .rel-link');
    if (!t) return;
    try { Sound.click(); } catch (_) {}
  });
})();
