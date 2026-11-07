/*
 * Snelle test van het bord in demomodus (geen echte database).
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

  await check('geen JavaScript-fouten', async () => { assert(errors.length === 0, errors.join(' | ')); });

  if (shot) await page.screenshot({ path: path.join(__dirname, 'screenshot.png'), fullPage: true });
  await browser.close();

  results.forEach((r) => console.log(r[0] + '  ' + r[1]));
  process.exit(results.some((r) => r[0] === 'FOUT') ? 1 : 0);
})();
