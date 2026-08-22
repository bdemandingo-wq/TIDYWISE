import { chromium } from 'playwright';

const base = 'http://localhost:8080';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE ERR:', m.text()); });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

async function login() {
  // try to detect if already logged in by navigating to dashboard/staff
  await page.goto(base + '/dashboard/staff', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const url = page.url();
  console.log('after nav url:', url);
}
await login();
await page.screenshot({ path: '/tmp/shots/00-staff-initial.png', fullPage: true });
console.log(page.url());
await browser.close();
