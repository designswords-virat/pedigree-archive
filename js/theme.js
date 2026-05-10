// ============================================================
// THEME PICKER — five Renaissance-archive palettes.
//
// The active theme is stored in localStorage under `pa_theme` and
// applied as a `data-theme` attribute on <html>. Each HTML file should
// also include a tiny inline pre-paint script in its <head> so the
// theme is set BEFORE the stylesheet evaluates (no flash of default
// theme on load):
//
//   <script>try{document.documentElement.setAttribute(
//     'data-theme', localStorage.getItem('pa_theme')||'ivoire'
//   )}catch(e){}</script>
//
// This file builds the floating top-right picker UI on every page.
// ============================================================
(function () {
  const KEY = 'pa_theme';
  const DEFAULT = 'ivoire';

  const THEMES = [
    { id: 'ivoire',       name: 'Ivoire doux',  color: '#f0e6c2' },
    { id: 'bleu-nuit',    name: 'Bleu nuit',    color: '#1b2e49' },
    { id: 'vert-profond', name: 'Vert profond', color: '#07312a' },
    { id: 'bordeaux',     name: 'Bordeaux',     color: '#490c1e' },
    { id: 'or-vieilli',   name: 'Or vieilli',   color: '#bfa06a' },
  ];

  function get() {
    try { return localStorage.getItem(KEY) || DEFAULT; } catch (e) { return DEFAULT; }
  }
  function set(id) {
    if (id === 'ivoire') document.documentElement.removeAttribute('data-theme');
    else                 document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(KEY, id); } catch (e) {}
    refreshActive();
    try { if (typeof Sound !== 'undefined') Sound.click(); } catch (e) {}
  }

  // make sure the attribute matches the saved value (even if the
  // pre-paint inline script set it earlier — keeps things in sync).
  set(get());

  function buildPicker() {
    if (document.querySelector('.theme-picker')) return;
    const wrap = document.createElement('div');
    wrap.className = 'theme-picker';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Choose theme');

    THEMES.forEach(t => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'theme-sw';
      sw.dataset.id = t.id;
      sw.title = t.name;
      sw.setAttribute('aria-label', t.name);
      sw.style.background = t.color;
      sw.addEventListener('click', () => set(t.id));
      wrap.appendChild(sw);
    });

    document.body.appendChild(wrap);
    refreshActive();
  }

  function refreshActive() {
    const cur = get();
    document.querySelectorAll('.theme-sw').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.id === cur);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPicker);
  } else {
    buildPicker();
  }

  // Expose a tiny API in case other scripts want to read/set the theme.
  window.PaTheme = { get, set, themes: THEMES };
})();
