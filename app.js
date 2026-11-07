/* LACE PI Outcome Board — statische app op Supabase (database + realtime), zonder login. */
(function () {
  'use strict';

  var ITER_NAMES = ['Iteratie 1', 'Iteratie 2', 'Iteratie 3', 'Iteratie 4', 'IP-iteratie', 'Volgende PI'];
  var TYPES = { fixed: { l: 'Vaste datum', v: '--m-fixed' }, learn: { l: 'Leren', v: '--m-learn' }, sync: { l: 'Synchronisatie', v: '--m-sync' }, release: { l: 'Release', v: '--m-release' } };
  var STATUS = { planned: 'Gepland', done: 'Gehaald', risk: 'Risico', missed: 'Gemist' };
  var HEALTH = { planned: 'Gepland', ok: 'Op koers', watch: 'Aandacht', behind: 'Achter', done: 'Behaald' };
  var VIEW_KEY = 'lace-pi-view-v1';

  /* Kolomnamen in de database <-> veldnamen in de app */
  var KEYMAP = { order: 'sort_order', row: 'row_ref', createdAt: 'created_at', updatedAt: 'updated_at', updatedBy: 'updated_by', piStart: 'pi_start', iterationWeeks: 'iteration_weeks', piName: 'pi_name', contrib: 'contrib_ref' };
  var REVMAP = {}; Object.keys(KEYMAP).forEach(function (k) { REVMAP[KEYMAP[k]] = k; });
  function toRow(o) { var r = {}; Object.keys(o).forEach(function (k) { r[KEYMAP[k] || k] = o[k]; }); return r; }
  function fromRow(r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== 'id') o[REVMAP[k] || k] = r[k]; }); return o; }

  var S = { sb: null, session: null, ready: false, outcomes: {}, milestones: {}, settings: { piStart: '2026-12-09', iterationWeeks: 2, piName: '' }, open: {}, sel: null, readOnly: false };
  var pending = {};
  var saving = 0;

  try { var vw = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') || {}; S.focus = vw.focus || null; S.expandAll = !!vw.expandAll; } catch (e) {}
  function saveView() { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ focus: S.focus, expandAll: S.expandAll })); } catch (e) {} }
  function setFocus(id) { S.focus = id; saveView(); }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function rid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function toast(t) { var r = $('toastRoot'); r.innerHTML = '<div class="toast">' + esc(t) + '</div>'; clearTimeout(toast._t); toast._t = setTimeout(function () { r.innerHTML = ''; }, 3200); }
  function diamond(type, size) { size = size || 14; var t = TYPES[type] || TYPES.learn; return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" fill="var(' + t.v + ')"></rect></svg>'; }
  var X_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"></path></svg>';

  var NAME_KEY = 'lace-pi-name-v1';
  function myName() { var v = ($('myName') && $('myName').value || '').trim(); return v || null; }

  function setLive() {
    var el = $('live'), t = $('liveText');
    if (!S.ready) { el.dataset.state = 'loading'; t.textContent = 'Verbinden…'; return; }
    if (S.readOnly) { el.dataset.state = 'error'; t.textContent = 'Alleen lezen'; return; }
    if (S.offline) { el.dataset.state = 'error'; t.textContent = 'Verbinding verbroken'; return; }
    if (saving > 0 || Object.keys(pending).length) { el.dataset.state = 'saving'; t.textContent = 'Opslaan…'; return; }
    el.dataset.state = 'live'; t.textContent = 'Live · opgeslagen';
  }

  /* ---------- tijd ---------- */
  function timeInfo() {
    var weeks = Math.min(4, Math.max(1, num(S.settings.iterationWeeks) || 2));
    var p = String(S.settings.piStart || '2026-12-09').split('-');
    var start = new Date(num(p[0]) || 2026, (num(p[1]) || 12) - 1, num(p[2]) || 9);
    if (isNaN(start.getTime())) start = new Date(2026, 11, 9);
    var len = weeks * 7;
    var now = new Date(); var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var elapsed = Math.round((today - start) / 86400000);
    var piDays = len * 5;
    var nowIdx = elapsed < 0 ? -1 : Math.min(5, Math.floor(elapsed / len));
    var expected = Math.round(Math.max(0, Math.min(1, elapsed / piDays)) * 100);
    function add(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function fmt(d) { return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); }
    var iters = ITER_NAMES.map(function (n, i) { var s = add(start, i * len), e = add(s, len - 1); return { name: n, dates: i === 5 ? 'vanaf ' + fmt(s) : fmt(s) + ' – ' + fmt(e) }; });
    var end = add(start, piDays - 1);
    var todayIdx = elapsed >= 0 && elapsed < piDays ? nowIdx : -1;
    var tpos = todayIdx >= 0 ? Math.round(((elapsed - todayIdx * len) + 0.5) / len * 1000) / 10 : 0;
    return { start: start, end: end, elapsed: elapsed, piDays: piDays, nowIdx: nowIdx, todayIdx: todayIdx, tpos: tpos, expected: expected, iters: iters, fmt: fmt };
  }

  /* ---------- afgeleid ---------- */
  function krPct(k) { var s = num(k.start), t = num(k.target), c = num(k.current); if (t === s) return c >= t ? 100 : 0; return Math.max(0, Math.min(100, Math.round((c - s) / (t - s) * 100))); }
  function sortedOutcomes() { return Object.keys(S.outcomes).map(function (id) { return Object.assign({ id: id }, S.outcomes[id]); }).sort(function (a, b) { return num(a.order) - num(b.order) || String(a.id).localeCompare(b.id); }); }
  function msList() { return Object.keys(S.milestones).map(function (id) { return Object.assign({ id: id }, S.milestones[id]); }).sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); }); }
  function outcomeStats(o, T, ms) {
    var krs = Array.isArray(o.krs) ? o.krs : [];
    var pct = krs.length ? Math.round(krs.reduce(function (a, k) { return a + krPct(k); }, 0) / krs.length) : 0;
    var risk = ms.some(function (m) { return m.row === o.id && (m.status === 'risk' || m.status === 'missed'); });
    var h;
    if (krs.length && pct >= 100) h = 'done';
    else if (T.expected === 0 && pct === 0) h = risk ? 'watch' : 'planned';
    else if (pct >= T.expected - 10) h = risk ? 'watch' : 'ok';
    else if (pct >= T.expected - 25) h = 'watch';
    else h = 'behind';
    return { pct: pct, health: h };
  }
  function whoLabel(o) {
    if (!o || !o.updatedAt) return '';
    var d = new Date(o.updatedAt);
    var when = isNaN(d) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    return 'Bijgewerkt' + (o.updatedBy ? ' door ' + o.updatedBy : '') + (when ? ' · ' + when : '');
  }

  /* ---------- weergave ---------- */
  function renderAll() { renderHeader(); renderBoard(); setLive(); syncDrawer(); }

  function renderHeader() {
    var T = timeInfo();
    var name = S.settings.piName ? S.settings.piName + ' · ' : '';
    $('eyebrow').textContent = 'PI-planning · ' + name + T.fmt(T.start) + ' ' + T.start.getFullYear() + ' – ' + T.fmt(T.end) + ' ' + T.end.getFullYear();
    var outs = sortedOutcomes(), ms = msList();
    var tot = outs.length ? Math.round(outs.reduce(function (a, o) { return a + outcomeStats(o, T, ms).pct; }, 0) / outs.length) : 0;
    $('tPct').textContent = tot + '%'; $('tFill').style.width = tot + '%'; $('tBar').setAttribute('aria-valuenow', tot);
    var done = ms.filter(function (m) { return m.status === 'done'; }).length;
    var planned = ms.filter(function (m) { return !m.status || m.status === 'planned'; }).length;
    var risk = ms.filter(function (m) { return m.status === 'risk' || m.status === 'missed'; }).length;
    $('tMs').textContent = done + ' / ' + ms.length; $('tMsSub').textContent = ms.length ? planned + ' nog gepland' : 'nog niets gepland';
    $('tRisk').textContent = risk; $('tRisk').style.color = risk ? 'var(--bad)' : '';
    if (T.nowIdx < 0) { var d = -T.elapsed; $('tNow').textContent = 'Start over ' + d + (d === 1 ? ' dag' : ' dagen'); $('tNowSub').textContent = 'PI start ' + T.start.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    else if (T.nowIdx >= 5) { $('tNow').textContent = 'PI afgerond'; $('tNowSub').textContent = 'Tijd voor de volgende PI Planning'; }
    else { $('tNow').textContent = ITER_NAMES[T.nowIdx]; $('tNowSub').textContent = 'Dag ' + (T.elapsed + 1) + ' van ' + T.piDays + ' · verwacht ' + T.expected + '% gerealiseerd'; }
  }

  function msState(m, T) {
    var st = STATUS[m.status] ? m.status : 'planned';
    var late = st === 'planned' && T.nowIdx >= 0 && num(m.iter) < T.nowIdx;
    var cls = late ? 'late' : st;
    var label = late ? 'Verlopen' : STATUS[st];
    var icon = { done: '✓ ', risk: '! ', late: '! ', missed: '× ' }[cls] || '';
    return { cls: cls, label: label, icon: icon };
  }
  function msCard(m, T) {
    var t = TYPES[m.type] || TYPES.learn, s = msState(m, T);
    var sel = S.sel && S.sel.kind === 'm' && S.sel.id === m.id;
    var title = m.title || '(zonder titel)';
    return '<button type="button" class="callout s-' + s.cls + (sel ? ' sel' : '') + '" style="--mc:var(' + t.v + ')" data-act="ms" data-id="' + esc(m.id) + '" aria-label="' + esc(t.l + ' mijlpaal: ' + title + ', ' + s.label) + '">' +
      '<span class="dia" aria-hidden="true"></span><span class="ctitle">' + esc(title) + '</span>' +
      '<span class="cstat">' + s.icon + esc(s.label) + '</span></button>';
  }
  function msDot(m, T) {
    var t = TYPES[m.type] || TYPES.learn, s = msState(m, T);
    var title = m.title || '(zonder titel)';
    return '<button type="button" class="mdot s-' + s.cls + '" style="--mc:var(' + t.v + ')" data-act="ms" data-id="' + esc(m.id) + '" title="' + esc(title + ' · ' + t.l + ' · ' + s.label) + '" aria-label="' + esc(t.l + ' mijlpaal: ' + title + ', ' + s.label) + '"><span class="dia-s" aria-hidden="true"></span></button>';
  }
  function addBtn(row, i, contrib) {
    if (S.readOnly) return '';
    return '<button type="button" class="add" data-act="addms" data-row="' + esc(row) + '" data-iter="' + i + '" data-contrib="' + esc(contrib || '') + '" aria-label="Mijlpaal toevoegen in ' + esc(ITER_NAMES[i]) + '">+</button>';
  }
  function cell(i, r, T, inner, extra, drop) {
    var cls = 'cell' + (i === T.nowIdx ? ' now' : '') + (i === T.todayIdx ? ' today' : '') + (extra ? ' ' + extra : '');
    var st = 'grid-column:' + (i + 3) + ';grid-row:' + r + (i === T.todayIdx ? ';--tpos:' + T.tpos + '%' : '');
    var dz = drop ? ' data-drop-row="' + esc(drop.row) + '" data-drop-contrib="' + esc(drop.contrib) + '" data-drop-iter="' + i + '"' : '';
    return '<div class="' + cls + '" style="' + st + '"' + dz + '>' + inner + '</div>';
  }
  function focusId(outs) {
    if (S.focus === '__none__') return null;
    if (S.focus && S.outcomes[S.focus]) return S.focus;
    return outs.length ? outs[0].id : null;
  }

  function renderBoard() {
    if (!S.ready) { $('board').innerHTML = '<div class="empty">Bord laden…</div>'; return; }
    var T = timeInfo(), ms = msList(), outs = sortedOutcomes(), fid = focusId(outs);
    var h = '<div class="row head"><div>PI-outcome</div><div>Bijdragen</div>' + T.iters.map(function (it, i) {
      return '<div class="it' + (i === T.nowIdx ? ' now' : '') + '">' + esc(it.name) + (i === T.nowIdx ? '<span class="nowpill">Nu</span>' : '') + '<span class="dates">' + esc(it.dates) + '</span></div>';
    }).join('') + '</div>';

    var art = ms.filter(function (m) { return m.row === 'art'; });
    h += '<div class="row art"><div class="ocell" style="grid-column:1;grid-row:1"><h3>ART- &amp; LACE-mijlpalen</h3><span class="meta">Events en vaste data voor het hele ART</span></div><div class="lane" style="grid-column:2;grid-row:1"></div>' +
      ITER_NAMES.map(function (n, i) { return cell(i, 1, T, art.filter(function (m) { return num(m.iter) === i; }).map(function (m) { return msCard(m, T); }).join('') + addBtn('art', i, ''), '', { row: 'art', contrib: '' }); }).join('') + '</div>';

    if (!outs.length) h += '<div class="empty"><b>Nog geen PI-outcomes.</b> Voeg de eerste toe met “+ PI-outcome”. Daarna kun je bijdragen, key results en mijlpalen per iteratie toevoegen.</div>';

    outs.forEach(function (o) {
      var st = outcomeStats(o, T, ms);
      var expanded = S.expandAll || o.id === fid;
      var krs = Array.isArray(o.krs) ? o.krs : [], cs = Array.isArray(o.contribs) ? o.contribs : [];
      var oms = ms.filter(function (m) { return m.row === o.id; });
      var sel = S.sel && S.sel.kind === 'o' && S.sel.id === o.id;
      var bar = '<div class="bar" role="progressbar" aria-label="Voortgang" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + st.pct + '"><div class="fill f-' + st.health + '" style="width:' + st.pct + '%"></div><div class="exp" style="left:' + T.expected + '%"></div></div>';

      if (!expanded) {
        var owners = cs.map(function (c) { return c.owner; }).filter(Boolean);
        h += '<div class="row compact' + (sel ? ' sel' : '') + '">' +
          '<div class="ocell" style="grid-column:1;grid-row:1"><div class="otop"><h3><button type="button" class="otitle" data-act="focus" data-id="' + esc(o.id) + '" aria-label="' + esc((o.title || 'Outcome') + ' uitklappen') + '"><span class="chev" aria-hidden="true">▸</span>' + esc(o.title || '(zonder titel)') + '</button></h3><span class="pill h-' + st.health + '">' + HEALTH[st.health] + '</span></div>' + bar +
          '<span class="meta"><span class="num" style="color:var(--ink)">' + st.pct + '%</span> gerealiseerd · ' + oms.length + (oms.length === 1 ? ' mijlpaal' : ' mijlpalen') + '</span></div>' +
          '<div class="lane" style="grid-column:2;grid-row:1"><span>' + (owners.length ? esc(owners.join(', ')) : 'Nog geen bijdragen') + '</span></div>' +
          ITER_NAMES.map(function (n, i) { return cell(i, 1, T, '<div class="dots">' + oms.filter(function (m) { return num(m.iter) === i; }).map(function (m) { return msDot(m, T); }).join('') + '</div>', '', { row: o.id, contrib: '*' }); }).join('') +
          '</div>';
        return;
      }

      var ids = {}; cs.forEach(function (c) { ids[c.id] = 1; });
      var lanes = cs.map(function (c) { return { id: c.id, owner: c.owner, text: c.text }; });
      var loose = oms.filter(function (m) { return !ids[m.contrib]; });
      if (!lanes.length || loose.length) lanes.push({ id: '', owner: lanes.length ? 'Hele outcome' : 'Mijlpalen', text: lanes.length ? 'Niet aan één bijdrage gekoppeld' : 'Voeg bijdragen toe om banen per persoon of team te krijgen', whole: true });
      var n = lanes.length;

      h += '<div class="row focus' + (sel ? ' sel' : '') + '">' +
        '<div class="ocell" style="grid-column:1;grid-row:1 / span ' + n + '">' +
        '<div class="otop"><h3>' + (S.expandAll ? '' : '<button type="button" class="otitle open" data-act="unfocus" aria-label="Inklappen"><span class="chev" aria-hidden="true">▾</span></button>') + esc(o.title || '(zonder titel)') + '</h3><span class="pill h-' + st.health + '">' + HEALTH[st.health] + '</span></div>' + bar +
        '<span class="meta"><span class="num" style="color:var(--ink)">' + st.pct + '%</span> gerealiseerd · verwacht ' + T.expected + '%</span>' +
        '<ul class="krs">' + krs.map(function (k) { var p = krPct(k), u = k.unit || ''; return '<li><span class="kt">' + esc(k.text) + '</span><span class="kv"><span class="bar thin"><span class="fill" style="display:block;width:' + p + '%;background:' + (p >= 100 ? 'var(--done-bar)' : 'var(--muted)') + '"></span></span><span class="num">' + esc(num(k.current) + u + ' / ' + num(k.target) + u) + '</span></span></li>'; }).join('') + (krs.length ? '' : '<li class="meta">Nog geen key results</li>') + '</ul>' +
        (S.readOnly ? '' : '<div class="minibtns"><button type="button" class="mini edit" data-act="edit" data-id="' + esc(o.id) + '">Outcome bewerken</button></div>') +
        (o.updatedAt ? '<span class="meta">' + esc(whoLabel(o)) + '</span>' : '') + '</div>';

      lanes.forEach(function (ln, idx) {
        var r = idx + 1, first = idx === 0 ? ' first' : '';
        var lms = ln.whole ? loose : oms.filter(function (m) { return m.contrib === ln.id; });
        h += '<div class="lane l' + first + (ln.whole ? ' whole' : '') + '" style="grid-column:2;grid-row:' + r + '"><b>' + esc(ln.owner || '–') + '</b>' + (ln.text ? '<span>' + esc(ln.text) + '</span>' : '') + '</div>';
        ITER_NAMES.forEach(function (nm, i) {
          h += cell(i, r, T, lms.filter(function (m) { return num(m.iter) === i; }).map(function (m) { return msCard(m, T); }).join('') + addBtn(o.id, i, ln.id), 'l' + first, { row: o.id, contrib: ln.id });
        });
      });
      h += '</div>';
    });
    $('board').innerHTML = h;
    var vt = $('btnView'); if (vt) { vt.textContent = S.expandAll ? 'Focus op één outcome' : 'Alles uitklappen'; vt.setAttribute('aria-pressed', String(!!S.expandAll)); }
  }

  function renderLegend() {
    $('legend').innerHTML = Object.keys(TYPES).map(function (k) { return '<span>' + diamond(k) + esc(TYPES[k].l) + ' mijlpaal</span>'; }).join('') +
      '<span><span aria-hidden="true" class="todayline"></span>Vandaag</span>' +
      '<span><span aria-hidden="true" style="display:inline-block;width:2px;height:14px;background:var(--ink)"></span>Verwachte voortgang op basis van de tijd in de PI</span>' +
      '<span>Gestippelde rand: gepland, maar de iteratie is voorbij</span>';
  }

  /* ---------- schrijven ---------- */
  function meta() { return { updatedBy: myName(), updatedAt: new Date().toISOString() }; }
  function check(res) {
    if (res && res.error) {
      var e = res.error;
      if (/contrib_ref/.test(e.message || '')) { toast('De database mist nog een kolom. Voer supabase/migrations/002_bijdrage_koppeling.sql uit in Supabase.'); return; }
      if (e.code === '42501' || /row-level security|permission/i.test(e.message || '')) { S.readOnly = true; toast('Opslaan lukt niet: je account heeft geen schrijfrechten op dit bord.'); renderAll(); }
      else toast('Opslaan mislukt: ' + (e.message || 'onbekende fout') + '. Probeer het opnieuw.');
    }
  }
  function track(promise) { saving++; setLive(); return Promise.resolve(promise).then(check, function () { toast('Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.'); }).then(function () { saving--; setLive(); }); }
  function storeFor(col) { return col === 'outcomes' ? S.outcomes : S.milestones; }
  function queue(col, id, patch, delay) {
    var k = col + '/' + id;
    var p = pending[k] || (pending[k] = { col: col, id: id, patch: {}, t: null });
    Object.assign(p.patch, patch);
    var store = storeFor(col);
    if (store[id]) store[id] = Object.assign({}, store[id], patch);
    clearTimeout(p.t);
    p.t = setTimeout(function () { flush(k); }, delay == null ? 450 : delay);
    renderHeader(); renderBoard(); setLive();
  }
  function flush(k) {
    var p = pending[k]; if (!p) return; delete pending[k]; clearTimeout(p.t);
    track(S.sb.from(p.col).update(toRow(Object.assign({}, p.patch, meta()))).eq('id', p.id));
  }
  function flushAll() { Object.keys(pending).forEach(flush); }
  window.addEventListener('pagehide', flushAll);

  function insert(col, id, body) {
    storeFor(col)[id] = body;
    return track(S.sb.from(col).insert(toRow(Object.assign({ id: id }, body))));
  }

  function addOutcome() {
    var max = sortedOutcomes().reduce(function (a, o) { return Math.max(a, num(o.order)); }, 0);
    var id = rid('o');
    insert('outcomes', id, Object.assign({ title: 'Nieuwe PI-outcome', order: max + 1, krs: [{ id: rid('k'), text: 'Nieuw key result', start: 0, target: 100, current: 0, unit: '%' }], contribs: [{ id: rid('c'), owner: '', text: '' }], createdAt: new Date().toISOString() }, meta()));
    setFocus(id);
    openDrawer({ kind: 'o', id: id }); renderAll();
  }
  function addMs(row, iter, contrib) {
    var id = rid('m');
    insert('milestones', id, Object.assign({ row: row, iter: iter, contrib: contrib || '', title: 'Nieuwe mijlpaal', type: row === 'art' ? 'fixed' : 'learn', status: 'planned', createdAt: new Date().toISOString() }, meta()));
    openDrawer({ kind: 'm', id: id }); renderAll();
  }

  /* ---------- bord-events ---------- */
  $('board').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    if (drag.suppress) { drag.suppress = false; return; }
    var a = b.dataset.act, id = b.dataset.id;
    if (a === 'ms') { var mm = S.milestones[id]; if (mm && mm.row !== 'art' && !S.expandAll) setFocus(mm.row); openDrawer({ kind: 'm', id: id }); }
    else if (a === 'edit') openDrawer({ kind: 'o', id: id });
    else if (a === 'focus') { setFocus(id); renderBoard(); }
    else if (a === 'unfocus') { setFocus('__none__'); renderBoard(); }
    else if (a === 'addms' && S.ready && !S.readOnly) addMs(b.dataset.row, num(b.dataset.iter), b.dataset.contrib);
  });
  $('btnAddOutcome').addEventListener('click', function () { if (S.ready && !S.readOnly) addOutcome(); });
  $('btnView').addEventListener('click', function () { S.expandAll = !S.expandAll; saveView(); renderBoard(); });
  $('btnSettings').addEventListener('click', function () { openDrawer({ kind: 's' }); });
  try { $('myName').value = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
  $('myName').addEventListener('input', function () { try { localStorage.setItem(NAME_KEY, $('myName').value.trim()); } catch (e) {} });

  /* ---------- slepen (muis/pen) ---------- */
  var drag = { id: null, src: null, ghost: null, sx: 0, sy: 0, on: false, over: null, suppress: false };
  function dropCellAt(x, y) {
    var el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-drop-row]') : null;
  }
  $('board').addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || e.button !== 0 || S.readOnly || !S.ready) return;
    var b = e.target.closest('.callout,.mdot'); if (!b) return;
    drag.id = b.dataset.id; drag.src = b; drag.sx = e.clientX; drag.sy = e.clientY; drag.on = false;
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag.id) return;
    if (!drag.on) {
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 6) return;
      drag.on = true;
      var r = drag.src.getBoundingClientRect();
      var g = drag.src.cloneNode(true);
      g.classList.add('ghost'); g.style.width = r.width + 'px';
      g.style.left = '0px'; g.style.top = '0px';
      drag.offX = e.clientX - r.left; drag.offY = e.clientY - r.top;
      document.body.appendChild(g); drag.ghost = g;
      drag.src.classList.add('dragging'); document.body.classList.add('is-dragging');
    }
    e.preventDefault();
    drag.ghost.style.transform = 'translate(' + (e.clientX - drag.offX) + 'px,' + (e.clientY - drag.offY) + 'px)';
    var c = dropCellAt(e.clientX, e.clientY);
    if (c !== drag.over) { if (drag.over) drag.over.classList.remove('drop-over'); drag.over = c; if (c) c.classList.add('drop-over'); }
    var box = $('board').parentNode, br = box.getBoundingClientRect();
    if (e.clientX > br.right - 40) box.scrollLeft += 12; else if (e.clientX < br.left + 40) box.scrollLeft -= 12;
  });
  function endDrag(e, cancel) {
    if (!drag.id) return;
    var id = drag.id, was = drag.on, c = drag.over;
    if (drag.ghost) drag.ghost.remove();
    if (drag.src) drag.src.classList.remove('dragging');
    if (c) c.classList.remove('drop-over');
    document.body.classList.remove('is-dragging');
    drag.id = null; drag.src = null; drag.ghost = null; drag.over = null; drag.on = false;
    if (!was) return;
    drag.suppress = true; setTimeout(function () { drag.suppress = false; }, 0);
    if (cancel || !c) return;
    var m = S.milestones[id]; if (!m) return;
    var row = c.dataset.dropRow, iter = num(c.dataset.dropIter), contrib = c.dataset.dropContrib;
    if (contrib === '*') contrib = m.row === row ? (m.contrib || '') : '';
    if (row === 'art') contrib = '';
    if (m.row === row && num(m.iter) === iter && (m.contrib || '') === contrib) return;
    queue('milestones', id, { row: row, iter: iter, contrib: contrib }, 0);
    syncDrawer();
    toast('Verplaatst naar ' + ITER_NAMES[iter] + '.');
  }
  window.addEventListener('pointerup', function (e) { endDrag(e, false); });
  window.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drag.on) endDrag(e, true); });

  /* ---------- zijpaneel ---------- */
  var lastFocus = null;
  function openDrawer(sel) { flushAll(); lastFocus = document.activeElement; S.sel = sel; buildDrawer(); renderBoard(); }
  function closeDrawer() { flushAll(); S.sel = null; $('drawerRoot').innerHTML = ''; renderBoard(); if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.sel) closeDrawer(); });

  function contribOptions(rowId, cur) {
    if (rowId === 'art') return opt('', '— (ART-mijlpaal)', '');
    var o = S.outcomes[rowId], cs = o && Array.isArray(o.contribs) ? o.contribs : [];
    var has = cs.some(function (c) { return c.id === cur; });
    return opt('', 'Hele outcome', has ? cur : '') + cs.map(function (c) { return opt(c.id, (c.owner || '–') + (c.text ? ' – ' + c.text : ''), cur); }).join('');
  }
  function opt(v, l, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>'; }

  function buildDrawer() {
    var r = $('drawerRoot'), sel = S.sel; if (!sel) { r.innerHTML = ''; return; }
    var ro = S.readOnly ? ' disabled' : '';
    var title = '', body = '', foot = '';
    if (sel.kind === 'm') {
      var m = S.milestones[sel.id]; if (!m) { closeDrawer(); return; }
      title = 'Mijlpaal';
      body = '<label class="field">Titel<input id="m-title" data-f="title" type="text" value="' + esc(m.title) + '"' + ro + '></label>' +
        '<div class="two"><label class="field">Soort<select id="m-type" data-f="type"' + ro + '>' + Object.keys(TYPES).map(function (k) { return opt(k, TYPES[k].l, m.type); }).join('') + '</select></label>' +
        '<label class="field">Status<select id="m-status" data-f="status"' + ro + '>' + Object.keys(STATUS).map(function (k) { return opt(k, STATUS[k], m.status || 'planned'); }).join('') + '</select></label>' +
        '<label class="field">Hoort bij<select id="m-row" data-f="row"' + ro + '>' + opt('art', 'ART- & LACE-mijlpalen', m.row) + sortedOutcomes().map(function (o) { return opt(o.id, o.title || '(zonder titel)', m.row); }).join('') + '</select></label>' +
        '<label class="field">Bijdrage (baan)<select id="m-contrib" data-f="contrib"' + (S.readOnly || m.row === 'art' ? ' disabled' : '') + '>' + contribOptions(m.row, m.contrib) + '</select></label>' +
        '<label class="field">Iteratie<select id="m-iter" data-f="iter"' + ro + '>' + ITER_NAMES.map(function (n, i) { return opt(i, n, num(m.iter)); }).join('') + '</select></label></div>' +
        '<p class="note" id="m-who">' + esc(whoLabel(m)) + '</p>';
      foot = S.readOnly ? '' : '<button class="btn" type="button" data-d="left">← Eerder</button><button class="btn" type="button" data-d="right">Later →</button><span style="flex:1"></span><span id="delZone"><button class="btn danger" type="button" data-d="askdel">Verwijderen</button></span>';
    } else if (sel.kind === 'o') {
      var o = S.outcomes[sel.id]; if (!o) { closeDrawer(); return; }
      title = 'PI-outcome';
      body = '<label class="field">Outcome<input id="o-title" class="big" data-f="title" type="text" value="' + esc(o.title) + '"' + ro + '></label>' +
        '<div class="sec"><h3>Key results</h3><div style="overflow-x:auto"><div class="grid krgrid"><span class="h">Wat meten we</span><span class="h">Start</span><span class="h">Doel</span><span class="h">Nu</span><span class="h unit">Eenheid</span><span></span></div><div id="krList" class="sec"></div></div>' +
        (S.readOnly ? '' : '<button class="btn ghost" type="button" data-d="addkr" style="align-self:flex-start">+ Key result</button>') + '</div>' +
        '<div class="sec"><h3>Bijdragen (wie doet wat)</h3><div id="cList" class="sec"></div>' +
        (S.readOnly ? '' : '<button class="btn ghost" type="button" data-d="addc" style="align-self:flex-start">+ Bijdrage</button>') + '</div>' +
        '<p class="note" id="o-who">' + esc(whoLabel(o)) + '</p>';
      foot = S.readOnly ? '' : '<button class="btn" type="button" data-d="up">↑ Omhoog</button><button class="btn" type="button" data-d="down">↓ Omlaag</button><span style="flex:1"></span><span id="delZone"><button class="btn danger" type="button" data-d="askdel">Verwijderen</button></span>';
    } else {
      var s = S.settings;
      title = 'PI-instellingen';
      body = '<label class="field">Naam van de PI<input id="s-name" data-s="piName" type="text" placeholder="bijv. PI 2027.1" value="' + esc(s.piName || '') + '"' + ro + '></label>' +
        '<div class="two"><label class="field">Start iteratie 1<input id="s-start" data-s="piStart" type="date" value="' + esc(s.piStart) + '"' + ro + '></label>' +
        '<label class="field">Lengte iteratie<select id="s-weeks" data-s="iterationWeeks"' + ro + '>' + [1, 2, 3, 4].map(function (w) { return opt(w, w + (w === 1 ? ' week' : ' weken'), num(s.iterationWeeks) || 2); }).join('') + '</select></label></div>' +
        '<p class="note">Het bord telt 4 iteraties, een IP-iteratie en een kolom voor de volgende PI. Deze instellingen gelden voor iedereen.</p>' +
        (S.readOnly ? '' : '<div class="sec"><h3>Gegevens overnemen</h3><p class="note">Plak hier de tekst uit “Delen / importeren” van het eerdere canvas-bord. Outcomes en mijlpalen worden toegevoegd aan dit bord.</p>' +
        '<label class="field">Bordgegevens<textarea id="s-import" rows="6"></textarea></label><div class="actions"><button class="btn" type="button" data-d="import">Toevoegen aan bord</button><span class="msg" id="importMsg" role="status"></span></div></div>');
    }
    r.innerHTML = '<div class="scrim" data-d="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">' +
      '<div class="dhead"><h2 id="dTitle">' + title + '</h2><button class="btn" type="button" data-d="close">Klaar</button></div>' +
      '<div class="dbody">' + body + '</div>' + (foot ? '<div class="dfoot">' + foot + '</div>' : '') + '</aside>';
    if (sel.kind === 'o') { renderKrList(true); renderCList(true); }
    var first = r.querySelector('input,select'); if (first) first.focus();
  }

  function sig(arr) { return (arr || []).map(function (x) { return x.id; }).join('|'); }
  function keepFocus(fn) {
    var a = document.activeElement;
    var idk = a && a.dataset ? (a.dataset.kr || a.dataset.c) : null, f = a && a.dataset ? (a.dataset.kf || a.dataset.cf) : null, pos = a && a.selectionStart;
    fn();
    if (idk && f) {
      var n = $('drawerRoot').querySelector('[data-kr="' + idk + '"][data-kf="' + f + '"],[data-c="' + idk + '"][data-cf="' + f + '"]');
      if (n) { n.focus(); try { if (pos != null) n.setSelectionRange(pos, pos); } catch (e) {} }
    }
  }
  function renderKrList(force) {
    var o = S.outcomes[S.sel.id], el = $('krList'); if (!o || !el) return;
    var krs = Array.isArray(o.krs) ? o.krs : [];
    if (!force && el.dataset.sig === sig(krs)) return syncInputs(el);
    var ro = S.readOnly ? ' disabled' : '';
    keepFocus(function () {
      el.dataset.sig = sig(krs);
      el.innerHTML = krs.map(function (k) {
        var id = esc(k.id);
        return '<div class="grid krgrid">' +
          '<input type="text" aria-label="Key result" data-kr="' + id + '" data-kf="text" value="' + esc(k.text) + '"' + ro + '>' +
          '<input type="number" aria-label="Startwaarde" data-kr="' + id + '" data-kf="start" value="' + esc(k.start) + '"' + ro + '>' +
          '<input type="number" aria-label="Doelwaarde" data-kr="' + id + '" data-kf="target" value="' + esc(k.target) + '"' + ro + '>' +
          '<input type="number" class="cur" aria-label="Huidige waarde" data-kr="' + id + '" data-kf="current" value="' + esc(k.current) + '"' + ro + '>' +
          '<input type="text" class="unit" aria-label="Eenheid" data-kr="' + id + '" data-kf="unit" value="' + esc(k.unit) + '"' + ro + '>' +
          (S.readOnly ? '<span></span>' : '<button type="button" class="x" aria-label="Key result verwijderen" data-d="delkr" data-id="' + id + '">' + X_ICON + '</button>') + '</div>';
      }).join('') || '<p class="note">Nog geen key results.</p>';
    });
  }
  function renderCList(force) {
    var o = S.outcomes[S.sel.id], el = $('cList'); if (!o || !el) return;
    var cs = Array.isArray(o.contribs) ? o.contribs : [];
    if (!force && el.dataset.sig === sig(cs)) return syncInputs(el);
    var ro = S.readOnly ? ' disabled' : '';
    keepFocus(function () {
      el.dataset.sig = sig(cs);
      el.innerHTML = cs.map(function (c) {
        var id = esc(c.id);
        return '<div class="grid cgrid">' +
          '<input type="text" aria-label="Wie" placeholder="Wie / team" data-c="' + id + '" data-cf="owner" value="' + esc(c.owner) + '"' + ro + '>' +
          '<input type="text" aria-label="Bijdrage" placeholder="Bijdrage aan deze outcome" data-c="' + id + '" data-cf="text" value="' + esc(c.text) + '"' + ro + '>' +
          (S.readOnly ? '<span></span>' : '<button type="button" class="x" aria-label="Bijdrage verwijderen" data-d="delc" data-id="' + id + '">' + X_ICON + '</button>') + '</div>';
      }).join('') || '<p class="note">Nog geen bijdragen.</p>';
    });
  }
  function syncInputs(scope) {
    var o = S.sel && S.sel.kind === 'o' ? S.outcomes[S.sel.id] : null;
    scope.querySelectorAll('input[data-kr],input[data-c]').forEach(function (inp) {
      if (inp === document.activeElement || !o) return;
      var list = inp.dataset.kr ? o.krs : o.contribs, idk = inp.dataset.kr || inp.dataset.c, f = inp.dataset.kf || inp.dataset.cf;
      var item = (list || []).find(function (x) { return x.id === idk; });
      if (item && String(inp.value) !== String(item[f] == null ? '' : item[f])) inp.value = item[f] == null ? '' : item[f];
    });
  }
  function syncDrawer() {
    var sel = S.sel, r = $('drawerRoot'); if (!sel || !r.firstChild) return;
    if (sel.kind === 'm') {
      var m = S.milestones[sel.id]; if (!m) { closeDrawer(); toast('Deze mijlpaal is verwijderd.'); return; }
      r.querySelectorAll('[data-f]').forEach(function (el) { if (el !== document.activeElement) { var v = el.dataset.f === 'iter' ? String(num(m.iter)) : (m[el.dataset.f] == null ? '' : m[el.dataset.f]); if (String(el.value) !== String(v)) el.value = v; } });
      var w = $('m-who'); if (w) w.textContent = whoLabel(m);
    } else if (sel.kind === 'o') {
      var o = S.outcomes[sel.id]; if (!o) { closeDrawer(); toast('Deze outcome is verwijderd.'); return; }
      var t = $('o-title'); if (t && t !== document.activeElement && t.value !== (o.title || '')) t.value = o.title || '';
      renderKrList(false); renderCList(false);
      var w2 = $('o-who'); if (w2) w2.textContent = whoLabel(o);
    } else {
      r.querySelectorAll('[data-s]').forEach(function (el) { if (el !== document.activeElement) { var v = S.settings[el.dataset.s]; if (v != null && String(el.value) !== String(v)) el.value = v; } });
    }
  }

  var settingsTimer = null;
  function writeSettings(patch, delay) {
    Object.assign(S.settings, patch); renderHeader(); renderBoard();
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(function () { track(S.sb.from('settings').upsert(toRow(Object.assign({ id: 'pi' }, S.settings, meta())))); }, delay == null ? 450 : delay);
  }

  $('drawerRoot').addEventListener('input', function (e) {
    var el = e.target, sel = S.sel; if (!sel || !S.ready || S.readOnly) return;
    if (el.dataset.s) {
      var v = el.dataset.s === 'iterationWeeks' ? num(el.value) : el.value;
      if (el.dataset.s === 'piStart' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      var p = {}; p[el.dataset.s] = v; writeSettings(p, el.tagName === 'SELECT' ? 0 : 450); return;
    }
    if (sel.kind === 'm' && el.dataset.f) {
      var pm = {}; pm[el.dataset.f] = el.dataset.f === 'iter' ? num(el.value) : el.value;
      if (el.dataset.f === 'row') { pm.contrib = ''; var cSel = $('m-contrib'); if (cSel) { cSel.innerHTML = contribOptions(el.value, ''); cSel.disabled = el.value === 'art'; } if (el.value !== 'art') setFocus(el.value); }
      if (el.dataset.f === 'contrib') { var mm = S.milestones[sel.id]; if (mm && mm.row !== 'art') setFocus(mm.row); }
      queue('milestones', sel.id, pm, el.tagName === 'SELECT' ? 0 : 450); return;
    }
    if (sel.kind === 'o') {
      var o = S.outcomes[sel.id]; if (!o) return;
      if (el.dataset.f === 'title') { queue('outcomes', sel.id, { title: el.value }); return; }
      if (el.dataset.kr) { var krs = clone(o.krs || []); krs.forEach(function (k) { if (k.id === el.dataset.kr) { var f = el.dataset.kf; k[f] = (f === 'text' || f === 'unit') ? el.value : (el.value === '' ? '' : Number(el.value)); } }); queue('outcomes', sel.id, { krs: krs }); return; }
      if (el.dataset.c) { var cs = clone(o.contribs || []); cs.forEach(function (c) { if (c.id === el.dataset.c) c[el.dataset.cf] = el.value; }); queue('outcomes', sel.id, { contribs: cs }); }
    }
  });

  $('drawerRoot').addEventListener('click', function (e) {
    var b = e.target.closest('[data-d]'); if (!b) return;
    var d = b.dataset.d, sel = S.sel;
    if (d === 'close') return closeDrawer();
    if (!S.ready || S.readOnly || !sel) return;
    if (sel.kind === 'm') {
      var m = S.milestones[sel.id]; if (!m) return;
      if (d === 'left' || d === 'right') { queue('milestones', sel.id, { iter: Math.max(0, Math.min(5, num(m.iter) + (d === 'left' ? -1 : 1))) }, 0); syncDrawer(); }
      else if (d === 'askdel') $('delZone').innerHTML = '<span class="confirm">Mijlpaal verwijderen? <button class="btn danger" type="button" data-d="del">Ja, verwijderen</button><button class="btn" type="button" data-d="nodel">Nee</button></span>';
      else if (d === 'nodel') $('delZone').innerHTML = '<button class="btn danger" type="button" data-d="askdel">Verwijderen</button>';
      else if (d === 'del') { delete pending['milestones/' + sel.id]; delete S.milestones[sel.id]; track(S.sb.from('milestones').delete().eq('id', sel.id)); S.sel = null; $('drawerRoot').innerHTML = ''; renderAll(); toast('Mijlpaal verwijderd.'); }
      return;
    }
    if (sel.kind === 'o') {
      var o = S.outcomes[sel.id]; if (!o) return;
      if (d === 'addkr') { var krs = clone(o.krs || []); krs.push({ id: rid('k'), text: '', start: 0, target: 100, current: 0, unit: '%' }); queue('outcomes', sel.id, { krs: krs }, 0); renderKrList(true); var ins = $('krList').querySelectorAll('input[data-kf="text"]'); if (ins.length) ins[ins.length - 1].focus(); }
      else if (d === 'delkr') { queue('outcomes', sel.id, { krs: (o.krs || []).filter(function (k) { return k.id !== b.dataset.id; }) }, 0); renderKrList(true); }
      else if (d === 'addc') { var cs = clone(o.contribs || []); cs.push({ id: rid('c'), owner: '', text: '' }); queue('outcomes', sel.id, { contribs: cs }, 0); renderCList(true); var ci = $('cList').querySelectorAll('input[data-cf="owner"]'); if (ci.length) ci[ci.length - 1].focus(); }
      else if (d === 'delc') {
        var cid = b.dataset.id;
        msList().forEach(function (x) { if (x.contrib === cid) S.milestones[x.id] = Object.assign({}, S.milestones[x.id], { contrib: '' }); });
        track(S.sb.from('milestones').update({ contrib_ref: '' }).eq('contrib_ref', cid));
        queue('outcomes', sel.id, { contribs: (o.contribs || []).filter(function (c) { return c.id !== cid; }) }, 0); renderCList(true);
      }
      else if (d === 'up' || d === 'down') {
        var list = sortedOutcomes(), i = list.findIndex(function (x) { return x.id === sel.id; }), j = i + (d === 'up' ? -1 : 1);
        if (i < 0 || j < 0 || j >= list.length) return;
        list.forEach(function (x, n) { if (num(x.order) !== n + 1 && n !== i && n !== j) queue('outcomes', x.id, { order: n + 1 }, 0); });
        queue('outcomes', list[i].id, { order: j + 1 }, 0); queue('outcomes', list[j].id, { order: i + 1 }, 0);
      }
      else if (d === 'askdel') $('delZone').innerHTML = '<span class="confirm">Outcome én bijbehorende mijlpalen verwijderen? <button class="btn danger" type="button" data-d="del">Ja, verwijderen</button><button class="btn" type="button" data-d="nodel">Nee</button></span>';
      else if (d === 'nodel') $('delZone').innerHTML = '<button class="btn danger" type="button" data-d="askdel">Verwijderen</button>';
      else if (d === 'del') {
        var oid = sel.id; delete pending['outcomes/' + oid]; delete S.outcomes[oid];
        msList().filter(function (x) { return x.row === oid; }).forEach(function (x) { delete S.milestones[x.id]; delete pending['milestones/' + x.id]; });
        track(S.sb.from('milestones').delete().eq('row_ref', oid));
        track(S.sb.from('outcomes').delete().eq('id', oid));
        S.sel = null; $('drawerRoot').innerHTML = ''; renderAll(); toast('Outcome verwijderd.');
      }
      return;
    }
    if (sel.kind === 's' && d === 'import') doImport();
  });

  function doImport() {
    var msg = $('importMsg'), txt = $('s-import').value.trim();
    var data; try { data = JSON.parse(txt); } catch (e) { msg.textContent = 'Dit is geen geldige bordtekst. Plak de volledige tekst uit “Delen / importeren”.'; return; }
    if (!data || !Array.isArray(data.outcomes) || !Array.isArray(data.milestones)) { msg.textContent = 'Deze tekst bevat geen outcomes en mijlpalen.'; return; }
    var map = {}, base = sortedOutcomes().reduce(function (a, o) { return Math.max(a, num(o.order)); }, 0), now = new Date().toISOString();
    var outRows = [], msRows = [];
    data.outcomes.forEach(function (o, n) {
      var id = rid('o'); map[o.id] = id;
      var body = Object.assign({ title: String(o.title || ''), order: base + n + 1,
        krs: (Array.isArray(o.krs) ? o.krs : []).map(function (k) { return { id: rid('k'), text: String(k.text || ''), start: num(k.start), target: num(k.target), current: num(k.current), unit: String(k.unit || '') }; }),
        contribs: (Array.isArray(o.contribs) ? o.contribs : []).map(function (c) { return { id: rid('c'), owner: String(c.owner || ''), text: String(c.text || '') }; }), createdAt: now }, meta());
      S.outcomes[id] = body; outRows.push(toRow(Object.assign({ id: id }, body)));
    });
    data.milestones.forEach(function (m) {
      var row = m.row === 'art' ? 'art' : map[m.row]; if (!row) return;
      var id = rid('m'), body = Object.assign({ row: row, iter: Math.max(0, Math.min(5, num(m.iter))), title: String(m.title || ''), type: TYPES[m.type] ? m.type : 'learn', status: STATUS[m.status] ? m.status : 'planned', createdAt: now }, meta());
      S.milestones[id] = body; msRows.push(toRow(Object.assign({ id: id }, body)));
    });
    if (outRows.length) track(S.sb.from('outcomes').insert(outRows));
    if (msRows.length) track(S.sb.from('milestones').insert(msRows));
    $('s-import').value = '';
    msg.textContent = outRows.length + ' outcomes en ' + msRows.length + ' mijlpalen toegevoegd.';
    renderAll();
  }

  /* ---------- laden + realtime ---------- */
  function overlay(col, id, body) { var p = pending[col + '/' + id]; return p ? Object.assign({}, body, p.patch) : body; }
  function applySettings(r) { var v = fromRow(r); S.settings = { piStart: v.piStart || '2026-12-09', iterationWeeks: num(v.iterationWeeks) || 2, piName: v.piName || '' }; }

  function loadAll() {
    return Promise.all([S.sb.from('outcomes').select('*'), S.sb.from('milestones').select('*'), S.sb.from('settings').select('*').eq('id', 'pi')]).then(function (res) {
      var err = res.find(function (r) { return r.error; });
      if (err) { toast('Laden mislukt: ' + err.error.message); return; }
      var o = {}; res[0].data.forEach(function (r) { o[r.id] = overlay('outcomes', r.id, fromRow(r)); });
      var m = {}; res[1].data.forEach(function (r) { m[r.id] = overlay('milestones', r.id, fromRow(r)); });
      S.outcomes = o; S.milestones = m;
      if (res[2].data[0]) applySettings(res[2].data[0]);
      S.ready = true; $('btnAddOutcome').disabled = false;
      renderAll();
    });
  }

  function onChange(col) {
    return function (payload) {
      var store = storeFor(col);
      if (payload.eventType === 'DELETE') { if (payload.old && payload.old.id) delete store[payload.old.id]; }
      else if (payload.new && payload.new.id) store[payload.new.id] = overlay(col, payload.new.id, fromRow(payload.new));
      renderAll();
    };
  }

  function subscribe() {
    S.sb.channel('lace-pi-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outcomes' }, onChange('outcomes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, onChange('milestones'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, function (p) { if (p.new && p.new.id === 'pi') { applySettings(p.new); renderAll(); } })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') { S.offline = false; loadAll(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { S.offline = true; setLive(); }
      });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.ready) loadAll(); });

  /* ---------- start ---------- */
  var cfg = window.LACE_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey || /JOUW/.test(cfg.supabaseUrl)) {
    $('app').hidden = true; var g = $('gate'); g.hidden = false;
    g.innerHTML = '<div class="gate"><h1>Nog niet ingesteld</h1><p class="sub">Vul <code>config.js</code> met de URL en de anon key van je Supabase-project. Zie de README voor de stappen.</p></div>';
    return;
  }
  S.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } });
  $('app').hidden = false;
  renderLegend(); renderAll();
  subscribe();
})();
