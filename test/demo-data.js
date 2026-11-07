/*
 * Demomodus: open index.html?demo
 * Vervangt Supabase door een nep-database in het geheugen met voorbeelddata.
 * Niets wordt opgeslagen; herladen zet alles terug. Bedoeld om wijzigingen te
 * testen zonder de echte database te raken (door mensen én door Claude Code).
 */
(function () {
  window.LACE_DEMO = true;
  window.LACE_CONFIG = { supabaseUrl: 'https://demo.invalid', supabaseAnonKey: 'demo' };

  function iso(d) { return d.toISOString().slice(0, 10); }
  var today = new Date();
  var start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 17); // midden in iteratie 2
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }

  var db = {
    settings: [{ id: 'pi', pi_start: iso(start), iteration_weeks: 2, pi_name: 'Demo-PI', iteration_count: 5, ip_iteration: false }],
    outcomes: [
      { id: 'o1', title: 'Flow-metrics zichtbaar per ART', sort_order: 1, commitment: 'committed', bv_planned: 8, bv_actual: null,
        hypothesis: 'Wij geloven dat flow-metrics per ART leiden tot betere keuzes in PI Planning. We weten dat het werkt als RTE\'s de cijfers gebruiken in de ART-sync.',
        krs: [{ id: 'k1', text: '6 ARTs met een flow-dashboard', kind: 'lagging', start: 0, target: 6, current: 2, unit: '' },
              { id: 'k2', text: 'Teams die lead time meten', kind: 'leading', start: 20, target: 80, current: 35, unit: '%' }],
        contribs: [{ id: 'c1', owner: 'Voorbeeld A', text: 'Dashboard in Jira' }, { id: 'c2', owner: 'Voorbeeld B', text: 'Coaching RTE\'s' }],
        checkins: [{ id: 'ci1', date: daysAgo(14), confidence: 4, note: 'Goede start', by: 'Voorbeeld A' }, { id: 'ci2', date: daysAgo(5), confidence: 3, note: 'Data uit Jira onvolledig', by: 'Voorbeeld A' }],
        updated_by: 'Demo', updated_at: daysAgo(1) },
      { id: 'o2', title: 'PI Planning in één dag', sort_order: 2, commitment: 'stretch', bv_planned: 5, bv_actual: null, hypothesis: '',
        krs: [{ id: 'k3', text: 'Duur PI Planning in dagen', kind: 'lagging', start: 2, target: 1, current: 2, unit: '' }],
        contribs: [{ id: 'c3', owner: 'Voorbeeld C', text: 'Draaiboek' }], checkins: [] },
      { id: 'o3', title: '[Lege outcome om mee te testen]', sort_order: 3, commitment: 'committed', krs: [], contribs: [], checkins: [] }
    ],
    milestones: [
      { id: 'm1', row_ref: 'art', contrib_ref: '', iter: 0, title: 'PI Planning', type: 'fixed', status: 'done', created_at: daysAgo(30) },
      { id: 'm2', row_ref: 'art', contrib_ref: '', iter: 4, title: 'Inspect & Adapt', type: 'fixed', status: 'planned', created_at: daysAgo(29) },
      { id: 'm3', row_ref: 'o1', contrib_ref: 'c1', iter: 0, title: 'Datamodel gevalideerd', type: 'learn', status: 'done', learning: 'Lead time klopt alleen als statussen in Jira gelijk zijn.', decision: 'adjust', created_at: daysAgo(28) },
      { id: 'm4', row_ref: 'o1', contrib_ref: 'c1', iter: 2, title: 'Dashboard live voor 2 ARTs', type: 'release', status: 'planned', created_at: daysAgo(27) },
      { id: 'm5', row_ref: 'o1', contrib_ref: 'c2', iter: 1, title: 'RTE-sessie metrics', type: 'sync', status: 'risk', created_at: daysAgo(26) },
      { id: 'm6', row_ref: 'o2', contrib_ref: 'c3', iter: 1, title: 'Draaiboek v1', type: 'learn', status: 'planned', created_at: daysAgo(25) }
    ],
    tasks: [
      { id: 't1', title: 'Koppeling Jira-statussen testen', outcome_ref: 'o1', milestone_ref: 'm4', owner: 'Voorbeeld A', status: 'doing', iter: 1, checklist: [{ id: 'x1', text: 'Testset kiezen', done: true }, { id: 'x2', text: 'Afwijkingen noteren', done: false }], notes: '', sort_order: 1, created_at: daysAgo(10) },
      { id: 't2', title: 'Dashboard-template maken', outcome_ref: 'o1', milestone_ref: 'm4', owner: 'Voorbeeld A', status: 'todo', iter: 2, checklist: [], notes: '', sort_order: 2, created_at: daysAgo(9) },
      { id: 't3', title: 'Agenda RTE-sessie afstemmen', outcome_ref: 'o1', milestone_ref: 'm5', owner: 'Voorbeeld B', status: 'waiting', iter: 1, checklist: [], notes: 'Wacht op beschikbaarheid RTE\'s', sort_order: 3, created_at: daysAgo(8) },
      { id: 't4', title: 'Datamodel documenteren', outcome_ref: 'o1', milestone_ref: 'm3', owner: 'Voorbeeld A', status: 'done', iter: 0, checklist: [], notes: '', sort_order: 4, created_at: daysAgo(20) },
      { id: 't5', title: 'Draaiboek eerste versie', outcome_ref: 'o2', milestone_ref: 'm6', owner: 'Voorbeeld C', status: 'todo', iter: 0, checklist: [], notes: '', sort_order: 5, created_at: daysAgo(18) },
      { id: 't6', title: 'Verlof en bezetting PI bijwerken', outcome_ref: '', milestone_ref: '', owner: 'Voorbeeld B', status: 'doing', iter: 1, checklist: [], notes: '', sort_order: 6, created_at: daysAgo(4) }
    ]
  };

  function query(table) {
    var op = 'select', payload = null, filters = [];
    var q = {
      select: function () { return q; },
      eq: function (col, val) { filters.push([col, val]); return q; },
      insert: function (rows) { op = 'insert'; payload = rows; return q; },
      update: function (patch) { op = 'update'; payload = patch; return q; },
      upsert: function (row) { op = 'upsert'; payload = row; return q; },
      delete: function () { op = 'delete'; return q; },
      then: function (resolve, reject) {
        var rows = db[table] || (db[table] = []);
        var match = function (r) { return filters.every(function (f) { return r[f[0]] === f[1]; }); };
        if (op === 'insert') [].concat(payload).forEach(function (r) { rows.push(Object.assign({}, r)); });
        if (op === 'update') rows.forEach(function (r) { if (match(r)) Object.assign(r, payload); });
        if (op === 'upsert') { var ex = rows.find(function (r) { return r.id === payload.id; }); if (ex) Object.assign(ex, payload); else rows.push(Object.assign({}, payload)); }
        if (op === 'delete') db[table] = rows.filter(function (r) { return !match(r); });
        var data = op === 'select' ? JSON.parse(JSON.stringify((db[table] || []).filter(match))) : null;
        return Promise.resolve({ data: data, error: null }).then(resolve, reject);
      }
    };
    return q;
  }

  window.supabase = {
    createClient: function () {
      return {
        from: query,
        channel: function () { var c = { on: function () { return c; }, subscribe: function (cb) { if (cb) setTimeout(function () { cb('SUBSCRIBED'); }, 0); return c; } }; return c; },
        removeAllChannels: function () {},
        auth: {}
      };
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.className = 'demobar';
    b.textContent = 'Demomodus: voorbeelddata, er wordt niets opgeslagen. Herlaad de pagina om opnieuw te beginnen.';
    document.body.insertBefore(b, document.body.firstChild);
  });
})();
