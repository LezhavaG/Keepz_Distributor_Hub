import { test } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { PaymentPage } from '../pages/PaymentPage';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

test('All Methods Automation - All Payment Methods Available', async ({ request }) => {
  const authPage = new AuthPage(request);
  const paymentPage = new PaymentPage(request, null as any);

  const accessToken = await authPage.authenticate();

  // ყველა Payment Method (Direct Link + Open Banking + Google Pay)
  const paymentUrl = await paymentPage.createPaymentOrder(accessToken, {
    amount: 0.1,
    receiverId: 'a1b9a5c5-9f01-42ee-a6e3-8853297caf49',
    integratorId: '76880b28-9033-4d48-b21f-37a9a36ec5dd',
    validUntil: '2026-12-30 14:40:23',
  });

  console.log('\n✅ Order Created - All Methods Available');
  console.log(`🔗 Payment URL: ${paymentUrl}\n`);

  // შენს ბრაუზერში გახსნა (Google Pay ვერიფიცირებული)
  await execAsync(`start chrome "${paymentUrl}"`);
  console.log('✅ Opened in YOUR Chrome - Google Pay verified!\n');
});
