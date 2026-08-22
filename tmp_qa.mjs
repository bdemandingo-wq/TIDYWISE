import { chromium } from 'playwright';

const base = 'http://localhost:8080';
const browser = await chromium.launch({ executablePath: '/bin/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));

async function login() {
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill('support+paywalltest2@tidywisecleaning.com');
  await page.locator('#password').fill('TestPaywall2026!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL('**/dashboard**', { timeout: 20000 });
  await page.waitForTimeout(2000);
}
await login();
console.log('logged in, url:', page.url());
await page.screenshot({ path: '/tmp/shots/01-after-login.png' });
console.log('ERRORS SO FAR:', errors.length);
await browser.close();
