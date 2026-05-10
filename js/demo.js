// ============================================================
// DEMO — auto-playing first-visit walkthrough on the landing.
// ~25 seconds, five scenes, with a fake cursor that types and
// clicks through each scripted scene. Skip-able at any time.
// localStorage.pa_demo_seen is set when the user finishes or skips.
// ============================================================
(function () {
  const SEEN_KEY = 'pa_demo_seen';
  // skip if already shown, or query string forces it off (?nodemo=1),
  // or this browser already has credentials set up / a saved tree
  // (returning users don't need a tour).
  try {
    if (location.search.indexOf('nodemo') !== -1) return;
    if (localStorage.getItem(SEEN_KEY)) return;
    if (localStorage.getItem('pa_gate'))    return;   // credentials exist
    if (localStorage.getItem('pa_local_v1')) return;  // some saved data
  } catch (_) {}

  // ---------- DOM ----------
  const overlay = document.createElement('div');
  overlay.className = 'demo-overlay';
  overlay.innerHTML = `
    <button class="demo-skip" type="button" aria-label="Skip the demo">Skip ✕</button>
    <div class="demo-progress" id="demoDots"></div>
    <div class="demo-frame">
      <div class="demo-stage" id="demoStage"></div>
      <div class="demo-cursor" id="demoCursor"></div>
    </div>
    <div class="demo-caption" id="demoCaption"></div>
  `;
  document.body.appendChild(overlay);

  const stage   = overlay.querySelector('#demoStage');
  const caption = overlay.querySelector('#demoCaption');
  const cursor  = overlay.querySelector('#demoCursor');
  const dotsBox = overlay.querySelector('#demoDots');

  // ---------- helpers ----------
  function moveCursor(target, dx = 0, dy = 0) {
    const stageRect = stage.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const x = r.left - stageRect.left + r.width / 2 + dx;
    const y = r.top  - stageRect.top  + r.height / 2 + dy;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
  }
  function clickPulse(target) {
    target.classList.add('demo-clicked');
    setTimeout(() => target.classList.remove('demo-clicked'), 320);
    try { if (typeof Sound !== 'undefined') Sound.click(); } catch (_) {}
  }
  function typeInto(input, text, doneAfterMs = 0) {
    input.value = '';
    let i = 0;
    const tick = () => {
      if (i <= text.length) {
        input.value = text.slice(0, i);
        i++;
        setTimeout(tick, 90);
      }
    };
    tick();
    if (doneAfterMs) return new Promise(r => setTimeout(r, doneAfterMs));
  }

  // ---------- scenes ----------
  // Each scene returns the duration after which we advance.
  const SCENES = [
    {
      caption: 'Welcome to Pedigree Archive — a book of kindred.',
      duration: 3500,
      build() {
        return `
          <div class="demo-card demo-welcome">
            <div class="demo-eyebrow">Your family, in the old style</div>
            <div class="demo-flourish">A book of</div>
            <h1>Kindred &amp; Lineage</h1>
            <p>An heirloom for your house — built in a quiet hour.</p>
          </div>`;
      },
      run() { /* static slide */ },
    },

    {
      caption: 'First, create your access — a username and password kept only on this browser.',
      duration: 5800,
      build() {
        return `
          <div class="demo-card demo-login">
            <div class="demo-eyebrow">Set up your access</div>
            <h2>Create your book</h2>
            <div class="demo-field"><label>Username</label><input id="dmUser" /></div>
            <div class="demo-field"><label>Password</label><input id="dmPass" type="text" /></div>
            <button class="demo-btn primary" id="dmEnter">⏵ Create access</button>
          </div>`;
      },
      run() {
        const u = stage.querySelector('#dmUser');
        const p = stage.querySelector('#dmPass');
        const b = stage.querySelector('#dmEnter');
        setTimeout(() => { moveCursor(u); }, 250);
        setTimeout(() => { typeInto(u, 'dinesh'); }, 700);
        setTimeout(() => { moveCursor(p); }, 2100);
        setTimeout(() => { typeInto(p, '••••••••'); }, 2400);
        setTimeout(() => { moveCursor(b); }, 4400);
        setTimeout(() => { clickPulse(b); }, 4900);
      },
    },

    {
      caption: 'Then record yourself — name, dates, photo. The first page of the book.',
      duration: 5400,
      build() {
        return `
          <div class="demo-card demo-details">
            <div class="demo-eyebrow">Step 1 of 2</div>
            <h2>Your particulars</h2>
            <div class="demo-grid">
              <div class="demo-field"><label>Full name</label><input id="dmName" /></div>
              <div class="demo-field"><label>Date of birth</label><input id="dmDate" /></div>
              <div class="demo-field demo-field-full">
                <label>Sex</label>
                <div class="demo-pickers">
                  <span class="demo-pick" id="dmSexM">♂ Man</span>
                  <span class="demo-pick" id="dmSexF">♀ Woman</span>
                </div>
              </div>
            </div>
            <button class="demo-btn primary" id="dmSave">⏵ Save &amp; continue</button>
          </div>`;
      },
      run() {
        const n = stage.querySelector('#dmName');
        const d = stage.querySelector('#dmDate');
        const m = stage.querySelector('#dmSexM');
        const s = stage.querySelector('#dmSave');
        setTimeout(() => moveCursor(n), 200);
        setTimeout(() => typeInto(n, 'Dinesh Kumar Dhawan'), 600);
        setTimeout(() => moveCursor(d), 2700);
        setTimeout(() => typeInto(d, '1992-05-14'), 3000);
        setTimeout(() => { moveCursor(m); }, 4100);
        setTimeout(() => { clickPulse(m); m.classList.add('active'); }, 4500);
        setTimeout(() => moveCursor(s), 4900);
      },
    },

    {
      caption: 'Open the canvas. Click + on any portrait to add a parent, partner, child, or sibling.',
      duration: 6000,
      build() {
        return `
          <div class="demo-card demo-tree">
            <svg viewBox="0 0 600 360" class="demo-svg">
              <defs>
                <clipPath id="demoOval"><ellipse cx="0.5" cy="0.5" rx="0.5" ry="0.5"/></clipPath>
              </defs>
              <!-- self -->
              <g class="demo-node" id="dmNode1" transform="translate(250,170)">
                <ellipse cx="50" cy="64" rx="50" ry="64" class="demo-ring"/>
                <ellipse cx="50" cy="64" rx="48" ry="62" fill="#e7decb"/>
                <text x="50" y="160" text-anchor="middle" class="demo-label">DINESH</text>
                <circle cx="92" cy="6" r="13" class="demo-plus" id="dmPlus"/>
                <text x="92" y="6" text-anchor="middle" dominant-baseline="central" class="demo-plus-text">+</text>
              </g>
              <!-- father (appears) -->
              <g class="demo-node demo-appear" id="dmNode2" transform="translate(120,30)">
                <ellipse cx="50" cy="64" rx="50" ry="64" class="demo-ring"/>
                <ellipse cx="50" cy="64" rx="48" ry="62" fill="#e7decb"/>
                <text x="50" y="160" text-anchor="middle" class="demo-label">FATHER</text>
              </g>
              <!-- mother (appears) -->
              <g class="demo-node demo-appear" id="dmNode3" transform="translate(380,30)">
                <ellipse cx="50" cy="64" rx="50" ry="64" class="demo-ring"/>
                <ellipse cx="50" cy="64" rx="48" ry="62" fill="#e7decb"/>
                <text x="50" y="160" text-anchor="middle" class="demo-label">MOTHER</text>
              </g>
              <!-- branches -->
              <path class="demo-branch demo-appear" d="M170,158 Q300,120 300,170" fill="none"/>
              <path class="demo-branch demo-appear" d="M430,158 Q300,120 300,170" fill="none"/>
            </svg>
            <div class="demo-relpicker" id="dmRelPicker">
              <span class="demo-pick" id="dmRelF">♂ Father</span>
              <span class="demo-pick" id="dmRelM">♀ Mother</span>
            </div>
          </div>`;
      },
      run() {
        const plus = stage.querySelector('#dmPlus');
        const relF = stage.querySelector('#dmRelF');
        const relM = stage.querySelector('#dmRelM');
        const f = stage.querySelector('#dmNode2');
        const m = stage.querySelector('#dmNode3');
        const branches = stage.querySelectorAll('.demo-branch');
        setTimeout(() => moveCursor(plus), 400);
        setTimeout(() => clickPulse(plus), 800);
        setTimeout(() => moveCursor(relF), 1300);
        setTimeout(() => { clickPulse(relF); f.classList.add('shown'); branches[0].classList.add('shown'); }, 1700);
        setTimeout(() => moveCursor(relM), 2900);
        setTimeout(() => { clickPulse(relM); m.classList.add('shown'); branches[1].classList.add('shown'); }, 3300);
        setTimeout(() => moveCursor(plus, 0, 0), 4600);
      },
    },

    {
      caption: 'Pick a theme — five palettes, switch any time. Your book travels with the colour you choose.',
      duration: 5500,
      build() {
        return `
          <div class="demo-card demo-themes">
            <h2>Pick your theme</h2>
            <div class="demo-themelist">
              <button class="demo-swatch" data-c="#490c1e" id="dmT1"></button>
              <button class="demo-swatch" data-c="#f0e6c2" id="dmT2"></button>
              <button class="demo-swatch" data-c="#1b2e49" id="dmT3"></button>
              <button class="demo-swatch" data-c="#07312a" id="dmT4"></button>
              <button class="demo-swatch" data-c="#bfa06a" id="dmT5"></button>
            </div>
            <div class="demo-preview" id="dmPreview">
              <span>Your book — in any palette</span>
            </div>
          </div>`;
      },
      run() {
        const swatches = ['#dmT1', '#dmT2', '#dmT3', '#dmT4', '#dmT5'].map(s => stage.querySelector(s));
        const preview = stage.querySelector('#dmPreview');
        const order = [1, 2, 3, 4, 0];   // cycle ivoire, navy, green, gold, back to bordeaux
        order.forEach((i, idx) => {
          const t = 350 + idx * 950;
          setTimeout(() => moveCursor(swatches[i]), t);
          setTimeout(() => {
            clickPulse(swatches[i]);
            preview.style.background = swatches[i].dataset.c;
          }, t + 350);
        });
      },
    },
  ];

  // ---------- runtime ----------
  let sceneIdx = -1;
  let timer = null;

  // build progress dots
  SCENES.forEach((_, i) => {
    const d = document.createElement('span');
    d.className = 'demo-dot';
    d.dataset.i = String(i);
    dotsBox.appendChild(d);
  });

  function showScene(i) {
    sceneIdx = i;
    const s = SCENES[i];
    stage.innerHTML = s.build();
    caption.textContent = s.caption;
    [...dotsBox.children].forEach((d, idx) => d.classList.toggle('active', idx === i));
    // fire scripted interactions on the next tick (after layout)
    requestAnimationFrame(() => { try { s.run(); } catch (_) {} });
    // schedule next
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (i + 1 < SCENES.length) showScene(i + 1);
      else finish();
    }, s.duration);
  }

  function finish() {
    if (timer) { clearTimeout(timer); timer = null; }
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) {}
    overlay.classList.add('demo-out');
    setTimeout(() => { overlay.remove(); }, 420);
  }

  overlay.querySelector('.demo-skip').addEventListener('click', finish);
  // click any dot to jump
  dotsBox.addEventListener('click', (e) => {
    const d = e.target.closest('.demo-dot');
    if (!d) return;
    showScene(parseInt(d.dataset.i, 10));
  });
  // ESC also skips
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      document.removeEventListener('keydown', onEsc);
      finish();
    }
  });

  // expose so the landing can re-launch via a "How it works" button
  window.PaDemo = {
    play() {
      try { localStorage.removeItem(SEEN_KEY); } catch (_) {}
      location.reload();
    },
  };

  // start on the next frame so the layout settles
  requestAnimationFrame(() => showScene(0));
})();
