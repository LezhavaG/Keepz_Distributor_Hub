import { DistributorHubHelper } from '../../utils/DistributorHubHelper';
import { randomUUID } from 'crypto';

export const BOG_BANK = { name: 'BOG', iban: process.env.BOG_IBAN! };
export const TBC_BANK = { name: 'TBC', iban: process.env.TBC_IBAN! };
export const LIBERTY_BANK = { name: 'Liberty', iban: process.env.LIBERTY_IBAN! };
export const CREDO_BANK = { name: 'CREDO', iban: process.env.CREDO_IBAN! };

export const BOG_INVALID = { name: 'BOG', iban: process.env.BOG_INVALID_IBAN! };
export const TBC_INVALID = { name: 'TBC', iban: process.env.TBC_INVALID_IBAN! };
export const LIBERTY_INVALID = { name: 'Liberty', iban: process.env.LIBERTY_INVALID_IBAN! };
export const CREDO_INVALID = { name: 'CREDO', iban: process.env.CREDO_INVALID_IBAN! };

export const ALL_BANKS = [BOG_BANK, TBC_BANK, LIBERTY_BANK, CREDO_BANK];

export const INVALID_IBANS = [
  { name: 'BOG', iban: process.env.BOG_INVALID_IBAN! },
  { name: 'TBC', iban: process.env.TBC_INVALID_IBAN! },
  { name: 'Liberty', iban: process.env.LIBERTY_INVALID_IBAN! },
  { name: 'CREDO', iban: process.env.CREDO_INVALID_IBAN! },
];

export const TRANSACTION_AMOUNT = 0.1;
export const MIN_ALLOWED_AMOUNT = parseFloat(process.env.MIN_ALLOWED_AMOUNT || '0.02');
export const MAX_TRANSACTION_AMOUNT = parseFloat(process.env.MAX_TRANSACTION_AMOUNT || '100000');
export const BELOW_MIN_AMOUNT = parseFloat(process.env.BELOW_MIN_AMOUNT || '0.01');
export const INSUFFICIENT_BALANCE_AMOUNT = parseFloat(process.env.INSUFFICIENT_BALANCE_AMOUNT || '99999');
export const ABOVE_MAX_AMOUNT = parseFloat(process.env.ABOVE_MAX_AMOUNT || '999999');
export const CURRENCIES = ['GEL', 'USD', 'EUR'];

// Test fixtures for payer-details / paymentDescription tests (configurable via .env)
export const PAYER_DEBTOR_NAME = process.env.PAYER_DEBTOR_NAME || 'შპს ტესტი';
export const PAYER_DEBTOR_IBAN = process.env.PAYER_DEBTOR_IBAN || 'GE42CD0360000062461306';
export const PAYER_DEBTOR_IDENTITY = process.env.PAYER_DEBTOR_IDENTITY || '98809409129';
export const PAYER_DESCRIPTION = process.env.PAYER_DESCRIPTION || 'Test Payment';
export const PAYER_TEST_AMOUNT = parseFloat(process.env.PAYER_TEST_AMOUNT || '0.02');
export const BALANCE_UPDATE_AMOUNT = parseFloat(process.env.BALANCE_UPDATE_AMOUNT || '0.22');
export const BENEFICIARY_NAME = process.env.BENEFICIARY_NAME || 'Giorgi Lezhava';
export const BENEFICIARY_IDENTITY = process.env.BENEFICIARY_IDENTITY || '01024085016';
export const BENEFICIARY_ADDRESS = process.env.BENEFICIARY_ADDRESS || 'Tbilisi, Georgia';
export const BENEFICIARY_BIRTHDATE = process.env.BENEFICIARY_BIRTHDATE || '1990-01-01';

