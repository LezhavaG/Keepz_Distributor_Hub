import { test, chromium } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { PaymentPage } from '../pages/PaymentPage';
import { GmailHelper } from '../utils/GmailHelper';
import * as dotenv from 'dotenv';

dotenv.config();

// ============================================
// BOG Open Banking
// ============================================

test('BOG Open Banking', async ({ request }) => {
  const authPage = new AuthPage(request);
  const paymentPage = new PaymentPage(request, null as any);

  const accessToken = await authPage.authenticate();

  const paymentUrl = await paymentPage.createPaymentOrder(accessToken, {
    amount: 0.1,
    receiverId: 'db1bb73d-30cf-4718-ad2b-bc25cd13b09c',
    integratorId: '76880b28-9033-4d48-b21f-37a9a36ec5dd',
    validUntil: '2026-12-30 14:40:23',
    openBankingLinkProvider: 'BOG',
  });

  console.log('\n✅ Order Created - BOG');

  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const page = (await browser.newContext()).newPage();

  await (await page).goto(paymentUrl);

  await automateBOG(await page);

  // ტესტის დასრულება - ბრაუზერის დახურვა
  await (await page).waitForTimeout(3000);
  await browser.close();
  console.log('✅ Browser closed - Test completed\n');
});

async function automateBOG(page: any) {
  const gmail = new GmailHelper(process.env.GMAIL_USER!, process.env.GMAIL_APP_PASSWORD!);

  // Login (Username + Password) - BOG custom components
  await page.click('bd-text-field#username');
  await page.waitForTimeout(300);
  await page.keyboard.type(process.env.BOG_USERNAME!, { delay: 80 });

  await page.click('bd-text-field#password');
  await page.waitForTimeout(300);
  await page.keyboard.type(process.env.BOG_PASSWORD!, { delay: 80 });

  await page.locator('bd-button#kc-login').click();
  console.log('✅ BOG Login submitted');

  await page.waitForLoadState('networkidle');

  // Email ღილაკზე კლიკი
  await page.getByText('Email').click();
  console.log('✅ Email clicked');

  await page.waitForLoadState('networkidle');

  // OTP ჩაწერა (Gmail-დან - BOG email-ით ფილტრაცია)
  const otp = await gmail.getLatestOTP(20, 'customerservice@bog.ge');
  console.log(`✅ OTP: ${otp}`);

  // BOG OTP input
  await page.locator('input[maxlength="6"]').fill(otp);
  console.log('✅ OTP entered');

  // LOG IN ღილაკი
  await page.click('bd-button[name="validateSMSCode"]');
  console.log('✅ LOG IN clicked');

  await page.waitForLoadState('networkidle');

  // Submit Corp Client
  await page.click('bd-button[name="submitCorpClient"]');
  console.log('✅ Submit Corp Client clicked');

  await page.waitForLoadState('networkidle');

  // ანგარიშის არჩევა
  await page.locator('bd-text-field[label="Your account"]').click();
  await page.waitForTimeout(500);

  // კონკრეტული ანგარიშის არჩევა
  await page.locator('bd-select-item[label="GE62BG0000000610917722GEL"]').click();
  console.log('✅ Account selected');

  await page.waitForLoadState('networkidle');

  // ბარათის დამატება - ბოლო სტეპი
  await page.locator('bd-button#kc-add-card-buttons').click();
  console.log('✅ Card added');

  // Success Modal-ის დახურვა (3 მეთოდი)
  await page.waitForTimeout(2000);

  try {
    await page.click('svg.absolute.top-5.right-5');
  } catch {
    try {
      await page.click('.bg-violet', { position: { x: 5, y: 5 } });
    } catch {
      await page.evaluate(() => {
        // @ts-ignore
        const modal = document.querySelector('.fixed.inset-0');
        if (modal) modal.remove();
      });
    }
  }

  await page.waitForTimeout(500);
  console.log('✅ Modal closed');

  // Skip ღილაკზე click
  await page.getByRole('button', { name: 'Skip' }).click();
  console.log('✅ Skip clicked');

  await page.waitForTimeout(1000);

  // Done ღილაკზე click
  await page.getByRole('button', { name: 'Done' }).click();
  console.log('✅ Done clicked\n');
}

// ============================================
// TBC Open Banking
// ============================================

test('TBC Auto-Fill Test', async ({ request }) => {
  const authPage = new AuthPage(request);
  const paymentPage = new PaymentPage(request, null as any);

  const accessToken = await authPage.authenticate();

  const paymentUrl = await paymentPage.createPaymentOrder(accessToken, {
    amount: 0.1,
    receiverId: 'db1bb73d-30cf-4718-ad2b-bc25cd13b09c',
    integratorId: '76880b28-9033-4d48-b21f-37a9a36ec5dd',
    validUntil: '2026-12-30 14:40:23',
    openBankingLinkProvider: 'TBC',
  });

  console.log('\n✅ Order Created');

  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const page = (await browser.newContext()).newPage();

  await (await page).goto(paymentUrl);

  await automateTBC(await page);

  await new Promise(resolve => setTimeout(resolve, 120000));
  await browser.close();
});

async function automateTBC(page: any) {
  const gmail = new GmailHelper(process.env.GMAIL_USER!, process.env.GMAIL_APP_PASSWORD!);

  // Login (Username + Password)
  await page.waitForSelector('#UserName');
  await page.fill('#UserName', process.env.TBC_USERNAME!);
  await page.fill('#Password', process.env.TBC_PASSWORD!);
  await page.click('button[type="submit"]');
  console.log('✅ Login submitted');

  await page.waitForLoadState('networkidle');

  // OTP ჩაწერა
  const otp = await gmail.getLatestOTP(20);
  console.log(`✅ OTP: ${otp}`);

  await page.fill('input[name="OtpCode"]', otp);
  await page.click('button[type="submit"]');
  console.log('✅ OTP submitted');

  await page.waitForLoadState('networkidle');

  // Dropdown - ანგარიშის არჩევა
  await page.click('.dropdown-header');
  await page.waitForTimeout(500);

  // ანგარიშის არჩევა (პირველი dropdown-item)
  await page.click('.dropdown-item');
  console.log('✅ Account selected');

  await page.waitForTimeout(500);

  // Checkbox დაჭერა (label-ზე კლიკი)
  await page.click('label[for="paymentAcceptanceCheckbox"]');
  await page.waitForTimeout(500);
  console.log('✅ Checkbox checked');

  // გადახდის დადასტურება
  await page.click('#acceptPaymentButton');
  console.log('✅ Payment confirmed');

  // Success Modal-ის დახურვა (3 მეთოდი)
  await page.waitForTimeout(2000);

  try {
    await page.click('svg.absolute.top-5.right-5');
  } catch {
    try {
      await page.click('.bg-violet', { position: { x: 5, y: 5 } });
    } catch {
      await page.evaluate(() => {
        // @ts-ignore
        const modal = document.querySelector('.fixed.inset-0');
        if (modal) modal.remove();
      });
    }
  }

  await page.waitForTimeout(500);
  console.log('✅ Modal closed');

  // Skip ღილაკზე click
  await page.getByRole('button', { name: 'Skip' }).click();
  console.log('✅ Skip clicked');

  await page.waitForTimeout(1000);

  // Done ღილაკზე click
  await page.getByRole('button', { name: 'Done' }).click();
  console.log('✅ Done clicked\n');
}
