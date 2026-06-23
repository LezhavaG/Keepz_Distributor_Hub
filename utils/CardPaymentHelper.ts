import { Page } from '@playwright/test';

export class CardPaymentHelper {
  constructor(private page: Page) {}

  async fillCardAndPay(cardNumber: string, expiry: string, cvv: string) {
    await this.page.click('#number');
    await this.page.waitForTimeout(500);

    const cleanCard = cardNumber.replace(/\s/g, '');
    await this.page.keyboard.type(cleanCard, { delay: 80 });
    await this.page.waitForTimeout(300);

    await this.page.keyboard.press('Space');
    await this.page.waitForTimeout(300);

    const cleanExpiry = expiry.replace(/\//g, '');
    await this.page.keyboard.type(cleanExpiry, { delay: 80 });
    await this.page.waitForTimeout(300);

    await this.page.keyboard.press('Space');
    await this.page.waitForTimeout(300);

    await this.page.keyboard.type(cvv, { delay: 80 });
    await this.page.waitForTimeout(1500);

    await this.page.click('[bdd-key="button-pay"]');
  }

  async fillOTPAndSubmit(otpCode: string) {
    await this.page.waitForSelector('input[name="code"]', { timeout: 10000 });
    await this.page.fill('input[name="code"]', otpCode);
    await this.page.click('[name="verify"]');
    await this.page.waitForLoadState('networkidle', { timeout: 30000 });
  }
}
