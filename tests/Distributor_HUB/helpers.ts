import { DistributorHubHelper } from '../../utils/DistributorHubHelper';
import { randomUUID } from 'crypto';
import {
  loadDistributorConfig,
  getTransactionAmount,
  getBelowMinAmount,
  getAboveMaxAmount,
  getInsufficientAmount,
  computeExpectedCommission,
  triggerStatusUpdate,
} from '../../utils/DistributorConfig';

export const BOG_BANK = { name: 'BOG', iban: process.env.BOG_IBAN! };
export const TBC_BANK = { name: 'TBC', iban: process.env.TBC_IBAN! };
export const LIBERTY_BANK = { name: 'Liberty', iban: process.env.LIBERTY_IBAN! };
export const CREDO_BANK = { name: 'CREDO', iban: process.env.CREDO_IBAN! };

export const BOG_INVALID = { name: 'BOG', iban: process.env.BOG_INVALID_IBAN! };
export const TBC_INVALID = { name: 'TBC', iban: process.env.TBC_INVALID_IBAN! };
export const LIBERTY_INVALID = { name: 'Liberty', iban: process.env.LIBERTY_INVALID_IBAN! };
export const CREDO_INVALID = { name: 'CREDO', iban: process.env.CREDO_INVALID_IBAN! };

export const ALL_BANKS = [BOG_BANK, TBC_BANK, LIBERTY_BANK, CREDO_BANK];

// Banks used for happy-path distribution (Distribute To ...). Defaults to all
// banks; override via .env to skip banks whose distribution can't complete in a
// given environment, e.g. DISTRIBUTION_BANKS=BOG,TBC,Liberty (CREDO distribution
// is disabled in dev). Only affects successful-distribution tests — CREDO's
// negative and payer-details cases still run.
export const DISTRIBUTION_BANK_NAMES = (process.env.DISTRIBUTION_BANKS || 'BOG,TBC,Liberty,CREDO')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);
const _distributionBanks = ALL_BANKS.filter((b) => DISTRIBUTION_BANK_NAMES.includes(b.name));
// Guard: a typo'd/empty DISTRIBUTION_BANKS would leave nothing to distribute to,
// silently passing the distribution tests. Fall back to all banks and warn.
if (_distributionBanks.length === 0) {
  console.warn(`⚠️  DISTRIBUTION_BANKS="${process.env.DISTRIBUTION_BANKS}" matched no known banks (BOG, TBC, Liberty, CREDO); falling back to all banks.`);
}
export const DISTRIBUTION_BANKS = _distributionBanks.length > 0 ? _distributionBanks : ALL_BANKS;

// Banks whose distribution transactions require signing (bot signs ~every 1-2 min).
// For these we trigger a status refresh (update-status) before each poll so a
// just-signed transaction is seen immediately instead of lingering in PENDING.
// Configurable via .env; defaults to BOG and Liberty.
export const SIGN_REQUIRED_BANKS = (process.env.SIGN_REQUIRED_BANKS || 'BOG,Liberty')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);
/** Case-insensitive check: does this bank's distribution require signing? */
export function bankNeedsSigning(bankName: string): boolean {
  return SIGN_REQUIRED_BANKS.some((b) => b.toLowerCase() === bankName.toLowerCase());
}

export const INVALID_IBANS = [
  { name: 'BOG', iban: process.env.BOG_INVALID_IBAN! },
  { name: 'TBC', iban: process.env.TBC_INVALID_IBAN! },
  { name: 'Liberty', iban: process.env.LIBERTY_INVALID_IBAN! },
  { name: 'CREDO', iban: process.env.CREDO_INVALID_IBAN! },
];

// Display-only amount shown in auth/no-token report rows (those cases don't
// create an order, so this is just a nominal value for the report table).
// All REAL transaction amounts/limits come live from DistributorConfig.
export const TRANSACTION_AMOUNT = parseFloat(process.env.TRANSACTION_AMOUNT || '0.02');
// Currencies to test. Defaults to all three; override via .env to run a subset,
// e.g. TEST_CURRENCIES=GEL (single) or TEST_CURRENCIES=GEL,USD (multiple).
export const CURRENCIES = (process.env.TEST_CURRENCIES || 'GEL,USD,EUR')
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);

