import { APIRequestContext } from '@playwright/test';
import { randomUUID } from 'crypto';

export interface TransactionPayload {
  amount: number;
  currency: string;
  description: string;
  toIban: string;
  beneficiaryName?: string;
  beneficiaryIdentityNumber?: string;
  beneficiaryAddress?: string;
  beneficiaryBirthDate?: string;
  debtorName?: string;
  debtorIban?: string;
  debtorIdentityNumber?: string;
  debtorBirthDate?: string;
  birthDate?: string;
}

export interface TransactionResponse {
  transactionId: number;
  status: string;
  statusDescription: string;
  uniqueId: string;
  createdAt: string;
  commissionAmount?: number;
}

export interface BalanceResponse {
  amount: number;
  currency: string;
}

export interface TransactionDetailsResponse {
  transactionId: number;
  status: string;
  statusDescription: string;
  amount: number;
  toIban: string;
  currency: string;
  paymentDescription: string;
  uniqueId: string;
  createdAt: string;
  commissionAmount: number;
}

export interface ApiCall {
  name: string;
  url: string;
  method: string;
  statusCode: number;
  requestBody?: any;
  expectedResult: any;
  actualResult: any;
  passed?: boolean;
}

export class DistributorHubHelper {
  private baseUrl = process.env.DISTRIBUTOR_BASE_URL || 'https://distributor.dev.keepz.me';
  private clientId = process.env.DISTRIBUTOR_CLIENT_ID!;
  private clientSecret = process.env.DISTRIBUTOR_CLIENT_SECRET!;
  private accessToken: string = '';
  apiCalls: ApiCall[] = [];

  constructor(private request: APIRequestContext) {}

  async authenticate(): Promise<string> {
    const url = `${this.baseUrl}/api/auth`;
    const requestBody = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: process.env.DISTRIBUTOR_GRANT_TYPE || 'client_credentials',
    };
    const response = await this.request.post(url, {
      data: requestBody,
    });

    const data = await response.json();
    this.accessToken = data.value.access_token;

    this.apiCalls.push({
      name: 'Get Token',
      url: url,
      method: 'POST',
      requestBody: { ...requestBody, client_secret: '***' },
      statusCode: response.status(),
      expectedResult: { access_token: '***' },
      actualResult: data,
    });

