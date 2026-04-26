// ============================================================
// PEDIGREE RENDERER — SVG, medical genetics symbols
//   Square = male, Circle = female, Diamond = unknown
//   Filled = affected, Half-fill = carrier, Slash = deceased
//   Mating line = horizontal between partners
//   Sibship line = horizontal connecting children, vertical drops
// ============================================================

const Pedigree = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const NODE = 56;            // node size (square side / circle diameter)
  const COUPLE_GAP = 32;      // gap between mating partners
  const SIBLING_GAP = 56;     // gap between siblings (wider for long Indian names)
  const GEN_HEIGHT = 200;     // vertical space per generation
  const MARGIN = 80;
  const SIBSHIP_DROP = 44;    // how far below couple the sibship bar sits
  const LABEL_WRAP = 14;      // wrap names longer than this many chars

  let viewState = { scale: 1, tx: 0, ty: 0 };
  let svg, g, currentData, currentLayout, onSelectCb;

  function el(tag, attrs = {}, parent = null) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Word-wrap a name into lines of at most `max` chars, splitting on whitespace.
  // Falls back to a hard split for any single word longer than max.
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
      return (p.partnerIds || [])
        .map(id => byId[id])
        .find(x => x && !visited.has(x.id)) || null;
    }

    function childrenOf(p1, p2) {
      return data.people.filter(c => {
        const par = c.parentIds || [];
        if (p2) return par.includes(p1) && par.includes(p2);
        // single parent: child whose parentIds contains p1, and any other parent isn't in dataset
        return par.includes(p1) && par.every(x => x === p1 || !byId[x]);
      });
    }

    function computeWidth(pid) {
      if (widths[pid] != null) return widths[pid];
      const p = byId[pid];
      visited.add(pid);
      const partner = partnerOf(pid);
      if (partner) visited.add(partner.id);

      const coupleW = partner ? 2 * NODE + COUPLE_GAP : NODE;
      const kids = childrenOf(pid, partner ? partner.id : null);

      p._partner = partner;
      p._children = kids;
      p._coupleW = coupleW;

      let w;
      if (kids.length === 0) {
        w = coupleW;
      } else {
        let sum = 0;
        kids.forEach(c => sum += computeWidth(c.id));
        sum += (kids.length - 1) * SIBLING_GAP;
        w = Math.max(coupleW, sum);
      }
      widths[pid] = w;
      return w;
    }

    function position(pid, x, depth) {
      const p = byId[pid];
      const w = widths[pid];
      const partner = p._partner;
      const kids = p._children;
      const coupleW = p._coupleW;
      const y = depth * GEN_HEIGHT;

      // place children first (so we can route sibship)
      const childCenters = [];
      if (kids.length > 0) {
        let childSum = kids.reduce((s, c) => s + widths[c.id], 0) + (kids.length - 1) * SIBLING_GAP;
        let cursor = x + (w - childSum) / 2;
        kids.forEach(c => {
          position(c.id, cursor, depth + 1);
          // node center for child = its couple's primary node center
          const nx = nodes[c.id].x + NODE / 2;
          childCenters.push(nx);
          cursor += widths[c.id] + SIBLING_GAP;
        });
      }

      const coupleX = x + (w - coupleW) / 2;
      nodes[pid] = { x: coupleX, y, person: p, depth };
      if (partner) {
        nodes[partner.id] = { x: coupleX + NODE + COUPLE_GAP, y, person: partner, depth, marriedIn: true };
      }
      p._childCenters = childCenters;
      p._x = coupleX; p._y = y;
    }

    // Identify root couples (founders)
    const rootEntries = [];
    data.people.forEach(p => {
      if (visited.has(p.id)) return;
      const noParents = !p.parentIds || p.parentIds.length === 0;
      if (!noParents) return;
      // skip if their partner is already an established root (married-in to a root)
      const partner = (p.partnerIds || []).map(id => byId[id]).find(Boolean);
      if (partner && visited.has(partner.id)) { visited.add(p.id); return; }
      rootEntries.push(p);
      computeWidth(p.id);
    });

    // Catch orphans (people not connected to any root) — render them as their own roots
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

    // compute extents
    let maxX = 0, maxY = 0;
    Object.values(nodes).forEach(n => {
      maxX = Math.max(maxX, n.x + NODE);
      maxY = Math.max(maxY, n.y + NODE);
    });

    return { nodes, byId, width: maxX + MARGIN, height: maxY + MARGIN, rootEntries };
  }

  function drawNode(person, x, y, parent, layout) {
    const cx = x + NODE / 2, cy = y + NODE / 2;
    const group = el('g', {
      class: 'node-group',
      'data-id': person.id,
      transform: `translate(${x},${y})`,
      style: `--depth:${layout.nodes[person.id].depth}`
    }, parent);

    // glow ring
    el('circle', {
      cx: NODE / 2, cy: NODE / 2, r: NODE * 0.75,
      class: 'node-glow', fill: 'none'
    }, group);

    // photo (clipped to shape) — drawn behind the outline
    const photoUrl = Data.resolvePhoto(person);
    if (photoUrl) {
      const img = el('image', {
        x: 0, y: 0, width: NODE, height: NODE,
        preserveAspectRatio: 'xMidYMid slice',
        class: 'node-photo'
      }, group);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', photoUrl);
      img.setAttribute('href', photoUrl);
      if (person.gender === 'female')      img.setAttribute('clip-path', 'url(#cp-female)');
      else if (person.gender === 'unknown') img.setAttribute('clip-path', 'url(#cp-unknown)');
      // male: rect needs no clip
    }

    // outline shape — fill is suppressed if a photo is showing through
    const outlineAttrs = photoUrl ? { fill: 'none' } : {};
    let shape;
    if (person.gender === 'male') {
      shape = el('rect', { x: 0, y: 0, width: NODE, height: NODE, class: 'node-shape', rx: 2, ...outlineAttrs }, group);
    } else if (person.gender === 'female') {
      shape = el('circle', { cx: NODE / 2, cy: NODE / 2, r: NODE / 2, class: 'node-shape', ...outlineAttrs }, group);
    } else {
      const half = NODE / 2;
      shape = el('polygon', {
        points: `${half},0 ${NODE},${half} ${half},${NODE} 0,${half}`,
        class: 'node-shape',
        ...outlineAttrs
      }, group);
    }

    // (Genetic-status overlays removed — only deceased indicator remains.)

    // deceased slash (diagonal across)
    if (person.deceased) {
      el('line', {
        x1: -6, y1: NODE + 6, x2: NODE + 6, y2: -6,
        class: 'deceased-slash'
      }, group);
    }

    // label (wraps long names across multiple lines)
    const lines = wrapName(person.name.toUpperCase(), LABEL_WRAP);
    const label = el('text', {
      x: NODE / 2, y: NODE + 22,
      class: 'node-label', 'text-anchor': 'middle'
    }, group);
    lines.forEach((ln, i) => {
      const ts = el('tspan', { x: NODE / 2, dy: i === 0 ? 0 : 13 }, label);
      ts.textContent = ln;
    });

    // years
    const years = [];
    if (person.birthYear) years.push(person.birthYear);
    if (person.deceased && person.deathYear) years.push('†' + person.deathYear);
    if (years.length) {
      const yt = el('text', {
        x: NODE / 2, y: NODE + 22 + lines.length * 13 + 4,
        class: 'node-years', 'text-anchor': 'middle'
      }, group);
      yt.textContent = years.join(' – ');
    }

    // ID tag (top left)
    const idtag = el('text', {
      x: 2, y: -6, class: 'node-id'
    }, group);
    idtag.textContent = person.id.toUpperCase();

    group.addEventListener('click', (e) => {
      e.stopPropagation();
      Sound.select();
      if (onSelectCb) onSelectCb(person);
      highlightNode(person.id);
    });
    group.addEventListener('mouseenter', () => Sound.hover());
  }

  function highlightNode(id) {
    g.querySelectorAll('.node-group').forEach(n => n.classList.remove('selected'));
    const sel = g.querySelector(`.node-group[data-id="${id}"]`);
    if (sel) sel.classList.add('selected');
  }

  function drawConnections(layout) {
    const { nodes, byId } = layout;
    const linesG = el('g', { class: 'lines-layer' }, g);

    // Helper: line with pathLength="1" so the dasharray draw-in animation
    // works regardless of how long the line is.
    const line = (attrs, cls) => el('line', { ...attrs, pathLength: 1, class: cls }, linesG);

    // Travels a small circle along (x1,y1)→(x2,y2) on a loop. Used to make
    // the static lines feel like data is flowing through them.
    const flow = (x1, y1, x2, y2, dur = 3) => {
      const p = el('circle', { r: 2.4, class: 'flow-particle' }, linesG);
      const ax = document.createElementNS(NS, 'animate');
      ax.setAttribute('attributeName', 'cx');
      ax.setAttribute('values', x1 + ';' + x2);
      ax.setAttribute('dur', dur + 's');
      ax.setAttribute('repeatCount', 'indefinite');
      ax.setAttribute('begin', (Math.random() * dur).toFixed(2) + 's');
      p.appendChild(ax);
      const ay = document.createElementNS(NS, 'animate');
      ay.setAttribute('attributeName', 'cy');
      ay.setAttribute('values', y1 + ';' + y2);
      ay.setAttribute('dur', dur + 's');
      ay.setAttribute('repeatCount', 'indefinite');
      ay.setAttribute('begin', (Math.random() * dur).toFixed(2) + 's');
      p.appendChild(ay);
    };

    Object.values(byId).forEach(p => {
      const node = nodes[p.id];
      if (!node) return;
      const partner = p._partner;

      // mating line + sibship
      if (partner && nodes[partner.id]) {
        const a = nodes[p.id], b = nodes[partner.id];
        const y = a.y + NODE / 2;
        const x1 = a.x + NODE;
        const x2 = b.x;
        const matingMid = (x1 + x2) / 2;

        line({ x1, y1: y, x2, y2: y }, 'mating-line');
        flow(x1, y, x2, y, 3.2);

        const kids = p._children;
        const childCenters = p._childCenters;
        if (kids && kids.length > 0) {
          const sibY = y + SIBSHIP_DROP;
          line({ x1: matingMid, y1: y, x2: matingMid, y2: sibY }, 'parent-line');
          flow(matingMid, y, matingMid, sibY, 2.6);
          const minX = Math.min(...childCenters);
          const maxX = Math.max(...childCenters);
          if (kids.length > 1) {
            line({ x1: minX, y1: sibY, x2: maxX, y2: sibY }, 'sibship-line');
          }
          kids.forEach(c => {
            const cn = nodes[c.id];
            const cx = cn.x + NODE / 2;
            line({ x1: cx, y1: sibY, x2: cx, y2: cn.y }, 'sibship-drop');
            flow(cx, sibY, cx, cn.y, 2.4);
          });
        }
      } else if (!partner && p._children && p._children.length > 0) {
        // single parent
        const a = nodes[p.id];
        const matingMid = a.x + NODE / 2;
        const y = a.y + NODE;
        const sibY = y + SIBSHIP_DROP;
        line({ x1: matingMid, y1: y, x2: matingMid, y2: sibY }, 'parent-line');
        const childCenters = p._childCenters;
        const minX = Math.min(...childCenters);
        const maxX = Math.max(...childCenters);
        if (p._children.length > 1) {
          line({ x1: minX, y1: sibY, x2: maxX, y2: sibY }, 'sibship-line');
        }
        p._children.forEach(c => {
          const cn = nodes[c.id];
          const cx = cn.x + NODE / 2;
          line({ x1: cx, y1: sibY, x2: cx, y2: cn.y }, 'sibship-drop');
        });
      }
    });
  }

  function applyTransform() {
    g.setAttribute('transform', `translate(${viewState.tx},${viewState.ty}) scale(${viewState.scale})`);
  }

  function attachPanZoom(svgEl) {
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
      viewState.tx = startTx + (e.clientX - startX);
      viewState.ty = startTy + (e.clientY - startY);
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
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const sx = (mx - viewState.tx) / viewState.scale;
      const sy = (my - viewState.ty) / viewState.scale;
      viewState.scale = Math.max(0.25, Math.min(3, viewState.scale * delta));
      viewState.tx = mx - sx * viewState.scale;
      viewState.ty = my - sy * viewState.scale;
      applyTransform();
    }, { passive: false });

    // touch pan
    let touchStart = null;
    svgEl.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: viewState.tx, ty: viewState.ty };
      }
    });
    svgEl.addEventListener('touchmove', e => {
      if (touchStart && e.touches.length === 1) {
        viewState.tx = touchStart.tx + (e.touches[0].clientX - touchStart.x);
        viewState.ty = touchStart.ty + (e.touches[0].clientY - touchStart.y);
        applyTransform();
      }
    }, { passive: true });
    svgEl.addEventListener('touchend', () => { touchStart = null; });
  }

  function fitToView() {
    if (!currentData) return;
    const layout = buildLayout(currentData);
    const rect = svg.getBoundingClientRect();
    const sx = (rect.width - 80) / layout.width;
    const sy = (rect.height - 80) / layout.height;
    viewState.scale = Math.min(1, Math.min(sx, sy));
    viewState.tx = (rect.width - layout.width * viewState.scale) / 2;
    viewState.ty = 40;
    applyTransform();
  }

  return {
    init(svgEl, opts = {}) {
      svg = svgEl;
      onSelectCb = opts.onSelect || null;

      // Reusable clip-paths for photo masking. Using objectBoundingBox so
      // the same clip works for any image size — coords are 0..1.
      const defs = el('defs', {}, svg);
      const cpFemale = el('clipPath', { id: 'cp-female', clipPathUnits: 'objectBoundingBox' }, defs);
      el('circle', { cx: 0.5, cy: 0.5, r: 0.5 }, cpFemale);
      const cpUnknown = el('clipPath', { id: 'cp-unknown', clipPathUnits: 'objectBoundingBox' }, defs);
      el('polygon', { points: '0.5,0 1,0.5 0.5,1 0,0.5' }, cpUnknown);

      g = el('g', { class: 'pedigree-root' }, svg);
      attachPanZoom(svg);
    },

    render(data) {
      currentData = data;
      while (g.firstChild) g.removeChild(g.firstChild);
      const layout = buildLayout(data);
      currentLayout = layout;
      svg.setAttribute('viewBox', `0 0 ${Math.max(layout.width, 800)} ${Math.max(layout.height, 600)}`);
      drawConnections(layout);
      const nodesG = el('g', { class: 'nodes-layer' }, g);
      data.people.forEach(p => {
        const n = layout.nodes[p.id];
        if (!n) return;
        drawNode(p, n.x, n.y, nodesG, layout);
      });
      Sound.scan();
      setTimeout(fitToView, 50);
      return layout;
    },

    fitToView,
    highlight: highlightNode,

    // Temporary green halo on a node — used when hovering a relation pill.
    hoverHighlight(id) {
      g.querySelectorAll('.node-group.hover').forEach(n => n.classList.remove('hover'));
      if (id) {
        const sel = g.querySelector('.node-group[data-id="' + id + '"]');
        if (sel) sel.classList.add('hover');
      }
    },

    // Smoothly center the viewport on a node (CSS transition does the easing).
    // We use screen-pixel deltas, then convert to user-coord deltas via the
    // viewBox scale, so this works regardless of how zoomed-out the SVG is.
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
  };
})();