// Base URL of the Distributor HUB API (override per-environment via .env).
export const BASE_URL = process.env.DISTRIBUTOR_BASE_URL || 'https://distributor.dev.keepz.me';

// Transaction completion polling (tune per observed processing time).
export const POLL_MAX_RETRIES = parseInt(process.env.TRANSACTION_POLL_MAX_RETRIES || '15', 10);
export const POLL_INTERVAL_SECONDS = parseInt(process.env.TRANSACTION_POLL_INTERVAL_SECONDS || '60', 10);

// Banks that require beneficiaryName on order creation (even when not otherwise sent).
const BANKS_REQUIRING_BENEFICIARY = ['Liberty'];
export function requiresBeneficiaryName(bankName: string): boolean {
  return BANKS_REQUIRING_BENEFICIARY.includes(bankName);
}

// Test fixtures for payer-details / paymentDescription tests (configurable via .env)
export const PAYER_DEBTOR_NAME = process.env.PAYER_DEBTOR_NAME || 'შპს ტესტი';
export const PAYER_DEBTOR_IBAN = process.env.PAYER_DEBTOR_IBAN || 'GE42CD0360000062461306';
export const PAYER_DEBTOR_IDENTITY = process.env.PAYER_DEBTOR_IDENTITY || '98809409129';
export const PAYER_DEBTOR_BIRTHDATE = process.env.PAYER_DEBTOR_BIRTHDATE || '1990-01-01';
export const PAYER_DESCRIPTION = process.env.PAYER_DESCRIPTION || 'Test Payment';
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
    const url = `${BASE_URL}/api/auth`;
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

  // Load live config from admin panel (limits/commission) before using amounts
  await loadDistributorConfig(request);

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
        amount: getTransactionAmount(currency),
        currency: currency,
        description: `Payment to ${bank.name}`,
        toIban: bank.iban,
        uniqueId: uniqueId,
      };

      // Some banks (e.g. Liberty) require beneficiaryName
      if (requiresBeneficiaryName(bank.name)) {
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

  // Step 3: Wait for all transactions to complete (in parallel).
  // BOG/Liberty need signing, so for those we trigger a status refresh before
  // each poll (the signing bot signs ~every 1-2 min; update-status surfaces it).
  const pollPromises = transactions
    .filter(tx => tx.id !== 0)
    .map(tx => {
      const onBeforePoll = bankNeedsSigning(tx.bank)
        ? (id: number) => triggerStatusUpdate(request, id)
        : undefined;
      return hub.waitForTransactionCompletion(tx.id, POLL_MAX_RETRIES, POLL_INTERVAL_SECONDS, onBeforePoll)
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
        });
    });

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
        // expectedResult (incl. the real uniqueId) is set in createTransaction
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

  // Balance is deducted at order creation, but a FAILED transaction is REFUNDED
  // (amount + commission returned). So only SUCCEEDED transactions permanently
  // change the balance. Reconcile against succeeded transactions:
  //   final = initial − (succeeded orders × (amount + commission)).
  // This is only valid once EVERY transaction has reached a terminal status
  // (SUCCESS/FAILED) — the poll above waits for that (triggering update-status
  // for BOG/Liberty so signed transactions resolve promptly).
  const succeededTxs = transactions.filter(tx => {
    const finalTx = finalStatuses.find(f => f.id === tx.id);
    return finalTx && (finalTx.status === 'COMPLETED' || finalTx.status === 'SUCCESS');
  });

  // Calculate detailed balance info per currency.
  // Commission is verified against the EXPECTED value from the admin-panel config
  // (not the value the API reported) so a wrong back-end commission is caught.
  const perCurrency = (currency: string) => {
    const txs = succeededTxs.filter(tx => tx.currency === currency);
    const amount = getTransactionAmount(currency);
    const totalTransactions = amount * txs.length;
    const actualCommission = txs.reduce((sum, tx) => sum + (tx.commission || 0), 0);
    const expectedCommissionPerTx = computeExpectedCommission(currency, amount);
    const expectedCommission = expectedCommissionPerTx * txs.length;
    const commissionCorrect = Math.abs(actualCommission - expectedCommission) < 0.001;
    const totalDeducted = totalTransactions + expectedCommission; // expected, not actual
    return { totalTransactions, actualCommission, expectedCommission, expectedCommissionPerTx, commissionCorrect, totalDeducted };
  };

  const gel = perCurrency('GEL');
  const usd = perCurrency('USD');
  const eur = perCurrency('EUR');

  const totalDeductedGEL = gel.totalDeducted;
  const totalDeductedUSD = usd.totalDeducted;
  const totalDeductedEUR = eur.totalDeducted;

  // Show the SPECIFIC expected final balance per currency on the final-balance
  // calls (expected = initial − amount×succeeded − commission), so the report
  // shows real numbers (e.g. Expected 0.95 vs Actual 1.01) instead of a generic
  // "number", and each call's pass/fail reflects the actual reconciliation.
  const expectedFinalByCurrency: { [k: string]: number } = {
    GEL: +(initialBalanceGEL.amount - totalDeductedGEL).toFixed(2),
    USD: +(initialBalanceUSD.amount - totalDeductedUSD).toFixed(2),
    EUR: +(initialBalanceEUR.amount - totalDeductedEUR).toFixed(2),
  };
  finalBalanceCalls.forEach((c) => {
    const cur = c.actualResult?.currency;
    if (cur && cur in expectedFinalByCurrency) {
      const expectedAmount = expectedFinalByCurrency[cur];
      c.expectedResult = { amount: expectedAmount, currency: cur };
      c.passed = c.statusCode === 200 && Math.abs((c.actualResult?.amount ?? NaN) - expectedAmount) < 0.001;
    }
  });

  const allCommissionsCorrect = gel.commissionCorrect && usd.commissionCorrect && eur.commissionCorrect;

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

  // Final Balance Verification: balance math must be correct AND every
  // commission must match the expected (admin-config) commission.
  const balanceMathCorrect =
    Math.abs((initialBalanceGEL.amount - finalBalanceGEL.amount) - totalDeductedGEL) < 0.001 &&
    Math.abs((initialBalanceUSD.amount - finalBalanceUSD.amount) - totalDeductedUSD) < 0.001 &&
    Math.abs((initialBalanceEUR.amount - finalBalanceEUR.amount) - totalDeductedEUR) < 0.001;

  const balanceVerificationCorrect = balanceMathCorrect && allCommissionsCorrect;

  const line = (cur: string, init: number, fin: number, c: ReturnType<typeof perCurrency>) =>
    `${cur}: Initial: ${init.toFixed(2)} | Transactions: -${c.totalTransactions.toFixed(2)} | Commission expected: -${c.expectedCommission.toFixed(2)} | Commission actual: -${c.actualCommission.toFixed(2)} | Commission OK: ${c.commissionCorrect ? '✓' : '✗'} | Final: ${fin.toFixed(2)}`;

  const balanceDetails = [
    line('GEL', initialBalanceGEL.amount, finalBalanceGEL.amount, gel),
    line('USD', initialBalanceUSD.amount, finalBalanceUSD.amount, usd),
    line('EUR', initialBalanceEUR.amount, finalBalanceEUR.amount, eur),
  ].join('\n');

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
      `${BASE_URL}/api/auth`,
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
            url: `${BASE_URL}/api/auth`,
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
      `${BASE_URL}/api/auth`,
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
            url: `${BASE_URL}/api/auth`,
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
  const url = `${BASE_URL}/api/distributor`;
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
    getInsufficientAmount,
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
    getAboveMaxAmount,
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
    getBelowMinAmount,
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
    getTransactionAmount,
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
  amountFn: (currency: string) => number,
  expectedErrorMessage: string,
  testCaseSuffix: string,
  category: string
) {
  const hub = new DistributorHubHelper(request);

  // Load live config from admin panel (limits/commission) before using amounts
  await loadDistributorConfig(request);

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
        amount: amountFn(currency),
        currency: currency,
        description: `Payment to ${bank.name} - ${testCaseSuffix}`,
        toIban: bank.iban,
        uniqueId: uniqueId,
      };

      // Some banks (e.g. Liberty) require beneficiaryName
      if (requiresBeneficiaryName(bank.name)) {
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
      amount: amountFn(CURRENCIES[0]),
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

  // Load live config from admin panel (limits/commission) before using amounts
  await loadDistributorConfig(request);

  await hub.authenticate();
  console.log('✅ Token successfully taken\n');

  const tokenCall = hub.apiCalls.find((c) => c.name === 'Get Token');
  if (tokenCall) {
    tokenCall.passed = tokenCall.statusCode === 200;
  }

  // Expected paymentDescription is ALWAYS payer details + description (never beneficiary).
  // The back-end prepends the payer fields in this exact order (verified live):
  //   {debtorName}, {debtorIban}, {debtorIdentityNumber}, {debtorBirthDate}, {description}
  const expectedPaymentDescription = `${PAYER_DEBTOR_NAME}, ${PAYER_DEBTOR_IBAN}, ${PAYER_DEBTOR_IDENTITY}, ${PAYER_DEBTOR_BIRTHDATE}, ${PAYER_DESCRIPTION}`;

  const tableData: any[] = [];

  for (const bank of banksToTest) {
    const startIdx = hub.apiCalls.length;
    const currencyResults: Array<{ currency: string; matches: boolean }> = [];

    for (const currency of CURRENCIES) {
      const payload: any = {
        amount: getTransactionAmount(currency),
        currency: currency,
        description: PAYER_DESCRIPTION,
        toIban: bank.iban,
        debtorName: PAYER_DEBTOR_NAME,
        debtorIban: PAYER_DEBTOR_IBAN,
        debtorIdentityNumber: PAYER_DEBTOR_IDENTITY,
        debtorBirthDate: PAYER_DEBTOR_BIRTHDATE,
      };

      if (includeBeneficiary) {
        payload.beneficiaryName = BENEFICIARY_NAME;
        payload.beneficiaryIdentityNumber = BENEFICIARY_IDENTITY;
        payload.beneficiaryAddress = BENEFICIARY_ADDRESS;
        payload.beneficiaryBirthDate = BENEFICIARY_BIRTHDATE;
      } else if (requiresBeneficiaryName(bank.name)) {
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
        const reqId = Number(new URL(call.url).searchParams.get('transaction_id') || '0');
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
      amount: getTransactionAmount(CURRENCIES[0]),
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

// ---- JIRA retest resolver ----
// Maps a bug's test-case name back to the single case to re-run.

const RETEST_EXPECTED = {
  invalidIban: 'To iban has invalid format,',
  insufficient: "Couldn't make transaction. Insufficient balance amount",
  aboveMax: 'Amount above maximum transaction amount.',
  belowMin: 'Amount below minimum transaction amount.',
};

const BANKS_BY_NAME: { [k: string]: typeof BOG_BANK } = {
  BOG: BOG_BANK, TBC: TBC_BANK, Liberty: LIBERTY_BANK, CREDO: CREDO_BANK,
};
const INVALID_BY_NAME: { [k: string]: typeof BOG_INVALID } = {
  BOG: BOG_INVALID, TBC: TBC_INVALID, Liberty: LIBERTY_INVALID, CREDO: CREDO_INVALID,
};

function casePassed(c: any): boolean {
  return !!c && (c.status === 'Succeeded' || (c.status === 'Failed' && c.isExpectedError));
}

/**
 * Re-run the case identified by testCaseName (parsed from a bug summary).
 *
 * Bug summaries are bank-agnostic (per-bank failures are combined into one bug),
 * so the bank suffix is optional: when present we re-run just that bank, when
 * absent we re-run ALL banks and pass only if every affected bank now passes.
 * Returns whether the case was resolved and whether it passed this time.
 */
export async function retestCaseByName(
  request: any,
  testCaseName: string
): Promise<{ found: boolean; passed: boolean; caseData?: any }> {
  let rows: any[] | undefined;
  let filterRe: RegExp | null = null;
  let m: RegExpMatchArray | null;

  // The bank(s) to re-run: the named bank if the summary carries one, else all.
  const banksFrom = (name?: string) => (name ? [BANKS_BY_NAME[name]] : ALL_BANKS);
  const invalidsFrom = (name?: string) => (name ? [INVALID_BY_NAME[name]] : INVALID_IBANS);

  if (testCaseName === 'No Token (Authentication Failure)') {
    rows = await runAuthenticationFailureTest(request);
  } else if (testCaseName === 'Invalid Credentials (Authentication)') {
    rows = await runIncorrectCredentialsTest(request);
  } else if (testCaseName === 'Incorrect Client ID (Authentication)') {
    rows = await runIncorrectClientIdTest(request);
  } else if (testCaseName === 'Successful Authentication') {
    rows = await runAuthenticationSuccessTest(request);
  } else if ((m = testCaseName.match(/^Distributor(?: (\w+))? - Invalid IBAN$/))) {
    rows = (await runNegativeTest(request, invalidsFrom(m[1]), RETEST_EXPECTED.invalidIban)).tableData;
    filterRe = / - Invalid IBAN$/;
  } else if ((m = testCaseName.match(/^Distributor(?: (\w+))? - Insufficient Balance$/))) {
    rows = (await runInsufficientBalanceTest(request, banksFrom(m[1]), RETEST_EXPECTED.insufficient)).tableData;
    filterRe = / - Insufficient Balance$/;
  } else if ((m = testCaseName.match(/^Distributor(?: (\w+))? - Above Maximum Amount$/))) {
    rows = (await runAboveMaximumAmountTest(request, banksFrom(m[1]), RETEST_EXPECTED.aboveMax)).tableData;
    filterRe = / - Above Maximum Amount$/;
  } else if ((m = testCaseName.match(/^Distributor(?: (\w+))? - Below Minimum Amount$/))) {
    rows = (await runBelowMinimumAmountTest(request, banksFrom(m[1]), RETEST_EXPECTED.belowMin)).tableData;
    filterRe = / - Below Minimum Amount$/;
  } else if ((m = testCaseName.match(/^Distribute To(?: (\w+))?$/))) {
    rows = (await runHappyPathTest(request, banksFrom(m[1]))).tableData;
    filterRe = /^Distribute To /;
  } else if ((m = testCaseName.match(/^Payer Details(?: - (\w+))?$/))) {
    rows = (await runPaymentDescriptionTest(request, banksFrom(m[1]), false, 'Payer Details', 'Payer Details Cases')).tableData;
    filterRe = /^Payer Details - /;
  } else if ((m = testCaseName.match(/^Payer \+ Beneficiary Details(?: - (\w+))?$/))) {
    rows = (await runPaymentDescriptionTest(request, banksFrom(m[1]), true, 'Payer + Beneficiary Details', 'Payer + Beneficiary Details Cases')).tableData;
    filterRe = /^Payer \+ Beneficiary Details - /;
  } else if ((m = testCaseName.match(/^Balance Update - (\w+)$/))) {
    rows = (await runBalanceUpdateTest(request, undefined, [m[1]])).tableData;
  } else {
    return { found: false, passed: false };
  }

  const arr = Array.isArray(rows) ? rows : [];
  // Rows that belong to this case: matched by pattern (multi-bank cases) or by
  // exact name (single, non-bank cases like auth / balance update).
  const relevant = filterRe ? arr.filter((c) => filterRe!.test(c.testCaseName)) : arr.filter((c) => c.testCaseName === testCaseName);
  const pool = relevant.length > 0 ? relevant : arr;
  // Combined bug passes only when EVERY affected case passes.
  const passed = pool.length > 0 && pool.every(casePassed);
  return { found: true, passed, caseData: pool[0] };
}
