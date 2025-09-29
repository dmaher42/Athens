import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

(async () => {
  const base = process.argv[2] || 'http://localhost:4173';
  const url = base + (base.includes('?') ? '&' : '?') + 'headlessSmoke=1';
  const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const ok = await page.evaluate(() => {
    // relies on debug hook enabled by ?headlessSmoke=1
    const dbg = window.__athensDebug;
    if (!dbg || !dbg.renderer || !dbg.renderer.info) return false;
    // Rendered at least one draw call?
    return (dbg.renderer.info.render.calls || 0) > 0;
  });

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
