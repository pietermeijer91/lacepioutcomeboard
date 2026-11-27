/*
 * Snelle test van het bord, de planner en de weekly sync in demomodus (geen echte database).
 *
 *   node test/smoke.js             # draait de checks
 *   node test/smoke.js --shot      # maakt ook test/screenshot.png
 *
 * Vereist Playwright met Chromium:
 *   npm i -D playwright && npx playwright install chromium
 */
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const url = 'file://' + path.join(root, 'index.html') + '?demo';
const shot = process.argv.includes('--shot');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000); // een vastgelopen stap faalt snel in plaats van de hele test op te houden
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Externe bestanden (Supabase-bibliotheek, fonts) zijn in demomodus niet nodig.
  // Export-bibliotheek lokaal aanbieden als die er is (anders slaat de exporttest over)
  const fs = require('fs');
  const libCandidates = [path.join(root, 'node_modules/html-to-image/dist/html-to-image.js'), '/opt/npm-tools/node_modules/html-to-image/dist/html-to-image.js'];
  const lib = libCandidates.find((f) => fs.existsSync(f));
  await page.route(/^https?:\/\//, (r) => (lib && /html-to-image/.test(r.request().url()) ? r.fulfill({ path: lib, contentType: 'application/javascript' }) : r.abort()));

  const results = [];
  async function check(name, fn) {
    try { await fn(); results.push(['OK  ', name]); }
    catch (e) { results.push(['FOUT', name + ' — ' + e.message.split('\n')[0]]); }
  }
  function assert(cond, msg) { if (!cond) throw new Error(msg); }

  await check('wachtwoordscherm (demo&login)', async () => {
    await page.goto(url + '&login');
    await page.waitForSelector('#loginPw', { timeout: 5000 });
    assert(await page.locator('#app').isHidden(), 'bord zichtbaar zonder wachtwoord');
    await page.fill('#loginPw', 'lace');
    await page.click('#loginBtn');
    await page.waitForSelector('#loginMsg:not([hidden])', { timeout: 3000 });
    assert((await page.locator('#loginMsg').innerText()).includes('klopt niet'), 'geen foutmelding bij verkeerd wachtwoord');
    await page.fill('#loginPw', 'LACE');
    await page.click('#loginBtn');
    await page.waitForSelector('.row.focus', { timeout: 5000 });
  });

  await page.goto(url);
  await page.waitForSelector('.row.focus', { timeout: 5000 });

  await check('bord laadt met demodata', async () => {
    assert(await page.locator('.demobar').count() === 1, 'geen demobalk');
    assert(await page.locator('.row.focus, .row.compact').count() >= 2, 'outcomes ontbreken');
  });

  await check('OGSM: groepen, lijnen en waarschuwingen', async () => {
    assert(await page.locator('.ogcell[data-og="g1"]').count() === 1, 'groep G1 ontbreekt');
    assert(await page.locator('.ogcell[data-og="g1"]').locator('xpath=..').locator('[data-oid]').count() === 2, 'G1 heeft niet 2 outcomes');
    assert(await page.locator('.ciocell[data-cio="c1"]').count() === 1 && await page.locator('.ciocell[data-cio="c2"]').count() === 1, 'CIO-kolom ontbreekt');
    assert(await page.locator('[data-oid="o1"] > .bar').count() === 0, 'voortgangsbalk outcome staat er nog');
    assert(await page.locator('.ogcell[data-og="_none"]').count() === 1, 'groep Nog niet gekoppeld ontbreekt');
    await page.waitForTimeout(100);
    assert(await page.locator('#ogLines path.ogl').count() === 5, 'aantal OGSM/CIO-lijnen klopt niet: ' + await page.locator('#ogLines path.ogl').count());
    assert(!(await page.locator('#board').innerText()).includes('Geen CIO Office-doel'), 'lege CIO-cel toont nog tekst');
    assert((await page.locator('#board .row.head').innerText()).includes('LACE PI-outcome'), 'kop LACE PI-outcome ontbreekt');
    assert((await page.locator('#ogsmBanner').innerText()).includes('Voorbeeld-ambitie'), 'ambitie niet zichtbaar');
    assert(await page.locator('#ogsmBanner .ogwarn').count() === 0, 'G2 heeft extra koppeling, geen waarschuwing verwacht');
    assert(await page.locator('.ogextra .ogtag').count() >= 1, 'extra doel-label ontbreekt');
    assert((await page.locator('#board').innerText()).indexOf('ART- &') < 0, 'ART-rij staat er nog');
  });

  await check('OGSM: outcome koppelen en doel toevoegen', async () => {
    await page.click('button[data-act="edit"][data-id="o3"]');
    await page.selectOption('#o-ogsm', 'g2');
    await page.waitForTimeout(100);
    await page.click('.dhead [data-d="close"]');
    await page.waitForTimeout(100);
    assert(await page.locator('.ogcell[data-og="g2"]').count() === 1, 'groep G2 niet verschenen');
    assert(await page.locator('.ogcell[data-og="_none"]').count() === 0, 'ongekoppelde groep had moeten verdwijnen');
    await page.click('#ogsmBanner [data-ogact="manage"]');
    await page.click('[data-d="addgoal"]');
    await page.fill('#ogList .ogedit:last-child [data-gf="title"]', 'Nieuw doel');
    await page.waitForTimeout(600);
    await page.click('.dhead [data-d="close"]');
    assert((await page.locator('#ogsmBanner').innerText()).includes('Nieuw doel heeft deze PI geen outcome'), 'waarschuwing leeg doel ontbreekt');
    await page.click('button[data-act="edit"][data-id="o3"]');
    await page.selectOption('#o-ogsm', '');
    await page.waitForTimeout(100);
    await page.click('.dhead [data-d="close"]');
  });

  await check('outcome compact op het bord', async () => {
    assert(await page.locator('#board .hyp, #board .confbox, #board details.learn').count() === 0, 'hypothese, check-in-blok of leerlog staat nog op het bord');
    assert(await page.locator('.row.focus .krs.mini li').count() >= 1, 'key results ontbreken in compacte weergave');
  });

  await check('exporteren als afbeelding', async () => {
    if (!lib) return;
    await page.click('#exportMenu > summary');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('[data-export="png"]')]);
    assert(/^LACE-PI-Outcome-Board-.*\.png$/.test(dl.suggestedFilename()), 'onverwachte bestandsnaam: ' + dl.suggestedFilename());
    const out = await dl.path(); const buf = fs.readFileSync(out);
    assert(buf.length > 20000, 'afbeelding is (bijna) leeg');
    if (process.argv.includes('--shot')) fs.copyFileSync(out, path.join(__dirname, 'export.png'));
    assert(!(await page.evaluate(() => document.body.classList.contains('exporting'))), 'exportstand blijft hangen');
    await page.click('#exportMenu > summary');
    await page.click('[data-export="pdf"]');
    await page.waitForSelector('.toast:has-text("Opslaan als PDF")', { timeout: 20000 });
  });

  await check('mijlpalen ook bij ingeklapte outcome als kaartje met tekst', async () => {
    assert(await page.locator('#board .mdot').count() === 0, 'er staan nog losse ruitjes zonder tekst');
    const compact = page.locator('.row.compact').filter({ hasText: 'PI Planning in één dag' });
    assert((await compact.locator('.callout').first().innerText()).includes('Draaiboek'), 'titel van mijlpaal niet zichtbaar in ingeklapte rij');
  });

  await check('eigenaar rechtsboven bij OGSM- en CIO Office-doel', async () => {
    assert((await page.locator('.ogcell[data-og="g1"] .ogowner').innerText()).includes('Voorbeeld'), 'eigenaar OGSM-doel ontbreekt');
    assert((await page.locator('.ciocell[data-cio="c1"] .ogowner').getAttribute('title')).includes('Voorbeeld A'), 'eigenaar CIO-doel ontbreekt');
    await page.click('#ogsmBanner [data-ogact="manage"]');
    await page.fill('#cioList [data-g="c2"][data-gf="owner"]', 'Voorbeeld E');
    await page.waitForTimeout(600);
    await page.click('.dhead [data-d="close"]');
    assert((await page.locator('.ciocell[data-cio="c2"] .ogowner').getAttribute('title')).includes('Voorbeeld E'), 'nieuwe eigenaar niet zichtbaar op het bord');
  });

  await check('lijnen: speels en per lijn verschillend, maar stabiel', async () => {
    await page.waitForTimeout(150);
    const ds = await page.locator('#ogLines path.ogl').evaluateAll((els) => els.map((e) => e.getAttribute('style')));
    assert(new Set(ds).size > 1, 'alle lijnen zijn even dik: ' + JSON.stringify(ds));
    const before = await page.locator('#ogLines path.ogl').first().getAttribute('d');
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(150);
    assert((await page.locator('#ogLines path.ogl').first().getAttribute('d')) === before, 'lijn verspringt bij opnieuw tekenen');
  });

  await check('eigenaar bij een LACE PI-outcome', async () => {
    assert((await page.locator('[data-oid="o1"] .ogowner').getAttribute('title')).includes('Voorbeeld B'), 'eigenaar outcome o1 ontbreekt');
    await page.click('button[data-act="edit"][data-id="o3"]');
    await page.fill('#o-owner', 'Voorbeeld F');
    await page.waitForTimeout(600);
    await page.click('.dhead [data-d="close"]');
    assert((await page.locator('[data-oid="o3"] .ogowner').getAttribute('title')).includes('Voorbeeld F'), 'nieuwe eigenaar outcome niet op het bord');
  });

  await check('Management Review-bord', async () => {
    try {
      assert((await page.locator('#rvCount').innerText()).trim() === '4', 'teller open items klopt niet: ' + await page.locator('#rvCount').innerText());
      assert(await page.locator('[data-oid="o1"] .rvtag.rv-risk').count() === 1, 'risico-label op outcome ontbreekt');
      await page.click('#btnReview');
      await page.waitForSelector('.rvpanel');
      assert(await page.locator('.rvq').count() === 4, 'niet vier vakken');
      assert(await page.locator('.rvq.q-risk .rvnote').count() === 2, 'risks niet zichtbaar');
      assert((await page.locator('.rvnote[data-id="d5"] .rvdue').innerText()).includes('Te laat'), 'te late actie niet gemarkeerd');
      await page.fill('.rvq.q-needed .rvadd', 'Budget voor tooling');
      await page.press('.rvq.q-needed .rvadd', 'Enter');
      assert(await page.locator('.rvq.q-needed .rvnote', { hasText: 'Budget voor tooling' }).count() === 1, 'toevoegen werkt niet');
      await page.click('.rvq.q-needed .rvnote:has-text("Budget voor tooling")');
      await page.fill('.rvedit [data-rf="owner"]', 'Voorbeeld G');
      await page.selectOption('.rvedit [data-rf="outcome"]', 'o2');
      await page.selectOption('.rvedit [data-rf="kind"]', 'confirmed');
      await page.waitForTimeout(600);
      assert(await page.locator('.rvq.q-confirmed .rvnote', { hasText: 'Budget voor tooling' }).count() === 1, 'verplaatsen via Vak werkt niet');
      await page.click('.rvedit [data-rv="done"]');
      await page.dragAndDrop('.rvnote[data-id="d3"]', '.rvq.q-action', { targetPosition: { x: 40, y: 20 } });
      assert(await page.locator('.rvq.q-action .rvnote[data-id="d3"]').count() === 1, 'slepen naar Actions werkt niet');
      await page.selectOption('#rvFilter', 'o1');
      assert(await page.locator('.rvnote[data-id="d4"]').count() === 0, 'filter op outcome werkt niet');
      await page.keyboard.press('Escape');
      assert(await page.locator('.rvpanel').count() === 0, 'paneel sluit niet');
      await page.click('[data-oid="o1"] .rvtag.rv-risk');
      assert((await page.locator('#rvFilter').inputValue()) === 'o1', 'label opent paneel niet gefilterd op outcome');
      await page.click('.rvhead [data-rv="close"]');
    
    } finally {
      await page.evaluate(() => { const c = document.querySelector('#rvRoot [data-rv="close"]'); if (c) c.click(); });
    }
  });

  await check('geen bijdragen-banen op het bord', async () => {
    assert(await page.locator('#board .lane').count() === 0, 'bijdragen staan nog op het bord');
    assert(!(await page.locator('#board .row.head').innerText()).includes('Bijdragen'), 'kolom Bijdragen staat nog in de kop');
  });

  await check('outcome-check: niet op het bord, wel inklapbaar in zijpaneel', async () => {
    assert(await page.locator('#board .ochk').count() === 0, 'check-labels staan nog op het bord');
    await page.click('button[data-act="edit"][data-id="o3"]');
    await page.click('.ocheck summary');
    await page.check('[data-ochk="invloed"]');
    await page.check('[data-ochk="termijn"]');
    assert((await page.locator('#ochkBadge').innerText()).includes('2/5'), 'badge in zijpaneel niet bijgewerkt');
    await page.click('.dhead [data-d="close"]');
  });

  await check('knop + Mijlpaal opent nieuwe mijlpaal', async () => {
    const before = await page.locator('#board [data-act="ms"]').count();
    await page.click('#btnAddMs');
    assert((await page.locator('#m-title').inputValue()) === 'Nieuwe mijlpaal', 'zijpaneel niet geopend');
    await page.selectOption('#m-iter', '3');
    await page.waitForTimeout(100);
    await page.click('.dhead [data-d="close"]');
    assert(await page.locator('#board [data-act="ms"]').count() === before + 1, 'mijlpaal niet op het bord');
  });

  await check('mijlpaal snel toevoegen in een iteratie', async () => {
    await page.click('button[data-act="focus"][data-id="o1"]').catch(() => {});
    const before = await page.locator('#board [data-act="ms"]').count();
    await page.click('.cell[data-drop-row="o1"][data-drop-iter="4"] [data-act="addms"]');
    await page.fill('#qaddInput', 'Snelle mijlpaal');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    assert(await page.locator('#board [data-act="ms"]').count() === before + 1, 'mijlpaal niet toegevoegd');
    assert(await page.locator('.cell[data-drop-row="o1"][data-drop-iter="4"] .callout', { hasText: 'Snelle mijlpaal' }).count() === 1, 'mijlpaal staat niet in de juiste cel');
    await page.click('.cell[data-drop-row="o1"][data-drop-iter="2"] [data-act="addms"]');
    await page.keyboard.press('Escape');
    assert(await page.locator('#qaddInput').count() === 0, 'annuleren werkt niet');
  });

  await check('CIO Office-doel koppelen', async () => {
    await page.click('button[data-act="edit"][data-id="o3"]');
    await page.selectOption('#o-cio', 'c2');
    await page.waitForTimeout(100);
    await page.click('.dhead [data-d="close"]');
    await page.waitForTimeout(100);
    assert(await page.locator('.ogcell[data-og="_none"]').locator('xpath=..').locator('.ciocell[data-cio="c2"]').count() === 1, 'o3 niet onder C2');
    await page.click('button[data-act="edit"][data-id="o3"]');
    await page.selectOption('#o-cio', '');
    await page.waitForTimeout(100);
    await page.click('.dhead [data-d="close"]');
  });

  await check('parkeerplaats: tonen, toevoegen en naar het bord slepen', async () => {
    assert((await page.locator('#board').innerText()).indexOf('LACE-ritme') < 0, 'rij LACE-ritme staat er nog');
    assert(await page.locator('#parking .pcard').count() === 2, 'geparkeerde items ontbreken');
    assert(await page.locator('[data-oid="p1"]').count() === 0, 'geparkeerd item staat op het bord');
    const msTot = async () => Number((await page.locator('#tMs').innerText()).split('/')[1]);
    const msBefore = await msTot();
    await page.fill('#parkInput', 'Nieuw idee');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    assert(await page.locator('#parking .pcard').count() === 3, 'item niet geparkeerd');
    assert(await page.evaluate(() => window.__lastOutcomeInsertOrder) < 2147483647, 'volgnummer past niet in de database (integer)');
    const card = await page.locator('#parking .pcard[data-id="p1"]').boundingBox();
    const target = await page.locator('.ciocell[data-cio="c1"]').locator('xpath=..').boundingBox();
    await page.mouse.move(card.x + 20, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + 40, card.y + 30, { steps: 3 });
    await page.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert(await page.locator('#parking .pcard[data-id="p1"]').count() === 0, 'item staat nog op de parkeerplaats');
    assert(await msTot() === msBefore + 1, 'mijlpaal van geparkeerd item telde al mee in de voortgang (of telt nu niet mee)');
    assert(await page.locator('.ciocell[data-cio="c1"]').locator('xpath=..').locator('[data-oid="p1"]').count() === 1, 'item niet onder G1/C1 op het bord');
    await page.click('button[data-act="edit"][data-id="p1"]').catch(async () => { await page.click('[data-oid="p1"] [data-act="focus"]'); await page.click('button[data-act="edit"][data-id="p1"]'); });
    await page.click('[data-d="park"]');
    await page.waitForTimeout(100);
    assert(await page.locator('#parking .pcard[data-id="p1"]').count() === 1, 'terug parkeren werkt niet');
  });

  await check('outcome bewerken (titel)', async () => {
    await page.click('button[data-act="edit"][data-id="o1"]');
    await page.fill('#o-title', 'Testtitel');
    await page.waitForTimeout(600);
    await page.click('.dhead [data-d="close"]');
    assert((await page.locator('.row.focus h3').innerText()).includes('Testtitel'), 'titel niet bijgewerkt');
  });

  await check('check-in toevoegen', async () => {
    await page.click('button[data-act="checkin"][data-id="o1"]');
    await page.selectOption('#ci-conf', '2');
    await page.fill('#ci-note', 'Test');
    await page.click('[data-d="addci"]');
    assert(await page.locator('#ciList li').count() === 3, 'check-in niet in lijst');
    await page.click('.dhead [data-d="close"]');
    assert((await page.locator('.row.focus .conf').innerText()).includes('2/5'), 'vertrouwen niet op bord');
  });

  await check('outcome toevoegen', async () => {
    await page.click('button[data-act="addoutcome"]');
    assert((await page.locator('#o-title').inputValue()) === 'Nieuwe PI-outcome', 'zijpaneel niet geopend');
    await page.click('.dhead [data-d="close"]');
  });

  await check('mijlpaal verslepen', async () => {
    await page.click('button[data-act="focus"][data-id="o1"]').catch(() => {});
    const card = await page.locator('button.callout[data-id="m4"]').boundingBox();
    const target = await page.locator('[data-drop-row="o1"][data-drop-iter="3"]').boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2 + 20, card.y + card.height / 2 + 10, { steps: 3 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert(await page.locator('[data-drop-row="o1"][data-drop-iter="3"] button.callout[data-id="m4"]').count() === 1, 'kaartje niet verplaatst');
    assert(await page.locator('#drawerRoot aside').count() === 0, 'zijpaneel opende na slepen');
  });

  await check('afhankelijkheden: lijnen en conflict', async () => {
    await page.click('.tab[data-view="board"]').catch(() => {});
    await page.click('button[data-act="focus"][data-id="o1"]').catch(() => {});
    await page.waitForTimeout(100);
    assert(await page.locator('#depLines path.dep').count() >= 2, 'geen lijnen getekend');
    assert(await page.locator('#depLines path.dep.bad').count() >= 1, 'conflict niet rood');
    await page.click('button.callout[data-id="m4"]');
    await page.selectOption('#m-adddep', 'm6');
    await page.waitForTimeout(100);
    assert(await page.locator('#mDeps .deprow').count() === 2, 'afhankelijkheid niet toegevoegd');
    await page.click('.dhead [data-d="close"]');
    await page.waitForTimeout(100);
    assert(await page.locator('#depLines path[data-from="m6"][data-to="m4"]').count() === 1, 'nieuwe lijn ontbreekt');
  });

  await check('mijlpaal toont gekoppelde taken', async () => {
    assert((await page.locator('button.callout[data-id="m4"] .ctasks').innerText()).includes('/2 taken'), 'geen taakteller op kaartje');
  });

  await check('planner: tab openen en taak toevoegen', async () => {
    await page.click('.tab[data-view="planner"]');
    await page.waitForSelector('#planner .pgrid');
    const before = await page.locator('#planner .tcard').count();
    await page.click('#planner [data-pact="add"]');
    await page.fill('#t-title', 'Smoke-taak');
    await page.waitForTimeout(600);
    await page.click('.dhead [data-d="close"]');
    assert(await page.locator('#planner .tcard').count() === before + 1, 'taak niet toegevoegd');
  });

  await check('planner: taak verslepen naar Klaar', async () => {
    const card = await page.locator('#planner .tcard[data-id="t2"]').boundingBox();
    const target = await page.locator('#planner [data-tdrop-outcome="o1"][data-tdrop-status="done"]').boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + 12);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2 + 20, card.y + 20, { steps: 3 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert(await page.locator('#planner [data-tdrop-outcome="o1"][data-tdrop-status="done"] .tcard[data-id="t2"]').count() === 1, 'taak niet verplaatst');
  });

  await check('planner: filter vastgelopen', async () => {
    await page.click('#planner [data-pf="blocked"]');
    const ids = await page.locator('#planner .tcard').evaluateAll((els) => els.map((e) => e.dataset.id));
    assert(ids.includes('t3') && !ids.includes('t1'), 'filter klopt niet: ' + ids.join(','));
    await page.click('#planner [data-pf="blocked"]');
  });

  await check('weekly sync: check-in en volgende outcome', async () => {
    await page.click('.tab[data-view="sync"]');
    await page.waitForSelector('#sync .sgrid');
    await page.selectOption('#sync-ci-conf', '5');
    await page.fill('#sync-ci-note', 'Sync-test');
    await page.click('#sync [data-sact="checkin"]');
    await page.waitForTimeout(100);
    assert((await page.locator('#sync .okmsg').first().innerText()).includes('ingecheckt'), 'check-in niet verwerkt');
    await page.click('#sync [data-sact="next"]');
    assert((await page.locator('#sync .shead h2').innerText()).includes('PI Planning in één dag'), 'niet naar volgende outcome');
    await page.click('.tab[data-view="board"]');
  });

  await check('geen JavaScript-fouten', async () => { assert(errors.length === 0, errors.join(' | ')); });

  if (shot) {
    await page.screenshot({ path: path.join(__dirname, 'screenshot.png'), fullPage: true });
    await page.click('.tab[data-view="planner"]'); await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-planner.png'), fullPage: true });
    await page.click('.tab[data-view="sync"]'); await page.click('#sync [data-sact="go"][data-i="0"]'); await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-sync.png'), fullPage: true });
  }
  await browser.close();

  results.forEach((r) => console.log(r[0] + '  ' + r[1]));
  process.exit(results.some((r) => r[0] === 'FOUT') ? 1 : 0);
})();
