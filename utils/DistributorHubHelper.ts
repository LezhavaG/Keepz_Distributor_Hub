import { APIRequestContext } from '@playwright/test';
import { randomUUID } from 'crypto';

export interface TransactionPayload {
  amount: number;
  currency: string;
  description: string;
  toIban: string;
  beneficiaryName?: string;
  beneficiaryAddress?: string;
  debtorName?: string;
  debtorIban?: string;
  debtorIdentityNumber?: string;
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

export class DistributorHubHelper {
  private baseUrl = 'https://distributor.dev.keepz.me';
  private clientId = process.env.DISTRIBUTOR_CLIENT_ID!;
  private clientSecret = process.env.DISTRIBUTOR_CLIENT_SECRET!;
  private accessToken: string = '';

  constructor(private request: APIRequestContext) {}

  async authenticate(): Promise<string> {
    const response = await this.request.post(`${this.baseUrl}/api/auth`, {
      data: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      },
    });

    const data = await response.json();
    this.accessToken = data.value.access_token;
    return this.accessToken;
  }

  async getBalance(currency: string = 'GEL'): Promise<BalanceResponse> {
    const response = await this.request.get(
      `${this.baseUrl}/api/distributor/balance/check?currency=${currency}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    const data = await response.json();
    return data.value;
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

    if (payload.beneficiaryAddress) {
      requestBody.beneficiaryAddress = payload.beneficiaryAddress;
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

    if (payload.birthDate) {
      requestBody.birthDate = payload.birthDate;
    }

    const response = await this.request.post(`${this.baseUrl}/api/distributor`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      data: requestBody,
    });

    const data = await response.json();
    if (data.value) {
      return data.value;
    }

    // Throw error with status code and full response
    const error = new Error(JSON.stringify({ statusCode: response.status(), response: data }));
    throw error;
  }

  async getTransactionDetails(transactionId: number): Promise<TransactionDetailsResponse> {
    const response = await this.request.get(
      `${this.baseUrl}/api/distributor/details?transaction_id=${transactionId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    const data = await response.json();
    return data.value;
  }

  async waitForTransactionCompletion(
    transactionId: number,
    maxRetries: number = 10,
    retryIntervalSeconds: number = 30
  ): Promise<TransactionDetailsResponse> {
    let attempts = 0;
    const finalStatuses = ['COMPLETED', 'SUCCESS', 'FAILED', 'REJECTED', 'CANCELLED'];

    while (attempts < maxRetries) {
      const details = await this.getTransactionDetails(transactionId);

      if (finalStatuses.includes(details.status)) {
        if (details.status === 'FAILED') {
          throw new Error(`❌ Transaction FAILED! ID: ${transactionId}, Description: ${details.statusDescription}`);
        }
        return details;
      }

      attempts++;
      if (attempts < maxRetries) {
        console.log(`⏳ Transaction ${transactionId} status: ${details.status}. Retrying in ${retryIntervalSeconds}s (attempt ${attempts}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, retryIntervalSeconds * 1000));
      }
    }

    throw new Error(`⏱️ Transaction ${transactionId} did not complete after ${maxRetries * retryIntervalSeconds} seconds`);
  }
}