    return this.accessToken;
  }

  async getBalance(currency: string = 'GEL'): Promise<BalanceResponse> {
    const url = `${this.baseUrl}/api/distributor/balance/check?currency=${currency}`;
    const response = await this.request.get(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    const data = await response.json();

    this.apiCalls.push({
      name: `Get Balance (${currency})`,
      url: url,
      method: 'GET',
      requestBody: 'N/A (GET request - no body)',
      statusCode: response.status(),
      expectedResult: { amount: 'number', currency: currency },
      actualResult: data.value,
    });

    return data.value;
  }

  /**
   * Update (top up) the integrator balance for a currency.
   * This endpoint returns NO response body - only a status code (200 = success).
   * Uses clientId + secret directly in the body (not the Bearer token).
   */
  async updateBalance(amount: number, currency: string = 'GEL'): Promise<number> {
    const url = `${this.baseUrl}/api/distributor/balance/update`;
    const requestBody = {
      amount: amount,
      clientId: this.clientId,
      // Balance update uses a SEPARATE secret, not the OAuth client_secret
      secret: process.env.DISTRIBUTOR_BALANCE_SECRET!,
      currency: currency,
    };

    const response = await this.request.put(url, {
      data: requestBody,
    });

    const statusCode = response.status();

    // No response body for this endpoint - capture whatever comes back (if any)
    let actualBody: any;
    try {
      const text = await response.text();
      actualBody = text ? JSON.parse(text) : { statusCode };
    } catch {
      actualBody = { statusCode };
    }

    this.apiCalls.push({
      name: `Update Balance (${currency})`,
      url: url,
      method: 'PUT',
      requestBody: { ...requestBody, secret: '***' },
      statusCode: statusCode,
      expectedResult: { statusCode: 200 },
      actualResult: actualBody,
    });

    return statusCode;
  }

  async createTransaction(payload: TransactionPayload): Promise<TransactionResponse> {
    const requestBody: any = {
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description,
      toIban: payload.toIban,
      uniqueId: randomUUID(),
    };

    if (payload.beneficiaryName) {
      requestBody.beneficiaryName = payload.beneficiaryName;
    }

    if (payload.beneficiaryIdentityNumber) {
      requestBody.beneficiaryIdentityNumber = payload.beneficiaryIdentityNumber;
    }

    if (payload.beneficiaryAddress) {
      requestBody.beneficiaryAddress = payload.beneficiaryAddress;
    }

    if (payload.beneficiaryBirthDate) {
      requestBody.beneficiaryBirthDate = payload.beneficiaryBirthDate;
    }

    if (payload.debtorName) {
      requestBody.debtorName = payload.debtorName;
    }

    if (payload.debtorIban) {
      requestBody.debtorIban = payload.debtorIban;
    }

    if (payload.debtorIdentityNumber) {
      requestBody.debtorIdentityNumber = payload.debtorIdentityNumber;
    }

    if (payload.debtorBirthDate) {
      requestBody.debtorBirthDate = payload.debtorBirthDate;
    }

    if (payload.birthDate) {
      requestBody.birthDate = payload.birthDate;
    }

    const url = `${this.baseUrl}/api/distributor`;
    const response = await this.request.post(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      data: requestBody,
    });

    const data = await response.json();

    this.apiCalls.push({
      name: `Create Order (${payload.currency})`,
      url: url,
      method: 'POST',
      requestBody: requestBody,
      statusCode: response.status(),
      expectedResult: {
        value: {
          transactionId: 'number (generated by server)',
          status: 'INITIAL',
          statusDescription: 'Initial',
          uniqueId: requestBody.uniqueId,
          createdAt: 'string (ISO timestamp, set by server)',
          distributionFlow: 'STANDARD',
        },
      },
      actualResult: data,
    });

    if (data.value) {
      return data.value;
    }

    // Throw error with status code and full response
    const error = new Error(JSON.stringify({ statusCode: response.status(), response: data }));
    throw error;
  }

  async getTransactionDetails(transactionId: number): Promise<TransactionDetailsResponse> {
    const url = `${this.baseUrl}/api/distributor/details?transaction_id=${transactionId}`;
    const response = await this.request.get(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    const data = await response.json();

    this.apiCalls.push({
      name: 'Get Transaction Details',
      url: url,
      method: 'GET',
      statusCode: response.status(),
      expectedResult: { transactionId: transactionId, status: 'string' },
      actualResult: data.value,
    });

    return data.value;
  }

  async waitForTransactionCompletion(
    transactionId: number,
    maxRetries: number = 10,
    retryIntervalSeconds: number = 30,
    onBeforePoll?: (transactionId: number) => Promise<void>,
    hookAfterTries: number = 0
  ): Promise<TransactionDetailsResponse> {
    let attempts = 0;
    // Terminal statuses that end polling (override via .env if the API adds more).
    const finalStatuses = (process.env.TRANSACTION_FINAL_STATUSES || 'COMPLETED,SUCCESS,FAILED,REJECTED,CANCELLED')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let lastStatus = 'unknown';

    while (attempts < maxRetries) {
      try {
        // Refresh the status first (trigger update-status for BOG/Liberty so a
        // just-signed transaction shows up on this read) — but only after the
        // first `hookAfterTries` reads, to give the signing bot its own cycle
        // before we start nudging. `attempts` here = reads already completed
        // (0 before the 1st read, 1 before the 2nd, ...), so with hookAfterTries=3
        // reads 1-3 are plain and read 4+ triggers the hook.
        if (onBeforePoll && attempts >= hookAfterTries) await onBeforePoll(transactionId);

        const url = `${this.baseUrl}/api/distributor/details?transaction_id=${transactionId}`;
        const response = await this.request.get(url, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });
        const data = await response.json();
        const details = data.value;
        lastStatus = details?.status ?? lastStatus;

        if (finalStatuses.includes(details.status)) {
          // Track the final API call
          this.apiCalls.push({
            name: 'Get Transaction Details',
            url: url,
            method: 'GET',
            statusCode: response.status(),
            expectedResult: { transactionId: transactionId, status: 'COMPLETED|SUCCESS' },
            actualResult: details,
          });

          if (details.status === 'FAILED') {
            throw new Error(`❌ Transaction FAILED! ID: ${transactionId}, Description: ${details.statusDescription}`);
          }
          return details;
        }
      } catch (err) {
        // A genuine FAILED status carries our marker — propagate it.
        if (err instanceof Error && err.message.startsWith('❌ Transaction FAILED')) throw err;
        // Otherwise it's a transient poll error (network/JSON) — keep retrying.
        console.log(`⚠️  Poll error for transaction ${transactionId}: ${err instanceof Error ? err.message : String(err)}`);
      }

      attempts++;
      if (attempts < maxRetries) {
        console.log(`⏳ Transaction ${transactionId} status: ${lastStatus}. Retrying in ${retryIntervalSeconds}s (attempt ${attempts}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, retryIntervalSeconds * 1000));
      }
    }

    throw new Error(`⏱️ Transaction ${transactionId} did not complete after ${maxRetries * retryIntervalSeconds} seconds`);
  }
}