export async function runAuthenticationSuccessTest(request: any) {
  // Try to authenticate with correct credentials
  const payload = {
    client_id: process.env.DISTRIBUTOR_CLIENT_ID!,
    client_secret: process.env.DISTRIBUTOR_CLIENT_SECRET!,
    grant_type: process.env.DISTRIBUTOR_GRANT_TYPE!,
  };

  try {
    const url = 'https://distributor.dev.keepz.me/api/auth';
    const response = await request.post(url, { data: payload });

    const statusCode = response.status();
    const responseBody = await response.json();
    // Token is nested under "value" in the response
    const accessToken = responseBody.value?.access_token || responseBody.access_token || '';
    const isSuccessful = statusCode === 200 && !!accessToken;

    if (isSuccessful) {
      console.log(`✅ Authentication successful\n`);
    } else {
      console.log(`❌ Expected 200 with access token, got ${statusCode}\n`);
    }

    return [
      {
        transactionId: 0,
        bank: 'N/A',
        amount: TRANSACTION_AMOUNT,
        currency: 'GEL',
        status: isSuccessful ? ('Succeeded' as const) : ('Failed' as const),
        testCaseName: 'Successful Authentication',
        skipTransactionTable: true,
        category: 'Authentication Cases',
        apiCalls: [
          {
            name: 'Get Token',
            url: url,
            method: 'POST',
            requestBody: { ...payload, client_secret: '***' },
            statusCode: statusCode,
            expectedResult: { value: { access_token: 'string', token_type: 'Bearer' } },
            actualResult: responseBody,
            passed: isSuccessful,
          },
        ],
      },
    ];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Unexpected error: ${errorMsg}\n`);
    return [
      {
        transactionId: 0,
        bank: 'N/A',
        amount: TRANSACTION_AMOUNT,
        currency: 'GEL',
        status: 'Failed' as const,
        errorMessage: errorMsg,
        isExpectedError: false,
        testCaseName: 'Successful Authentication',
        skipTransactionTable: true,
        category: 'Authentication Cases',
      },
    ];
  }
}

export async function runHappyPathTest(request: any, banksToTest: typeof ALL_BANKS) {
  const hub = new DistributorHubHelper(request);

  // Step 1: Authenticate and get token
  await hub.authenticate();
  console.log('✅ Token successfully taken\n');
  const tokenCall = hub.apiCalls.find((c) => c.name === 'Get Token');
  if (tokenCall) {
    tokenCall.passed = tokenCall.statusCode === 200;
  }

  // Step 2: Check initial balances for all currencies (track these calls for the Balance Check case)
  const initialBalanceIdx = hub.apiCalls.length;
  const initialBalanceGEL = await hub.getBalance('GEL');
  const initialBalanceUSD = await hub.getBalance('USD');
  const initialBalanceEUR = await hub.getBalance('EUR');
  const initialBalanceCalls = hub.apiCalls.slice(initialBalanceIdx);
  initialBalanceCalls.forEach((c) => { c.passed = c.statusCode === 200; });

  const initialBalancesSuccessful = initialBalanceGEL && initialBalanceUSD && initialBalanceEUR;

  // Step 3: Create orders for all banks
  const transactions: Array<{ bank: string; id: number; status: string; currency: string; commission?: number; error?: string; uniqueId: string }> = [];
  const commissionByCurrency: { [key: string]: number } = { GEL: 0, USD: 0, EUR: 0 };

  for (const bank of banksToTest) {
    for (const currency of CURRENCIES) {
      const uniqueId = randomUUID();

      const payload: any = {
        amount: TRANSACTION_AMOUNT,
        currency: currency,
        description: `Payment to ${bank.name}`,
        toIban: bank.iban,
        uniqueId: uniqueId,
      };

      // LIBERTY requires beneficiaryName
      if (bank.name === 'Liberty') {
        payload.beneficiaryName = BENEFICIARY_NAME;
      }

      try {
        const transactionResponse = await hub.createTransaction(payload);

        console.log(`✅ Order created ${bank.name} - ${currency}`);

        transactions.push({
          bank: bank.name,
          id: transactionResponse.transactionId,
          status: transactionResponse.status,
          currency: currency,
          commission: 0,
          uniqueId: uniqueId,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`❌ Order failed ${bank.name} - ${currency} - ${errorMsg}`);

        transactions.push({
          bank: bank.name,
          id: 0,
          status: 'FAILED',
          currency: currency,
          error: errorMsg,
          uniqueId: uniqueId,
        });
      }
    }
  }

  // Step 3: Wait for all transactions to complete (in parallel)
  const pollPromises = transactions
    .filter(tx => tx.id !== 0)
    .map(tx =>
      hub.waitForTransactionCompletion(tx.id, 15, 60)
        .then(details => {
          const txIndex = transactions.findIndex(t => t.id === details.transactionId);
          if (txIndex !== -1) {
            transactions[txIndex].commission = details.commissionAmount || 0;
            commissionByCurrency[tx.currency] += details.commissionAmount || 0;
          }
          return { id: details.transactionId, status: details.status };
        })
        .catch(async () => {
          const details = await hub.getTransactionDetails(tx.id);
          const txIndex = transactions.findIndex(t => t.id === details.transactionId);
          if (txIndex !== -1) {
            transactions[txIndex].commission = details.commissionAmount || 0;
            commissionByCurrency[tx.currency] += details.commissionAmount || 0;
          }
          return { id: details.transactionId, status: details.status };
        })
    );

  const finalStatuses = await Promise.all(pollPromises);

  // Step 4: Check final balances for all currencies (track these calls for the Balance Check case)
  const finalBalanceIdx = hub.apiCalls.length;
  const finalBalanceGEL = await hub.getBalance('GEL');
  const finalBalanceUSD = await hub.getBalance('USD');
  const finalBalanceEUR = await hub.getBalance('EUR');
  const finalBalanceCalls = hub.apiCalls.slice(finalBalanceIdx);
  finalBalanceCalls.forEach((c) => { c.passed = c.statusCode === 200; });

  // Step 5: Build per-bank transaction cases (Details format).
  // Each bank case shows Get Token + per-currency (Create Order + Get Transaction Details).
  // Calls are matched by toIban/currency and transactionId (robust to parallel polling).
  const transactionTestCases = banksToTest.map((bank) => {
    const caseApiCalls: any[] = tokenCall ? [tokenCall] : [];
    let allSucceeded = true;

    for (const currency of CURRENCIES) {
      const tx = transactions.find((t) => t.bank === bank.name && t.currency === currency);

      // Create Order call for this bank+currency
      const createCall = hub.apiCalls.find(
        (c) => c.name === `Create Order (${currency})` && c.requestBody?.toIban === bank.iban
      );
      if (createCall) {
        createCall.expectedResult = { value: { transactionId: 'number', status: 'INITIAL|PENDING' } };
        createCall.passed = createCall.statusCode === 200 || createCall.statusCode === 201;
        caseApiCalls.push(createCall);
      }

      // Determine final status of this transaction
      const finalStatus = tx && tx.id !== 0 ? finalStatuses.find((s) => s.id === tx.id) : undefined;
      const succeeded = !!finalStatus && (finalStatus.status === 'COMPLETED' || finalStatus.status === 'SUCCESS');
      if (!succeeded) allSucceeded = false;

      // Get Transaction Details call (only for created transactions)
      if (tx && tx.id !== 0) {
        const detailsCall = hub.apiCalls.find(
          (c) => c.name === 'Get Transaction Details' && c.actualResult?.transactionId === tx.id
        );
        if (detailsCall) {
          // Returned transactionId must equal the requested transaction_id
          detailsCall.expectedResult = { transactionId: tx.id, status: 'COMPLETED|SUCCESS' };
          const idMatches = detailsCall.actualResult?.transactionId === tx.id;
          detailsCall.passed = succeeded && idMatches;
          if (!idMatches) allSucceeded = false;
          caseApiCalls.push(detailsCall);
        }
      }
    }

    return {
      transactionId: 0,
      bank: bank.name,
      amount: TRANSACTION_AMOUNT,
      currency: 'ALL',
      status: allSucceeded ? ('Succeeded' as const) : ('Failed' as const),
      testCaseName: `Distribute To ${bank.name}`,
      skipTransactionTable: true,
      category: 'Transactions',
      apiCalls: caseApiCalls,
    };
  });

  // Get succeeded transactions from the original transactions array (which has commission data)
  const succeededTxs = transactions.filter(tx => {
    const finalTx = finalStatuses.find(f => f.id === tx.id);
    return finalTx && (finalTx.status === 'COMPLETED' || finalTx.status === 'SUCCESS');
  });

  // Calculate detailed balance information for each currency
  const totalTransactionsGEL = TRANSACTION_AMOUNT * succeededTxs.filter(tx => tx.currency === 'GEL').length;
  const totalCommissionGEL = succeededTxs.filter(tx => tx.currency === 'GEL').reduce((sum, tx) => sum + (tx.commission || 0), 0);
  const totalDeductedGEL = totalTransactionsGEL + totalCommissionGEL;

  const totalTransactionsUSD = TRANSACTION_AMOUNT * succeededTxs.filter(tx => tx.currency === 'USD').length;
  const totalCommissionUSD = succeededTxs.filter(tx => tx.currency === 'USD').reduce((sum, tx) => sum + (tx.commission || 0), 0);
  const totalDeductedUSD = totalTransactionsUSD + totalCommissionUSD;

  const totalTransactionsEUR = TRANSACTION_AMOUNT * succeededTxs.filter(tx => tx.currency === 'EUR').length;
  const totalCommissionEUR = succeededTxs.filter(tx => tx.currency === 'EUR').reduce((sum, tx) => sum + (tx.commission || 0), 0);
  const totalDeductedEUR = totalTransactionsEUR + totalCommissionEUR;

  // Step 6: Create Balance Check test cases (with their own API calls in Details)
  const balanceCheckTestCases: any[] = [
    {
      transactionId: 0,
      bank: 'N/A',
      amount: 0,
      currency: 'GEL',
      status: initialBalancesSuccessful ? ('Succeeded' as const) : ('Failed' as const),
      errorMessage: initialBalancesSuccessful ? undefined : 'Failed to retrieve initial balances',
      testCaseName: 'Balance Check - Get Initial Balances',
      skipTransactionTable: true,
      category: 'Balance Check',
      apiCalls: tokenCall ? [tokenCall, ...initialBalanceCalls] : [...initialBalanceCalls],
    },
  ];

  // Add Final Balance Verification test case
  const balanceVerificationCorrect =
    Math.abs((initialBalanceGEL.amount - finalBalanceGEL.amount) - totalDeductedGEL) < 0.001 &&
    Math.abs((initialBalanceUSD.amount - finalBalanceUSD.amount) - totalDeductedUSD) < 0.001 &&
    Math.abs((initialBalanceEUR.amount - finalBalanceEUR.amount) - totalDeductedEUR) < 0.001;

  const balanceDetails = `GEL: Initial: ${initialBalanceGEL.amount.toFixed(2)} | Transactions: -${totalTransactionsGEL.toFixed(2)} | Commission: -${totalCommissionGEL.toFixed(2)} | Final: ${finalBalanceGEL.amount.toFixed(2)}\nUSD: Initial: ${initialBalanceUSD.amount.toFixed(2)} | Transactions: -${totalTransactionsUSD.toFixed(2)} | Commission: -${totalCommissionUSD.toFixed(2)} | Final: ${finalBalanceUSD.amount.toFixed(2)}\nEUR: Initial: ${initialBalanceEUR.amount.toFixed(2)} | Transactions: -${totalTransactionsEUR.toFixed(2)} | Commission: -${totalCommissionEUR.toFixed(2)} | Final: ${finalBalanceEUR.amount.toFixed(2)}`;

  balanceCheckTestCases.push({
    transactionId: 0,
    bank: 'N/A',
    amount: 0,
    currency: 'GEL',
    status: balanceVerificationCorrect ? ('Succeeded' as const) : ('Failed' as const),
    errorMessage: balanceDetails,
    testCaseName: 'Balance Check - Verify Final Balances',
    skipTransactionTable: true,
    category: 'Balance Check',
    apiCalls: tokenCall ? [tokenCall, ...finalBalanceCalls] : [...finalBalanceCalls],
  });

  const tableData = [...transactionTestCases, ...balanceCheckTestCases];

  // Return test data (report will be generated after all tests)
  return { tableData, balanceSummary: [] };
}

export async function runIncorrectClientIdTest(request: any) {
  // Try to authenticate with incorrect client_id (correct secret)
  const payload = {
    client_id: process.env.DISTRIBUTOR_WRONG_CLIENT_ID!,
    client_secret: process.env.DISTRIBUTOR_CLIENT_SECRET!,
    grant_type: process.env.DISTRIBUTOR_GRANT_TYPE!,
  };

  try {
    const response = await request.post(
      'https://distributor.dev.keepz.me/api/auth',
      { data: payload }
    );

    const statusCode = response.status();
    const responseBody = await response.json();
    const responseMessage = responseBody.message || responseBody.error || '';
    const isExpectedError = statusCode === 400 && responseMessage.includes('Client not found for given id.');

    if (isExpectedError) {
      console.log(`✅ Got expected error - Status ${statusCode}\n`);
    } else {
      console.log(`❌ Expected 400 with "Client not found for given id.", got ${statusCode}\n`);
    }

    return [
      {
        transactionId: 0,
        bank: 'N/A',
        amount: TRANSACTION_AMOUNT,
        currency: 'GEL',
        status: 'Failed' as const,
        isExpectedError: isExpectedError,
        testCaseName: 'Incorrect Client ID (Authentication)',
        skipTransactionTable: true,
        category: 'Authentication Cases',
        apiCalls: [
          {
            name: 'Get Token',
            url: 'https://distributor.dev.keepz.me/api/auth',
            method: 'POST',
            requestBody: { ...payload, client_secret: '***' },
            statusCode: statusCode,
            expectedResult: { message: 'Client not found for given id.' },
            actualResult: responseBody,
            passed: isExpectedError,
          },
        ],
      },
    ];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Unexpected error: ${errorMsg}\n`);
    return [
      {
        transactionId: 0,
        bank: 'N/A',
        amount: TRANSACTION_AMOUNT,
        currency: 'GEL',
        status: 'Failed' as const,
        errorMessage: errorMsg,
        isExpectedError: false,
        testCaseName: 'Incorrect Client ID (Authentication)',
        skipTransactionTable: true,
        category: 'Authentication Cases',
      },
    ];
  }
}

