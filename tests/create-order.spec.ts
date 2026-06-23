import { test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { PaymentPage } from '../pages/PaymentPage';
import * as dotenv from 'dotenv';

dotenv.config();

test('Create Order Only - No Automation', async ({ request }) => {
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
  console.log(`\n🔗 Payment URL:\n${paymentUrl}\n`);
});
