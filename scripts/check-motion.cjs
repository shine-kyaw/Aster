/* Integration checks with the real motion libraries. API requests are mocked;
   this script never sends enquiries or messages to a provider. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const results = [];
function check(pass, label, details) {
  results.push({ pass: !!pass, label });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${details === undefined ? '' : ': ' + JSON.stringify(details)}`);
}
async function scroll(page, top) {
  await page.evaluate(y => {
    if (window.__asterLenis) window.__asterLenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
    window.ScrollTrigger?.update();
  }, top);
  await page.waitForTimeout(1400);
}
async function prepare(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...options });
  await context.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Test only"}' }));
  const page = await context.newPage();
  page.motionErrors = [];
  page.on('pageerror', error => page.motionErrors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.gsap && window.ScrollTrigger);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2200);
  return page;
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  try {
    const page = await prepare(browser);
    const motto = await page.locator('h1').innerText();
    check(/Your Digital Presence/i.test(motto) && /Built to Bloom/i.test(motto), 'Brand motto retained in hero', motto);
    await page.mouse.move(180, 180);
    await page.waitForTimeout(1100);
    const tiltBefore = await page.locator('#heroFlower').evaluate(e => getComputedStyle(e).transform);
    await page.mouse.move(1180, 620);
    await page.waitForTimeout(1100);
    const tiltAfter = await page.locator('#heroFlower').evaluate(e => ({ transform: getComputedStyle(e).transform, display: getComputedStyle(e).display }));
    check(tiltBefore !== tiltAfter.transform && tiltAfter.display !== 'none', 'Visible hero flower responds to pointer', { before: tiltBefore, after: tiltAfter.transform });
    const targetScroll = await page.locator('#work').evaluate(e => e.getBoundingClientRect().top + scrollY - 96);
    await page.locator('.hero-secondary[href="#work"]').click();
    await page.waitForTimeout(120);
    const earlyScroll = await page.evaluate(() => scrollY);
    await page.waitForFunction(() => Math.abs(document.getElementById('work').getBoundingClientRect().top - 96) < 8, null, { timeout: 7000 });
    const navigation = await page.evaluate(() => ({ hash: location.hash, focus: document.activeElement.id, scroll: scrollY }));
    check(earlyScroll > 0 && earlyScroll < targetScroll - 100 && navigation.hash === '#work' && navigation.focus === 'work' && Math.abs(navigation.scroll - targetScroll) < 8, 'Hero CTA smoothly reaches work with URL and keyboard focus', { earlyScroll, targetScroll, ...navigation });
    const rail = await page.evaluate(() => {
      const trigger = ScrollTrigger.getAll().find(t => t.trigger?.classList.contains('work-rail') && t.pin);
      return trigger ? { start: trigger.start, end: trigger.end } : null;
    });
    check(rail && rail.end > rail.start + 300, 'Desktop gallery has a meaningful pinned scroll journey', rail);
    if (rail) {
      await scroll(page, rail.start + (rail.end - rail.start) * .15);
      const before = await page.locator('.work-track').evaluate(e => new DOMMatrixReadOnly(getComputedStyle(e).transform).m41);
      await scroll(page, rail.start + (rail.end - rail.start) * .7);
      const after = await page.locator('.work-track').evaluate(e => ({ x: new DOMMatrixReadOnly(getComputedStyle(e).transform).m41, top: e.getBoundingClientRect().top }));
      check(after.x < before - 200 && after.top >= 0 && after.top < 900, 'Scrolling moves pinned gallery horizontally', { before, ...after });
      await page.mouse.move(750, 450);
      await page.waitForTimeout(500);
      const lamp = await page.locator('#work > .lamp').evaluate(e => ({ lit: e.classList.contains('lit'), display: getComputedStyle(e).display, opacity: +getComputedStyle(e).opacity, transform: e.style.transform }));
      check(lamp.lit && lamp.display !== 'none' && lamp.opacity > 0 && lamp.transform, 'Dark-section pointer light is visible and tracks mouse', lamp);
    }
    const bloom = await page.evaluate(() => {
      const trigger = ScrollTrigger.getAll().find(t => t.trigger?.classList.contains('bloom-zoom') && typeof t.vars.onUpdate === 'function');
      return trigger ? { start: trigger.start, end: trigger.end, ready: trigger.trigger.classList.contains('motion-ready'), sticky: getComputedStyle(document.querySelector('.bloom-zoom-stage')).position } : null;
    });
    check(bloom && bloom.ready && bloom.end - bloom.start > 1000 && bloom.sticky === 'sticky', 'Studio bloom has active cinematic scroll stage', bloom);
    if (bloom) {
      // Reverse scrolling intentionally resets the cinematic sequence; start
      // a fresh forward journey before checking its first phase.
      await scroll(page, bloom.start);
      for (const [index, fraction] of [.4, .56, .72, .88].entries()) {
        await scroll(page, bloom.start + (bloom.end - bloom.start) * fraction);
        const phases = await page.locator('.ovule-reveal').evaluateAll(es => es.map(e => ({ phase: e.dataset.phase, opacity: +getComputedStyle(e).opacity, position: getComputedStyle(e).position })));
        const active = phases.reduce((a, b) => a.opacity > b.opacity ? a : b);
        check(active.phase === String(index + 1) && active.opacity > .8 && active.position === 'absolute', `Scroll reveals studio phase ${index + 1}`, phases);
      }
    }
    check(page.motionErrors.length === 0, 'Desktop motion has no uncaught errors', page.motionErrors);
    const mobile = await prepare(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const swipe = await mobile.locator('.work-rail').evaluate(e => ({ overflow: getComputedStyle(e).overflowX, scroll: e.scrollWidth, client: e.clientWidth, snap: getComputedStyle(e).scrollSnapType, pinned: ScrollTrigger.getAll().some(t => t.trigger === e && t.pin) }));
    check(swipe.overflow === 'auto' && swipe.scroll > swipe.client && !swipe.pinned && swipe.snap.includes('x'), 'Mobile gallery has native horizontal swipe and no pin', swipe);
    await mobile.locator('.work-rail').evaluate(e => e.scrollTo({ left: e.clientWidth, behavior: 'instant' }));
    await mobile.waitForTimeout(400);
    check(await mobile.locator('.work-rail').evaluate(e => e.scrollLeft > 100), 'Mobile gallery can reach following projects');
    check(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile animation layout has no page overflow');
    check(mobile.motionErrors.length === 0, 'Mobile motion has no uncaught errors', mobile.motionErrors);
    const reduced = await prepare(browser, { reducedMotion: 'reduce' });
    const fallback = await reduced.locator('.ovule-reveal').evaluateAll(es => es.map(e => ({ display: getComputedStyle(e).display, opacity: +getComputedStyle(e).opacity, position: getComputedStyle(e).position, height: e.getBoundingClientRect().height })));
    check(fallback.length === 4 && fallback.every(e => e.display !== 'none' && e.opacity === 1 && e.position === 'static' && e.height > 0), 'Reduced motion shows all four process phases', fallback);
    check(await reduced.evaluate(() => !ScrollTrigger.getAll().some(t => t.trigger?.classList.contains('work-rail') && t.pin)), 'Reduced motion disables gallery pinning');
    check(reduced.motionErrors.length === 0, 'Reduced motion has no uncaught errors', reduced.motionErrors);
  } finally { await browser.close(); }
  const failed = results.filter(r => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} motion checks passed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