export async function runIncorrectCredentialsTest(request: any) {
  // Try to authenticate with incorrect credentials
  const payload = {
    client_id: process.env.DISTRIBUTOR_CLIENT_ID!,
    client_secret: process.env.DISTRIBUTOR_WRONG_CLIENT_SECRET!,
    grant_type: process.env.DISTRIBUTOR_GRANT_TYPE!,
  };

  try {
    const response = await request.post(
      'https://distributor.dev.keepz.me/api/auth',
      { data: payload }
    );

    const statusCode = response.status();
    const responseBody = await response.json();
    const responseMessage = responseBody.message || responseBody.error || '';
    const isExpectedError = statusCode === 400 && responseMessage.includes('Incorrect credentials');

    if (isExpectedError) {
      console.log(`✅ Got expected error - Status ${statusCode}\n`);
    } else {
      console.log(`❌ Expected 400 with "Incorrect credentials", got ${statusCode}\n`);
    }

    return [
      {
        transactionId: 0,
        bank: 'N/A',
        amount: TRANSACTION_AMOUNT,
        currency: 'GEL',
        status: 'Failed' as const,
        isExpectedError: isExpectedError,
        testCaseName: 'Invalid Credentials (Authentication)',
        skipTransactionTable: true,
        category: 'Authentication Cases',
        apiCalls: [
          {
            name: 'Get Token',
            url: 'https://distributor.dev.keepz.me/api/auth',
            method: 'POST',
            requestBody: { ...payload, client_secret: '***' },
            statusCode: statusCode,
            expectedResult: { message: 'Incorrect credentials' },
            actualResult: responseBody,
            passed: isExpectedError,
          },
        ],
      },
    ];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Unexpected error: ${errorMsg}\n`);
    return [
      {
        transactionId: 0,
        bank: 'N/A',
        amount: TRANSACTION_AMOUNT,
        currency: 'GEL',
        status: 'Failed' as const,
        errorMessage: errorMsg,
        isExpectedError: false,
        testCaseName: 'Invalid Credentials (Authentication)',
        skipTransactionTable: true,
        category: 'Authentication Cases',
      },
    ];
  }
}

export async function runAuthenticationFailureTest(request: any) {
  // Try to create a transaction without authenticating
  const payload: any = {
    amount: TRANSACTION_AMOUNT,
    currency: 'GEL',
    description: 'Payment without authentication',
    toIban: process.env.BOG_IBAN!,
  };

  // Use the REAL Create Order endpoint (same as createTransaction) so we
  // actually verify that endpoint requires authentication.
  const url = 'https://distributor.dev.keepz.me/api/distributor';
  let result = {
    statusCode: 0,
    responseBody: {} as any,
    isExpectedError: false,
  };

  try {
    // Try to make API call without token
    const response = await request.post(url, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header
      },
    });

    result.statusCode = response.status();
    result.responseBody = await response.json();
    const message = result.responseBody.message || result.responseBody.error || '';

    if (result.statusCode === 401 && message.includes('Authentication failed')) {
      console.log(`✅ Got expected 401 error\n`);
      result.isExpectedError = true;
    } else {
      console.log(`❌ Expected 401 with "Authentication failed", got ${result.statusCode}\n`);
      result.isExpectedError = false;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Unexpected error: ${errorMsg}\n`);
    result.statusCode = 0;
    result.responseBody = { error: errorMsg };
    result.isExpectedError = false;
  }

  // Return test data instead of generating report
  return [
    {
      transactionId: 0,
      bank: 'N/A',
      amount: TRANSACTION_AMOUNT,
      currency: 'GEL',
      status: 'Failed' as const,
      isExpectedError: result.isExpectedError,
      testCaseName: 'No Token (Authentication Failure)',
      skipTransactionTable: true,
      category: 'Authentication Cases',
      apiCalls: [
        {
          name: 'Create Order (No Token)',
          url: url,
          method: 'POST',
          requestBody: payload,
          statusCode: result.statusCode,
          expectedResult: { message: 'Authentication failed' },
          actualResult: result.responseBody,
          passed: result.isExpectedError,
        },
      ],
    },
  ];
}

