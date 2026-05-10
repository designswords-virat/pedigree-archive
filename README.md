# Pedigree Archive

A heritage-style family tree builder. Inscribe your kindred in oval gold-framed
portraits, joined by lineage threads. Built as a single-browser web app —
no servers, no accounts in the cloud, all data lives on your own device.

**Live demo (current canonical URL):**
https://designswords-virat.github.io/pedigree-archive/

---

## What it is

- **Vanilla** HTML / CSS / JavaScript. No build step, no framework, no bundler.
- **localStorage-only** — everything (profile, family tree, photos, password,
  theme choice) is saved in the visitor's browser.
- **Single-admin gate** — one username + password protects the dashboard / tree
  pages. The password is hashed with SHA-256 via `crypto.subtle`. Privacy by
  obscurity, not enterprise auth.
- **Five themes** — Bordeaux (default), Ivoire doux, Bleu nuit, Vert profond,
  Or vieilli. Switch with the picker in the bottom-right.
- **First-visit demo** — a 25-second auto-playing walkthrough on the landing
  page. Skippable, plays only once.

## File map

```
index.html           Landing page (public, hero with auto-cycling tree)
login.html           First-run setup OR login (single admin gate)
dashboard.html       After-login home (profile summary + next steps)
details.html         Tabbed editor (Basic / Contact / Cultural / ...)
profile.html         Step-1 form (legacy, still functional)
tree-edit.html       Editable canvas with the + kinship-add badge
tree-view.html       Read-only chart with download-to-JPG
signup.html          Redirect to login (legacy filename)
superadmin.html      Redirect to dashboard (legacy filename)

css/style.css        Single stylesheet for everything
js/auth.js           localStorage profile + tree persistence
js/gate.js           Single-admin login gate
js/theme.js          Theme picker + persisted choice
js/demo.js           First-visit walkthrough overlay
js/main.js           Landing page (hero + spotlight cycling)
js/pedigree.js       SVG tree renderer (oval portraits, gold branches)
js/tree-edit.js      Editor logic for tree-edit.html
js/tree-view.js      Read-only logic for tree-view.html
js/sounds.js         Soft chime SFX (synthesised in-browser)
js/click-sound.js    Plays Sound.click() on every clickable element
js/supa.js           Photo upload (resizes to 480x600 JPEG, base64)
js/config.js         Empty config stub (kept so older callers don't crash)

netlify.toml         Netlify deploy config (publish=root, no build)
.gitignore
README.md            this file
```

---

## Run locally

Just open `index.html` in a browser, OR launch a tiny local server (recommended,
because some browsers restrict `file://` URLs):

```bash
# Python
python -m http.server 5500

# Node
npx serve .

# VS Code: install the "Live Server" extension and click "Go Live"
```

Then visit http://localhost:5500.

---

## Deploy

The site is **100% static** (no build, no server). Pick any free static host.

### Option A — GitHub Pages (zero accounts, zero setup)

If your repo lives on GitHub:

```bash
# (one-time) enable Pages — needs a GitHub token with `repo` scope
gh api -X POST repos/<USER>/<REPO>/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

Or via the UI: **repo Settings → Pages → Source: `main` / root → Save**.
Live URL: `https://<USER>.github.io/<REPO>/`. Auto-rebuilds on every push.

### Option B — Netlify

```bash
# (one-time) install + log in
npm i -g netlify-cli
netlify login

# (one-time) link this folder to a Netlify project
netlify init     # answer "Create & configure a new project"

# every deploy after that
netlify deploy --prod --dir . --no-build
```

`netlify.toml` is already configured: publish root, cache-bust JS / CSS / HTML
on every deploy. Drag-and-drop `netlify.app/drop` also works — drop the whole
folder, get a live URL in seconds.

### Option C — Cloudflare Pages

1. Sign in at https://dash.cloudflare.com → Pages → **Create a project**.
2. Connect to your GitHub repo, pick the `main` branch.
3. Build command: *leave empty*. Build output directory: `/` (root).
4. Save & deploy. Auto-rebuilds on every push.

### Option D — Vercel

```bash
npm i -g vercel
vercel        # follow prompts, accept defaults (no framework, root output)
vercel --prod # promote to production
```

---

## Manual push to a new GitHub repo

If you want this code on a **new repo under your own GitHub account**:

```bash
# 1. Create the empty repo on GitHub first (via https://github.com/new)

# 2. Add it as a remote (replace USER and REPO)
git remote add personal https://github.com/<USER>/<REPO>.git

# 3. Push
git push -u personal main
```

You'll be prompted for credentials. Use a **Personal Access Token** as the
password (https://github.com/settings/tokens, scope `repo`).

---

## Reset / clear data

- **Logout** (dashboard → ⊙ Logout) — closes the gate session, data preserved.
- **Reset** (dashboard → ⟲ Reset) — wipes ALL of `pa_local_v1`. Cannot undo.
- **Forgot password / locked out** — open DevTools → Application → Local Storage
  → delete the `pa_gate` key → reload. Your tree (`pa_local_v1`) is unaffected;
  you'll just be asked to set up new credentials.
- **Re-trigger the demo** — delete the `pa_demo_seen` key and reload, or run
  `PaDemo.play()` in the console.

---

## License

All yours. Built as a personal heirloom project, do whatever with it.
