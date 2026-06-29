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

export async function runAuthenticationSuccessTest(request: any) {
  // Try to authenticate with correct credentials
  const payload = {
    client_id: process.env.DISTRIBUTOR_CLIENT_ID!,
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
    const responseJson = JSON.stringify(responseBody, null, 2);
    const accessToken = responseBody.access_token || '';
    const isSuccessful = statusCode === 200 && accessToken;

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
        errorMessage: `Status: ${statusCode}\n\n${responseJson}`,
        isExpectedError: true,
        testCaseName: 'Successful Authentication',
        skipTransactionTable: true,
        category: 'Authentication Cases',
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

  // Step 2: Check initial balances for all currencies
  const initialBalanceGEL = await hub.getBalance('GEL');
  const initialBalanceUSD = await hub.getBalance('USD');
  const initialBalanceEUR = await hub.getBalance('EUR');

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
        payload.beneficiaryName = 'Giorgi Lezhava';
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

  // Step 4: Check final balances for all currencies
  const finalBalanceGEL = await hub.getBalance('GEL');
  const finalBalanceUSD = await hub.getBalance('USD');
  const finalBalanceEUR = await hub.getBalance('EUR');

  // Step 5: Final Report - Table Format
  const transactionTestCases = transactions.map((tx_info) => {
    if (tx_info.error) {
      return {
        transactionId: 0,
        bank: tx_info.bank,
        amount: TRANSACTION_AMOUNT,
        currency: tx_info.currency,
        status: 'Failed' as const,
        errorMessage: tx_info.error,
        testCaseName: `Distribute To ${tx_info.bank} - ${tx_info.currency}`,
        category: 'Transactions',
        uniqueId: tx_info.uniqueId,
      };
    }

    const finalStatus = finalStatuses.find((s) => s.id === tx_info.id);
    let status: 'Succeeded' | 'Failed' | 'Pending' = 'Pending';

    if (finalStatus) {
      if (finalStatus.status === 'COMPLETED' || finalStatus.status === 'SUCCESS') {
        status = 'Succeeded';
      } else if (finalStatus.status === 'FAILED') {
        status = 'Failed';
      }
    }

    return {
      transactionId: tx_info.id,
      bank: tx_info.bank,
      amount: TRANSACTION_AMOUNT,
      currency: tx_info.currency,
      status: status,
      errorMessage: finalStatus?.status === 'FAILED' ? `Transaction status: ${finalStatus.status}` : undefined,
      testCaseName: `Distribute To ${tx_info.bank} - ${tx_info.currency}`,
      category: 'Transactions',
      uniqueId: tx_info.uniqueId,
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

  // Step 6: Create Balance Check test cases
  const balanceCheckTestCases = [
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
  });

  // Attach API calls to each test case with corrected expected results for positive tests
  const apiCallsWithCorrectExpectations = hub.apiCalls.map(call => {
    if (call.name.startsWith('Create Order')) {
      return {
        ...call,
        expectedResult: { transactionId: 'number', status: 'INITIAL|PENDING' },
      };
    }
    return call;
  });

  const tableDataWithApiCalls = [...transactionTestCases, ...balanceCheckTestCases].map(testCase => ({
    ...testCase,
    apiCalls: apiCallsWithCorrectExpectations,
  }));

  // Return test data (report will be generated after all tests)
  return { tableData: tableDataWithApiCalls, balanceSummary: [] };
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

  const url = 'https://distributor.dev.keepz.me/api/v1/transaction/create';
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
        payload.beneficiaryName = 'Giorgi Lezhava';
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