export async function runInsufficientBalanceTest(
  request: any,
  banksToTest: typeof ALL_BANKS,
  expectedErrorMessage: string
) {
  return runBankGroupedNegativeTest(
    request,
    banksToTest,
    INSUFFICIENT_BALANCE_AMOUNT,
    expectedErrorMessage,
    'Insufficient Balance',
    'Insufficient Balance Cases'
  );
}

export async function runAboveMaximumAmountTest(
  request: any,
  banksToTest: typeof ALL_BANKS,
  expectedErrorMessage: string
) {
  return runBankGroupedNegativeTest(
    request,
    banksToTest,
    ABOVE_MAX_AMOUNT,
    expectedErrorMessage,
    'Above Maximum Amount',
    'Amount Validation Cases'
  );
}

export async function runBelowMinimumAmountTest(
  request: any,
  banksToTest: typeof ALL_BANKS,
  expectedErrorMessage: string
) {
  return runBankGroupedNegativeTest(
    request,
    banksToTest,
    BELOW_MIN_AMOUNT,
    expectedErrorMessage,
    'Below Minimum Amount',
    'Amount Validation Cases'
  );
}

export async function runNegativeTest(
  request: any,
  banksToTest: typeof ALL_BANKS,
  expectedErrorMessage: string
) {
  return runBankGroupedNegativeTest(
    request,
    banksToTest,
    TRANSACTION_AMOUNT,
    expectedErrorMessage,
    'Invalid IBAN',
    'Invalid IBAN Cases'
  );
}

