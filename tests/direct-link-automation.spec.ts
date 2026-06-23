import { test, chromium } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { PaymentPage } from '../pages/PaymentPage';
import { CardPaymentHelper } from '../utils/CardPaymentHelper';
import { GmailHelper } from '../utils/GmailHelper';
import * as dotenv from 'dotenv';

dotenv.config();

test('BOG Direct Link - სრული ავტომატიზაცია', async ({ request }) => {
  const authPage = new AuthPage(request);
  const paymentPage = new PaymentPage(request, null as any);

  const accessToken = await authPage.authenticate();

  const paymentUrl = await paymentPage.createPaymentOrder(accessToken, {
    amount: 0.1,
    receiverId: 'a1b9a5c5-9f01-42ee-a6e3-8853297caf49',
    integratorId: '76880b28-9033-4d48-b21f-37a9a36ec5dd',
    validUntil: '2026-12-30 14:40:23',
    directLinkProvider: 'BOG',
  });

  console.log('\n✅ Order Created');

  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(paymentUrl);
  console.log('✅ Page loaded');

  await automatePayment(page);

  // Close immediately after completion
  await page.waitForTimeout(3000);
  await browser.close();
  console.log('✅ Browser closed\n');
});

async function automatePayment(page: any) {
  const card = new CardPaymentHelper(page);
  const gmail = new GmailHelper(process.env.GMAIL_USER!, process.env.GMAIL_APP_PASSWORD!);

  // ბარათის მონაცემების ჩაწერა (Card Number, Expiry, CVV)
  await card.fillCardAndPay('4315 7140 0386 4442', '11/27', '581');
  console.log('✅ Card filled');

  // ელოდება გვერდის ჩატვირთვას
  await page.waitForLoadState('networkidle');

  // Gmail-დან OTP-ს მიღება (ბოლო 30 წამის ახალი OTP)
  const otp = await gmail.getLatestOTP(20);
  console.log(`✅ OTP: ${otp}`);

  // OTP-ს ჩაწერა და Submit
  await card.fillOTPAndSubmit(otp);
  console.log('✅ Payment completed');

  // Success Modal-ის დახურვა (3 მეთოდი)
  await page.waitForTimeout(2000);

  try {
    // მეთოდი 1: X ღილაკზე click (SVG)
    await page.click('svg.absolute.top-5.right-5');
  } catch {
    try {
      // მეთოდი 2: Backdrop-ზე click (modal-ის გარეთ)
      await page.click('.bg-violet', { position: { x: 5, y: 5 } });
    } catch {
      // მეთოდი 3: JavaScript-ით force წაშლა
      await page.evaluate(() => {
        // @ts-ignore - Browser context
        const modal = document.querySelector('.fixed.inset-0');
        if (modal) modal.remove();
      });
    }
  }

  await page.waitForTimeout(500);
  console.log('✅ Modal closed');

  // Skip ღილაკზე click - შემდეგ გვერდზე გადასვლა
  await page.getByRole('button', { name: 'Skip' }).click();
  console.log('✅ Skip clicked');

  await page.waitForTimeout(1000);

  // Done ღილაკზე click - სრული დასრულება
  await page.getByRole('button', { name: 'Done' }).click();
  console.log('✅ Done clicked\n');
}

// ============================================
// TBC Direct Link - Card Payment
// ============================================

test('TBC Direct Link - სრული ავტომატიზაცია', async ({ request }) => {
  const authPage = new AuthPage(request);
  const paymentPage = new PaymentPage(request, null as any);

  // ავტორიზაცია
  const accessToken = await authPage.authenticate();

  // Order შექმნა TBC directLinkProvider-ით
  const paymentUrl = await paymentPage.createPaymentOrder(accessToken, {
    amount: 0.1,
    receiverId: 'a1b9a5c5-9f01-42ee-a6e3-8853297caf49',
    integratorId: '76880b28-9033-4d48-b21f-37a9a36ec5dd',
    validUntil: '2026-12-30 14:40:23',
    directLinkProvider: 'TBC',
  });

  console.log('\n✅ Order Created - TBC');

  // Chrome გახსნა
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(paymentUrl);
  console.log('✅ TBC page loaded');

  await automateTBCPayment(page);

  await page.waitForTimeout(3000);
  await browser.close();
  console.log('✅ Browser closed\n');
});

async function automateTBCPayment(page: any) {
  const gmail = new GmailHelper(process.env.GMAIL_USER!, process.env.GMAIL_APP_PASSWORD!);

  // ბარათის მონაცემების ჩაწერა (TBC selectors)
  await page.waitForSelector('#cardNumber', { timeout: 10000 });

  await page.fill('#cardNumber', '4315714003864442');
  await page.fill('#cardExpirationDateCustom', '1127');
  await page.fill('#cvc2', '581');

  console.log('✅ Card filled');

  // Submit ღილაკზე click
  await page.click('#payment-submit');
  console.log('✅ Submit clicked');

  // ელოდება OTP გვერდს
  await page.waitForLoadState('networkidle');

  // Gmail-დან OTP მიღება
  const otp = await gmail.getLatestOTP(20);
  console.log(`✅ OTP: ${otp}`);

  // OTP-ს ჩაწერა (იგივე selector რაც BOG-ზე)
  await page.waitForSelector('input[name="code"]', { timeout: 10000 });
  await page.fill('input[name="code"]', otp);
  await page.click('[name="verify"]');
  console.log('✅ Payment completed');

  // Success Modal-ის დახურვა
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
