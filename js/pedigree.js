// ============================================================
// PEDIGREE RENDERER — Tudor portrait theme
//   Every node is an oval gold-framed portrait (faithful to the
//   source painting), with a name cartouche below. Lineage lines
//   are drawn in gold; tudor-rose roundels mark sibship junctions.
// ============================================================

const Pedigree = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 100;            // oval width  (bigger portraits)
  const NODE_H = 128;            // oval height (portrait proportion preserved)
  const COUPLE_GAP = 60;         // gap between mating partners
  const SIBLING_GAP = 70;        // gap between siblings — wide enough to read
  const GEN_HEIGHT = 480;        // vertical gap from one generation to the next
                                 // (large enough to hold wrapped sub-rows + grandkids)
  const MARGIN = 100;
  const SIBSHIP_DROP = 50;       // how far below couple the sibship bar sits
  const LABEL_WRAP = 16;         // wrap names longer than this many chars
  const CART_HEIGHT = 20;        // name cartouche row height (per line)
  const CART_PAD_TOP = 8;        // gap between oval bottom and cartouche
  const SIBLING_STAGGER = 70;    // organic vertical offset between siblings (px)
  // Sibling-row wrapping — when a parent has more siblings than fit
  // horizontally, the row wraps to a sub-row below. Keeps the tree NARROW
  // and TALL (grows vertically rather than spreading sideways).
  const MAX_SIBS_PER_ROW = 3;    // wrap after this many sibling positions
  // SIB_ROW_GAP must clear: oval (NODE_H=128) + cartouche (~32) + years (~30)
  // + SIBLING_STAGGER (70 for an odd-indexed kid in row 1) + breathing room.
  const SIB_ROW_GAP = 320;       // vertical distance between two sibling sub-rows

  let viewState = { scale: 1, tx: 0, ty: 0 };
  let svg, g, currentData, currentLayout, onSelectCb, onAddCb;
  let interactive = true;     // when false (landing hero), no clicks, no pan/zoom, no sounds
  let editMode = false;       // when true, draws a '+' add button on each node
  let scrollMode = false;     // when true, SVG flows naturally and grows on scroll
  let wrapSiblings = true;    // when true, wide sibling rows wrap into stacked sub-rows
  let scrollObserver = null;

  let isVertical = false;
  const VERTICAL_BREAKPOINT = 720;
  function detectVertical() { return window.innerWidth < VERTICAL_BREAKPOINT; }
  const xy = (lx, ly) => isVertical ? [ly, lx] : [lx, ly];

  function el(tag, attrs = {}, parent = null) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Resolve a person.photo to a usable URL. Self-contained so the renderer
  // works without Data being on the page (tree-edit / tree-view don't load
  // data.js). Treats data: and http(s): as absolute, anything else as a
  // filename inside the Profiles/ folder (used by the landing demo).
  function resolvePhoto(photoOrPerson) {
    const v = (typeof photoOrPerson === 'string'
                ? photoOrPerson
                : photoOrPerson && photoOrPerson.photo) || '';
    if (!v) return null;
    if (/^(https?:|data:)/i.test(v)) return v;
    return 'Profiles/' + v.split('/').map(encodeURIComponent).join('/');
  }

  function wrapName(text, max) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (w.length > max) {
        if (cur) { lines.push(cur); cur = ''; }
        for (let i = 0; i < w.length; i += max) lines.push(w.slice(i, i + max));
        continue;
      }
      const next = cur ? cur + ' ' + w : w;
      if (next.length > max) { lines.push(cur); cur = w; }
      else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function buildLayout(data) {
    const byId = {};
    data.people.forEach(p => byId[p.id] = { ...p });

    const visited = new Set();
    const widths = {};
    const nodes = {};

    function partnerOf(pid) {
      const p = byId[pid];
      // Only treat as a couple-partner someone who has no parents in the
      // tree (i.e., a married-in spouse). If both members of the couple are
      // bloodline (each has parents in the tree), they each belong in their
      // own lineage subtree — pairing them at one would cause one of them
      // to be positioned twice (once as partner, once as bloodline child)
      // and crash visually.
      return (p.partnerIds || [])
        .map(id => byId[id])
        .find(x =>
          x &&
          !visited.has(x.id) &&
          (!x.parentIds || x.parentIds.length === 0)
        ) || null;
    }

    function childrenOf(p1, p2) {
      return data.people.filter(c => {
        const par = c.parentIds || [];
        if (p2) return par.includes(p1) && par.includes(p2);
        return par.includes(p1) && par.every(x => x === p1 || !byId[x]);
      });
    }

    function computeWidth(pid) {
      if (widths[pid] != null) return widths[pid];
      const p = byId[pid];
      visited.add(pid);
      const partner = partnerOf(pid);
      if (partner) visited.add(partner.id);

      const coupleW = partner ? 2 * NODE_W + COUPLE_GAP : NODE_W;
      const kids = childrenOf(pid, partner ? partner.id : null);

      p._partner = partner;
      p._children = kids;
      p._coupleW = coupleW;

      let w;
      if (kids.length === 0) {
        w = coupleW;
      } else {
        kids.forEach(c => computeWidth(c.id));
        const perRow = wrapSiblings ? MAX_SIBS_PER_ROW : kids.length;
        let maxRowWidth = 0;
        for (let r = 0; r < kids.length; r += perRow) {
          const rowKids = kids.slice(r, r + perRow);
          const rowSum = rowKids.reduce((s, c) => s + widths[c.id], 0)
                        + (rowKids.length - 1) * SIBLING_GAP;
          if (rowSum > maxRowWidth) maxRowWidth = rowSum;
        }
        w = Math.max(coupleW, maxRowWidth);
      }
      widths[pid] = w;
      return w;
    }

    // Recursive max-depth helper (memoised). Returns how many generations
    // deep this person's descendant subtree goes (0 = leaf). Used to compute
    // the dynamic gap between wrapped sibling sub-rows so a wrapped sub-row's
    // top doesn't crash into the previous row's grandchildren.
    const _depthMem = {};
    function maxSubtreeDepth(pid) {
      if (_depthMem[pid] != null) return _depthMem[pid];
      const p = byId[pid];
      const kids = (p && p._children) || [];
      if (kids.length === 0) return _depthMem[pid] = 0;
      let maxD = 0;
      kids.forEach(c => {
        const d = maxSubtreeDepth(c.id) + 1;
        if (d > maxD) maxD = d;
      });
      return _depthMem[pid] = maxD;
    }

    function position(pid, x, depth, yShift = 0) {
      const p = byId[pid];
      const w = widths[pid];
      const partner = p._partner;
      const kids = p._children;
      const coupleW = p._coupleW;
      const y = depth * GEN_HEIGHT + yShift;

      const childCenters = [];
      if (kids.length > 0) {
        // Wrap kids into sub-rows of at most perRow kids. When wrapSiblings
        // is false (full-row mode / edit mode), perRow = kids.length so all
        // siblings fit on one horizontal line.
        const perRow = wrapSiblings ? MAX_SIBS_PER_ROW : kids.length;

        // Dynamic sub-row gap: the gap between two wrapped sub-rows must be
        // big enough to clear the *full subtree* of the previous row, not
        // just the row's own portrait. Otherwise the wrapped row collides
        // with the previous row's grandchildren / great-grandchildren.
        let dynamicSibRowGap = SIB_ROW_GAP;
        if (perRow < kids.length) {
          // wrapping will actually happen — compute deep gap
          const kidsMaxDepth = Math.max(0, ...kids.map(c => maxSubtreeDepth(c.id)));
          // each gen below the wrapped row adds GEN_HEIGHT;
          // plus NODE_H + cartouche/years/buffer for the deepest leaf row.
          dynamicSibRowGap = (kidsMaxDepth + 1) * GEN_HEIGHT + 80;
        }

        for (let r = 0; r * perRow < kids.length; r++) {
          const rowKids = kids.slice(r * perRow, (r + 1) * perRow);
          const rowSum = rowKids.reduce((s, c) => s + widths[c.id], 0)
                        + (rowKids.length - 1) * SIBLING_GAP;
          let cursor = x + (w - rowSum) / 2;
          const subRowY = r * dynamicSibRowGap;
          rowKids.forEach((c, idx) => {
            // organic stagger within each sub-row (only the first sub-row,
            // so wrapped sub-rows stay clean and aligned)
            const stagger = (r === 0 && rowKids.length >= 2 && idx % 2 === 1) ? SIBLING_STAGGER : 0;
            // CRUCIAL: pass `yShift + subRowY + stagger` so this parent's
            // own offset (if it itself was a wrapped sub-row child) is
            // inherited by its descendants. Without this, children of a
            // wrapped parent would land at the un-shifted gen Y and crash
            // into earlier rows.
            position(c.id, cursor, depth + 1, yShift + subRowY + stagger);
            const nx = nodes[c.id].x + NODE_W / 2;
            childCenters.push(nx);
            cursor += widths[c.id] + SIBLING_GAP;
          });
        }
      }

      const coupleX = x + (w - coupleW) / 2;
      nodes[pid] = { x: coupleX, y, person: p, depth };
      if (partner) {
        // partners must share a Y so the mating line stays horizontal
        nodes[partner.id] = { x: coupleX + NODE_W + COUPLE_GAP, y, person: partner, depth, marriedIn: true };
      }
      p._childCenters = childCenters;
      p._x = coupleX; p._y = y;
    }

    const rootEntries = [];
    data.people.forEach(p => {
      if (visited.has(p.id)) return;
      const noParents = !p.parentIds || p.parentIds.length === 0;
      if (!noParents) return;
      // Skip if this person is the partner of a bloodline person (i.e. a
      // married-in spouse). Their bloodline partner's subtree will pull
      // them in via partnerOf; making them a separate root would either
      // duplicate them or shove them into a stray column on the right.
      const isMarriedInSpouse = data.people.some(other =>
        (other.partnerIds || []).includes(p.id) &&
        other.parentIds && other.parentIds.length > 0
      );
      if (isMarriedInSpouse) return;
      const partner = (p.partnerIds || []).map(id => byId[id]).find(Boolean);
      if (partner && visited.has(partner.id)) { visited.add(p.id); return; }
      rootEntries.push(p);
      computeWidth(p.id);
    });

    data.people.forEach(p => {
      if (!visited.has(p.id) && widths[p.id] == null) {
        rootEntries.push(p);
        computeWidth(p.id);
      }
    });

    let cursorX = MARGIN;
    rootEntries.forEach(r => {
      position(r.id, cursorX, 0);
      cursorX += widths[r.id] + SIBLING_GAP * 2;
    });

    let maxX = 0, maxY = 0;
    Object.values(nodes).forEach(n => {
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H + 60);   // +60 for cartouche + years
    });

    return { nodes, byId, width: maxX + MARGIN, height: maxY + MARGIN, rootEntries };
  }

  // Draw a person as: dark oval backplate, photo clipped to oval, ornate gold
  // double-ring frame, then a name cartouche (rectangular plate) below with the
  // name engraved in small caps and birth/death years in italics underneath.
  function drawNode(person, x, y, parent, layout) {
    const [tx, ty] = xy(x, y);
    const group = el('g', {
      class: 'node-group',
      'data-id': person.id,
      transform: `translate(${tx},${ty})`,
      style: `--depth:${layout.nodes[person.id].depth}`
    }, parent);

    const cx = NODE_W / 2;
    const cy = NODE_H / 2;
    const rx = NODE_W / 2;
    const ry = NODE_H / 2;

    // dark backplate (visible if the photo is missing)
    el('ellipse', {
      cx, cy, rx, ry,
      class: 'frame-back'
    }, group);

    // photo clipped to oval
    const photoUrl = resolvePhoto(person);
    if (photoUrl) {
      const img = el('image', {
        x: 0, y: 0, width: NODE_W, height: NODE_H,
        preserveAspectRatio: 'xMidYMid slice',
        class: 'node-photo',
        'clip-path': 'url(#cp-oval)'
      }, group);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', photoUrl);
      img.setAttribute('href', photoUrl);
    }

    // outer ornate gold ring
    el('ellipse', {
      cx, cy, rx, ry,
      class: 'frame-ring'
    }, group);
    // inner thin highlight ring (gives the frame depth)
    el('ellipse', {
      cx, cy, rx: rx - 3.5, ry: ry - 3.5,
      class: 'frame-ring-inner'
    }, group);

    if (person.deceased) group.classList.add('deceased');

    // name cartouche & label
    const nameLines = wrapName(person.name, LABEL_WRAP);
    const years = [];
    if (person.birthYear) years.push(person.birthYear);
    if (person.deceased && person.deathYear) years.push('†' + person.deathYear);

    if (isVertical) {
      // VERTICAL (mobile): label sits to the right of the oval, single line.
      const label = el('text', {
        x: NODE_W + 14, y: cy - 2,
        class: 'node-label', 'text-anchor': 'start'
      }, group);
      label.textContent = person.name.toUpperCase();
      if (years.length) {
        const yt = el('text', {
          x: NODE_W + 14, y: cy + 14,
          class: 'node-years', 'text-anchor': 'start'
        }, group);
        yt.textContent = years.join(' – ');
      }
    } else {
      // HORIZONTAL (desktop): label + years stacked below the oval.
      // (The boxed cartouche behind the name was removed — names sit free
      // on the parchment, which reads cleaner and avoids touching plates
      // when partners are drawn close together.)
      const cartTop = NODE_H + CART_PAD_TOP;
      const cartW = NODE_W + 28;
      const cartH = nameLines.length * CART_HEIGHT + 6;

      const label = el('text', {
        x: NODE_W / 2, y: cartTop + 12,
        class: 'node-label', 'text-anchor': 'middle'
      }, group);
      // Cinzel small-caps with letter-spacing renders wider than a naive
      // char-count would suggest, so any line that would overflow the
      // cartouche gets squeezed to fit via SVG's textLength.
      const maxLineW = cartW - 12;
      nameLines.forEach((ln, i) => {
        const ts = el('tspan', { x: NODE_W / 2, dy: i === 0 ? 0 : CART_HEIGHT }, label);
        ts.textContent = ln.toUpperCase();
        if (ln.length * 13 > maxLineW) {
          ts.setAttribute('textLength', String(maxLineW));
          ts.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
      });

      if (years.length) {
        const yt = el('text', {
          x: NODE_W / 2, y: cartTop + cartH + 14,
          class: 'node-years', 'text-anchor': 'middle'
        }, group);
        yt.textContent = years.join(' – ');
      }
    }

    // (the small internal id label that used to sit above each portrait was
    // removed — it added clutter and collided with the edit-mode + badge.)

    if (interactive) {
      group.addEventListener('click', (e) => {
        e.stopPropagation();
        Sound.select();
        if (onSelectCb) onSelectCb(person);
        highlightNode(person.id);
      });
      group.addEventListener('mouseenter', () => Sound.hover());
    } else {
      // landing-hero: tree is decorative, don't accept clicks
      group.style.pointerEvents = 'none';
    }

    // Edit-mode affordance: small '+' badge floating above the oval. Clicking
    // it opens the kinship-add panel for this person. The badge is drawn last
    // so it sits on top of the photo and frame.
    if (editMode) {
      const bx = NODE_W - 4, by = -4;
      const btn = el('g', {
        class: 'node-add-btn',
        transform: `translate(${bx},${by})`,
        'data-id': person.id
      }, group);
      el('circle', { cx: 0, cy: 0, r: 11, class: 'node-add-bg' }, btn);
      const t = el('text', {
        x: 0, y: 0, class: 'node-add-plus',
        'text-anchor': 'middle', 'dominant-baseline': 'central'
      }, btn);
      t.textContent = '+';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Sound.click();
        if (onAddCb) onAddCb(person);
      });
    }
  }

  function highlightNode(id) {
    g.querySelectorAll('.node-group').forEach(n => n.classList.remove('selected'));
    const sel = g.querySelector(`.node-group[data-id="${id}"]`);
    if (sel) sel.classList.add('selected');
  }

  // Tiny tudor-rose roundel — five-petalled, drawn at line junctions.
  function drawRose(lx, ly, parent, r = 5) {
    const [px, py] = xy(lx, ly);
    const group = el('g', { class: 'junction-rose-group' }, parent);
    el('circle', { cx: px, cy: py, r, class: 'junction-rose' }, group);
    // a tiny gold pip at the centre
    el('circle', { cx: px, cy: py, r: r * 0.35, fill: 'var(--gold-bright)', opacity: 0.9 }, group);
  }

  // Bezier curve from logical (lx1,ly1) to (lx2,ly2). Control points lie on
  // the same vertical axis as the endpoints (in horizontal mode), producing a
  // smooth S-bend that feels like a tree branch — straight at the trunk top,
  // sweeping out to the child, straight again at the child top. xy() flips the
  // axes for vertical (mobile) mode automatically.
  function drawCurve(lx1, ly1, lx2, ly2, parent, cls) {
    const ldy = ly2 - ly1;
    const lc1y = ly1 + ldy * 0.5;
    const lc2y = ly2 - ldy * 0.5;
    const [x1, y1]   = xy(lx1, ly1);
    const [c1x, c1y] = xy(lx1, lc1y);
    const [c2x, c2y] = xy(lx2, lc2y);
    const [x2, y2]   = xy(lx2, ly2);
    return el('path', {
      d: `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`,
      pathLength: 1,
      fill: 'none',
      class: cls
    }, parent);
  }

  function drawConnections(layout) {
    const { nodes, byId } = layout;
    const linesG = el('g', { class: 'lines-layer' }, g);

    const line = (attrs, cls) => {
      const [x1, y1] = xy(attrs.x1, attrs.y1);
      const [x2, y2] = xy(attrs.x2, attrs.y2);
      return el('line', { x1, y1, x2, y2, pathLength: 1, class: cls }, linesG);
    };

    Object.values(byId).forEach(p => {
      const node = nodes[p.id];
      if (!node) return;
      const partner = p._partner;

      if (partner && nodes[partner.id]) {
        // ===== couple with children =====
        const a = nodes[p.id], b = nodes[partner.id];
        const yMid = a.y + NODE_H / 2;
        const x1 = a.x + NODE_W;
        const x2 = b.x;
        const matingMid = (x1 + x2) / 2;

        // straight horizontal mating line (a spousal link, not a lineage flow)
        line({ x1, y1: yMid, x2, y2: yMid }, 'mating-line');

        const kids = p._children;
        if (kids && kids.length > 0) {
          // tudor rose where the partnership joins the lineage
          drawRose(matingMid, yMid, linesG, 5);

          // each child gets its own curving branch from the couple's centre
          // straight down to the child's top — like a branch growing outward.
          kids.forEach(c => {
            const cn = nodes[c.id];
            const childX = cn.x + NODE_W / 2;
            const childTop = cn.y;
            drawCurve(matingMid, yMid, childX, childTop, linesG, 'parent-branch');
          });
        }
      } else if (!partner && p._children && p._children.length > 0) {
        // ===== single parent with children =====
        const a = nodes[p.id];
        const startX = a.x + NODE_W / 2;
        const startY = a.y + NODE_H;
        drawRose(startX, startY, linesG, 4);
        p._children.forEach(c => {
          const cn = nodes[c.id];
          const childX = cn.x + NODE_W / 2;
          const childTop = cn.y;
          drawCurve(startX, startY, childX, childTop, linesG, 'parent-branch');
        });
      }
    });
  }

  function applyTransform() {
    g.setAttribute('transform', `translate(${viewState.tx},${viewState.ty}) scale(${viewState.scale})`);
  }

  function vbScaleNow() {
    if (!svg) return 1;
    const vb = svg.viewBox.baseVal;
    if (!vb || !vb.width || !vb.height) return 1;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return 1;
    return Math.min(r.width / vb.width, r.height / vb.height);
  }

  function attachResize() {
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const wantsVertical = detectVertical();
        if (wantsVertical !== isVertical && currentData) {
          viewState = { scale: 1, tx: 0, ty: 0 };
          const ev = new CustomEvent('pedigree-orient-change');
          window.dispatchEvent(ev);
        } else {
          fitToView();
        }
      }, 180);
    });
  }

  function attachPanZoom(svgEl) {
    if (!interactive) return;
    if (scrollMode) return;     // scroll mode replaces pan/zoom with page scroll
    let dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0;
    svgEl.addEventListener('mousedown', e => {
      if (e.target.closest('.node-group')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startTx = viewState.tx; startTy = viewState.ty;
      svgEl.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const s = vbScaleNow();
      viewState.tx = startTx + (e.clientX - startX) / s;
      viewState.ty = startTy + (e.clientY - startY) / s;
      applyTransform();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      svgEl.style.cursor = '';
    });
    svgEl.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = svgEl.getBoundingClientRect();
      const vbS = vbScaleNow();
      const mx = (e.clientX - rect.left) / vbS;
      const my = (e.clientY - rect.top)  / vbS;
      const sx = (mx - viewState.tx) / viewState.scale;
      const sy = (my - viewState.ty) / viewState.scale;
      viewState.scale = Math.max(0.25, Math.min(3, viewState.scale * delta));
      viewState.tx = mx - sx * viewState.scale;
      viewState.ty = my - sy * viewState.scale;
      applyTransform();
    }, { passive: false });

    let touchStart = null, pinch = null;
    svgEl.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const cxT = (t1.clientX + t2.clientX) / 2;
        const cyT = (t1.clientY + t2.clientY) / 2;
        pinch = { dist, cx: cxT, cy: cyT, scale: viewState.scale, tx: viewState.tx, ty: viewState.ty };
        touchStart = null;
      } else if (e.touches.length === 1 && !pinch) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: viewState.tx, ty: viewState.ty };
      }
    }, { passive: true });
    svgEl.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const ratio = dist / pinch.dist;
        const newScale = Math.max(0.2, Math.min(4, pinch.scale * ratio));
        const rect = svgEl.getBoundingClientRect();
        const vbS = vbScaleNow();
        const ax = (pinch.cx - rect.left) / vbS;
        const ay = (pinch.cy - rect.top)  / vbS;
        const sx = (ax - pinch.tx) / pinch.scale;
        const sy = (ay - pinch.ty) / pinch.scale;
        viewState.scale = newScale;
        viewState.tx = ax - sx * newScale;
        viewState.ty = ay - sy * newScale;
        applyTransform();
      } else if (touchStart && e.touches.length === 1) {
        const s = vbScaleNow();
        viewState.tx = touchStart.tx + (e.touches[0].clientX - touchStart.x) / s;
        viewState.ty = touchStart.ty + (e.touches[0].clientY - touchStart.y) / s;
        applyTransform();
      }
    }, { passive: false });
    svgEl.addEventListener('touchend', e => {
      if (e.touches.length === 0) { touchStart = null; pinch = null; }
      else if (e.touches.length === 1) { pinch = null; touchStart = null; }
    });
  }

  // Scroll-to-grow: nodes and branches reveal as they enter the viewport.
  // Uses IntersectionObserver — once seen, an element is unobserved (so the
  // animation only plays once per element).
  function setupScrollGrow() {
    if (scrollObserver) { try { scrollObserver.disconnect(); } catch (e) {} scrollObserver = null; }
    if (!('IntersectionObserver' in window)) {
      // graceful fallback: just reveal everything
      g.querySelectorAll('.node-group, .parent-branch, .mating-line, .junction-rose-group')
        .forEach(el => el.classList.add('in-view'));
      return;
    }
    scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          scrollObserver.unobserve(entry.target);
        }
      });
    }, {
      // start the reveal a touch before the element fully enters the viewport
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.04,
    });
    g.querySelectorAll('.node-group, .parent-branch, .mating-line, .junction-rose-group')
      .forEach(el => scrollObserver.observe(el));
  }

  // Inline CSS baked into the exported SVG so the rasterised JPG keeps
  // the right colours / fonts / line weights without depending on the page's
  // stylesheet (image rasterisers don't load <link rel="stylesheet">).
  //
  // CRITICAL: do NOT set CSS `transform` here. Each node-group has an SVG
  // transform="translate(x,y)" attribute that positions it within the layout;
  // a CSS transform would override that and stack every portrait at the origin.
  const EXPORT_CSS = `
    .frame-back { fill: #1c1812; stroke: #8b6f1f; stroke-width: 1; }
    .frame-ring { fill: none; stroke: #cba656; stroke-width: 2.4; }
    .frame-ring-inner { fill: none; stroke: #f1d68a; stroke-width: 0.8; opacity: 0.7; }
    .label-cartouche { fill: #1c1812; stroke: #8b6f1f; stroke-width: 0.8; }
    .node-label { fill: #f1d68a; font-family: 'Cinzel', 'Trajan Pro', Georgia, serif; font-weight: 600; font-size: 14px; letter-spacing: 0.15em; }
    .node-years { fill: #a0906a; font-family: 'Cormorant Garamond', 'EB Garamond', Georgia, serif; font-style: italic; font-size: 14px; }
    .mating-line   { stroke: #cba656; stroke-width: 1.8; opacity: 0.85; fill: none; stroke-linecap: round; stroke-dasharray: none !important; stroke-dashoffset: 0 !important; animation: none !important; }
    .parent-branch { stroke: #cba656; stroke-width: 1.6; opacity: 0.85; fill: none; stroke-linecap: round; stroke-dasharray: none !important; stroke-dashoffset: 0 !important; animation: none !important; }
    .junction-rose { fill: #9c2330; stroke: #f1d68a; stroke-width: 0.8; opacity: 1 !important; animation: none !important; }
    .node-group { opacity: 1 !important; animation: none !important; }
    .node-photo { opacity: 1 !important; animation: none !important; }
    .node-add-btn, .node-id { display: none !important; }
  `;

  function exportImage(opts = {}) {
    const filename = opts.filename || 'family-tree.jpg';
    const scale    = opts.scale    || 2;       // 2× pixel density for print
    const bgColor  = opts.bgColor  || '#0a0805';
    const format   = opts.format   || 'image/jpeg';
    const quality  = opts.quality !== undefined ? opts.quality : 0.92;
    const maxPx    = opts.maxPixels || 16000;  // cap on either side

    if (!svg) throw new Error('Tree not yet rendered.');

    // The live SVG's viewBox has a `Math.max(W, 600)` minimum-size clamp
    // applied at render time so small trees still display nicely on screen.
    // For export we don't want that — measure the *actual* content extents
    // and crop the export viewBox tightly around them so the JPG isn't
    // padded with empty black space on one side.
    const liveRoot = svg.querySelector('.pedigree-root');
    let bx = 0, by = 0, bw, bh;
    try {
      const bbox = liveRoot.getBBox();
      bx = bbox.x; by = bbox.y; bw = bbox.width; bh = bbox.height;
    } catch (e) {
      const vb = svg.viewBox.baseVal;
      bx = vb.x; by = vb.y; bw = vb.width; bh = vb.height;
    }
    const padBox = 28;                                  // even padding on every side
    const W0 = Math.max(1, Math.round(bw + padBox * 2));
    const H0 = Math.max(1, Math.round(bh + padBox * 2));
    // shrink scale if natural × scale would exceed maxPx
    const safeScale = Math.min(scale, maxPx / Math.max(W0, H0));

    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', W0);
    clone.setAttribute('height', H0);
    // tight, content-fitted viewBox — equal margin on every side
    clone.setAttribute('viewBox', `${bx - padBox} ${by - padBox} ${W0} ${H0}`);
    clone.removeAttribute('style');

    // Reset any pan/zoom transform on the root group
    const rootG = clone.querySelector('.pedigree-root');
    if (rootG) {
      rootG.removeAttribute('transform');
      rootG.classList.remove('scroll-grow');     // disable scroll-grow hiding
    }

    // Strip in-view markers — they're scroll-mode state that doesn't apply.
    clone.querySelectorAll('.in-view').forEach(el => el.classList.remove('in-view'));

    // BULLET-PROOF VISIBILITY: image rasterisers don't always honour CSS in
    // <style> tags inside the SVG, especially when the live page has rules
    // that hide elements (scroll-grow opacity:0, draw-line dashoffset:1, etc.).
    // Inline style attributes are always respected, so set them per element.
    //
    // CRITICAL: never set CSS `transform` on a node-group — each one has an
    // SVG transform="translate(x,y)" attribute that defines its layout
    // position, and a CSS transform would override it and stack every
    // portrait at the origin (this was the bug behind the broken export).
    clone.querySelectorAll('.node-group').forEach(g => {
      g.style.opacity = '1';
      g.style.animation = 'none';
    });
    clone.querySelectorAll('.node-photo').forEach(p => {
      p.style.opacity = '1';
      p.style.animation = 'none';
    });
    clone.querySelectorAll('.parent-branch, .mating-line').forEach(p => {
      p.style.strokeDasharray = 'none';
      p.style.strokeDashoffset = '0';
      p.style.animation = 'none';
      p.style.opacity = '0.85';
    });
    clone.querySelectorAll('.junction-rose-group').forEach(jr => {
      jr.style.opacity = '1';
      jr.style.animation = 'none';
    });
    clone.querySelectorAll('.node-add-btn, .node-id').forEach(el => {
      el.setAttribute('display', 'none');
    });

    // The <style> tag is still useful as a colour/font fallback in case the
    // rasteriser supports it — inline styles above provide guaranteed
    // visibility, this provides guaranteed *appearance*.
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = EXPORT_CSS;
    clone.insertBefore(styleEl, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(W0 * safeScale);
          canvas.height = Math.round(H0 * safeScale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(svgUrl);
          canvas.toBlob((b) => {
            if (!b) return reject(new Error('Could not build image blob.'));
            const dlUrl = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = dlUrl; a.download = filename;
            document.body.appendChild(a);
            a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(dlUrl), 1200);
            resolve();
          }, format, quality);
        } catch (e) { reject(e); }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('Image load failed (the tree may contain photos from a different origin that block export).'));
      };
      img.src = svgUrl;
    });
  }

  function fitToView() {
    if (!svg || !g) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      // viewport hasn't been sized yet — try again next frame
      requestAnimationFrame(fitToView);
      return;
    }
    const vb = svg.viewBox.baseVal;
    if (!vb.width || !vb.height) return;

    // Reset any existing transform so getBBox returns the *natural* extents
    // of the rendered content (not whatever was previously fit-transformed).
    g.removeAttribute('transform');
    let bbox;
    try { bbox = g.getBBox(); } catch (e) { return; }
    if (!bbox.width || !bbox.height) return;

    // The "meet" scale that maps viewBox user-units to CSS pixels.
    const vbScale = Math.min(rect.width / vb.width, rect.height / vb.height);

    // Padding around the content (in CSS pixels).
    const padCss = 28;

    // Required scale to fit the bbox (in CSS pixels) inside the viewport.
    const naturalW = bbox.width  * vbScale;
    const naturalH = bbox.height * vbScale;
    const fitX = (rect.width  - padCss * 2) / naturalW;
    const fitY = (rect.height - padCss * 2) / naturalH;
    // Allow zoom-out to whatever's needed; cap zoom-in so a tiny tree with one
    // person doesn't get blown up to absurd size.
    const scale = Math.min(2.2, Math.min(fitX, fitY));

    // Translate so the bbox centre lands at the viewBox centre. We work in
    // viewBox user-units throughout; the SVG's meet preservation handles the
    // CSS mapping.
    const bcx = bbox.x + bbox.width  / 2;
    const bcy = bbox.y + bbox.height / 2;
    const vcx = vb.x + vb.width  / 2;
    const vcy = vb.y + vb.height / 2;

    viewState.scale = scale;
    viewState.tx = vcx - bcx * scale;
    viewState.ty = vcy - bcy * scale;
    applyTransform();
  }

  return {
    init(svgEl, opts = {}) {
      svg = svgEl;
      onSelectCb = opts.onSelect || null;
      onAddCb    = opts.onAdd    || null;
      interactive = opts.interactive !== false;     // default true; pass false for hero
      editMode   = !!opts.editMode;
      scrollMode = !!opts.scrollMode;
      wrapSiblings = opts.wrapSiblings !== false;   // default true; pass false for full-row layout

      // Single oval clip-path used for every portrait — it scales to whatever
      // bounding box the image occupies, so no per-gender variants are needed.
      const defs = el('defs', {}, svg);
      const cp = el('clipPath', { id: 'cp-oval', clipPathUnits: 'objectBoundingBox' }, defs);
      el('ellipse', { cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5 }, cp);

      g = el('g', { class: 'pedigree-root' }, svg);
      attachPanZoom(svg);
      attachResize();
    },

    render(data) {
      currentData = data;
      isVertical = detectVertical();
      while (g.firstChild) g.removeChild(g.firstChild);
      const layout = buildLayout(data);
      currentLayout = layout;
      const vbW = isVertical ? layout.height : layout.width;
      const vbH = isVertical ? layout.width  : layout.height;
      // 20px of negative-side padding so add-buttons and id labels above the
      // top row of nodes don't get clipped by the viewBox edge
      const pad = 20;
      svg.setAttribute('viewBox', `-${pad} -${pad} ${Math.max(vbW, 600) + pad * 2} ${Math.max(vbH, 400) + pad * 2}`);

      if (scrollMode) {
        // SVG flows at its natural width and lets height auto-scale to the
        // viewBox aspect ratio — page scrolls vertically through the tree.
        g.classList.add('scroll-grow');
        svg.style.width = '100%';
        svg.style.height = 'auto';
      } else {
        g.classList.remove('scroll-grow');
        svg.style.width = '';
        svg.style.height = '';
      }

      drawConnections(layout);
      const nodesG = el('g', { class: 'nodes-layer' }, g);
      data.people.forEach(p => {
        const n = layout.nodes[p.id];
        if (!n) return;
        drawNode(p, n.x, n.y, nodesG, layout);
      });
      if (interactive) Sound.scan();

      if (scrollMode) {
        setupScrollGrow();
      } else {
        setTimeout(fitToView, 50);
      }
      return layout;
    },

    fitToView,
    highlight: highlightNode,

    hoverHighlight(id) {
      g.querySelectorAll('.node-group.hover').forEach(n => n.classList.remove('hover'));
      if (id) {
        const sel = g.querySelector('.node-group[data-id="' + id + '"]');
        if (sel) sel.classList.add('hover');
      }
    },

    // Spotlight a single node (used by the landing-hero autoplay).
    // Adds a 'spotlight' class to the chosen node and removes it from any other.
    // Returns the node's screen-space rect so the caller can position a caption.
    spotlight(id) {
      g.querySelectorAll('.node-group.spotlight').forEach(n => n.classList.remove('spotlight'));
      if (!id) return null;
      const sel = g.querySelector('.node-group[data-id="' + id + '"]');
      if (!sel) return null;
      sel.classList.add('spotlight');
      return sel.getBoundingClientRect();
    },

    // Returns a list of person IDs that were rendered as nodes (used to pick
    // a random subject for the autoplay loop).
    nodeIds() {
      return Array.from(g.querySelectorAll('.node-group')).map(n => n.dataset.id);
    },

    panToNode(id) {
      const groupEl = g.querySelector('.node-group[data-id="' + id + '"]');
      if (!groupEl) return;
      const nodeBox = groupEl.getBoundingClientRect();
      const svgBox  = svg.getBoundingClientRect();
      const dxScreen = (svgBox.left + svgBox.width  / 2) - (nodeBox.left + nodeBox.width  / 2);
      const dyScreen = (svgBox.top  + svgBox.height / 2) - (nodeBox.top  + nodeBox.height / 2);
      const vb = svg.viewBox.baseVal;
      const vbScale = Math.min(svgBox.width / vb.width, svgBox.height / vb.height);
      viewState.tx += dxScreen / vbScale;
      viewState.ty += dyScreen / vbScale;
      applyTransform();
    },

    zoomIn()  { viewState.scale = Math.min(3, viewState.scale * 1.15); applyTransform(); Sound.blip(); },
    zoomOut() { viewState.scale = Math.max(0.25, viewState.scale * 0.87); applyTransform(); Sound.blip(); },
    reset()   { viewState = { scale: 1, tx: 0, ty: 0 }; fitToView(); Sound.whoosh(); },

    // Switch between scroll-grow mode and zoomed/fit-to-canvas mode at runtime.
    // Re-renders the current data so the new mode takes effect.
    setScrollMode(bool) {
      scrollMode = !!bool;
      if (currentData) this.render(currentData);
    },

    // Toggle sibling-row wrapping at runtime. When false, every sibship is
    // drawn on a single horizontal row (the "full tree" view).
    setWrapSiblings(bool) {
      wrapSiblings = bool !== false;
      if (currentData) this.render(currentData);
    },

    // Export the rendered tree as a printable JPG/PNG. See exportImage docs.
    exportImage,
  };
})();
