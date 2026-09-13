// Run with Playwright available: node tools/match-ui-test.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../vocabulary.html')).href);
    await page.locator('#open-setup').click();
    for (const type of ['flip', 'input', 'choice']) {
      await page.locator(`[data-type="${type}"]`).click();
    }
    await page.locator('#setup-go').click();
    const ids = () => page.locator('.mtile--left').evaluateAll(tiles => tiles.map(tile => tile.dataset.id));
    const tile = (side, id) => page.locator(`.mtile[data-side="${side}"][data-id="${id}"]`);
    const learned = () => page.evaluate(() => JSON.parse(localStorage.getItem('hy-vocab-v1') || '{}'));
    const checkbox = id => page.locator(`[data-match-learn="${id}"]`);
    const first = await ids();
    assert.equal(first.length, 4);

    // All eight cells have the same height, including wrapped translations.
    for (const width of [1200, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = await page.locator('.mtile').evaluateAll(tiles => tiles.map(tile => tile.getBoundingClientRect().height));
      assert(Math.max(...heights) - Math.min(...heights) < 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 900 });

    // An incorrect guess reveals a hint, but never persists a learned mark.
    await tile('right', first[0]).click();
    await tile('left', first[1]).click();
    assert.equal(await page.locator('.is-shake').count(), 2);
    await page.waitForTimeout(650);
    assert.equal(await page.locator('.is-hint').count(), 2);
    assert.deepEqual(await learned(), {});
    await page.waitForTimeout(1400);
    assert.equal(await page.locator('.is-hint').count(), 0);

    // Right-first success is also not a learned mark. Only the checkbox writes it.
    await tile('right', first[0]).click();
    await tile('left', first[0]).click();
    assert.equal(await checkbox(first[0]).isChecked(), false);
    assert.deepEqual(await learned(), {});
    await checkbox(first[0]).check();
    assert.deepEqual(await learned(), { [first[0]]: 1 });
    await checkbox(first[0]).uncheck();
    assert.deepEqual(await learned(), {});
    await checkbox(first[0]).check();
    for (const id of first.slice(1)) {
      await tile('left', id).click();
      await tile('right', id).click();
    }
    assert.deepEqual(await learned(), { [first[0]]: 1 });
    if (process.env.MATCH_QA_SCREENSHOT) {
      await page.locator('.sx--match').screenshot({ path: process.env.MATCH_QA_SCREENSHOT });
    }
    await page.locator('[data-act="match-continue"]').click();
    assert.deepEqual(await learned(), { [first[0]]: 1 });

    // Skipping preserves the exact group for later and never marks it learned.
    const skipped = await ids();
    await page.locator('[data-act="match-skip"]').click();
    assert.equal((await ids()).length, 2);
    async function solve() {
      for (const id of await ids()) {
        await tile('left', id).click();
        await tile('right', id).click();
      }
      await page.locator('[data-act="match-continue"]').click();
    }
    await solve();
    assert.deepEqual(await ids(), skipped);
    await solve();
    assert.equal(await page.locator('#result').isVisible(), true);
    assert.equal(await page.locator('#result .rstat--learn .rstat__n').innerText(), '1');
    assert.match(await page.locator('#result-stats').innerText(), /9\s+сопоставил без отметки/);
    assert.equal(await page.locator('#result .rstat--pct .rstat__n').innerText(), '100%');
    assert.deepEqual(await learned(), { [first[0]]: 1 });
    await page.reload();
    assert.deepEqual(await learned(), { [first[0]]: 1 });
    assert.deepEqual(errors, []);
    console.log('PASS: equal cell heights at 1200/390/320px; hints; both selection directions; explicit learned checkbox and undo; no automatic marks; skip/replay; completion statistics; persistence; no page errors.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