// Helper function to fix expected results for negative test API calls
export function fixNegativeTestExpectedResults(apiCalls: any[], errorMessage: string): any[] {
  return apiCalls.map(call => {
    if (call.name.startsWith('Create Order')) {
      return {
        ...call,
        expectedResult: { message: errorMessage, statusCode: 'number' },
      };
    }
    return call;
  });
}

/**
 * Shared per-bank negative test runner.
 * Creates one test case PER BANK (not per bank+currency).
 * Each bank case's Details shows: Get Token (shared) + 3 Create Orders (GEL, USD, EUR).
 */
async function runBankGroupedNegativeTest(
  request: any,
  banksToTest: typeof ALL_BANKS,
  amount: number,
  expectedErrorMessage: string,
  testCaseSuffix: string,
  category: string
) {
  const hub = new DistributorHubHelper(request);

  await hub.authenticate();
  console.log('✅ Token successfully taken\n');

  // Capture the shared Get Token call (shown in every bank's Details)
  const tokenCall = hub.apiCalls.find((c) => c.name === 'Get Token');
  if (tokenCall) {
    tokenCall.passed = tokenCall.statusCode === 200;
  }

  const tableData: any[] = [];

  for (const bank of banksToTest) {
    // Record where this bank's Create Order calls begin
    const startIdx = hub.apiCalls.length;
    const currencyResults: Array<{ currency: string; isExpectedError: boolean }> = [];

    for (const currency of CURRENCIES) {
      const uniqueId = randomUUID();

      const payload: any = {
        amount: amount,
        currency: currency,
        description: `Payment to ${bank.name} - ${testCaseSuffix}`,
        toIban: bank.iban,
        uniqueId: uniqueId,
      };

      // LIBERTY requires beneficiaryName
      if (bank.name === 'Liberty') {
        payload.beneficiaryName = BENEFICIARY_NAME;
      }

      let isExpectedError = false;

      try {
        await hub.createTransaction(payload);
        // Got success when we expected an error
        console.log(`❌ Order succeeded (expected error) ${bank.name} - ${currency}`);
        isExpectedError = false;
      } catch (error: any) {
        try {
          const errorData = JSON.parse(error.message);
          const responseBody = errorData.response;
          const message = responseBody.message || responseBody.error || '';
          isExpectedError = message.includes(expectedErrorMessage);
        } catch {
          isExpectedError = String(error?.message || error).includes(expectedErrorMessage);
        }
        console.log(
          isExpectedError
            ? `✅ Got expected error ${bank.name} - ${currency}`
            : `❌ Got unexpected error ${bank.name} - ${currency}`
        );
      }

      currencyResults.push({ currency, isExpectedError });
    }

    // This bank's Create Order calls (only the 3 currencies for THIS bank)
    const bankCreateCalls = hub.apiCalls.slice(startIdx);
    // Mark each Create Order call passed/failed by its currency result (same order)
    bankCreateCalls.forEach((call, i) => {
      call.passed = currencyResults[i]?.isExpectedError ?? false;
    });
    const allExpected = currencyResults.every((r) => r.isExpectedError);

    // Details = shared token call + this bank's create orders
    const caseApiCalls = fixNegativeTestExpectedResults(
      [tokenCall, ...bankCreateCalls],
      expectedErrorMessage
    );

    tableData.push({
      transactionId: 0,
      bank: bank.name,
      amount: amount,
      currency: 'ALL',
      status: 'Failed' as const,
      isExpectedError: allExpected,
      testCaseName: `Distributor ${bank.name} - ${testCaseSuffix}`,
      skipTransactionTable: true,
      category: category,
      apiCalls: caseApiCalls,
    });
  }

  return { tableData, balanceSummary: [] };
}

