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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Externe bestanden (Supabase-bibliotheek, fonts) zijn in demomodus niet nodig.
  await page.route(/^https?:\/\//, (r) => r.abort());

  const results = [];
  async function check(name, fn) {
    try { await fn(); results.push(['OK  ', name]); }
    catch (e) { results.push(['FOUT', name + ' — ' + e.message.split('\n')[0]]); }
  }
  function assert(cond, msg) { if (!cond) throw new Error(msg); }

  await page.goto(url);
  await page.waitForSelector('.row.focus', { timeout: 5000 });

  await check('bord laadt met demodata', async () => {
    assert(await page.locator('.demobar').count() === 1, 'geen demobalk');
    assert(await page.locator('.row.focus, .row.compact').count() >= 2, 'outcomes ontbreken');
  });

  await check('OGSM: groepen, lijnen en waarschuwingen', async () => {
    assert(await page.locator('.ogcell[data-og="g1"]').count() === 1, 'groep G1 ontbreekt');
    assert(await page.locator('.ogcell[data-og="g1"]').locator('xpath=..').locator('[data-oid]').count() === 2, 'G1 heeft niet 2 outcomes');
    assert(await page.locator('.ogcell[data-og="_none"]').count() === 1, 'groep Nog niet gekoppeld ontbreekt');
    await page.waitForTimeout(100);
    assert(await page.locator('#ogLines path.ogl').count() === 3, 'aantal OGSM-lijnen klopt niet');
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
    assert((await page.locator('.row.focus .confbox .conf').innerText()).includes('2/5'), 'vertrouwen niet op bord');
  });

  await check('outcome toevoegen', async () => {
    await page.click('button[data-act="addoutcome"]');
    assert((await page.locator('#o-title').inputValue()) === 'Nieuwe PI-outcome', 'zijpaneel niet geopend');
    await page.click('.dhead [data-d="close"]');
  });

  await check('mijlpaal verslepen', async () => {
    await page.click('button[data-act="focus"][data-id="o1"]').catch(() => {});
    const card = await page.locator('button.callout[data-id="m4"]').boundingBox();
    const target = await page.locator('[data-drop-row="o1"][data-drop-contrib="c2"][data-drop-iter="3"]').boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2 + 20, card.y + card.height / 2 + 10, { steps: 3 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert(await page.locator('[data-drop-row="o1"][data-drop-contrib="c2"][data-drop-iter="3"] button.callout[data-id="m4"]').count() === 1, 'kaartje niet verplaatst');
    assert(await page.locator('#drawerRoot aside').count() === 0, 'zijpaneel opende na slepen');
  });

  await check('afhankelijkheden: lijnen en conflict', async () => {
    await page.click('.tab[data-view="board"]').catch(() => {});
    await page.click('button[data-act="focus"][data-id="o1"]').catch(() => {});
    await page.waitForTimeout(100);
    assert(await page.locator('#depLines path.dep').count() >= 2, 'geen lijnen getekend');
    assert(await page.locator('#depLines path.dep.bad').count() >= 1, 'conflict niet rood');
    await page.click('button.callout[data-id="m4"]');
    await page.selectOption('#m-adddep', 'm1');
    await page.waitForTimeout(100);
    assert(await page.locator('#mDeps .deprow').count() === 2, 'afhankelijkheid niet toegevoegd');
    await page.click('.dhead [data-d="close"]');
    await page.waitForTimeout(100);
    assert(await page.locator('#depLines path[data-from="m1"][data-to="m4"]').count() === 1, 'nieuwe lijn ontbreekt');
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
