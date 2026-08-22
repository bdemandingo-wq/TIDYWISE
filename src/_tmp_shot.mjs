import { chromium } from 'playwright';
const url = process.env.APP_URL || 'http://localhost:8080/dashboard/campaigns';
const width = parseInt(process.argv[2]||'390',10);
const browser = await chromium.launch({executablePath:'/bin/chromium'});
const page = await browser.newPage({ viewport: { width, height: 900 } });
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/tmp/w${width}_0_list.png` });
  const btn = page.getByText('New Campaign', { exact: false }).first();
  await btn.click({ timeout: 10000 }).catch(()=>{});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/w${width}_1_step1.png` });
  await page.getByPlaceholder(/Spring Cleaning Promo/i).fill('Test Campaign').catch(()=>{});
  await page.getByText('Both', { exact: true }).click().catch(()=>{});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/w${width}_1b_step1_filled.png` });
  await page.getByRole('button', { name: 'Continue' }).click({timeout:5000}).catch(()=>{});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/w${width}_2_step2.png` });
  await page.getByRole('button', { name: 'Continue' }).click({timeout:5000}).catch(()=>{});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/w${width}_3_step3.png` });
} catch(e) {
  console.error(e);
  await page.screenshot({ path: `/tmp/w${width}_error.png` });
}
await browser.close();