/**
 * Balance Update test (positive flow).
 * For each currency: check balance -> update balance -> check balance again ->
 * verify the balance increased by the expected amount.
 * One test case per currency. Details shows: Get Token + Get Balance (initial)
 * + Update Balance + Get Balance (final).
 */
export async function runBalanceUpdateTest(request: any, amountToAdd: number = BALANCE_UPDATE_AMOUNT, currenciesToTest: string[] = CURRENCIES) {
  const hub = new DistributorHubHelper(request);

  await hub.authenticate();
  console.log('✅ Token successfully taken\n');

  const tokenCall = hub.apiCalls.find((c) => c.name === 'Get Token');
  if (tokenCall) {
    tokenCall.passed = tokenCall.statusCode === 200;
  }

  const tableData: any[] = [];

  for (const currency of currenciesToTest) {
    const startIdx = hub.apiCalls.length;

    // 1. Check initial balance
    const initial = await hub.getBalance(currency);
    // 2. Update (top up) balance
    const updateStatus = await hub.updateBalance(amountToAdd, currency);
    // 3. Check balance again
    const final = await hub.getBalance(currency);

    const expectedFinal = initial.amount + amountToAdd;
    const updateOk = updateStatus === 200;
    const correctlyUpdated = Math.abs(final.amount - expectedFinal) < 0.001;
    const passed = updateOk && correctlyUpdated;

    if (passed) {
      console.log(`✅ Balance updated correctly ${currency}: ${initial.amount.toFixed(2)} + ${amountToAdd} = ${final.amount.toFixed(2)}`);
    } else {
      console.log(`❌ Balance update issue ${currency}: expected ${expectedFinal.toFixed(2)}, got ${final.amount.toFixed(2)} (update status ${updateStatus})`);
    }

    // Per-call pass/fail badges
    const currencyCalls = hub.apiCalls.slice(startIdx); // [initial balance, update, final balance]
    if (currencyCalls[0]) currencyCalls[0].passed = currencyCalls[0].statusCode === 200;
    if (currencyCalls[1]) currencyCalls[1].passed = updateOk;
    if (currencyCalls[2]) currencyCalls[2].passed = correctlyUpdated;

    const caseApiCalls = [tokenCall, ...currencyCalls];

    const summary = `${currency} balance updated: ${initial.amount.toFixed(2)} + ${amountToAdd.toFixed(2)} = ${final.amount.toFixed(2)} (Expected: ${expectedFinal.toFixed(2)})`;

    tableData.push({
      transactionId: 0,
      bank: 'N/A',
      amount: amountToAdd,
      currency: currency,
      status: passed ? ('Succeeded' as const) : ('Failed' as const),
      errorMessage: summary,
      testCaseName: `Balance Update - ${currency}`,
      skipTransactionTable: true,
      category: 'Balance Update Cases',
      apiCalls: caseApiCalls,
    });
  }

  return { tableData, balanceSummary: [] };
}

