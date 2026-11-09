/* LACE PI Outcome Board — statische app op Supabase (database + realtime), zonder login. */
(function () {
  'use strict';

  /* Kolommen: N iteraties, optioneel een IP-iteratie, en de volgende PI */
  function piIterCount() { return Math.min(6, Math.max(2, num(S.settings.iterationCount) || 4)) + (S.settings.ipIteration === false ? 0 : 1); }
  function iterNames() {
    var n = Math.min(6, Math.max(2, num(S.settings.iterationCount) || 4)), out = [];
    for (var i = 1; i <= n; i++) out.push('Iteratie ' + i);
    if (S.settings.ipIteration !== false) out.push('IP-iteratie');
    out.push('Volgende PI');
    return out;
  }
  function lastCol() { return piIterCount(); }
  function iterOf(m) { return Math.max(0, Math.min(lastCol(), num(m.iter))); }
  var CONF = { 1: 'Zeer onzeker', 2: 'Onzeker', 3: 'Neutraal', 4: 'Zeker', 5: 'Zeer zeker' };
  var DECISION = { '': '—', 'continue': 'Doorgaan', 'adjust': 'Bijsturen', 'stop': 'Stoppen' };
  var KIND = { '': '—', 'leading': 'Voorlopend', 'lagging': 'Achterlopend' };
  function checkinsOf(o) { return (Array.isArray(o.checkins) ? o.checkins : []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }); }
  function daysSince(iso) { var d = new Date(iso); if (isNaN(d)) return null; var n = new Date(); return Math.floor((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000); }
  function agoLabel(n) { return n == null ? '' : n <= 0 ? 'vandaag' : n === 1 ? 'gisteren' : n + ' dagen geleden'; }
  function confClass(c) { c = num(c); return c >= 4 ? 'ok' : c === 3 ? 'watch' : 'behind'; }
  function spark(cis) {
    if (cis.length < 2) return '';
    var w = 120, h = 30, pad = 4, step = (w - pad * 2) / (cis.length - 1);
    var pts = cis.map(function (c, i) { return [pad + i * step, pad + (5 - num(c.confidence)) / 4 * (h - pad * 2)]; });
    var last = pts[pts.length - 1];
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Verloop vertrouwen: ' + cis.map(function (c) { return num(c.confidence); }).join(', ') + '">' +
      '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + (pad + (h - pad * 2) / 2) + '" y2="' + (pad + (h - pad * 2) / 2) + '" class="sp-mid"></line>' +
      '<polyline points="' + pts.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ') + '" class="sp-line"></polyline>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" class="sp-dot c-' + confClass(cis[cis.length - 1].confidence) + '"></circle></svg>';
  }
  function hiNums(text) {
    var parts = String(text == null ? '' : text).split(/(\d+(?:[.,]\d+)?\s?%?)/);
    return parts.map(function (p, i) { return i % 2 ? '<strong class="kn">' + esc(p) + '</strong>' : esc(p); }).join('');
  }
  var TYPES = { fixed: { l: 'Vaste datum', v: '--m-fixed' }, learn: { l: 'Leren', v: '--m-learn' }, sync: { l: 'Synchronisatie', v: '--m-sync' }, release: { l: 'Release', v: '--m-release' } };
  var STATUS = { planned: 'Gepland', done: 'Gehaald', risk: 'Risico', missed: 'Gemist' };
  var HEALTH = { planned: 'Gepland', ok: 'Op koers', watch: 'Aandacht', behind: 'Achter', done: 'Behaald' };
  var VIEW_KEY = 'lace-pi-view-v1';

  /* Kolomnamen in de database <-> veldnamen in de app */
  var KEYMAP = { order: 'sort_order', row: 'row_ref', createdAt: 'created_at', updatedAt: 'updated_at', updatedBy: 'updated_by', piStart: 'pi_start', iterationWeeks: 'iteration_weeks', piName: 'pi_name', contrib: 'contrib_ref', iterationCount: 'iteration_count', ipIteration: 'ip_iteration', bvPlanned: 'bv_planned', bvActual: 'bv_actual', outcome: 'outcome_ref', milestone: 'milestone_ref', dependsOn: 'depends_on', ogsmRef: 'ogsm_ref', ogsmExtra: 'ogsm_extra' };
  var REVMAP = {}; Object.keys(KEYMAP).forEach(function (k) { REVMAP[KEYMAP[k]] = k; });
  function toRow(o) { var r = {}; Object.keys(o).forEach(function (k) { r[KEYMAP[k] || k] = o[k]; }); return r; }
  function fromRow(r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== 'id') o[REVMAP[k] || k] = r[k]; }); return o; }

  var S = { sb: null, session: null, ready: false, outcomes: {}, milestones: {}, tasks: {}, ogsm: {}, view: 'board', pf: {}, syncIdx: 0, settings: { piStart: '2026-12-09', iterationWeeks: 2, piName: '', iterationCount: 4, ipIteration: true }, open: {}, sel: null, readOnly: false };
  var pending = {};
  var saving = 0;

  try { var vw = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') || {}; S.focus = vw.focus || null; S.expandAll = !!vw.expandAll; S.pf = vw.pf || {}; S.showDeps = vw.showDeps !== false; } catch (e) {}
  function saveView() { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ focus: S.focus, expandAll: S.expandAll, pf: S.pf, showDeps: S.showDeps })); } catch (e) {} }
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
    var nIt = piIterCount(), names = iterNames();
    var piDays = len * nIt;
    var nowIdx = elapsed < 0 ? -1 : Math.min(nIt, Math.floor(elapsed / len));
    var expected = Math.round(Math.max(0, Math.min(1, elapsed / piDays)) * 100);
    function add(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function fmt(d) { return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); }
    var iters = names.map(function (n, i) { var s = add(start, i * len), e = add(s, len - 1); return { name: n, dates: i === nIt ? 'vanaf ' + fmt(s) : fmt(s) + ' – ' + fmt(e) }; });
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
  function renderAll() { renderHeader(); renderViews(); setLive(); syncDrawer(); }

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
    var plannedBV = outs.filter(function (o) { return o.commitment !== 'stretch' && o.bvPlanned != null; }).reduce(function (a, o) { return a + num(o.bvPlanned); }, 0);
    var withActual = outs.filter(function (o) { return o.bvActual != null; });
    var actualBV = withActual.reduce(function (a, o) { return a + num(o.bvActual); }, 0);
    if (plannedBV > 0 && withActual.length) {
      var pred = Math.round(actualBV / plannedBV * 100);
      $('tPred').textContent = pred + '%'; $('tPred').style.color = pred >= 80 && pred <= 100 ? 'var(--ok)' : pred < 80 ? 'var(--watch)' : '';
      $('tPredSub').textContent = actualBV + ' werkelijk / ' + plannedBV + ' gepland (committed) · doel 80–100%';
    } else {
      $('tPred').textContent = '–'; $('tPred').style.color = '';
      $('tPredSub').textContent = plannedBV > 0 ? plannedBV + ' BV gepland · werkelijke waarde vul je in bij I&A' : 'Vul business value in bij de outcomes';
    }
    $('tRisk').textContent = risk; $('tRisk').style.color = risk ? 'var(--bad)' : '';
    if (T.nowIdx < 0) { var d = -T.elapsed; $('tNow').textContent = 'Start over ' + d + (d === 1 ? ' dag' : ' dagen'); $('tNowSub').textContent = 'PI start ' + T.start.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    else if (T.nowIdx >= piIterCount()) { $('tNow').textContent = 'PI afgerond'; $('tNowSub').textContent = 'Tijd voor de volgende PI Planning'; }
    else { $('tNow').textContent = iterNames()[T.nowIdx]; $('tNowSub').textContent = 'Dag ' + (T.elapsed + 1) + ' van ' + T.piDays + ' · verwacht ' + T.expected + '% gerealiseerd'; }
  }

  function msState(m, T) {
    var st = STATUS[m.status] ? m.status : 'planned';
    var late = st === 'planned' && T.nowIdx >= 0 && iterOf(m) < T.nowIdx;
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
      '<span class="cstat">' + s.icon + esc(s.label) + (m.decision ? ' · ' + DECISION[m.decision] : '') + '</span>' + (depIssues(m).length ? '<span class="cdep">Wacht op latere mijlpaal</span>' : '') + (m.learning ? '<span class="clearn" title="' + esc(m.learning) + '">Leerpunt vastgelegd</span>' : '') + taskBadge(m) + '</button>';
  }
  function taskBadge(m) {
    var tk = tasksFor(m.id); if (!tk.length) return '';
    var d = tk.filter(function (t) { return t.status === 'done'; }).length;
    return '<span class="ctasks' + (d === tk.length ? ' all' : '') + '">' + d + '/' + tk.length + ' taken</span>';
  }
  function msDot(m, T) {
    var t = TYPES[m.type] || TYPES.learn, s = msState(m, T);
    var title = m.title || '(zonder titel)';
    return '<button type="button" class="mdot s-' + s.cls + '" style="--mc:var(' + t.v + ')" data-act="ms" data-id="' + esc(m.id) + '" title="' + esc(title + ' · ' + t.l + ' · ' + s.label) + '" aria-label="' + esc(t.l + ' mijlpaal: ' + title + ', ' + s.label) + '"><span class="dia-s" aria-hidden="true"></span></button>';
  }
  function addBtn(row, i, contrib) {
    if (S.readOnly) return '';
    return '<button type="button" class="add" data-act="addms" data-row="' + esc(row) + '" data-iter="' + i + '" data-contrib="' + esc(contrib || '') + '" aria-label="Mijlpaal toevoegen in ' + esc(iterNames()[i]) + '">+</button>';
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

  function confBadge(o) {
    var cis = checkinsOf(o); if (!cis.length) return '';
    var c = cis[cis.length - 1];
    return ' · <span class="conf c-' + confClass(c.confidence) + '" title="Vertrouwen: ' + esc(CONF[num(c.confidence)] || '') + '">Vertrouwen ' + num(c.confidence) + '/5</span>';
  }
  function confBlock(o, T) {
    var cis = checkinsOf(o), weeks = Math.max(1, num(S.settings.iterationWeeks) || 2);
    if (!cis.length) return '<div class="confbox"><span class="meta">Nog geen check-in. Hoe zeker zijn we dat deze outcome gehaald wordt?</span></div>';
    var c = cis[cis.length - 1], ago = daysSince(c.date), stale = ago != null && ago > weeks * 7 && T.nowIdx >= 0;
    return '<div class="confbox"><div class="confrow"><span class="conf c-' + confClass(c.confidence) + '">Vertrouwen ' + num(c.confidence) + '/5</span>' + spark(cis) + '</div>' +
      '<span class="meta">' + esc((CONF[num(c.confidence)] || '') + ' · ' + agoLabel(ago) + (c.by ? ' door ' + c.by : '')) + '</span>' +
      (c.note ? '<span class="cinote">“' + esc(c.note) + '”</span>' : '') +
      (stale ? '<span class="warn">Laatste check-in is ouder dan een iteratie</span>' : '') + '</div>';
  }
  function bvLine(o) {
    var p = o.bvPlanned, a = o.bvActual;
    if (p == null && a == null) return '';
    return '<span class="meta">Business value: <b class="num">' + (p == null ? '–' : num(p)) + '</b> gepland · <b class="num">' + (a == null ? '–' : num(a)) + '</b> werkelijk</span>';
  }
  function learnLog(oms) {
    var l = oms.filter(function (m) { return m.learning; });
    if (!l.length) return '';
    return '<details class="learn"><summary>Leerlog (' + l.length + ')</summary><ul>' + l.map(function (m) {
      return '<li><b>' + esc(m.title || '') + '</b>' + (m.decision ? ' <span class="tag d-' + esc(m.decision) + '">' + DECISION[m.decision] + '</span>' : '') + '<span>' + esc(m.learning) + '</span></li>';
    }).join('') + '</ul></details>';
  }

  var OCHECK = [
    { k: 'invloed', q: 'Invloed', d: 'Ligt het binnen wat het LACE kan beïnvloeden, zonder te wachten op besluiten die we niet in handen hebben?' },
    { k: 'termijn', q: 'Termijn', d: 'Is er binnen deze PI een beweging te zien? Zo niet: kies een tussenstap.' },
    { k: 'meetbaar', q: 'Meetbaar tijdens de PI', d: 'Is er een voorlopende indicator die al in iteratie 2 of 3 kan bewegen?' },
    { k: 'capaciteit', q: 'Capaciteit', d: 'Past het naast het run-werk? Reken op hooguit 50 à 60% van de tijd voor outcomes.' },
    { k: 'eerstestap', q: 'Eerste stap', d: 'Staat de eerste mijlpaal al in iteratie 1?' }
  ];
  function checkCount(o) { var c = o.checks || {}; return OCHECK.filter(function (x) { return c[x.k]; }).length; }
  function checkHint(o, k) {
    if (k === 'meetbaar') return (o.krs || []).some(function (x) { return x.kind === 'leading'; }) ? 'Er is al een voorlopend key result.' : 'Nog geen key result gemarkeerd als voorlopend.';
    if (k === 'eerstestap') return msList().some(function (m) { return m.row === o.id && iterOf(m) === 0; }) ? 'Er staat al een mijlpaal in iteratie 1.' : 'Er staat nog geen mijlpaal in iteratie 1.';
    return '';
  }
  function checkBadge(o) {
    var n = checkCount(o);
    if (n === OCHECK.length) return '<span class="ochk ok" title="Outcome-check: alle vragen afgevinkt">✓ Getoetst</span>';
    if (n === 0) return '<span class="ochk none" title="Outcome-check nog niet gedaan">Nog niet getoetst</span>';
    return '<span class="ochk part" title="Outcome-check: ' + n + ' van ' + OCHECK.length + ' afgevinkt">Check ' + n + '/' + OCHECK.length + '</span>';
  }
  function goalList() { return Object.keys(S.ogsm || {}).map(function (id) { return Object.assign({ id: id }, S.ogsm[id]); }).filter(function (g) { return g.kind === 'goal'; }).sort(function (a, b) { return num(a.order) - num(b.order) || String(a.code || '').localeCompare(String(b.code || '')); }); }
  function objective() { var o = S.ogsm && S.ogsm.objective; return o ? (o.title || '') : ''; }
  function ogColor(g) { var c = num(g.color); return c >= 1 && c <= 6 ? c : 1; }
  function ogsmGroups(outs) {
    var goals = goalList(), byId = {}; goals.forEach(function (g) { byId[g.id] = { goal: g, outs: [] }; });
    var none = { goal: null, outs: [] };
    outs.forEach(function (o) { (byId[o.ogsmRef] || none).outs.push(o); });
    return goals.map(function (g) { return byId[g.id]; }).filter(function (g) { return g.outs.length; }).concat(none.outs.length ? [none] : []);
  }
  function extraGoals(o) {
    var ex = (Array.isArray(o.ogsmExtra) ? o.ogsmExtra : []).filter(function (id) { return S.ogsm[id] && id !== o.ogsmRef; });
    if (!ex.length) return '';
    return '<span class="ogextra">Draagt ook bij aan ' + ex.map(function (id) { var g = S.ogsm[id]; return '<span class="ogtag ogc-' + ogColor(g) + '">' + esc(g.code || g.title || '') + '</span>'; }).join(' ') + '</span>';
  }
  function renderOgsmBanner() {
    var el = $('ogsmBanner'); if (!el) return;
    if (S.ogsmMissing) { el.innerHTML = '<p class="ogwarn">OGSM is nog niet geactiveerd. Voer supabase/migrations/007_ogsm.sql uit in Supabase.</p>'; return; }
    var obj = objective(), goals = goalList(), outs = sortedOutcomes();
    var empty = goals.filter(function (g) { return !outs.some(function (o) { return o.ogsmRef === g.id || (Array.isArray(o.ogsmExtra) && o.ogsmExtra.indexOf(g.id) >= 0); }); });
    var unl = outs.filter(function (o) { return !o.ogsmRef || !S.ogsm[o.ogsmRef]; }).length;
    var h = '<div class="ogobj"><span class="ogobj-l">OGSM-ambitie</span>' + (obj ? '<b>' + esc(obj) + '</b>' : '<b class="muted">Nog niet ingevuld</b>') +
      (S.readOnly ? '' : '<button type="button" class="mini edit" data-ogact="manage">' + (goals.length || obj ? '✎ OGSM beheren' : '+ OGSM invullen') + '</button>') + '</div>';
    if (empty.length || unl) h += '<div class="ogchips">' + empty.map(function (g) { return '<span class="ogwarn">' + esc((g.code ? g.code + ' · ' : '') + (g.title || '')) + ' heeft deze PI geen outcome</span>'; }).join('') +
      (unl ? '<span class="ogchip">' + unl + (unl === 1 ? ' outcome' : ' outcomes') + ' nog niet gekoppeld aan een OGSM-doel</span>' : '') + '</div>';
    el.innerHTML = h;
  }

  function renderBoard() {
    if (!S.ready) { $('board').innerHTML = '<div class="empty">Bord laden…</div>'; return; }
    var T = timeInfo(), ms = msList(), outs = sortedOutcomes(), fid = focusId(outs);
    var h = '<div class="ogroup head"><div class="ogh">OGSM-doel</div><div class="ogrows"><div class="row head"><div>PI-outcome</div><div>Bijdragen</div>' + T.iters.map(function (it, i) {
      return '<div class="it' + (i === T.nowIdx ? ' now' : '') + '">' + esc(it.name) + (i === T.nowIdx ? '<span class="nowpill">Nu</span>' : '') + '<span class="dates">' + esc(it.dates) + '</span></div>';
    }).join('') + '</div></div></div>';

    var art = ms.filter(function (m) { return m.row === 'art'; });
    h += '<div class="ogroup ritme"><div class="ogcell ogempty"></div><div class="ogrows"><div class="row art"><div class="ocell" style="grid-column:1;grid-row:1"><h3>LACE-ritme</h3><span class="meta">Vaste teammomenten, zoals PI Planning en Inspect &amp; Adapt</span></div><div class="lane" style="grid-column:2;grid-row:1"></div>' +
      T.iters.map(function (n, i) { return cell(i, 1, T, art.filter(function (m) { return iterOf(m) === i; }).map(function (m) { return msCard(m, T); }).join('') + addBtn('art', i, ''), '', { row: 'art', contrib: '' }); }).join('') + '</div></div></div>';

    if (!outs.length) h += '<div class="empty"><b>Nog geen PI-outcomes.</b> Voeg de eerste toe met “+ PI-outcome”. Daarna kun je bijdragen, key results en mijlpalen per iteratie toevoegen.</div>';

    function outcomeRow(o) {
      var h = '';
      var st = outcomeStats(o, T, ms);
      var expanded = S.expandAll || o.id === fid;
      var krs = Array.isArray(o.krs) ? o.krs : [], cs = Array.isArray(o.contribs) ? o.contribs : [];
      var oms = ms.filter(function (m) { return m.row === o.id; });
      var sel = S.sel && S.sel.kind === 'o' && S.sel.id === o.id;
      var bar = '<div class="bar" role="progressbar" aria-label="Voortgang" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + st.pct + '"><div class="fill f-' + st.health + '" style="width:' + st.pct + '%"></div><div class="exp" style="left:' + T.expected + '%"></div></div>';

      if (!expanded) {
        var owners = cs.map(function (c) { return c.owner; }).filter(Boolean);
        h += '<div class="row compact' + (sel ? ' sel' : '') + '">' +
          '<div class="ocell" data-oid="' + esc(o.id) + '" style="grid-column:1;grid-row:1"><div class="otop"><h3><button type="button" class="otitle" data-act="focus" data-id="' + esc(o.id) + '" aria-label="' + esc((o.title || 'Outcome') + ' uitklappen') + '"><span class="chev" aria-hidden="true">▸</span>' + esc(o.title || '(zonder titel)') + '</button></h3><span class="pill h-' + st.health + '">' + HEALTH[st.health] + '</span></div>' + bar +
          '<span class="meta"><span class="num" style="color:var(--ink)">' + st.pct + '%</span> gerealiseerd · ' + oms.length + (oms.length === 1 ? ' mijlpaal' : ' mijlpalen') + confBadge(o) + (o.commitment === 'stretch' ? ' · <span class="tag">Stretch</span>' : '') + '</span>' + extraGoals(o) + '<span class="ochkline">' + checkBadge(o) + '</span>' +
          (S.readOnly ? '' : '<div class="minibtns"><button type="button" class="mini edit" data-act="edit" data-id="' + esc(o.id) + '">✎ Bewerken</button></div>') + '</div>' +
          '<div class="lane" style="grid-column:2;grid-row:1"><span>' + (owners.length ? esc(owners.join(', ')) : 'Nog geen bijdragen') + '</span></div>' +
          T.iters.map(function (n, i) { return cell(i, 1, T, '<div class="dots">' + oms.filter(function (m) { return iterOf(m) === i; }).map(function (m) { return msDot(m, T); }).join('') + '</div>', '', { row: o.id, contrib: '*' }); }).join('') +
          '</div>';
        return h;
      }

      var ids = {}; cs.forEach(function (c) { ids[c.id] = 1; });
      var lanes = cs.map(function (c) { return { id: c.id, owner: c.owner, text: c.text }; });
      var loose = oms.filter(function (m) { return !ids[m.contrib]; });
      if (!lanes.length || loose.length) lanes.push({ id: '', owner: lanes.length ? 'Hele outcome' : 'Mijlpalen', text: lanes.length ? 'Niet aan één bijdrage gekoppeld' : 'Voeg bijdragen toe om banen per persoon of team te krijgen', whole: true });
      var n = lanes.length;

      h += '<div class="row focus' + (sel ? ' sel' : '') + '">' +
        '<div class="ocell" data-oid="' + esc(o.id) + '" style="grid-column:1;grid-row:1 / span ' + n + '">' +
        '<div class="otop"><h3>' + (S.expandAll ? '' : '<button type="button" class="otitle open" data-act="unfocus" aria-label="Inklappen"><span class="chev" aria-hidden="true">▾</span></button>') + esc(o.title || '(zonder titel)') + '</h3><span class="pill h-' + st.health + '">' + HEALTH[st.health] + '</span></div>' + bar +
        '<span class="meta"><span class="num" style="color:var(--ink)">' + st.pct + '%</span> gerealiseerd · verwacht ' + T.expected + '%</span>' +
        (o.commitment === 'stretch' ? '<span class="tag">Stretch-outcome</span>' : '') + extraGoals(o) + '<span class="ochkline">' + checkBadge(o) + '</span>' +
        (o.hypothesis ? '<p class="hyp"><span class="lbl">Hypothese</span>' + esc(o.hypothesis) + '</p>' : '') +
        '<ul class="krs">' + krs.map(function (k) { var p = krPct(k), u = k.unit || ''; return '<li><span class="kt">' + hiNums(k.text) + (k.kind ? ' <span class="tag k-' + esc(k.kind) + '">' + KIND[k.kind] + '</span>' : '') + '</span><span class="kv"><span class="bar thin"><span class="fill" style="display:block;width:' + p + '%;background:' + (p >= 100 ? 'var(--done-bar)' : 'var(--muted)') + '"></span></span><span class="num">' + esc(num(k.current) + u + ' / ' + num(k.target) + u) + '</span></span></li>'; }).join('') + (krs.length ? '' : '<li class="meta">Nog geen key results</li>') + '</ul>' +
        (krs.length && krs.every(function (k) { return k.kind === 'lagging'; }) ? '<p class="warn">Alleen achterlopende indicatoren: waar stuur je tijdens de PI op?</p>' : '') +
        confBlock(o, T) + bvLine(o) + learnLog(oms) +
        (S.readOnly ? '' : '<div class="minibtns"><button type="button" class="mini edit" data-act="edit" data-id="' + esc(o.id) + '">✎ Outcome bewerken</button><button type="button" class="mini" data-act="addmsout" data-id="' + esc(o.id) + '">+ Mijlpaal</button><button type="button" class="mini" data-act="checkin" data-id="' + esc(o.id) + '">+ Check-in</button></div>') +
        (o.updatedAt ? '<span class="meta">' + esc(whoLabel(o)) + '</span>' : '') + '</div>';

      lanes.forEach(function (ln, idx) {
        var r = idx + 1, first = idx === 0 ? ' first' : '';
        var lms = ln.whole ? loose : oms.filter(function (m) { return m.contrib === ln.id; });
        h += '<div class="lane l' + first + (ln.whole ? ' whole' : '') + '" style="grid-column:2;grid-row:' + r + '"><b>' + esc(ln.owner || '–') + '</b>' + (ln.text ? '<span>' + esc(ln.text) + '</span>' : '') + '</div>';
        T.iters.forEach(function (nm, i) {
          h += cell(i, r, T, lms.filter(function (m) { return iterOf(m) === i; }).map(function (m) { return msCard(m, T); }).join('') + addBtn(o.id, i, ln.id), 'l' + first, { row: o.id, contrib: ln.id });
        });
      });
      h += '</div>';
      return h;
    }

    ogsmGroups(outs).forEach(function (g) {
      var stats = g.outs.map(function (o) { return outcomeStats(o, T, ms).pct; });
      var avg = stats.length ? Math.round(stats.reduce(function (a2, b2) { return a2 + b2; }, 0) / stats.length) : 0;
      var left = g.goal
        ? '<div class="ogcell ogc-' + ogColor(g.goal) + '" data-og="' + esc(g.goal.id) + '"><span class="ogcode">' + esc(g.goal.code || 'Doel') + '</span><b>' + esc(g.goal.title || '(zonder titel)') + '</b>' +
          (g.goal.strategy ? '<span class="ogsub"><i>Strategie</i>' + esc(g.goal.strategy) + '</span>' : '') +
          (g.goal.measure ? '<span class="ogsub"><i>Meetwaarde</i>' + esc(g.goal.measure) + '</span>' : '') +
          '<span class="ogstat">' + g.outs.length + (g.outs.length === 1 ? ' outcome' : ' outcomes') + ' · ' + avg + '%</span>' +
          '<div class="ogbar" role="progressbar" aria-label="Voortgang doel" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + avg + '"><span style="width:' + avg + '%"></span></div></div>'
        : '<div class="ogcell ogc-none" data-og="_none"><b>Nog niet gekoppeld</b><span class="ogsub">Aan welk OGSM-doel draagt dit bij? Kies het bij Bewerken.</span></div>';
      h += '<div class="ogroup">' + left + '<div class="ogrows">' + g.outs.map(outcomeRow).join('') + '</div></div>';
    });
    if (!S.readOnly) h += '<div class="addrow"><button type="button" class="btn ghost" data-act="addoutcome">+ PI-outcome toevoegen</button></div>';
    $('board').style.setProperty('--cols', T.iters.length);
    renderOgsmBanner();
    $('board').innerHTML = h + '<svg class="deps" aria-hidden="true"><defs>' +
      '<marker id="dep-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L9 5L1 9z" class="dep-head"></path></marker>' +
      '<marker id="dep-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L9 5L1 9z" class="dep-head bad"></path></marker></defs><g id="ogLines"></g><g id="depLines"></g></svg>';
    drawDeps();
    var db = $('btnDeps'); if (db) { db.textContent = S.showDeps ? 'Afhankelijkheden verbergen' : 'Afhankelijkheden tonen'; db.setAttribute('aria-pressed', String(!!S.showDeps)); }
    var vt = $('btnView'); if (vt) { vt.textContent = S.expandAll ? 'Focus op één outcome' : 'Alles uitklappen'; vt.setAttribute('aria-pressed', String(!!S.expandAll)); }
  }

  function depsOf(m) { return (Array.isArray(m.dependsOn) ? m.dependsOn : []).filter(function (id) { return S.milestones[id] && id !== m.id; }); }
  function blockedBy(id) { return msList().filter(function (m) { return depsOf(m).indexOf(id) >= 0; }); }
  function depConflict(m, pre) { return iterOf(pre) > iterOf(m) || pre.status === 'missed'; }
  function depIssues(m) {
    return depsOf(m).map(function (id) { return S.milestones[id] ? Object.assign({ id: id }, S.milestones[id]) : null; }).filter(function (p) { return p && depConflict(m, p); });
  }
  var depRaf = null;
  function drawDeps() {
    if (depRaf) cancelAnimationFrame(depRaf);
    depRaf = requestAnimationFrame(function () {
      depRaf = null;
      var board = $('board'), g = $('depLines'), svg = board && board.querySelector('svg.deps'); if (!g || !svg) return;
      svg.setAttribute('width', board.scrollWidth); svg.setAttribute('height', board.scrollHeight);
      var br0 = board.getBoundingClientRect(), og = '';
      board.querySelectorAll('[data-og]').forEach(function (blk) {
        var gid = blk.dataset.og, rows = blk.parentNode.querySelectorAll('[data-oid]'), r0 = blk.getBoundingClientRect();
        var sx = r0.right - br0.left - 10, cls = gid === '_none' ? 'ogl none' : 'ogl ogc-' + (S.ogsm[gid] ? ogColor(S.ogsm[gid]) : 1);
        rows.forEach(function (oc) {
          var r1 = oc.getBoundingClientRect(), sy = Math.min(r0.top + 28, r0.bottom - 16) - br0.top, tx = r1.left - br0.left + 4, ty = r1.top - br0.top + 24;
          og += '<path class="' + cls + '" d="M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' C' + (sx + 18).toFixed(1) + ' ' + sy.toFixed(1) + ' ' + (tx - 18).toFixed(1) + ' ' + ty.toFixed(1) + ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1) + '"></path>' +
            '<circle class="' + cls + ' dot" cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="3"></circle>';
        });
        if (rows.length) og += '<circle class="' + cls + ' dot" cx="' + sx.toFixed(1) + '" cy="' + (Math.min(r0.top + 28, r0.bottom - 16) - br0.top).toFixed(1) + '" r="3.5"></circle>';
      });
      var ogl = $('ogLines'); if (ogl) ogl.innerHTML = og;
      if (!S.showDeps) { g.innerHTML = ''; return; }
      var br = board.getBoundingClientRect(), focusId = (S.sel && S.sel.kind === 'm' && S.sel.id) || S.hoverMs || null, out = '';
      function box(id) { var el = board.querySelector('[data-act="ms"][data-id="' + id + '"]'); if (!el) return null; var r = el.getBoundingClientRect(); return { l: r.left - br.left, r: r.right - br.left, t: r.top - br.top, b: r.bottom - br.top, cy: r.top - br.top + r.height / 2 }; }
      msList().forEach(function (m) {
        depsOf(m).forEach(function (pid) {
          var a = box(pid), b = box(m.id); if (!a || !b) return;
          var pre = Object.assign({ id: pid }, S.milestones[pid]), bad = depConflict(m, pre);
          var sx = a.r, sy = a.cy, tx = b.l - 3, ty = b.cy, dx = Math.max(40, Math.abs(tx - sx) / 2);
          var d = 'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' C' + (sx + dx).toFixed(1) + ' ' + sy.toFixed(1) + ' ' + (tx - dx).toFixed(1) + ' ' + ty.toFixed(1) + ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1);
          var cls = 'dep' + (bad ? ' bad' : '') + (focusId ? (focusId === m.id || focusId === pid ? ' hl' : ' dim') : '');
          out += '<path class="' + cls + '" d="' + d + '" marker-end="url(#' + (bad ? 'dep-b' : 'dep-a') + ')" data-from="' + esc(pid) + '" data-to="' + esc(m.id) + '"></path>';
        });
      });
      g.innerHTML = out;
    });
  }
  window.addEventListener('resize', drawDeps);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawDeps);

  function renderLegend() {
    $('legend').innerHTML = Object.keys(TYPES).map(function (k) { return '<span>' + diamond(k) + esc(TYPES[k].l) + ' mijlpaal</span>'; }).join('') +
      '<span><span aria-hidden="true" class="todayline"></span>Vandaag</span>' +
      '<span><span aria-hidden="true" style="display:inline-block;width:2px;height:14px;background:var(--ink)"></span>Verwachte voortgang op basis van de tijd in de PI</span>' +
      '<span>Gestippelde rand: gepland, maar de iteratie is voorbij</span>' +
      '<span><svg width="34" height="10" aria-hidden="true"><line x1="1" y1="5" x2="28" y2="5" class="dep"></line><path d="M26 1L33 5L26 9z" class="dep-head"></path></svg>Hangt af van</span>' +
      '<span><svg width="34" height="10" aria-hidden="true"><line x1="1" y1="5" x2="28" y2="5" class="dep bad"></line><path d="M26 1L33 5L26 9z" class="dep-head bad"></path></svg>Afhankelijkheid klopt niet in de tijd</span>';
  }

  /* ---------- schrijven ---------- */
  function meta() { return { updatedBy: myName(), updatedAt: new Date().toISOString() }; }
  function check(res) {
    if (res && res.error) {
      var e = res.error;
      if (/checks/.test(e.message || '')) { toast('De outcome-check is nog niet geactiveerd. Voer supabase/migrations/008_outcome_check.sql uit in Supabase.'); return; }
      if (/ogsm/.test(e.message || '')) { toast('OGSM is nog niet geactiveerd. Voer supabase/migrations/007_ogsm.sql uit in Supabase.'); return; }
      if (/depends_on/.test(e.message || '')) { toast('Afhankelijkheden zijn nog niet geactiveerd. Voer supabase/migrations/006_afhankelijkheden.sql uit in Supabase.'); return; }
      if (/tasks|outcome_ref|milestone_ref/.test(e.message || '')) { toast('De planner is nog niet geactiveerd. Voer supabase/migrations/005_planner_taken.sql uit in Supabase.'); return; }
      if (/hypothesis|commitment|bv_planned|bv_actual|checkins|learning|decision/.test(e.message || '')) { toast('De database mist nog kolommen. Voer supabase/migrations/004_outcome_based_lace.sql uit in Supabase.'); return; }
      if (/iteration_count|ip_iteration|iter_check/.test(e.message || '')) { toast('De database mist nog een aanpassing. Voer supabase/migrations/003_iteraties_instelbaar.sql uit in Supabase.'); return; }
      if (/contrib_ref/.test(e.message || '')) { toast('De database mist nog een kolom. Voer supabase/migrations/002_bijdrage_koppeling.sql uit in Supabase.'); return; }
      if (e.code === '42501' || /row-level security|permission/i.test(e.message || '')) { S.readOnly = true; toast('Opslaan lukt niet: je account heeft geen schrijfrechten op dit bord.'); renderAll(); }
      else toast('Opslaan mislukt: ' + (e.message || 'onbekende fout') + '. Probeer het opnieuw.');
    }
  }
  function track(promise) { saving++; setLive(); return Promise.resolve(promise).then(check, function () { toast('Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.'); }).then(function () { saving--; setLive(); }); }
  function storeFor(col) { return col === 'outcomes' ? S.outcomes : col === 'tasks' ? S.tasks : col === 'ogsm' ? S.ogsm : S.milestones; }
  function queue(col, id, patch, delay) {
    var k = col + '/' + id;
    var p = pending[k] || (pending[k] = { col: col, id: id, patch: {}, t: null });
    Object.assign(p.patch, patch);
    var store = storeFor(col);
    if (store[id]) store[id] = Object.assign({}, store[id], patch);
    clearTimeout(p.t);
    p.t = setTimeout(function () { flush(k); }, delay == null ? 450 : delay);
    renderHeader(); renderViews(); setLive();
  }
  function flush(k) {
    var p = pending[k]; if (!p) return; delete pending[k]; clearTimeout(p.t);
    track(S.sb.from(p.col).update(toRow(Object.assign({}, p.patch, meta()))).eq('id', p.id));
  }
  function flushAll() { Object.keys(pending).forEach(flush); }
  window.addEventListener('pagehide', flushAll);

  function unlinkTasks(field, id) {
    if (S.tasksMissing) return;
    var patch = field === 'outcome' ? { outcome: '', milestone: '' } : { milestone: '' };
    taskList().forEach(function (t) { if (t[field] === id) S.tasks[t.id] = Object.assign({}, S.tasks[t.id], patch); });
    track(S.sb.from('tasks').update(toRow(patch)).eq(field === 'outcome' ? 'outcome_ref' : 'milestone_ref', id));
  }
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

  // Nieuwe mijlpaal via de knop: bij de opengeklapte outcome (of LACE-ritme) in de huidige iteratie.
  function addMsQuick(outcomeId) {
    var outs = sortedOutcomes(), row = outcomeId || focusId(outs) || 'art';
    var T = timeInfo(), iter = T.nowIdx >= 0 ? Math.min(T.nowIdx, lastCol()) : 0;
    if (row !== 'art') setFocus(row);
    addMs(row, iter, '');
    toast('Nieuwe mijlpaal: kies in het paneel de iteratie, de outcome en de baan.');
  }

  /* ---------- bord-events ---------- */
  $('board').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    if (drag.suppress) { drag.suppress = false; return; }
    var a = b.dataset.act, id = b.dataset.id;
    if (a === 'ms') { var mm = S.milestones[id]; if (mm && mm.row !== 'art' && !S.expandAll) setFocus(mm.row); openDrawer({ kind: 'm', id: id }); }
    else if (a === 'edit') openDrawer({ kind: 'o', id: id });
    else if (a === 'addoutcome' && S.ready && !S.readOnly) addOutcome();
    else if (a === 'addmsout' && S.ready && !S.readOnly) addMsQuick(id);
    else if (a === 'checkin') { openDrawer({ kind: 'o', id: id }); var cf = $('ci-conf'); if (cf) { cf.scrollIntoView({ block: 'center' }); cf.focus(); } }
    else if (a === 'focus') { setFocus(id); renderViews(); }
    else if (a === 'unfocus') { setFocus('__none__'); renderViews(); }
    else if (a === 'addms' && S.ready && !S.readOnly) addMs(b.dataset.row, num(b.dataset.iter), b.dataset.contrib);
  });
  $('btnAddOutcome').addEventListener('click', function () { if (S.ready && !S.readOnly) addOutcome(); });
  $('btnView').addEventListener('click', function () { S.expandAll = !S.expandAll; saveView(); renderViews(); });
  $('ogsmBanner').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ogact]'); if (!b) return;
    openDrawer({ kind: 's' }); var sec = $('ogSection'); if (sec) { sec.scrollIntoView({ block: 'start' }); var f = $('og-obj'); if (f && !f.value) f.focus(); }
  });
  $('btnDeps').addEventListener('click', function () { S.showDeps = !S.showDeps; saveView(); renderViews(); });
  $('board').addEventListener('mouseover', function (e) { var c = e.target.closest('[data-act="ms"]'); var id = c ? c.dataset.id : null; if (id !== S.hoverMs) { S.hoverMs = id; drawDeps(); } });
  $('board').addEventListener('mouseleave', function () { if (S.hoverMs) { S.hoverMs = null; drawDeps(); } });
  $('btnAddMs').addEventListener('click', function () { if (S.ready && !S.readOnly) addMsQuick(); });
  $('btnSettings').addEventListener('click', function () { openDrawer({ kind: 's' }); });
  try { $('myName').value = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
  $('myName').addEventListener('input', function () { try { localStorage.setItem(NAME_KEY, $('myName').value.trim()); } catch (e) {} });

  /* ---------- slepen (muis/pen) ---------- */
  var drag = { id: null, src: null, ghost: null, sx: 0, sy: 0, on: false, over: null, suppress: false };
  function dropCellAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    return drag.kind === 't' ? el.closest('[data-tdrop-status]') : el.closest('[data-drop-row]');
  }
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || e.button !== 0 || S.readOnly || !S.ready) return;
    var b = e.target.closest('#board .callout, #board .mdot, #planner .tcard'); if (!b) return;
    drag.kind = b.classList.contains('tcard') ? 't' : 'm';
    drag.id = b.dataset.id; drag.src = b; drag.sx = e.clientX; drag.sy = e.clientY; drag.on = false;
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag.id) return;
    if (!drag.on) {
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 6) return;
      drag.on = true;
      var r = drag.src.getBoundingClientRect();
      var g = drag.src.cloneNode(true);
      g.classList.add('dragghost'); g.style.width = r.width + 'px';
      g.style.left = '0px'; g.style.top = '0px';
      drag.offX = e.clientX - r.left; drag.offY = e.clientY - r.top;
      document.body.appendChild(g); drag.ghost = g;
      drag.src.classList.add('dragging'); document.body.classList.add('is-dragging');
    }
    e.preventDefault();
    drag.ghost.style.transform = 'translate(' + (e.clientX - drag.offX) + 'px,' + (e.clientY - drag.offY) + 'px)';
    var c = dropCellAt(e.clientX, e.clientY);
    if (c !== drag.over) { if (drag.over) drag.over.classList.remove('drop-over'); drag.over = c; if (c) c.classList.add('drop-over'); }
    var box = drag.kind === 't' ? document.querySelector('#planner .pbox') : $('board').parentNode; if (!box) return;
    var br = box.getBoundingClientRect();
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
    if (drag.kind === 't') {
      var tk = S.tasks[id]; if (!tk) return;
      var to = c.dataset.tdropOutcome, ts = c.dataset.tdropStatus;
      if ((tk.outcome || '') === to && tk.status === ts) return;
      var tp = { outcome: to, status: ts, order: Date.now() };
      if ((tk.outcome || '') !== to) tp.milestone = '';
      queue('tasks', id, tp, 0); syncDrawer();
      toast('Taak naar ' + TSTATUS[ts] + (tp.milestone === '' && tk.milestone ? ' (mijlpaal losgekoppeld)' : '') + '.');
      return;
    }
    var m = S.milestones[id]; if (!m) return;
    var row = c.dataset.dropRow, iter = num(c.dataset.dropIter), contrib = c.dataset.dropContrib;
    if (contrib === '*') contrib = m.row === row ? (m.contrib || '') : '';
    if (row === 'art') contrib = '';
    if (m.row === row && iterOf(m) === iter && (m.contrib || '') === contrib) return;
    queue('milestones', id, { row: row, iter: iter, contrib: contrib }, 0);
    syncDrawer();
    toast('Verplaatst naar ' + iterNames()[iter] + '.');
  }
  window.addEventListener('pointerup', function (e) { endDrag(e, false); });
  window.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drag.on) endDrag(e, true); });

  /* ---------- zijpaneel ---------- */
  var lastFocus = null;
  function openDrawer(sel) { flushAll(); lastFocus = document.activeElement; S.sel = sel; buildDrawer(); renderViews(); }
  function closeDrawer() { flushAll(); S.sel = null; $('drawerRoot').innerHTML = ''; renderViews(); if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.sel) closeDrawer(); });

  function msOptions(outcomeId, cur) {
    var list = msList().filter(function (m) { return outcomeId ? m.row === outcomeId : m.row === 'art'; });
    var names = iterNames();
    return opt('', 'Geen', cur) + list.map(function (m) { return opt(m.id, (m.title || '(zonder titel)') + ' · ' + (names[iterOf(m)] || ''), cur); }).join('');
  }
  function depOptions(m) {
    var have = depsOf(m), names = iterNames(), blockers = blockedBy(m.id).map(function (x) { return x.id; });
    var list = msList().filter(function (x) { return x.id !== m.id && have.indexOf(x.id) < 0 && blockers.indexOf(x.id) < 0; });
    return opt('', 'Kies een mijlpaal…', '') + list.map(function (x) {
      var where = x.row === 'art' ? 'LACE-ritme' : (S.outcomes[x.row] ? S.outcomes[x.row].title : '');
      return opt(x.id, (x.title || '(zonder titel)') + ' · ' + (names[iterOf(x)] || '') + (where ? ' · ' + where : ''), '');
    }).join('');
  }
  function renderMsDeps() {
    var el = $('mDeps'), bl = $('mBlocks'), sel2 = $('m-adddep'); if (!el || !S.sel) return;
    var m = S.milestones[S.sel.id]; if (!m) return;
    m = Object.assign({ id: S.sel.id }, m);
    var names = iterNames();
    el.innerHTML = depsOf(m).map(function (pid) {
      var p = Object.assign({ id: pid }, S.milestones[pid]), bad = depConflict(m, p);
      return '<li><span class="deprow' + (bad ? ' bad' : '') + '">' + diamond(p.type) + '<span class="st">Hangt af van <b>' + esc(p.title || '') + '</b><span class="meta">' + esc(names[iterOf(p)] || '') + ' · ' + esc(STATUS[p.status] || 'Gepland') + (bad ? ' · staat later gepland dan deze mijlpaal' : '') + '</span></span>' +
        (S.readOnly ? '' : '<button type="button" class="x" aria-label="Afhankelijkheid verwijderen" data-d="deldep" data-id="' + esc(pid) + '">' + X_ICON + '</button>') + '</span></li>';
    }).join('') || '<li class="note">Hangt nergens van af.</li>';
    var b = blockedBy(m.id);
    bl.innerHTML = b.length ? '<li class="note">Blokkeert: ' + b.map(function (x) { return esc(x.title || ''); }).join(', ') + '</li>' : '';
    if (sel2 && sel2 !== document.activeElement) sel2.innerHTML = depOptions(m);
  }
  var OG_COLORS = { 1: 'Groen', 2: 'Paars', 3: 'Koraal', 4: 'Blauw', 5: 'Roze', 6: 'Oker' };
  function renderOgList(force) {
    var el = $('ogList'); if (!el) return;
    var goals = goalList(), ro = S.readOnly ? ' disabled' : '';
    if (!force && el.dataset.sig === sig(goals)) {
      el.querySelectorAll('[data-g]').forEach(function (inp) { if (inp === document.activeElement) return; var g = S.ogsm[inp.dataset.g]; if (!g) return; var v = g[inp.dataset.gf]; v = v == null ? '' : v; if (String(inp.value) !== String(v)) inp.value = v; });
      return;
    }
    var a = document.activeElement, keep = a && a.dataset && a.dataset.g ? [a.dataset.g, a.dataset.gf] : null;
    el.dataset.sig = sig(goals);
    el.innerHTML = goals.map(function (g) {
      var id = esc(g.id);
      return '<div class="ogedit ogc-' + ogColor(g) + '"><div class="ogedit-top">' +
        '<input type="text" class="code" aria-label="Code" placeholder="G1" data-g="' + id + '" data-gf="code" value="' + esc(g.code || '') + '"' + ro + '>' +
        '<input type="text" aria-label="Doel" placeholder="Doel uit de OGSM" data-g="' + id + '" data-gf="title" value="' + esc(g.title || '') + '"' + ro + '>' +
        '<select aria-label="Kleur" data-g="' + id + '" data-gf="color"' + ro + '>' + Object.keys(OG_COLORS).map(function (k) { return opt(k, OG_COLORS[k], ogColor(g)); }).join('') + '</select>' +
        (S.readOnly ? '' : '<span data-delzone="' + id + '"><button type="button" class="x" aria-label="Doel verwijderen" data-d="delgoal" data-id="' + id + '">' + X_ICON + '</button></span>') + '</div>' +
        '<input type="text" aria-label="Strategie" placeholder="Strategie (S)" data-g="' + id + '" data-gf="strategy" value="' + esc(g.strategy || '') + '"' + ro + '>' +
        '<input type="text" aria-label="Meetwaarde" placeholder="Meetwaarde (M), bijv. KPI en doelwaarde" data-g="' + id + '" data-gf="measure" value="' + esc(g.measure || '') + '"' + ro + '></div>';
    }).join('') || '<p class="note">Nog geen doelen.</p>';
    if (keep) { var n = el.querySelector('[data-g="' + keep[0] + '"][data-gf="' + keep[1] + '"]'); if (n) n.focus(); }
  }
  function renderMsTasks() {
    var el = $('mTasks'); if (!el || !S.sel) return;
    var tk = tasksFor(S.sel.id);
    el.innerHTML = tk.map(function (t) { return '<li><button type="button" class="srow" data-d="opentask" data-id="' + esc(t.id) + '"><span class="tstat s-' + esc(t.status) + '">' + TSTATUS[t.status] + '</span><span class="st">' + esc(t.title || '') + '</span><span class="meta">' + esc(t.owner || '') + '</span></button></li>'; }).join('') ||
      '<li class="note">' + (S.tasksMissing ? 'De planner is nog niet geactiveerd.' : 'Nog geen taken gekoppeld.') + '</li>';
  }
  function renderCkList(force) {
    var t = S.tasks[S.sel.id], el = $('ckList'); if (!t || !el) return;
    var ck = Array.isArray(t.checklist) ? t.checklist : [];
    if (!force && el.dataset.sig === sig(ck)) {
      el.querySelectorAll('[data-ck]').forEach(function (inp) { if (inp === document.activeElement) return; var it = ck.find(function (x) { return x.id === inp.dataset.ck; }); if (!it) return; if (inp.type === 'checkbox') inp.checked = !!it.done; else if (inp.value !== (it.text || '')) inp.value = it.text || ''; });
      return;
    }
    var ro = S.readOnly ? ' disabled' : '';
    el.dataset.sig = sig(ck);
    el.innerHTML = ck.map(function (c) { var id = esc(c.id); return '<li><input type="checkbox" aria-label="Afgevinkt" data-ck="' + id + '" data-ckf="done"' + (c.done ? ' checked' : '') + ro + '><input type="text" aria-label="Checklistpunt" data-ck="' + id + '" data-ckf="text" value="' + esc(c.text || '') + '"' + ro + '>' + (S.readOnly ? '' : '<button type="button" class="x" aria-label="Punt verwijderen" data-d="delck" data-id="' + id + '">' + X_ICON + '</button>') + '</li>'; }).join('') || '<li class="note">Nog geen punten.</li>';
  }
  function contribOptions(rowId, cur) {
    if (rowId === 'art') return opt('', '— (LACE-ritme)', '');
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
        '<label class="field">Hoort bij<select id="m-row" data-f="row"' + ro + '>' + opt('art', 'LACE-ritme', m.row) + sortedOutcomes().map(function (o) { return opt(o.id, o.title || '(zonder titel)', m.row); }).join('') + '</select></label>' +
        '<label class="field">Bijdrage (baan)<select id="m-contrib" data-f="contrib"' + (S.readOnly || m.row === 'art' ? ' disabled' : '') + '>' + contribOptions(m.row, m.contrib) + '</select></label>' +
        '<label class="field">Iteratie<select id="m-iter" data-f="iter"' + ro + '>' + iterNames().map(function (n, i) { return opt(i, n, iterOf(m)); }).join('') + '</select></label></div>' +
        '<div class="sec"><h3>Leerpunt</h3><p class="note">Vooral bij leermijlpalen: wat hebben we geleerd, en wat doen we ermee?</p>' +
        '<label class="field">Wat hebben we geleerd?<textarea class="prose" id="m-learning" data-f="learning" rows="3" placeholder="bijv. teams gebruiken het dashboard alleen als het in hun sync zit"' + ro + '>' + esc(m.learning || '') + '</textarea></label>' +
        '<label class="field">Besluit<select id="m-decision" data-f="decision"' + ro + '>' + Object.keys(DECISION).map(function (k) { return opt(k, DECISION[k], m.decision || ''); }).join('') + '</select></label></div>' +
        '<div class="sec"><h3>Afhankelijkheden</h3><ul id="mDeps" class="mtasks"></ul>' +
        (S.readOnly ? '' : '<label class="field">Hangt ook af van<select id="m-adddep">' + depOptions(m) + '</select></label>') +
        '<ul id="mBlocks" class="mtasks"></ul></div>' +
        '<div class="sec"><h3>Taken</h3><ul id="mTasks" class="mtasks"></ul>' + (S.readOnly ? '' : '<button class="btn ghost" type="button" data-d="addtask" style="align-self:flex-start">+ Taak voor deze mijlpaal</button>') + '</div>' +
        '<p class="note" id="m-who">' + esc(whoLabel(m)) + '</p>';
      foot = S.readOnly ? '' : '<button class="btn" type="button" data-d="left">← Eerder</button><button class="btn" type="button" data-d="right">Later →</button><span style="flex:1"></span><span id="delZone"><button class="btn danger" type="button" data-d="askdel">Verwijderen</button></span>';
    } else if (sel.kind === 't') {
      var t = S.tasks[sel.id]; if (!t) { closeDrawer(); return; }
      title = 'Taak';
      body = '<label class="field">Taak<input id="t-title" class="big" data-f="title" type="text" value="' + esc(t.title) + '"' + ro + '></label>' +
        '<div class="two"><label class="field">Status<select id="t-status" data-f="status"' + ro + '>' + Object.keys(TSTATUS).map(function (k) { return opt(k, TSTATUS[k], t.status || 'todo'); }).join('') + '</select></label>' +
        '<label class="field">Wie<input id="t-owner" data-f="owner" type="text" list="ownerListD" value="' + esc(t.owner || '') + '" placeholder="Naam"' + ro + '></label>' +
        '<label class="field">Outcome<select id="t-outcome" data-f="outcome"' + ro + '>' + opt('', 'Run & overig', t.outcome || '') + sortedOutcomes().map(function (o) { return opt(o.id, o.title || '(zonder titel)', t.outcome || ''); }).join('') + '</select></label>' +
        '<label class="field">Mijlpaal<select id="t-milestone" data-f="milestone"' + ro + '>' + msOptions(t.outcome || '', t.milestone || '') + '</select></label>' +
        '<label class="field">Iteratie<select id="t-iter" data-f="iter"' + ro + '>' + opt('', 'Geen', t.iter == null ? '' : t.iter) + iterNames().map(function (n, i) { return opt(i, n, t.iter == null ? '' : t.iter); }).join('') + '</select></label></div>' +
        '<div class="sec"><h3>Checklist</h3><ul id="ckList" class="cklist"></ul>' + (S.readOnly ? '' : '<button class="btn ghost" type="button" data-d="addck" style="align-self:flex-start">+ Punt</button>') + '</div>' +
        '<label class="field">Notities<textarea class="prose" id="t-notes" data-f="notes" rows="4"' + ro + '>' + esc(t.notes || '') + '</textarea></label>' +
        '<datalist id="ownerListD">' + knownOwners().map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('') + '</datalist>' +
        '<p class="note" id="t-who">' + esc(whoLabel(t)) + '</p>';
      foot = S.readOnly ? '' : '<span style="flex:1"></span><span id="delZone"><button class="btn danger" type="button" data-d="askdel">Verwijderen</button></span>';
    } else if (sel.kind === 'o') {
      var o = S.outcomes[sel.id]; if (!o) { closeDrawer(); return; }
      title = 'PI-outcome';
      var goals = goalList();
      body = '<label class="field">Outcome<input id="o-title" class="big" data-f="title" type="text" value="' + esc(o.title) + '"' + ro + '></label>' +
        (S.ogsmMissing ? '' : '<div class="sec"><label class="field">OGSM-doel<select id="o-ogsm" data-f="ogsmRef"' + ro + '>' + opt('', 'Nog niet gekoppeld', o.ogsmRef || '') + goals.map(function (g) { return opt(g.id, (g.code ? g.code + ' · ' : '') + (g.title || ''), o.ogsmRef || ''); }).join('') + '</select></label>' +
          (goals.length > 1 ? '<div class="ogx"><span class="h">Draagt ook bij aan</span>' + goals.map(function (g) { return '<label class="ogxl"><input type="checkbox" data-ogx="' + esc(g.id) + '"' + ((o.ogsmExtra || []).indexOf(g.id) >= 0 ? ' checked' : '') + (g.id === o.ogsmRef ? ' disabled' : '') + ro + '>' + esc((g.code ? g.code + ' · ' : '') + (g.title || '')) + '</label>'; }).join('') + '</div>' : '') +
          (goals.length ? '' : '<p class="note">Nog geen OGSM-doelen. Vul ze in via PI-instellingen › OGSM.</p>') + '</div>') +
        '<label class="field">Hypothese<textarea class="prose" id="o-hyp" data-f="hypothesis" rows="3" placeholder="Wij geloven dat [aanpak] leidt tot [resultaat]. We weten dat het werkt als [meetbaar signaal]."' + ro + '>' + esc(o.hypothesis || '') + '</textarea></label>' +
        '<div class="three"><label class="field">Commitment<select id="o-commit" data-f="commitment"' + ro + '>' + opt('committed', 'Committed', o.commitment || 'committed') + opt('stretch', 'Stretch (uncommitted)', o.commitment || 'committed') + '</select></label>' +
        '<label class="field">BV gepland (1–10)<input id="o-bvp" data-f="bvPlanned" type="number" min="1" max="10" value="' + esc(o.bvPlanned == null ? '' : o.bvPlanned) + '"' + ro + '></label>' +
        '<label class="field">BV werkelijk (bij I&amp;A)<input id="o-bva" data-f="bvActual" type="number" min="0" max="10" value="' + esc(o.bvActual == null ? '' : o.bvActual) + '"' + ro + '></label></div>' +
        '<div class="sec ocheck"><h3>Outcome-check <span id="ochkBadge">' + checkBadge(o) + '</span></h3><p class="note">Toets samen of deze outcome haalbaar is. Vink af wat klopt.</p>' +
          OCHECK.map(function (x) {
            return '<label class="ochkrow"><input type="checkbox" data-ochk="' + x.k + '"' + ((o.checks || {})[x.k] ? ' checked' : '') + ro + '><span class="ochktext"><b>' + x.q + '</b><span>' + x.d + '</span>' +
              '<span class="ochkhint" data-ochkhint="' + x.k + '">' + esc(checkHint(Object.assign({ id: sel.id }, o), x.k)) + '</span></span></label>';
          }).join('') + '</div>' +
        '<div class="sec"><h3>Key results</h3><div style="overflow-x:auto"><div class="grid krgrid"><span class="h">Wat meten we</span><span class="h">Soort</span><span class="h">Start</span><span class="h">Doel</span><span class="h">Nu</span><span class="h unit">Eenheid</span><span></span></div><div id="krList" class="sec"></div></div>' +
        (S.readOnly ? '' : '<button class="btn ghost" type="button" data-d="addkr" style="align-self:flex-start">+ Key result</button>') + '</div>' +
        '<div class="sec"><h3>Bijdragen (wie doet wat)</h3><div id="cList" class="sec"></div>' +
        (S.readOnly ? '' : '<button class="btn ghost" type="button" data-d="addc" style="align-self:flex-start">+ Bijdrage</button>') + '</div>' +
        '<div class="sec"><h3>Check-ins</h3><p class="note">Elke iteratie: hoe zeker zijn we dat deze outcome gehaald wordt, en wat zien we?</p>' +
        (S.readOnly ? '' : '<div class="cigrid"><label class="field">Vertrouwen<select id="ci-conf">' + [5, 4, 3, 2, 1].map(function (n) { return opt(n, n + ' – ' + CONF[n], 3); }).join('') + '</select></label>' +
        '<label class="field">Toelichting<input id="ci-note" type="text" placeholder="Wat zien we, wat zit tegen?"></label>' +
        '<button class="btn primary" type="button" data-d="addci">Check-in toevoegen</button></div>') +
        '<ul id="ciList" class="cilist"></ul></div>' +
        '<p class="note" id="o-who">' + esc(whoLabel(o)) + '</p>';
      foot = S.readOnly ? '' : '<button class="btn" type="button" data-d="up">↑ Omhoog</button><button class="btn" type="button" data-d="down">↓ Omlaag</button><span style="flex:1"></span><span id="delZone"><button class="btn danger" type="button" data-d="askdel">Verwijderen</button></span>';
    } else {
      var s = S.settings;
      title = 'PI-instellingen';
      body = '<label class="field">Naam van de PI<input id="s-name" data-s="piName" type="text" placeholder="bijv. PI 2027.1" value="' + esc(s.piName || '') + '"' + ro + '></label>' +
        '<div class="two"><label class="field">Start iteratie 1<input id="s-start" data-s="piStart" type="date" value="' + esc(s.piStart) + '"' + ro + '></label>' +
        '<label class="field">Lengte iteratie<select id="s-weeks" data-s="iterationWeeks"' + ro + '>' + [1, 2, 3, 4].map(function (w) { return opt(w, w + (w === 1 ? ' week' : ' weken'), num(s.iterationWeeks) || 2); }).join('') + '</select></label></div>' +
        '<div class="two"><label class="field">Aantal iteraties<select id="s-count" data-s="iterationCount"' + ro + '>' + [2, 3, 4, 5, 6].map(function (n) { return opt(n, n + ' iteraties', num(s.iterationCount) || 4); }).join('') + '</select></label>' +
        '<label class="field">IP-iteratie<select id="s-ip" data-s="ipIteration"' + ro + '>' + opt('true', 'Ja, aparte IP-iteratie', String(s.ipIteration !== false)) + opt('false', 'Nee', String(s.ipIteration !== false)) + '</select></label></div>' +
        '<p class="note">Na de laatste iteratie volgt altijd een kolom voor de volgende PI. Deze instellingen gelden voor iedereen.</p>' +
        (S.ogsmMissing ? '<div class="sec"><h3>OGSM</h3><p class="note">OGSM is nog niet geactiveerd. Voer supabase/migrations/007_ogsm.sql uit in Supabase.</p></div>' :
        '<div class="sec" id="ogSection"><h3>OGSM</h3><p class="note">Vul de ambitie en de doelen uit jullie OGSM in. Outcomes koppel je daarna aan een doel; het bord groepeert ze per doel.</p>' +
        '<label class="field">Ambitie (Objective)<input id="og-obj" data-ogobj="1" type="text" value="' + esc(objective()) + '" placeholder="De ambitie uit jullie OGSM"' + ro + '></label>' +
        '<div id="ogList" class="sec"></div>' + (S.readOnly ? '' : '<button class="btn ghost" type="button" data-d="addgoal" style="align-self:flex-start">+ Doel</button>') + '</div>') +
        (S.readOnly ? '' : '<div class="sec"><h3>Gegevens overnemen</h3><p class="note">Plak hier de tekst uit “Delen / importeren” van het eerdere canvas-bord. Outcomes en mijlpalen worden toegevoegd aan dit bord.</p>' +
        '<label class="field">Bordgegevens<textarea id="s-import" rows="6"></textarea></label><div class="actions"><button class="btn" type="button" data-d="import">Toevoegen aan bord</button><span class="msg" id="importMsg" role="status"></span></div></div>');
    }
    r.innerHTML = '<div class="scrim" data-d="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">' +
      '<div class="dhead"><h2 id="dTitle">' + title + '</h2><button class="btn" type="button" data-d="close">Klaar</button></div>' +
      '<div class="dbody">' + body + '</div>' + (foot ? '<div class="dfoot">' + foot + '</div>' : '') + '</aside>';
    if (sel.kind === 'o') { renderKrList(true); renderCList(true); renderCiList(true); }
    if (sel.kind === 't') renderCkList(true);
    if (sel.kind === 's') renderOgList(true);
    if (sel.kind === 'm') { renderMsTasks(); renderMsDeps(); }
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
          '<select aria-label="Soort indicator" data-kr="' + id + '" data-kf="kind"' + ro + '>' + Object.keys(KIND).map(function (kk) { return opt(kk, KIND[kk], k.kind || ''); }).join('') + '</select>' +
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
  function renderCiList(force) {
    var o = S.outcomes[S.sel.id], el = $('ciList'); if (!o || !el) return;
    var cis = checkinsOf(o).reverse();
    if (!force && el.dataset.sig === sig(cis)) return;
    el.dataset.sig = sig(cis);
    el.innerHTML = cis.map(function (c) {
      var d = new Date(c.date);
      return '<li><span class="conf c-' + confClass(c.confidence) + '">' + num(c.confidence) + '/5</span><span class="cimeta">' + esc((isNaN(d) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })) + (c.by ? ' · ' + c.by : '')) + '</span>' +
        '<span class="citext">' + esc(c.note || '') + '</span>' +
        (S.readOnly ? '' : '<button type="button" class="x" aria-label="Check-in verwijderen" data-d="delci" data-id="' + esc(c.id) + '">' + X_ICON + '</button>') + '</li>';
    }).join('') || '<li class="note">Nog geen check-ins.</li>';
  }
  function syncInputs(scope) {
    var o = S.sel && S.sel.kind === 'o' ? S.outcomes[S.sel.id] : null;
    scope.querySelectorAll('input[data-kr],select[data-kr],input[data-c]').forEach(function (inp) {
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
      renderMsTasks(); renderMsDeps();
    } else if (sel.kind === 't') {
      var t = S.tasks[sel.id]; if (!t) { closeDrawer(); toast('Deze taak is verwijderd.'); return; }
      r.querySelectorAll('[data-f]').forEach(function (el) { if (el === document.activeElement) return; var v = t[el.dataset.f]; v = v == null ? '' : v; if (String(el.value) !== String(v)) el.value = v; });
      renderCkList(false);
      var w3 = $('t-who'); if (w3) w3.textContent = whoLabel(t);
    } else if (sel.kind === 'o') {
      var o = S.outcomes[sel.id]; if (!o) { closeDrawer(); toast('Deze outcome is verwijderd.'); return; }
      r.querySelectorAll('.dbody > .field [data-f], .dbody > .three [data-f]').forEach(function (el) {
        if (el === document.activeElement) return;
        var f = el.dataset.f, v = o[f]; if (f === 'commitment' && !v) v = 'committed';
        v = v == null ? '' : v; if (String(el.value) !== String(v)) el.value = v;
      });
      renderKrList(false); renderCList(false); renderCiList(false);
      r.querySelectorAll('[data-ochk]').forEach(function (c) { if (c !== document.activeElement) c.checked = !!(o.checks || {})[c.dataset.ochk]; });
      r.querySelectorAll('[data-ochkhint]').forEach(function (h) { h.textContent = checkHint(Object.assign({ id: sel.id }, o), h.dataset.ochkhint); });
      var bd2 = $('ochkBadge'); if (bd2) bd2.innerHTML = checkBadge(o);
      var w2 = $('o-who'); if (w2) w2.textContent = whoLabel(o);
    } else {
      r.querySelectorAll('[data-s]').forEach(function (el) { if (el !== document.activeElement) { var v = S.settings[el.dataset.s]; if (v != null && String(el.value) !== String(v)) el.value = v; } });
      var ob = $('og-obj'); if (ob && ob !== document.activeElement && ob.value !== objective()) ob.value = objective();
      renderOgList(false);
    }
  }

  var settingsTimer = null;
  function writeSettings(patch, delay) {
    Object.assign(S.settings, patch); renderHeader(); renderViews();
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(function () { track(S.sb.from('settings').upsert(toRow(Object.assign({ id: 'pi' }, S.settings, meta())))); }, delay == null ? 450 : delay);
  }

  $('drawerRoot').addEventListener('input', function (e) {
    var el = e.target, sel = S.sel; if (!sel || !S.ready || S.readOnly) return;
    if (el.dataset.ogobj) {
      if (S.ogsm.objective) queue('ogsm', 'objective', { title: el.value });
      else insert('ogsm', 'objective', Object.assign({ kind: 'objective', title: el.value, order: 0 }, meta()));
      renderOgsmBanner(); return;
    }
    if (el.dataset.g) {
      var pg = {}; pg[el.dataset.gf] = el.dataset.gf === 'color' ? num(el.value) : el.value;
      queue('ogsm', el.dataset.g, pg, el.tagName === 'SELECT' ? 0 : 450);
      if (el.dataset.gf === 'color') { var card = el.closest('.ogedit'); if (card) card.className = 'ogedit ogc-' + num(el.value); }
      return;
    }
    if (el.dataset.s) {
      var v = (el.dataset.s === 'iterationWeeks' || el.dataset.s === 'iterationCount') ? num(el.value) : el.dataset.s === 'ipIteration' ? el.value === 'true' : el.value;
      if (el.dataset.s === 'piStart' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      var p = {}; p[el.dataset.s] = v; writeSettings(p, el.tagName === 'SELECT' ? 0 : 450); return;
    }
    if (sel.kind === 't') {
      var tk = S.tasks[sel.id]; if (!tk) return;
      if (el.dataset.ck) {
        if (el.type === 'checkbox') return;
        var ck = clone(tk.checklist || []); ck.forEach(function (c) { if (c.id === el.dataset.ck) c.text = el.value; });
        queue('tasks', sel.id, { checklist: ck }); return;
      }
      if (el.dataset.f) {
        var pt = {}, ft = el.dataset.f;
        pt[ft] = ft === 'iter' ? (el.value === '' ? null : num(el.value)) : el.value;
        if (ft === 'outcome') { pt.milestone = ''; var msel = $('t-milestone'); if (msel) msel.innerHTML = msOptions(el.value, ''); }
        if (ft === 'milestone' && el.value) { var mm0 = S.milestones[el.value]; if (mm0 && (tk.iter == null || tk.iter === '')) { pt.iter = iterOf(mm0); var isel = $('t-iter'); if (isel) isel.value = String(pt.iter); } }
        queue('tasks', sel.id, pt, el.tagName === 'SELECT' ? 0 : 450);
      }
      return;
    }
    if (sel.kind === 'm' && el.id === 'm-adddep') {
      if (!el.value) return;
      var mx = S.milestones[sel.id]; if (!mx) return;
      var nd = depsOf(Object.assign({ id: sel.id }, mx)).concat([el.value]);
      queue('milestones', sel.id, { dependsOn: nd }, 0); renderMsDeps(); drawDeps(); return;
    }
    if (sel.kind === 'm' && el.dataset.f) {
      var pm = {}; pm[el.dataset.f] = el.dataset.f === 'iter' ? num(el.value) : el.value;
      if (el.dataset.f === 'row') { pm.contrib = ''; var cSel = $('m-contrib'); if (cSel) { cSel.innerHTML = contribOptions(el.value, ''); cSel.disabled = el.value === 'art'; } if (el.value !== 'art') setFocus(el.value); }
      if (el.dataset.f === 'contrib') { var mm = S.milestones[sel.id]; if (mm && mm.row !== 'art') setFocus(mm.row); }
      if (el.dataset.f === 'status' && el.value === 'done') { var ml = S.milestones[sel.id]; if (ml && ml.type === 'learn' && !ml.learning) { var lt = $('m-learning'); if (lt) { lt.focus(); lt.scrollIntoView({ block: 'center' }); } toast('Gehaald! Wat hebben we geleerd? Vul het leerpunt in.'); } }
      queue('milestones', sel.id, pm, el.tagName === 'SELECT' ? 0 : 450); return;
    }
    if (sel.kind === 'o') {
      var o = S.outcomes[sel.id]; if (!o) return;
      if (el.dataset.f === 'ogsmRef') { $('drawerRoot').querySelectorAll('[data-ogx]').forEach(function (c) { c.disabled = c.dataset.ogx === el.value; }); }
      if (el.dataset.f) {
        var po = {}, f0 = el.dataset.f;
        if (f0 === 'bvPlanned' || f0 === 'bvActual') po[f0] = el.value === '' ? null : Math.max(0, Math.min(10, num(el.value)));
        else po[f0] = el.value;
        queue('outcomes', sel.id, po, el.tagName === 'SELECT' ? 0 : 450); return;
      }
      if (el.dataset.kr) { var krs = clone(o.krs || []); krs.forEach(function (k) { if (k.id === el.dataset.kr) { var f = el.dataset.kf; k[f] = (f === 'text' || f === 'unit' || f === 'kind') ? el.value : (el.value === '' ? '' : Number(el.value)); } }); queue('outcomes', sel.id, { krs: krs }); return; }
      if (el.dataset.c) { var cs = clone(o.contribs || []); cs.forEach(function (c) { if (c.id === el.dataset.c) c[el.dataset.cf] = el.value; }); queue('outcomes', sel.id, { contribs: cs }); }
    }
  });

  $('drawerRoot').addEventListener('change', function (e) {
    var el = e.target, sel = S.sel;
    if (sel && sel.kind === 'o' && el.dataset.ochk && !S.readOnly) {
      var oc = S.outcomes[sel.id]; if (!oc) return;
      var ck = Object.assign({}, oc.checks || {}); ck[el.dataset.ochk] = el.checked;
      queue('outcomes', sel.id, { checks: ck }, 0);
      var bd = $('ochkBadge'); if (bd) bd.innerHTML = checkBadge(S.outcomes[sel.id]);
      return;
    }
    if (sel && sel.kind === 'o' && el.dataset.ogx && !S.readOnly) {
      var ox = S.outcomes[sel.id]; if (!ox) return;
      var ex = (Array.isArray(ox.ogsmExtra) ? ox.ogsmExtra : []).filter(function (id) { return id !== el.dataset.ogx; });
      if (el.checked) ex.push(el.dataset.ogx);
      queue('outcomes', sel.id, { ogsmExtra: ex }, 0); return;
    }
    if (!sel || sel.kind !== 't' || el.type !== 'checkbox' || !el.dataset.ck || S.readOnly) return;
    var tk = S.tasks[sel.id]; if (!tk) return;
    var ck = clone(tk.checklist || []); ck.forEach(function (c) { if (c.id === el.dataset.ck) c.done = el.checked; });
    queue('tasks', sel.id, { checklist: ck }, 0);
  });

  $('drawerRoot').addEventListener('click', function (e) {
    var b = e.target.closest('[data-d]'); if (!b) return;
    var d = b.dataset.d, sel = S.sel;
    if (d === 'close') return closeDrawer();
    if (!S.ready || S.readOnly || !sel) return;
    if (d === 'opentask') { openDrawer({ kind: 't', id: b.dataset.id }); return; }
    if (sel.kind === 't') {
      var tk = S.tasks[sel.id]; if (!tk) return;
      if (d === 'addck') { var ck = clone(tk.checklist || []); ck.push({ id: rid('k'), text: '', done: false }); queue('tasks', sel.id, { checklist: ck }, 0); renderCkList(true); var ci2 = $('ckList').querySelectorAll('input[data-ckf="text"]'); if (ci2.length) ci2[ci2.length - 1].focus(); }
      else if (d === 'delck') { queue('tasks', sel.id, { checklist: (tk.checklist || []).filter(function (c) { return c.id !== b.dataset.id; }) }, 0); renderCkList(true); }
      else if (d === 'askdel') $('delZone').innerHTML = '<span class="confirm">Taak verwijderen? <button class="btn danger" type="button" data-d="del">Ja, verwijderen</button><button class="btn" type="button" data-d="nodel">Nee</button></span>';
      else if (d === 'nodel') $('delZone').innerHTML = '<button class="btn danger" type="button" data-d="askdel">Verwijderen</button>';
      else if (d === 'del') { delete pending['tasks/' + sel.id]; delete S.tasks[sel.id]; track(S.sb.from('tasks').delete().eq('id', sel.id)); S.sel = null; $('drawerRoot').innerHTML = ''; renderAll(); toast('Taak verwijderd.'); }
      return;
    }
    if (sel.kind === 'm') {
      var m = S.milestones[sel.id]; if (!m) return;
      if (d === 'deldep') { queue('milestones', sel.id, { dependsOn: depsOf(Object.assign({ id: sel.id }, m)).filter(function (x) { return x !== b.dataset.id; }) }, 0); renderMsDeps(); return; }
      if (d === 'addtask') { addTask({ outcome: m.row === 'art' ? '' : m.row, milestone: m.id, iter: iterOf(m) }); return; }
      if (d === 'left' || d === 'right') { queue('milestones', sel.id, { iter: Math.max(0, Math.min(lastCol(), iterOf(m) + (d === 'left' ? -1 : 1))) }, 0); syncDrawer(); }
      else if (d === 'askdel') $('delZone').innerHTML = '<span class="confirm">Mijlpaal verwijderen? <button class="btn danger" type="button" data-d="del">Ja, verwijderen</button><button class="btn" type="button" data-d="nodel">Nee</button></span>';
      else if (d === 'nodel') $('delZone').innerHTML = '<button class="btn danger" type="button" data-d="askdel">Verwijderen</button>';
      else if (d === 'del') { var gone = sel.id; blockedBy(gone).forEach(function (x) { queue('milestones', x.id, { dependsOn: depsOf(x).filter(function (y) { return y !== gone; }) }, 0); }); unlinkTasks('milestone', sel.id); delete pending['milestones/' + sel.id]; delete S.milestones[sel.id]; track(S.sb.from('milestones').delete().eq('id', sel.id)); S.sel = null; $('drawerRoot').innerHTML = ''; renderAll(); toast('Mijlpaal verwijderd.'); }
      return;
    }
    if (sel.kind === 'o') {
      var o = S.outcomes[sel.id]; if (!o) return;
      if (d === 'addkr') { var krs = clone(o.krs || []); krs.push({ id: rid('k'), text: '', start: 0, target: 100, current: 0, unit: '%' }); queue('outcomes', sel.id, { krs: krs }, 0); renderKrList(true); var ins = $('krList').querySelectorAll('input[data-kf="text"]'); if (ins.length) ins[ins.length - 1].focus(); }
      else if (d === 'addci') {
        var cis = clone(Array.isArray(o.checkins) ? o.checkins : []);
        cis.push({ id: rid('ci'), date: new Date().toISOString(), confidence: num($('ci-conf').value) || 3, note: $('ci-note').value.trim(), by: myName() || '' });
        queue('outcomes', sel.id, { checkins: cis }, 0); $('ci-note').value = ''; renderCiList(true); toast('Check-in opgeslagen.');
      }
      else if (d === 'delci') { queue('outcomes', sel.id, { checkins: (o.checkins || []).filter(function (c) { return c.id !== b.dataset.id; }) }, 0); renderCiList(true); }
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
        unlinkTasks('outcome', oid);
        track(S.sb.from('milestones').delete().eq('row_ref', oid));
        track(S.sb.from('outcomes').delete().eq('id', oid));
        S.sel = null; $('drawerRoot').innerHTML = ''; renderAll(); toast('Outcome verwijderd.');
      }
      return;
    }
    if (sel.kind === 's' && d === 'addgoal') {
      var n0 = goalList().length, gid = rid('g');
      insert('ogsm', gid, Object.assign({ kind: 'goal', code: 'G' + (n0 + 1), title: '', strategy: '', measure: '', color: (n0 % 6) + 1, order: n0 + 1 }, meta()));
      renderOgList(true); var ti = $('ogList').querySelector('[data-g="' + gid + '"][data-gf="title"]'); if (ti) ti.focus(); renderAll();
      return;
    }
    if (sel.kind === 's' && d === 'delgoal') {
      var z = $('drawerRoot').querySelector('[data-delzone="' + b.dataset.id + '"]');
      if (z) z.innerHTML = '<span class="confirm">Verwijderen? <button class="btn danger" type="button" data-d="delgoal2" data-id="' + esc(b.dataset.id) + '">Ja</button></span>';
      return;
    }
    if (sel.kind === 's' && d === 'delgoal2') {
      var did = b.dataset.id;
      sortedOutcomes().forEach(function (o) {
        var p2 = {}; if (o.ogsmRef === did) p2.ogsmRef = '';
        if (Array.isArray(o.ogsmExtra) && o.ogsmExtra.indexOf(did) >= 0) p2.ogsmExtra = o.ogsmExtra.filter(function (x) { return x !== did; });
        if (Object.keys(p2).length) queue('outcomes', o.id, p2, 0);
      });
      delete pending['ogsm/' + did]; delete S.ogsm[did];
      track(S.sb.from('ogsm').delete().eq('id', did));
      renderOgList(true); renderAll(); toast('Doel verwijderd.');
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
      var id = rid('m'), body = Object.assign({ row: row, iter: Math.max(0, Math.min(lastCol(), num(m.iter))), title: String(m.title || ''), type: TYPES[m.type] ? m.type : 'learn', status: STATUS[m.status] ? m.status : 'planned', createdAt: now }, meta());
      S.milestones[id] = body; msRows.push(toRow(Object.assign({ id: id }, body)));
    });
    if (outRows.length) track(S.sb.from('outcomes').insert(outRows));
    if (msRows.length) track(S.sb.from('milestones').insert(msRows));
    $('s-import').value = '';
    msg.textContent = outRows.length + ' outcomes en ' + msRows.length + ' mijlpalen toegevoegd.';
    renderAll();
  }

  /* ---------- weergaven (tabs) ---------- */
  var VIEWS = { board: 'viewBoard', planner: 'viewPlanner', sync: 'viewSync' };
  function setView(v, fromHash) {
    if (!VIEWS[v]) v = 'board';
    S.view = v;
    Object.keys(VIEWS).forEach(function (k) { $(VIEWS[k]).hidden = k !== v; });
    document.querySelectorAll('.tab').forEach(function (t) { if (t.dataset.view === v) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    if (!fromHash) { try { history.replaceState(null, '', v === 'board' ? location.pathname + location.search : '#' + v); } catch (e) {} }
    if (v !== 'sync') stopTimer();
    renderViews();
  }
  document.querySelector('.tabs').addEventListener('click', function (e) { var t = e.target.closest('.tab'); if (t) setView(t.dataset.view); });
  window.addEventListener('hashchange', function () { setView(location.hash.slice(1) || 'board', true); });

  function renderViews() {
    renderBoard();
    if (S.view === 'planner') renderPlanner();
    if (S.view === 'sync') renderSync();
  }

  /* ---------- taken ---------- */
  var TSTATUS = { todo: 'Te doen', doing: 'Bezig', waiting: 'Wacht op', done: 'Klaar' };
  var WIP_LIMIT = 3;
  function taskList() { return Object.keys(S.tasks).map(function (id) { return Object.assign({ id: id }, S.tasks[id]); }).sort(function (a, b) { return num(a.order) - num(b.order) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')); }); }
  function tasksFor(mid) { return taskList().filter(function (t) { return t.milestone === mid; }); }
  function taskLate(t, T) { return t.status !== 'done' && t.iter != null && t.iter !== '' && T.nowIdx >= 0 && num(t.iter) < T.nowIdx; }
  function ownerKey(s) { return String(s || '').trim().toLowerCase(); }
  function knownOwners() {
    var set = {};
    sortedOutcomes().forEach(function (o) { (o.contribs || []).forEach(function (c) { if (c.owner) set[c.owner] = 1; }); });
    taskList().forEach(function (t) { if (t.owner) set[t.owner] = 1; });
    var me = myName(); if (me) set[me] = 1;
    return Object.keys(set).sort();
  }
  function addTask(d) {
    if (S.tasksMissing) { toast('De planner is nog niet geactiveerd. Voer supabase/migrations/005_planner_taken.sql uit in Supabase.'); return; }
    var id = rid('t');
    insert('tasks', id, Object.assign({ title: 'Nieuwe taak', outcome: '', milestone: '', owner: myName() || '', status: 'todo', iter: null, checklist: [], notes: '', order: Date.now(), createdAt: new Date().toISOString() }, d || {}, meta()));
    openDrawer({ kind: 't', id: id });
  }
  function tcard(t, T) {
    var ck = Array.isArray(t.checklist) ? t.checklist : [], ckDone = ck.filter(function (c) { return c.done; }).length;
    var m = t.milestone ? S.milestones[t.milestone] : null;
    var late = taskLate(t, T), sel = S.sel && S.sel.kind === 't' && S.sel.id === t.id;
    var names = iterNames();
    return '<button type="button" class="tcard' + (late ? ' late' : '') + (t.status === 'done' ? ' done' : '') + (sel ? ' sel' : '') + '" data-pact="task" data-id="' + esc(t.id) + '">' +
      '<span class="tt">' + esc(t.title || '(zonder titel)') + '</span>' +
      (m ? '<span class="tms">' + diamond(m.type, 10) + esc(m.title || '') + '</span>' : '') +
      '<span class="tmeta">' + (t.owner ? '<span class="who-chip">' + esc(t.owner) + '</span>' : '<span class="who-chip empty">Niemand</span>') +
      (t.iter != null && t.iter !== '' ? '<span>' + esc(names[num(t.iter)] || '') + '</span>' : '') +
      (ck.length ? '<span class="num">☑ ' + ckDone + '/' + ck.length + '</span>' : '') +
      (t.notes ? '<span>notitie</span>' : '') +
      (late ? '<span class="late-l">Te laat</span>' : '') + '</span></button>';
  }

  function plannerFilter(t, T) {
    var f = S.pf || {};
    if (f.mine) { var me = ownerKey(myName()); if (!me || ownerKey(t.owner) !== me) return false; }
    if (f.iter && !(t.iter != null && t.iter !== '' && num(t.iter) === T.nowIdx)) return false;
    if (f.blocked && !(t.status === 'waiting' || taskLate(t, T))) return false;
    if (f.outcome && (t.outcome || '') !== (f.outcome === '_run' ? '' : f.outcome)) return false;
    return true;
  }

  function renderPlanner() {
    var el = $('planner'); if (!el) return;
    if (!S.ready) { el.innerHTML = '<div class="empty">Planner laden…</div>'; return; }
    if (S.tasksMissing) {
      el.innerHTML = '<div class="empty"><b>De planner is nog niet geactiveerd.</b> Voer in Supabase het script <code>supabase/migrations/005_planner_taken.sql</code> uit en herlaad de pagina.</div>';
      return;
    }
    var T = timeInfo(), f = S.pf || {}, outs = sortedOutcomes(), all = taskList();
    var rows = outs.map(function (o) { return { id: o.id, title: o.title || '(zonder titel)' }; }).concat([{ id: '', title: 'Run & overig', run: true }]);
    if (f.outcome) rows = rows.filter(function (r) { return f.outcome === '_run' ? r.run : r.id === f.outcome; });
    var shown = all.filter(function (t) { return plannerFilter(t, T); });
    var wip = {}; all.forEach(function (t) { if (t.status === 'doing' && t.owner) { var k = t.owner; wip[k] = (wip[k] || 0) + 1; } });
    var over = Object.keys(wip).filter(function (k) { return wip[k] > WIP_LIMIT; });
    var counts = {}; Object.keys(TSTATUS).forEach(function (s) { counts[s] = shown.filter(function (t) { return t.status === s; }).length; });

    var h = '<div class="ptools">' +
      '<div class="seg" role="group" aria-label="Filters">' +
      '<button type="button" class="chipbtn" data-pf="mine" aria-pressed="' + !!f.mine + '">Mijn taken</button>' +
      '<button type="button" class="chipbtn" data-pf="iter" aria-pressed="' + !!f.iter + '">Deze iteratie</button>' +
      '<button type="button" class="chipbtn" data-pf="blocked" aria-pressed="' + !!f.blocked + '">Vastgelopen of te laat</button></div>' +
      '<label class="pfield" for="pf-outcome">Outcome <select id="pf-outcome">' + opt('', 'Alle outcomes', f.outcome || '') + outs.map(function (o) { return opt(o.id, o.title || '(zonder titel)', f.outcome || ''); }).join('') + opt('_run', 'Run & overig', f.outcome || '') + '</select></label>' +
      '<span style="flex:1"></span>' +
      (S.readOnly ? '' : '<button type="button" class="btn primary" data-pact="add">+ Taak</button>') + '</div>';
    if (over.length) h += '<p class="wipwarn">Te veel tegelijk: ' + over.map(function (k) { return esc(k) + ' heeft ' + wip[k] + ' taken bezig'; }).join(', ') + ' (afspraak: maximaal ' + WIP_LIMIT + ').</p>';
    if (f.mine && !myName()) h += '<p class="wipwarn">Vul rechtsboven je naam in om je eigen taken te zien.</p>';

    h += '<div class="pbox"><div class="pgrid">' +
      '<div class="ph">Outcome</div>' + Object.keys(TSTATUS).map(function (s) { return '<div class="ph s-' + s + '">' + TSTATUS[s] + ' <span class="cnt">' + counts[s] + '</span></div>'; }).join('');
    rows.forEach(function (r) {
      var rt = all.filter(function (t) { return (t.outcome || '') === r.id && (r.run || S.outcomes[t.outcome]); });
      if (r.run) rt = all.filter(function (t) { return !t.outcome || !S.outcomes[t.outcome]; });
      var done = rt.filter(function (t) { return t.status === 'done'; }).length;
      h += '<div class="plabel' + (r.run ? ' run' : '') + '"><b>' + esc(r.title) + '</b><span class="meta">' + done + '/' + rt.length + ' klaar</span></div>';
      Object.keys(TSTATUS).forEach(function (s) {
        var cards = rt.filter(function (t) { return t.status === s && plannerFilter(t, T); }).map(function (t) { return tcard(t, T); }).join('');
        h += '<div class="pcell s-' + s + '" data-tdrop-outcome="' + esc(r.id) + '" data-tdrop-status="' + s + '">' + cards +
          (S.readOnly ? '' : '<button type="button" class="add" data-pact="addhere" data-outcome="' + esc(r.id) + '" data-status="' + s + '" aria-label="Taak toevoegen: ' + esc(r.title) + ', ' + TSTATUS[s] + '">+</button>') + '</div>';
      });
    });
    h += '</div></div>';
    h += '<datalist id="ownerList">' + knownOwners().map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('') + '</datalist>';
    el.innerHTML = h;
  }

  $('planner').addEventListener('click', function (e) {
    if (drag.suppress) { drag.suppress = false; return; }
    var pf = e.target.closest('[data-pf]');
    if (pf) { S.pf = S.pf || {}; S.pf[pf.dataset.pf] = !S.pf[pf.dataset.pf]; saveView(); renderPlanner(); return; }
    var b = e.target.closest('[data-pact]'); if (!b) return;
    var a = b.dataset.pact;
    if (a === 'task') openDrawer({ kind: 't', id: b.dataset.id });
    else if (a === 'add' && !S.readOnly) { var fo = (S.pf || {}).outcome; addTask({ outcome: fo && fo !== '_run' ? fo : '', iter: timeInfo().nowIdx >= 0 ? timeInfo().nowIdx : null }); }
    else if (a === 'addhere' && !S.readOnly) addTask({ outcome: b.dataset.outcome, status: b.dataset.status, iter: timeInfo().nowIdx >= 0 ? timeInfo().nowIdx : null });
  });
  $('planner').addEventListener('change', function (e) {
    if (e.target.id === 'pf-outcome') { S.pf = S.pf || {}; S.pf.outcome = e.target.value; saveView(); renderPlanner(); }
  });

  /* ---------- weekly sync ---------- */
  var timer = { left: 300, running: false, h: null };
  function fmtTime(s) { var m = Math.floor(Math.max(0, s) / 60), r = Math.max(0, s) % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
  function paintTimer() {
    var el = $('stime'), btn = $('sTimerBtn'); if (!el) return;
    el.textContent = timer.left > 0 ? fmtTime(timer.left) : 'Tijd!';
    el.classList.toggle('over', timer.left <= 0);
    if (btn) btn.textContent = timer.running ? 'Pauze' : (timer.left < 300 ? 'Verder' : 'Start timer');
  }
  function startTimer() { if (timer.running) return; timer.running = true; timer.h = setInterval(function () { timer.left--; paintTimer(); if (timer.left <= -600) stopTimer(); }, 1000); paintTimer(); }
  function stopTimer() { timer.running = false; clearInterval(timer.h); timer.h = null; paintTimer(); }
  function resetTimer(keep) { var was = timer.running; stopTimer(); timer.left = 300; if (keep && was) startTimer(); paintTimer(); }

  function renderSync() {
    var el = $('sync'); if (!el) return;
    if (!S.ready) { el.innerHTML = '<div class="empty">Laden…</div>'; return; }
    var a = document.activeElement, keepNote = $('sync-ci-note') ? $('sync-ci-note').value : '', keepConf = $('sync-ci-conf') ? $('sync-ci-conf').value : '3', hadFocus = a && a.id;
    var T = timeInfo(), outs = sortedOutcomes(), ms = msList(), tasks = taskList(), names = iterNames();
    var n = outs.length + 1;
    S.syncIdx = Math.max(0, Math.min(n - 1, num(S.syncIdx)));
    var i = S.syncIdx, o = outs[i];
    var nav = '<div class="sdots" role="group" aria-label="Onderdelen">' + outs.map(function (x, k) {
      return '<button type="button" class="sdot' + (k === i ? ' on' : '') + '" data-sact="go" data-i="' + k + '" aria-label="' + esc(x.title || 'Outcome') + '"' + (k === i ? ' aria-current="step"' : '') + '>' + (k + 1) + '</button>';
    }).join('') + '<button type="button" class="sdot' + (i === n - 1 ? ' on' : '') + '" data-sact="go" data-i="' + (n - 1) + '" aria-label="Afronden">✓</button></div>';
    var head = '<div class="shead"><div><p class="eyebrow">Weekly sync · ' + (o ? 'outcome ' + (i + 1) + ' van ' + outs.length : 'afronden') + '</p>' +
      '<h2>' + esc(o ? (o.title || '(zonder titel)') : 'Afronden') + '</h2></div>' +
      '<div class="stimer"><span id="stime" class="num">5:00</span><button type="button" class="btn" id="sTimerBtn" data-sact="timer">Start timer</button><button type="button" class="btn" data-sact="reset" aria-label="Timer opnieuw">↺</button></div>' +
      '<div class="snav"><button type="button" class="btn" data-sact="prev"' + (i === 0 ? ' disabled' : '') + '>← Vorige</button><button type="button" class="btn primary" data-sact="next"' + (i === n - 1 ? ' disabled' : '') + '>Volgende →</button></div></div>';

    var body;
    if (o) {
      var st = outcomeStats(o, T, ms), cis = checkinsOf(o), last = cis[cis.length - 1];
      var thisWeek = last && daysSince(last.date) != null && daysSince(last.date) < 7;
      var krs = Array.isArray(o.krs) ? o.krs : [];
      var c1 = '<section class="sbox"><div class="otop"><span class="pill h-' + st.health + '">' + HEALTH[st.health] + '</span>' + (o.commitment === 'stretch' ? '<span class="tag">Stretch</span>' : '') + '</div>' +
        '<div class="bar"><div class="fill f-' + st.health + '" style="width:' + st.pct + '%"></div><div class="exp" style="left:' + T.expected + '%"></div></div>' +
        '<span class="meta"><span class="num" style="color:var(--ink)">' + st.pct + '%</span> gerealiseerd · verwacht ' + T.expected + '%</span>' +
        (o.hypothesis ? '<p class="hyp"><span class="lbl">Hypothese</span>' + esc(o.hypothesis) + '</p>' : '') +
        '<ul class="krs">' + krs.map(function (k) { var p = krPct(k), u = k.unit || ''; return '<li><span class="kt">' + hiNums(k.text) + '</span><span class="kv"><span class="bar thin"><span class="fill" style="display:block;width:' + p + '%;background:var(--muted)"></span></span><span class="num">' + esc(num(k.current) + u + ' / ' + num(k.target) + u) + '</span></span></li>'; }).join('') + '</ul>' +
        '<div class="sci"><h3>Check-in</h3>' + (last ? '<p class="meta">Vorige: <span class="conf c-' + confClass(last.confidence) + '">' + num(last.confidence) + '/5</span> ' + esc(agoLabel(daysSince(last.date))) + (last.note ? ' · “' + esc(last.note) + '”' : '') + '</p>' : '<p class="meta">Nog geen check-in.</p>') +
        (thisWeek ? '<p class="okmsg">Deze week al ingecheckt.</p>' : '') +
        (S.readOnly ? '' : '<div class="cigrid"><label class="field">Vertrouwen<select id="sync-ci-conf">' + [5, 4, 3, 2, 1].map(function (k) { return opt(k, k + ' – ' + CONF[k], keepConf); }).join('') + '</select></label>' +
          '<label class="field">Wat zien we?<input id="sync-ci-note" type="text" value="' + esc(keepNote) + '" placeholder="Wat is bewogen, wat zit tegen?"></label>' +
          '<button type="button" class="btn primary" data-sact="checkin">Opslaan</button></div>') + '</div></section>';

      var om = ms.filter(function (m) { return m.row === o.id; });
      var near = om.filter(function (m) { var it = iterOf(m); return it === T.nowIdx || it === T.nowIdx + 1 || (T.nowIdx < 0 && it <= 1) || (m.status !== 'done' && m.status !== 'missed' && T.nowIdx >= 0 && it < T.nowIdx); });
      var c2 = '<section class="sbox"><h3>Mijlpalen: nu en volgende iteratie</h3>' + (near.length ? '<ul class="slist">' + near.map(function (m) {
        var s = msState(m, T), tk = tasksFor(m.id), tdone = tk.filter(function (t) { return t.status === 'done'; }).length;
        return '<li><button type="button" class="srow" data-sact="ms" data-id="' + esc(m.id) + '">' + diamond(m.type) + '<span class="st">' + esc(m.title || '') + '<span class="meta">' + esc(names[iterOf(m)] || '') + (tk.length ? ' · ' + tdone + '/' + tk.length + ' taken klaar' : '') + '</span></span><span class="cstat st-' + (s.cls === 'late' ? 'risk' : s.cls) + '">' + s.icon + esc(s.label) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="meta">Geen mijlpalen in deze of de volgende iteratie.</p>') + '</section>';

      var ot = tasks.filter(function (t) { return t.outcome === o.id; });
      var stuck = ot.filter(function (t) { return t.status === 'waiting' || taskLate(t, T); });
      var doing = ot.filter(function (t) { return t.status === 'doing'; });
      var c3 = '<section class="sbox"><h3>Taken die aandacht vragen</h3>' + (S.tasksMissing ? '<p class="meta">Planner nog niet geactiveerd.</p>' :
        (stuck.length ? '<div class="sstack">' + stuck.map(function (t) { return tcard(t, T); }).join('') + '</div>' : '<p class="okmsg">Niets vastgelopen of te laat.</p>') +
        '<h3>Bezig (' + doing.length + ')</h3>' + (doing.length ? '<div class="sstack">' + doing.map(function (t) { return tcard(t, T); }).join('') + '</div>' : '<p class="meta">Niets in uitvoering.</p>') +
        (S.readOnly ? '' : '<button type="button" class="btn ghost" data-sact="addtask" data-outcome="' + esc(o.id) + '">+ Taak</button>')) + '</section>';
      body = '<div class="sgrid">' + c1 + c2 + c3 + '</div>';
    } else {
      var noCi = outs.filter(function (x) { var c = checkinsOf(x); var l = c[c.length - 1]; return !l || daysSince(l.date) == null || daysSince(l.date) >= 7; });
      var stuckAll = tasks.filter(function (t) { return t.status === 'waiting' || taskLate(t, T); });
      var lateMs = ms.filter(function (m) { return msState(m, T).cls === 'late' || m.status === 'risk'; });
      body = '<div class="sgrid">' +
        '<section class="sbox"><h3>Nog geen check-in deze week</h3>' + (noCi.length ? '<ul class="slist">' + noCi.map(function (x) { return '<li><button type="button" class="srow" data-sact="go" data-i="' + outs.indexOf(x) + '"><span class="st">' + esc(x.title || '') + '</span><span class="cstat">Naar check-in →</span></button></li>'; }).join('') + '</ul>' : '<p class="okmsg">Alle outcomes zijn deze week ingecheckt.</p>') + '</section>' +
        '<section class="sbox"><h3>Mijlpalen met risico of verlopen</h3>' + (lateMs.length ? '<ul class="slist">' + lateMs.map(function (m) { var s = msState(m, T); return '<li><button type="button" class="srow" data-sact="ms" data-id="' + esc(m.id) + '">' + diamond(m.type) + '<span class="st">' + esc(m.title || '') + '<span class="meta">' + esc((S.outcomes[m.row] ? S.outcomes[m.row].title : 'LACE-ritme') + ' · ' + (names[iterOf(m)] || '')) + '</span></span><span class="cstat st-risk">' + s.icon + esc(s.label) + '</span></button></li>'; }).join('') + '</ul>' : '<p class="okmsg">Geen mijlpalen met risico.</p>') + '</section>' +
        '<section class="sbox"><h3>Vastgelopen of te late taken</h3>' + (S.tasksMissing ? '<p class="meta">Planner nog niet geactiveerd.</p>' : stuckAll.length ? '<div class="sstack">' + stuckAll.map(function (t) { return tcard(t, T); }).join('') + '</div>' : '<p class="okmsg">Niets vastgelopen.</p>') + '</section>' +
        '</div>';
    }
    el.innerHTML = '<div class="syncwrap">' + head + nav + body + '</div>';
    paintTimer();
    if (hadFocus && $(hadFocus)) { var f2 = $(hadFocus); f2.focus(); }
  }

  $('sync').addEventListener('click', function (e) {
    var tc = e.target.closest('[data-pact="task"]'); if (tc) { openDrawer({ kind: 't', id: tc.dataset.id }); return; }
    var b = e.target.closest('[data-sact]'); if (!b) return;
    var a = b.dataset.sact;
    if (a === 'next' || a === 'prev' || a === 'go') {
      S.syncIdx = a === 'go' ? num(b.dataset.i) : num(S.syncIdx) + (a === 'next' ? 1 : -1);
      var ni = $('sync-ci-note'); if (ni) ni.value = '';
      resetTimer(true); renderSync(); window.scrollTo(0, 0);
    }
    else if (a === 'timer') { if (timer.running) stopTimer(); else startTimer(); }
    else if (a === 'reset') resetTimer(false);
    else if (a === 'ms') openDrawer({ kind: 'm', id: b.dataset.id });
    else if (a === 'addtask' && !S.readOnly) addTask({ outcome: b.dataset.outcome, iter: timeInfo().nowIdx >= 0 ? timeInfo().nowIdx : null });
    else if (a === 'checkin' && !S.readOnly) {
      var o = sortedOutcomes()[S.syncIdx]; if (!o) return;
      var cis = clone(Array.isArray(o.checkins) ? o.checkins : []);
      cis.push({ id: rid('ci'), date: new Date().toISOString(), confidence: num($('sync-ci-conf').value) || 3, note: $('sync-ci-note').value.trim(), by: myName() || '' });
      $('sync-ci-note').value = '';
      queue('outcomes', o.id, { checkins: cis }, 0);
      toast('Check-in opgeslagen.');
    }
  });

  /* ---------- laden + realtime ---------- */
  function overlay(col, id, body) { var p = pending[col + '/' + id]; return p ? Object.assign({}, body, p.patch) : body; }
  function applySettings(r) { var v = fromRow(r); S.settings = { piStart: v.piStart || '2026-12-09', iterationWeeks: num(v.iterationWeeks) || 2, piName: v.piName || '', iterationCount: num(v.iterationCount) || 4, ipIteration: v.ipIteration !== false }; }

  function loadAll() {
    return Promise.all([S.sb.from('outcomes').select('*'), S.sb.from('milestones').select('*'), S.sb.from('settings').select('*').eq('id', 'pi')]).then(function (res) {
      var err = res.find(function (r) { return r.error; });
      if (err) { toast('Laden mislukt: ' + err.error.message); return; }
      var o = {}; res[0].data.forEach(function (r) { o[r.id] = overlay('outcomes', r.id, fromRow(r)); });
      var m = {}; res[1].data.forEach(function (r) { m[r.id] = overlay('milestones', r.id, fromRow(r)); });
      S.outcomes = o; S.milestones = m;
      if (res[2].data[0]) applySettings(res[2].data[0]);
      S.ready = true; $('btnAddOutcome').disabled = false; $('btnAddMs').disabled = false;
      renderAll();
      return Promise.all([loadTasks(), loadOgsm()]);
    });
  }
  function loadOgsm() {
    return Promise.resolve(S.sb.from('ogsm').select('*')).then(function (r) {
      if (r.error) { S.ogsmMissing = true; renderAll(); return; }
      S.ogsmMissing = false;
      var g = {}; (r.data || []).forEach(function (row) { g[row.id] = overlay('ogsm', row.id, fromRow(row)); });
      S.ogsm = g; renderAll();
      if (!S.ogsmChannel) S.ogsmChannel = S.sb.channel('lace-pi-ogsm').on('postgres_changes', { event: '*', schema: 'public', table: 'ogsm' }, onChange('ogsm')).subscribe();
    }, function () { S.ogsmMissing = true; renderAll(); });
  }
  function loadTasks() {
    return Promise.resolve(S.sb.from('tasks').select('*')).then(function (r) {
      if (r.error) { S.tasksMissing = true; renderAll(); return; }
      S.tasksMissing = false;
      var t = {}; (r.data || []).forEach(function (row) { t[row.id] = overlay('tasks', row.id, fromRow(row)); });
      S.tasks = t; renderAll();
      if (!S.taskChannel) S.taskChannel = S.sb.channel('lace-pi-tasks').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange('tasks')).subscribe();
    }, function () { S.tasksMissing = true; renderAll(); });
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
  renderLegend();
  setView(location.hash.slice(1) || 'board', true);
  subscribe();
})();
