// Usage: node scripts/smoke-render.js http://localhost:4173
const puppeteer = require('puppeteer');

(async () => {
  const url = (process.argv[2] || 'http://localhost:4173') +
              (/\?/.test(process.argv[2] || '') ? '&' : '?') + 'headlessSmoke=1';
  const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000); // let 1s of frames happen

  // Primary signal: did we actually render anything?
  const ok = await page.evaluate(() => {
    const dbg = window.__athensDebug;
    return !!(dbg && dbg.renderer && dbg.renderer.info && dbg.renderer.info.render.calls > 0);
  });

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
