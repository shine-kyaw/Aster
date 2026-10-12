/* Browser regression checks. Run with Node and Playwright installed; external requests
   are blocked so this script never sends an enquiry or a chat message to a provider. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const results = [];
function check(condition, label, details = '') {
  results.push({ pass: !!condition, label, details });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${details ? ': ' + JSON.stringify(details) : ''}`);
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Mock test only"}' });
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base, { waitUntil: 'networkidle' });
    const metrics = await page.evaluate(() => ({
      client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      hero: (() => { const e = document.querySelector('h1'); const r=e.getBoundingClientRect(); const s=getComputedStyle(e); return { text:e.innerText, top:r.top, width:r.width, height:r.height, opacity:s.opacity }; })(),
      links: Array.from(document.querySelectorAll('.work-card a, a.work-card, .work-grid a')).map(e=>e.href)
    }));
    check(metrics.scroll <= metrics.client + 1, `No horizontal overflow at ${width}`, metrics.scroll);
    check(metrics.hero.height > 0 && metrics.hero.top < 850 && metrics.hero.opacity !== '0', `Hero visible at ${width}`, metrics.hero);
    const screenshotDir = process.env.QA_SCREENSHOT_DIR;
    if (screenshotDir) { fs.mkdirSync(screenshotDir, { recursive:true }); await page.screenshot({ path:path.join(screenshotDir, `aster-${width}.png`), fullPage:true }); }
  }
  check(errors.length === 0, 'No uncaught JavaScript errors with third-party scripts unavailable', errors);
  const projectLinks = await page.locator('a[href*="vercel.app"]').evaluateAll(es => [...new Set(es.map(e => e.href))]);
  check(projectLinks.length >= 4, 'Four published project destinations present', projectLinks);
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(base, { waitUntil:'networkidle' });
  await page.locator('#navToggle').click();
  check(await page.locator('#navToggle').getAttribute('aria-expanded') === 'true', 'Mobile menu opens');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.activeElement.id === 'navToggle' && document.querySelector('#navMenu').inert), 'Escape closes menu and restores focus');
  await page.locator('#navToggle').click();
  await page.locator('#navMenu a[href="#work"]').click();
  await page.waitForTimeout(100);
  check(await page.evaluate(() => location.hash === '#work' && document.activeElement.id === 'work' && document.querySelector('#navMenu').inert), 'Hash navigation preserves URL and moves focus');
  await page.locator('#contactSend').click();
  check(await page.evaluate(() => document.activeElement.id === 'cName' && document.querySelector('#cName').getAttribute('aria-invalid') === 'true'), 'Empty contact form focuses first invalid field');
  await page.locator('#cName').fill('Test Visitor');
  await page.locator('#cEmail').fill('invalid');
  await page.locator('#cMessage').fill('Test message — this must never be sent.');
  await page.locator('#contactSend').click();
  check(await page.evaluate(() => document.activeElement.id === 'cEmail'), 'Malformed email rejected');
  await page.locator('#cEmail').fill('test@example.com');
  await page.evaluate(() => { window.__testCalls = 0; window.AsterEnquiry.submit = async draft => { window.__testCalls++; return { code:'TEST-ONLY', tracking:false }; }; });
  await page.locator('#contactSend').click();
  check(await page.evaluate(() => window.__testCalls === 1 && document.querySelector('#contactStatus').textContent.includes('TEST-ONLY') && document.querySelector('#cName').value === ''), 'Mock successful enquiry shows receipt and resets form');
  await page.locator('#cName').fill('Preserved Visitor');
  await page.locator('#cEmail').fill('preserved@example.com');
  await page.locator('#cMessage').fill('Preserve this text when sending fails.');
  await page.evaluate(() => { window.AsterEnquiry.submit = async () => { window.__testCalls++; await new Promise(resolve => { window.__completeSubmit = resolve; }); throw new Error('Mock failure'); }; });
  await page.locator('#contactSend').click();
  check(await page.locator('#contactSend').isDisabled(), 'Contact submit disabled while pending');
  await page.locator('#contactForm').evaluate(e => e.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})));
  check(await page.evaluate(() => window.__testCalls === 2), 'Pending form ignores duplicate submit events');
  await page.evaluate(() => window.__completeSubmit());
  await page.waitForTimeout(50);
  check(await page.evaluate(() => document.querySelector('#cMessage').value.includes('Preserve this text') && document.querySelectorAll('#contactStatus a[href^="mailto:"]').length === 2 && !document.querySelector('#contactSend').disabled), 'Failed enquiry preserves draft and offers email fallback');
  check(await page.locator('#aster-chat-panel').evaluate(e => e.inert), 'Closed chat is inert');
  await page.locator('#aster-chat-btn').click();
  await page.locator('#ac-input').fill('<img src=x onerror="window.__injected=1"> **hello**');
  await page.locator('#ac-send').click();
  await page.waitForTimeout(950);
  check(await page.evaluate(() => !window.__injected && !document.querySelector('#ac-messages img') && document.querySelector('.ac-msg.user').textContent.includes('<img')), 'Chat treats submitted HTML as text');
  check(await page.locator('#ac-messages a[href="/#connect"]').count() === 1, 'Offline chat fallback has working contact link');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.querySelector('#aster-chat-panel').inert && document.activeElement.id === 'aster-chat-btn'), 'Chat Escape restores launcher focus');
  const nojs = await browser.newContext({ javaScriptEnabled:false, viewport:{width:390,height:844} });
  await nojs.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  const plain = await nojs.newPage();
  await plain.goto(base, { waitUntil:'networkidle' });
  check(await plain.locator('h1').isVisible() && await plain.locator('a[href^="mailto:"]').first().isVisible(), 'No-JS visitor can read hero and reach email');
  check(await plain.locator('#contactForm').evaluate(e => getComputedStyle(e).display === 'none' || e.querySelector('button[type="submit"]').disabled), 'No-JS contact form cannot leak a GET enquiry');
  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
