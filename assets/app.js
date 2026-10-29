/* Интерактивное родословное дерево: SVG-схема с масштабом и сдвигом, карточки людей и разделы страницы.
   Данные — в assets/data.js (window.FAMILY). */
(() => {
  'use strict';

  const D = window.FAMILY;
  const NS = 'http://www.w3.org/2000/svg';
  const SX = 272; // шаг по горизонтали между соседями
  const NW = 248; // ширина карточки
  const NH = 100; // высота карточки
  const RY = 196; // шаг между поколениями
  const PH = { x: 10, y: 14, w: 54, h: 72 }; // место под фото в карточке
  const TX = PH.x + PH.w + 10; // отступ текста справа от фото
  const REL = {
    doc: 'подтверждено документом',
    prob: 'вероятно',
    hyp: 'предположение',
    fam: 'со слов семьи',
    neg: 'не найдено'
  };
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const byId = {};
  D.people.forEach(p => { byId[p.id] = p; });

  /* ---------- построение элементов ---------- */

  function setAttrs(e, attrs) {
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
  }
  function append(e, kids) {
    kids.flat(Infinity).forEach(c => {
      if (c === null || c === undefined || c === false || c === '') return;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  }
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    setAttrs(e, attrs);
    append(e, kids);
    return e;
  }
  function sv(tag, attrs, ...kids) {
    const e = document.createElementNS(NS, tag);
    setAttrs(e, attrs);
    append(e, kids);
    return e;
  }

  /* ---------- схема дерева ---------- */

  const cx = p => p.x * SX;
  const top = p => p.gen * RY;
  const shortName = p => p.n1 + (p.n2 && !p.n2.startsWith('(') ? ' ' + p.n2 : '');
  const sourceTitles = keys => (keys || []).map(k => D.sources[k] && D.sources[k].t).filter(Boolean).join('; ');

  const svg = document.getElementById('tree-svg');
  const vp = sv('g', {});
  const gDeco = sv('g', { class: 'deco' });
  const gLabels = sv('g', { class: 'gl' });
  const gEdges = sv('g', { class: 'edges' });
  const gNodes = sv('g', { class: 'nodes' });
  gDeco.append(gLabels);
  vp.append(gDeco, gEdges, gNodes);
  svg.append(
    sv('defs', {}, sv('clipPath', { id: 'ph-clip', clipPathUnits: 'objectBoundingBox' }, sv('rect', { width: 1, height: 1, rx: 0.15, ry: 0.11 }))),
    vp);

  let showHyp = true; // возможные родственники видны пунктиром; переключатель их скрывает

  function linkTip(a, b, r, keys) {
    const src = sourceTitles(keys);
    return `${a} — ${b}: ${REL[r] || REL.fam}` + (src ? `. Источник: ${src}` : '');
  }

  function edge(parent, d, r, found, tip, hidden) {
    const kind = r === 'prob' ? 'prob' : r === 'hyp' ? 'hyp' : 'solid';
    const g = sv('g', { class: 'eg' + (hidden ? ' hx' : '') });
    g.append(sv('path', { d, class: `e ${kind}` + (found ? ' found' : '') }));
    if (tip) g.append(sv('path', { d, class: 'ehit' }), sv('title', {}, tip));
    parent.append(g);
  }

  function drawUnions() {
    D.unions.forEach(u => {
      const ps = u.partners.map(id => byId[id]).sort((a, b) => a.x - b.x);
      const kids = (u.children || []).map(c => Object.assign({ p: byId[c.id] }, c));
      const members = u.partners.concat(kids.map(k => k.id));
      const g = sv('g', { class: 'ug' + (u.hyp ? ' hx' : ''), 'data-m': members.join(' ') });
      gEdges.append(g);

      const t0 = top(ps[0]);
      let dx;
      let y0;
      if (ps.length === 2) {
        const y = t0 + NH / 2;
        const x1 = cx(ps[0]) + NW / 2;
        const x2 = cx(ps[1]) - NW / 2;
        edge(g, `M${x1},${y}H${x2}`, u.r, u.f, linkTip(shortName(ps[0]), shortName(ps[1]) + ' (супруги)', u.r, u.s));
        g.append(sv('circle', { class: 'ring' + (u.f ? ' found' : ''), cx: (x1 + x2) / 2, cy: y, r: 3.5 }));
        dx = (x1 + x2) / 2;
        y0 = y;
      } else {
        dx = cx(ps[0]);
        y0 = t0 + NH;
      }
      if (!kids.length) return;

      const parents = ps.map(shortName).join(' и ');
      const busY = t0 + NH + (RY - NH) / 2;
      const main = kids.filter(k => !k.p.hyp);
      const extra = kids.filter(k => k.p.hyp);
      let minX = dx;
      let maxX = dx;
      if (main.length) {
        const xs = main.map(k => cx(k.p));
        minX = Math.min(dx, ...xs);
        maxX = Math.max(dx, ...xs);
        const weak = main.every(k => k.r === 'prob' || k.r === 'hyp');
        const bus = `M${dx},${y0}V${busY}` + (maxX > minX ? `M${minX},${busY}H${maxX}` : '');
        edge(g, bus, weak ? 'prob' : 'doc', main.every(k => k.f));
        main.forEach(k => edge(g, `M${cx(k.p)},${busY}V${top(k.p)}`, k.r, k.f, linkTip(parents, shortName(k.p), k.r, k.s)));
      }
      extra.forEach(k => {
        const x = cx(k.p);
        const d = main.length
          ? `M${x > maxX ? maxX : minX},${busY}H${x}V${top(k.p)}`
          : `M${dx},${y0}V${busY}H${x}V${top(k.p)}`;
        edge(g, d, k.r, k.f, linkTip(parents, shortName(k.p), k.r, k.s), !u.hyp);
      });
    });
  }

  // Заглушка на месте фото: силуэт и надпись «фото пока нет».
  function photoPlaceholder() {
    const mx = PH.x + PH.w / 2;
    return [
      sv('circle', { class: 'ph-fig', cx: mx, cy: PH.y + 19, r: 8 }),
      sv('path', { class: 'ph-fig', d: `M${mx - 14},${PH.y + 44}q0-13 14-13q14 0 14 13z` }),
      sv('text', { class: 'ph-t', x: mx, y: PH.y + 56 }, 'фото'),
      sv('text', { class: 'ph-t', x: mx, y: PH.y + 66 }, 'пока нет')
    ];
  }

  function photoSlot(p) {
    const g = sv('g', { class: 'ph' });
    g.append(sv('rect', { class: 'ph-bg', x: PH.x, y: PH.y, width: PH.w, height: PH.h, rx: 8 }));
    if (!p.photo) {
      append(g, photoPlaceholder());
      return g;
    }
    const im = sv('image', {
      x: PH.x, y: PH.y, width: PH.w, height: PH.h, href: p.photo.src,
      preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'url(#ph-clip)'
    });
    im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', p.photo.src);
    im.addEventListener('error', () => {
      im.remove();
      append(g, photoPlaceholder());
    });
    g.append(im);
    return g;
  }

  function pillFor(p) {
    if (p.hyp) return { t: 'гипотеза', c: 'hyp' };
    if (p.f) return { t: p.r === 'prob' ? 'новое · вероятно' : 'новое', c: 'found' };
    return null;
  }

  function drawNodes() {
    D.people.forEach(p => {
      const cls = ['node', p.f ? 'found' : 'known', p.hyp ? 'hyp hx' : '', p.me ? 'me' : ''].filter(Boolean).join(' ');
      const label = [p.full, p.y, p.role].filter(Boolean).join(', ');
      const g = sv('g', {
        class: cls, 'data-id': p.id, tabindex: '0', role: 'button', 'aria-label': label,
        transform: `translate(${cx(p) - NW / 2},${top(p)})`
      });
      g.append(sv('rect', { class: 'card', width: NW, height: NH, rx: 12 }), photoSlot(p));
      [[p.n1, 'n1', 30], [p.n2, 'n2', 50], [p.y, 'yr', 70], [p.role, 'role', 89]].forEach(([t, c, y]) => {
        if (t) g.append(sv('text', { class: c, x: TX, y }, t));
      });
      const pill = pillFor(p);
      if (pill) {
        const pg = sv('g', { class: 'pill ' + pill.c, transform: `translate(${NW - 8},-10)` });
        pg.append(sv('rect', { height: 20, rx: 10 }), sv('text', { y: 14 }, pill.t));
        g.append(pg);
      }
      gNodes.append(g);
    });
  }

  function drawGroups() {
    (D.groups || []).forEach(gr => {
      const ps = gr.ids.map(id => byId[id]);
      const x1 = Math.min(...ps.map(p => cx(p) - NW / 2)) - 22;
      const x2 = Math.max(...ps.map(p => cx(p) + NW / 2)) + 22;
      const y1 = Math.min(...ps.map(top)) - 46;
      const y2 = Math.max(...ps.map(p => top(p) + NH)) + 22;
      const g = sv('g', { class: 'grp' + (gr.hyp ? ' hx' : '') });
      g.append(sv('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 18 }), sv('text', { x: x1 + 16, y: y1 + 22 }, gr.label));
      gDeco.append(g);
    });
  }

  const visible = () => D.people.filter(p => showHyp || !p.hyp);

  function drawGenLabels() {
    gLabels.textContent = '';
    const left = Math.min(...visible().map(p => cx(p) - NW / 2)) - 28;
    (D.genLabels || []).forEach((t, i) => gLabels.append(sv('text', { x: left, y: i * RY + NH / 2 + 4 }, t.toUpperCase())));
  }

  // Длинные имена ужимаются по ширине карточки, плашки «новое» подгоняются под текст.
  function fitTexts() {
    gNodes.querySelectorAll('.node').forEach(n => {
      if (n.classList.contains('hx') && !showHyp) return;
      [...n.children].filter(c => c.tagName === 'text').forEach(t => {
        t.style.fontSize = '';
        let fs = parseFloat(getComputedStyle(t).fontSize) || 13;
        let guard = 0;
        while (t.getComputedTextLength() > NW - TX - 10 && fs > 8 && guard++ < 24) {
          fs -= 0.5;
          t.style.fontSize = fs + 'px';
        }
      });
      const pg = n.querySelector('.pill');
      if (pg) {
        const t = pg.querySelector('text');
        const r = pg.querySelector('rect');
        const w = Math.ceil(t.getComputedTextLength()) + 16;
        if (w > 16) {
          r.setAttribute('x', -w);
          r.setAttribute('width', w);
          t.setAttribute('x', -w / 2);
        }
      }
    });
  }

  /* ---------- масштаб и сдвиг ---------- */

  const view = { x: 0, y: 0, k: 1 };
  let anim = 0;
  const clampK = k => Math.min(2.4, Math.max(0.12, k));
  const applyView = () => vp.setAttribute('transform', `translate(${view.x.toFixed(1)},${view.y.toFixed(1)}) scale(${view.k.toFixed(4)})`);

  function zoomAt(px, py, f) {
    const k = clampK(view.k * f);
    const r = k / view.k;
    view.x = px - (px - view.x) * r;
    view.y = py - (py - view.y) * r;
    view.k = k;
    applyView();
  }
  function bounds() {
    const vis = visible();
    return {
      x1: Math.min(...vis.map(p => cx(p) - NW / 2)) - 150,
      x2: Math.max(...vis.map(p => cx(p) + NW / 2)) + 24,
      y1: -30,
      y2: Math.max(...vis.map(p => top(p) + NH)) + 24
    };
  }
  function fitView() {
    const r = svg.getBoundingClientRect();
    const b = bounds();
    const k = clampK(Math.min(r.width / (b.x2 - b.x1), r.height / (b.y2 - b.y1), 1.1));
    return { k, x: (r.width - (b.x2 + b.x1) * k) / 2, y: (r.height - (b.y2 + b.y1) * k) / 2 };
  }
  // Всё дерево, если оно читается целиком; иначе крупнее, по центру — линия Олега.
  function startView() {
    const r = svg.getBoundingClientRect();
    const b = bounds();
    const fit = fitView();
    const readable = 0.6;
    if (fit.k >= readable) return fit;
    const k = clampK(Math.max(fit.k, Math.min(readable, r.height / (b.y2 - b.y1))));
    return { k, x: r.width / 2 - cx(byId.oleg) * k, y: (r.height - (b.y2 + b.y1) * k) / 2 };
  }
  function focusView(p) {
    const r = svg.getBoundingClientRect();
    const k = Math.max(view.k, r.width < 700 ? 0.6 : 0.8);
    const shift = !panel.hidden && r.width >= 760 ? Math.min(430, r.width * 0.4) / 2 : 0;
    const lift = !panel.hidden && r.width < 760 ? r.height * 0.25 : 0;
    return { k, x: r.width / 2 - shift - cx(p) * k, y: r.height / 2 - lift - (top(p) + NH / 2) * k };
  }
  function animateTo(t, ms = 420) {
    cancelAnimationFrame(anim);
    if (reduceMotion) {
      Object.assign(view, t);
      applyView();
      return;
    }
    const s0 = Object.assign({}, view);
    const t0 = performance.now();
    const step = now => {
      const u = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - u, 3);
      view.x = s0.x + (t.x - s0.x) * e;
      view.y = s0.y + (t.y - s0.y) * e;
      view.k = s0.k + (t.k - s0.k) * e;
      applyView();
      if (u < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  const pointers = new Map();
  let moved = 0;
  let pinchDist = 0;
  let touched = false; // пока человек не трогал дерево, вид подстраивается под размер окна
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    touched = true;
    cancelAnimationFrame(anim);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    svg.classList.add('dragging');
  });
  window.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      view.x += cur.x - prev.x;
      view.y += cur.y - prev.y;
      moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
      applyView();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = svg.getBoundingClientRect();
      view.x += (cur.x - prev.x) / 2;
      view.y += (cur.y - prev.y) / 2;
      if (pinchDist > 0) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchDist);
      else applyView();
      pinchDist = d;
      moved += 10;
    }
  });
  function pointerEnd(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (!pointers.size) svg.classList.remove('dragging');
  }
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    touched = true;
    cancelAnimationFrame(anim);
    const r = svg.getBoundingClientRect();
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      view.x -= e.deltaX;
      applyView();
      return;
    }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });
  svg.addEventListener('click', e => {
    if (moved > 6) return;
    const n = e.target.closest('.node');
    if (n) select(n.dataset.id, false);
    else clearSelection();
  });
  svg.addEventListener('keydown', e => {
    const n = e.target.closest && e.target.closest('.node');
    if (n && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      select(n.dataset.id, false);
    }
    if (e.key === 'Escape') clearSelection();
  });

  /* ---------- карточка человека ---------- */

  const panel = document.getElementById('panel');
  let selectedId = null;

  function family(id) {
    const r = { parents: [], spouses: [], children: [], siblings: [] };
    D.unions.forEach(u => {
      const kids = (u.children || []).map(c => c.id);
      if (u.partners.includes(id)) {
        u.partners.forEach(x => { if (x !== id) r.spouses.push(x); });
        r.children.push(...kids);
      }
      if (kids.includes(id)) {
        r.parents.push(...u.partners);
        kids.forEach(x => { if (x !== id) r.siblings.push(x); });
      }
    });
    const uniq = a => [...new Set(a)].map(x => byId[x]);
    return { parents: uniq(r.parents), spouses: uniq(r.spouses), children: uniq(r.children), siblings: uniq(r.siblings) };
  }

  const chip = r => h('span', { class: 'chip r-' + r }, REL[r] || r);

  function thumbs(so) {
    if (!so.img) return null;
    return h('div', { class: 'thumbs' }, so.img.map(im =>
      h('button', { type: 'button', class: 'thumb', title: 'Открыть скан', onclick: () => openScan(im, so) },
        h('img', { src: im.src, alt: im.cap, loading: 'lazy' }))));
  }
  const links = so => (so.urls || []).map(([lab, url]) => h('a', { href: url, target: '_blank', rel: 'noopener' }, lab));

  function srcBlock(keys) {
    const list = (keys || []).filter(k => D.sources[k]);
    if (!list.length) return null;
    return h('div', { class: 'srcs' }, list.map(k => {
      const so = D.sources[k];
      return h('div', { class: 'src' },
        h('span', { class: 'src-t' }, so.t),
        so.ref ? h('span', { class: 'src-ref' }, so.ref) : null,
        so.note ? h('span', { class: 'src-ref' }, so.note) : null,
        so.urls ? h('span', { class: 'src-links' }, links(so)) : null,
        thumbs(so));
    }));
  }

  function factItem(fa) {
    return h('li', { class: 'fact' + (fa.f ? ' found' : '') + (fa.r === 'neg' ? ' neg' : '') },
      h('p', { class: 'fact-t' }, fa.t),
      h('div', { class: 'fact-m' }, fa.f ? h('span', { class: 'newtag' }, 'найдено') : null, chip(fa.r)),
      srcBlock(fa.s));
  }

  const personBtn = (q, onclick) => h('button', {
    type: 'button', class: 'pbtn' + (q.f ? ' found' : '') + (q.hyp ? ' hyp' : ''), onclick
  }, q.n1 + (q.y ? ` (${q.y})` : ''));

  function relBlock(fam) {
    const rows = [['Родители', fam.parents], ['Муж / жена', fam.spouses], ['Братья и сёстры', fam.siblings], ['Дети', fam.children]]
      .filter(([, arr]) => arr.length);
    if (!rows.length) return null;
    return h('div', { class: 'p-rel' }, h('h3', {}, 'Родные в дереве'),
      rows.map(([lab, arr]) => h('div', { class: 'rel-row' },
        h('span', { class: 'rel-l' }, lab),
        h('span', { class: 'rel-v' }, arr.map(q => personBtn(q, () => select(q.id, true)))))));
  }

  function photoBlock(p) {
    if (!p.photo) return h('div', { class: 'p-photo none' }, 'Фото пока нет');
    const so = D.sources[p.photo.s] || { t: p.photo.credit };
    return h('button', {
      type: 'button', class: 'p-photo', title: 'Открыть фото',
      onclick: () => openScan({ src: p.photo.src, cap: p.photo.cap }, so)
    }, h('img', { src: p.photo.src, alt: p.photo.cap }));
  }

  function renderPanel(p, fam) {
    panel.textContent = '';
    const badge = p.hyp
      ? h('span', { class: 'badge hyp' }, 'возможный родственник — родство не доказано')
      : p.f ? h('span', { class: 'badge found' }, 'найден в ходе исследования')
        : h('span', { class: 'badge known' }, 'известен от семьи');
    const photoSrc = p.photo && D.sources[p.photo.s];
    append(panel, [
      h('button', { type: 'button', class: 'p-close', 'aria-label': 'Закрыть карточку', onclick: clearSelection }, '×'),
      h('div', { class: 'p-head' },
        photoBlock(p),
        h('div', {},
          h('div', { class: 'p-role' }, p.role),
          h('h2', { class: 'p-name' + (p.f ? ' found' : '') }, p.full),
          p.y ? h('div', { class: 'p-years' }, p.y) : null,
          h('div', { class: 'p-badges' }, badge, p.living ? h('span', { class: 'badge known' }, 'о живущих — только имя') : null))),
      p.photo ? h('p', { class: 'p-credit' }, p.photo.credit, photoSrc ? h('span', { class: 'src-links' }, links(photoSrc)) : null) : null,
      p.alt ? h('p', { class: 'p-alt' }, p.alt) : null,
      h('h3', {}, 'Факты и источники'),
      h('ul', { class: 'facts' }, p.facts.map(factItem)),
      relBlock(fam)]);
    panel.hidden = false;
    panel.scrollTop = 0;
  }

  function setParam(id) {
    try {
      const u = new URL(location.href);
      if (id) u.searchParams.set('p', id);
      else u.searchParams.delete('p');
      history.replaceState(null, '', u);
    } catch (err) {
      /* адресная строка не обновляется — не страшно */
    }
  }

  function select(id, recenter) {
    const p = byId[id];
    if (!p) return;
    touched = true;
    if (p.hyp && !showHyp) setHyp(true);
    selectedId = id;
    const fam = family(id);
    const near = new Set([id].concat(fam.parents, fam.spouses, fam.children, fam.siblings).map(q => (typeof q === 'string' ? q : q.id)));
    svg.classList.add('focus');
    gNodes.querySelectorAll('.node').forEach(n => {
      n.classList.toggle('sel', n.dataset.id === id);
      n.classList.toggle('near', near.has(n.dataset.id));
    });
    gEdges.querySelectorAll('.ug').forEach(g => g.classList.toggle('near', g.dataset.m.split(' ').includes(id)));
    renderPanel(p, fam);
    if (recenter) animateTo(focusView(p));
    setParam(id);
  }

  function clearSelection() {
    selectedId = null;
    svg.classList.remove('focus');
    gNodes.querySelectorAll('.node.sel, .node.near').forEach(n => n.classList.remove('sel', 'near'));
    gEdges.querySelectorAll('.ug.near').forEach(g => g.classList.remove('near'));
    panel.hidden = true;
    setParam(null);
  }

  /* ---------- скан документа ---------- */

  const scan = document.getElementById('scan');
  function openScan(im, so) {
    const img = scan.querySelector('img');
    img.src = im.src;
    img.alt = im.cap;
    scan.querySelector('.scan-cap').textContent = im.cap;
    scan.querySelector('.scan-src').textContent = so.t + (so.ref ? '. ' + so.ref : '');
    const a = scan.querySelector('.scan-link');
    const first = so.urls && so.urls[0];
    a.hidden = !first;
    if (first) a.href = first[1];
    if (typeof scan.showModal === 'function') scan.showModal();
    else scan.setAttribute('open', '');
  }
  scan.addEventListener('click', e => {
    if (e.target === scan || e.target.closest('.scan-close')) {
      if (typeof scan.close === 'function') scan.close();
      else scan.removeAttribute('open');
    }
  });

  /* ---------- панель управления ---------- */

  const hypToggle = document.getElementById('hyp-toggle');
  function setHyp(on) {
    showHyp = on;
    hypToggle.checked = on;
    svg.classList.toggle('show-hyp', on);
    drawGenLabels();
    if (on) requestAnimationFrame(fitTexts);
  }
  hypToggle.addEventListener('change', () => {
    setHyp(hypToggle.checked);
    if (!showHyp && selectedId && byId[selectedId].hyp) clearSelection();
  });

  const center = () => {
    const r = svg.getBoundingClientRect();
    return [r.width / 2, r.height / 2];
  };
  document.getElementById('zoom-in').addEventListener('click', () => { touched = true; zoomAt(...center(), 1.25); });
  document.getElementById('zoom-out').addEventListener('click', () => { touched = true; zoomAt(...center(), 0.8); });
  document.getElementById('zoom-fit').addEventListener('click', () => { touched = true; animateTo(fitView()); });
  document.getElementById('zoom-me').addEventListener('click', () => select('oleg', true));

  const search = document.getElementById('search');
  const datalist = document.getElementById('people-list');
  D.people.forEach(p => datalist.append(h('option', { value: p.full })));
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').trim();
  function findPerson(q) {
    q = norm(q);
    if (!q) return null;
    return D.people.find(p => norm(p.full) === q)
      || D.people.find(p => norm([p.full, p.n1, p.n2, p.alt].join(' ')).includes(q));
  }
  search.addEventListener('input', () => {
    const p = D.people.find(x => x.full === search.value.trim());
    if (p) select(p.id, true);
  });
  search.addEventListener('change', () => {
    const p = findPerson(search.value);
    if (p) select(p.id, true);
  });

  function showInTree(id) {
    document.getElementById('tree').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    select(id, true);
  }

  /* ---------- разделы страницы ---------- */

  const isNew = f => f.f && f.r !== 'neg';
  const stat = (n, label, green) => h('div', { class: 'stat' + (green ? ' found' : '') }, h('b', {}, n), h('span', {}, label));

  function renderStats() {
    const main = D.people.filter(p => !p.hyp);
    const facts = D.people.reduce((n, p) => n + p.facts.filter(isNew).length, 0)
      + D.places.reduce((n, pl) => n + pl.facts.filter(isNew).length, 0);
    document.getElementById('stats').append(
      stat(main.length, 'человек в дереве'),
      stat(main.filter(p => p.f).length, 'найдены в ходе исследования', true),
      stat(facts, 'новых фактов с источниками', true),
      stat(D.places.filter(pl => pl.f).length, 'новых мест', true),
      stat(D.people.filter(p => p.hyp).length, 'возможных родственников'));
    document.getElementById('updated').textContent = `Обновлено ${D.updated}. ${D.status}`;
  }

  function sourceLine(keys) {
    const list = (keys || []).filter(k => D.sources[k]);
    if (!list.length) return null;
    return h('span', { class: 'hl-src' }, 'Источники: ', list.map((k, i) => {
      const so = D.sources[k];
      const u = so.urls && so.urls[0];
      return [i ? '; ' : '', u ? h('a', { href: u[1], target: '_blank', rel: 'noopener' }, so.t) : so.t];
    }));
  }

  function renderFindings() {
    const root = document.getElementById('findings-body');
    root.append(h('ol', { class: 'highlights' }, D.highlights.map(x => h('li', {},
      h('p', {}, x.t),
      h('div', { class: 'hl-m' }, x.ids.map(id => personBtn(byId[id], () => showInTree(id)))),
      sourceLine(x.s)))));

    const order = D.people.filter(p => !p.hyp).concat(D.people.filter(p => p.hyp));
    const groups = order.map(p => ({ p, facts: p.facts.filter(isNew) })).filter(g => g.facts.length);
    root.append(h('h3', { class: 'sub-h' }, 'Все находки по людям'));
    root.append(h('div', { class: 'cards' }, groups.map(({ p, facts }) => h('article', { class: 'card-p' + (p.f ? ' found' : '') + (p.hyp ? ' hyp' : '') },
      h('header', {},
        h('div', { class: 'cp-role' }, p.role),
        h('h4', {}, p.full),
        p.y ? h('div', { class: 'cp-y' }, p.y) : null,
        h('button', { type: 'button', class: 'linkbtn', onclick: () => showInTree(p.id) }, 'Показать в дереве')),
      h('ul', { class: 'facts' }, facts.map(factItem))))));
  }

  function placePhotos(pl) {
    if (!pl.photos || !pl.photos.length) return null;
    return h('div', { class: 'pl-photos' }, pl.photos.map(ph => h('figure', {},
      h('button', {
        type: 'button', class: 'pl-photo', title: 'Открыть фото',
        onclick: () => openScan({ src: ph.src, cap: ph.cap }, { t: ph.credit, urls: ph.page ? [['страница файла', ph.page]] : [] })
      }, h('img', { src: ph.src, alt: ph.cap, loading: 'lazy' })),
      h('figcaption', {}, ph.cap, h('span', { class: 'pl-credit' }, ph.credit)))));
  }

  function renderPlaces() {
    document.getElementById('places-body').append(h('div', { class: 'cards' }, D.places.map(pl => h('article', { class: 'card-p place' + (pl.f ? ' found' : '') },
      h('header', {},
        h('div', { class: 'cp-role' }, pl.f ? 'новое место' : 'известно от семьи'),
        h('h4', {}, pl.name),
        pl.sub ? h('div', { class: 'cp-y' }, pl.sub) : null),
      placePhotos(pl),
      h('ul', { class: 'facts' }, pl.facts.map(factItem)),
      pl.people && pl.people.length
        ? h('div', { class: 'cp-people' }, h('span', { class: 'rel-l' }, 'Люди'), pl.people.map(id => personBtn(byId[id], () => showInTree(id))))
        : null))));
  }

  function renderCandidates() {
    document.getElementById('candidates-body').append(h('div', { class: 'cands' }, D.candidates.map(c => h('article', { class: 'cand' },
      h('h4', {}, c.name),
      h('dl', {},
        h('dt', { class: 'pro' }, 'Совпадает'), h('dd', {}, c.pro),
        h('dt', { class: 'contra' }, 'Не совпадает'), h('dd', {}, c.contra),
        h('dt', {}, 'Вывод'), h('dd', {}, c.verdict)),
      srcBlock(c.s),
      c.id ? h('button', { type: 'button', class: 'linkbtn', onclick: () => showInTree(c.id) }, 'Показать в дереве') : null))));
  }

  function renderPlan() {
    document.getElementById('plan-body').append(h('ol', { class: 'plan' }, D.plan.map(x => h('li', {},
      h('h4', {}, x.t),
      h('p', {}, x.d),
      srcBlock(x.s)))));
  }

  function renderSources() {
    const used = {};
    const note = (k, who) => { (used[k] = used[k] || new Set()).add(who); };
    D.people.forEach(p => p.facts.forEach(f => (f.s || []).forEach(k => note(k, p.full))));
    D.people.forEach(p => { if (p.photo && p.photo.s) note(p.photo.s, p.full); });
    D.places.forEach(pl => pl.facts.forEach(f => (f.s || []).forEach(k => note(k, pl.name))));
    document.getElementById('sources-body').append(h('ol', { class: 'src-list' }, Object.keys(D.sources).map(k => {
      const so = D.sources[k];
      return h('li', { id: 'src-' + k },
        h('div', { class: 'src-t' }, so.t),
        so.ref ? h('div', { class: 'src-ref' }, so.ref) : null,
        so.note ? h('div', { class: 'src-ref' }, so.note) : null,
        so.urls ? h('div', { class: 'src-links' }, links(so)) : null,
        thumbs(so),
        used[k] ? h('div', { class: 'src-used' }, 'Упоминается: ' + [...used[k]].join(', ')) : null);
    })));
  }

  /* ---------- запуск ---------- */

  drawGroups();
  drawUnions();
  drawNodes();
  drawGenLabels();
  renderStats();
  renderFindings();
  renderPlaces();
  renderCandidates();
  renderPlan();
  renderSources();
  setHyp(showHyp);
  fitTexts();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTexts);

  Object.assign(view, startView());
  applyView();
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (touched) return;
      Object.assign(view, startView());
      applyView();
    }).observe(svg);
  }

  const pid = new URLSearchParams(location.search).get('p');
  if (pid && byId[pid]) select(pid, true);
})();
