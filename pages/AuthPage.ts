import { APIRequestContext } from '@playwright/test';

/**
 * Authentication Page Object
 * ავტორიზაციის ლოგიკა (SMS → Verify → Login)
 */
export class AuthPage {
  private baseUrl = 'https://gateway.dev.keepz.me';

  constructor(private request: APIRequestContext) {}

  /**
   * Step 1: Send SMS
   */
  async sendSMS(phone: string, countryCode: string) {
    const response = await this.request.post(
      `${this.baseUrl}/common-service/api/v1/auth/send-sms`,
      {
        data: {
          smsType: 'LOGIN',
          phoneNumberDetails: {
            phoneNumber: phone,
            countryCode: countryCode,
          },
          otphash: 'string',
        },
      }
    );
    return response;
  }

  /**
   * Step 2: Verify SMS
   */
  async verifySMS(phone: string, countryCode: string, code: string) {
    const response = await this.request.post(
      `${this.baseUrl}/common-service/api/v1/auth/verify-sms`,
      {
        data: {
          countryCode,
          phone,
          code,
        },
      }
    );
    const data = await response.json();
    const userSMSId = data.value;
    return userSMSId;
  }

  /**
   * Step 3: Login and get access token
   */
  async login(userSMSId: string, phone: string) {
    const response = await this.request.post(
      `${this.baseUrl}/common-service/api/v1/auth/login`,
      {
        data: {
          userSMSId,
          deviceToken: 'string',
          mobileOS: 'IOS',
          mobileName: 'string',
          mobileNumber: phone,
          userType: 'BUSINESS',
        },
      }
    );
    const data = await response.json();
    const accessToken = data.value.access_token;
    return accessToken;
  }

  /**
   * Complete full authentication flow
   */
  async authenticate(
    phone: string = '591078180',
    countryCode: string = '995',
    smsCode: string = '111111'
  ): Promise<string> {
    await this.sendSMS(phone, countryCode);
    const userSMSId = await this.verifySMS(phone, countryCode, smsCode);
    const accessToken = await this.login(userSMSId, phone);
    return accessToken;
  }
}