/**
 * Payment Description test (positive).
 * Creates orders with payer (debtor) details and verifies the back-end builds
 * paymentDescription = "{debtorName}, {debtorIban}, {debtorIdentityNumber}, {description}".
 * When includeBeneficiary is true, beneficiary details are ALSO sent - and the
 * test verifies they do NOT appear in paymentDescription (only payer + description).
 * One test case per bank; Details shows Get Token + per-currency (Create Order + Get Transaction Details).
 */
export async function runPaymentDescriptionTest(
  request: any,
  banksToTest: typeof ALL_BANKS,
  includeBeneficiary: boolean,
  testCaseSuffix: string,
  category: string
) {
  const hub = new DistributorHubHelper(request);

  await hub.authenticate();
  console.log('✅ Token successfully taken\n');

  const tokenCall = hub.apiCalls.find((c) => c.name === 'Get Token');
  if (tokenCall) {
    tokenCall.passed = tokenCall.statusCode === 200;
  }

  // Expected paymentDescription is ALWAYS payer details + description (never beneficiary)
  const expectedPaymentDescription = `${PAYER_DEBTOR_NAME}, ${PAYER_DEBTOR_IBAN}, ${PAYER_DEBTOR_IDENTITY}, ${PAYER_DESCRIPTION}`;

  const tableData: any[] = [];

  for (const bank of banksToTest) {
    const startIdx = hub.apiCalls.length;
    const currencyResults: Array<{ currency: string; matches: boolean }> = [];

    for (const currency of CURRENCIES) {
      const payload: any = {
        amount: PAYER_TEST_AMOUNT,
        currency: currency,
        description: PAYER_DESCRIPTION,
        toIban: bank.iban,
        debtorName: PAYER_DEBTOR_NAME,
        debtorIban: PAYER_DEBTOR_IBAN,
        debtorIdentityNumber: PAYER_DEBTOR_IDENTITY,
      };

      if (includeBeneficiary) {
        payload.beneficiaryName = BENEFICIARY_NAME;
        payload.beneficiaryIdentityNumber = BENEFICIARY_IDENTITY;
        payload.beneficiaryAddress = BENEFICIARY_ADDRESS;
        payload.beneficiaryBirthDate = BENEFICIARY_BIRTHDATE;
      } else if (bank.name === 'Liberty') {
        // Liberty requires beneficiaryName even when we only test payer details.
        // (It still must NOT appear in paymentDescription.)
        payload.beneficiaryName = BENEFICIARY_NAME;
      }

      let matches = false;
      try {
        const created = await hub.createTransaction(payload);
        const details = await hub.getTransactionDetails(created.transactionId);
        const actual = details.paymentDescription || '';
        matches = actual === expectedPaymentDescription;
        if (matches) {
          console.log(`✅ paymentDescription correct ${bank.name} - ${currency}`);
        } else {
          console.log(`❌ paymentDescription mismatch ${bank.name} - ${currency}: got "${actual}"`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`❌ Order creation failed ${bank.name} - ${currency}: ${msg}`);
        matches = false;
      }

      currencyResults.push({ currency, matches });
    }

    // This bank's calls: [Create GEL, Details GEL, Create USD, Details USD, Create EUR, Details EUR]
    const bankCalls = hub.apiCalls.slice(startIdx);
    bankCalls.forEach((call) => {
      if (call.name.startsWith('Create Order')) {
        call.passed = call.statusCode === 200 || call.statusCode === 201;
      } else if (call.name === 'Get Transaction Details') {
        // Returned transactionId must equal the requested transaction_id (from the URL)
        const reqId = Number((call.url.split('transaction_id=')[1] || '').split('&')[0]);
        call.expectedResult = { transactionId: reqId, paymentDescription: expectedPaymentDescription };
        const pd = call.actualResult?.paymentDescription || '';
        const idMatches = call.actualResult?.transactionId === reqId;
        call.passed = pd === expectedPaymentDescription && idMatches;
      }
    });

    const allMatch = currencyResults.every((r) => r.matches);
    const caseApiCalls = [tokenCall, ...bankCalls];
    const summary = `Expected paymentDescription: "${expectedPaymentDescription}"`;

    tableData.push({
      transactionId: 0,
      bank: bank.name,
      amount: PAYER_TEST_AMOUNT,
      currency: 'ALL',
      status: allMatch ? ('Succeeded' as const) : ('Failed' as const),
      errorMessage: summary,
      testCaseName: `${testCaseSuffix} - ${bank.name}`,
      skipTransactionTable: true,
      category: category,
      apiCalls: caseApiCalls,
    });
  }

  return { tableData, balanceSummary: [] };
}
