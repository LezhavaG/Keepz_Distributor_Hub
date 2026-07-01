import { APIRequestContext } from '@playwright/test';

/**
 * Live configuration loader (Option B).
 *
 * Fetches the integrator's admin-panel config (per-currency min/max transaction
 * amounts and commission) so tests always validate against the CURRENT config,
 * not a stale .env. Falls back to .env values if the endpoint is unavailable.
 */

interface CurrencyConfig {
  min: number;
  max: number;
  commission: number | null;
  commissionType: string | null;
}

let liveConfig: { currencies: { [key: string]: CurrencyConfig } } | null = null;

// Whether the amounts/commission used this run came from the admin panel ('live')
// or from the .env fallback ('fallback'). Surfaced so reports can flag stale config.
let configSource: 'live' | 'fallback' = 'fallback';

/** How the current config was sourced: live admin panel or .env fallback. */
export function getConfigSource(): 'live' | 'fallback' {
  return configSource;
}

const NEWADMIN_BASE_URL = process.env.NEWADMIN_BASE_URL || 'https://newadmin.dev.keepz.me';

/**
 * Authenticate to the admin panel and fetch the distributor client config.
 * Cached per worker - only fetches once.
 */
export async function loadDistributorConfig(request: APIRequestContext): Promise<void> {
  if (liveConfig) return; // already loaded this run

  try {
    // 1. Admin login -> access token
    const loginResp = await request.post(`${NEWADMIN_BASE_URL}/api/auth/login`, {
      data: {
        username: process.env.ADMIN_USERNAME,
        loginType: 'PASSWORD',
        password: process.env.ADMIN_PASSWORD,
        userType: 'ADMIN',
        countryCode: process.env.ADMIN_COUNTRY_CODE,
        deviceId: process.env.ADMIN_DEVICE_ID,
      },
    });
    const token = (await loginResp.json()).value.accessToken;

    // 2. Fetch client config (client id is a PATH param)
    const clientId = process.env.DISTRIBUTOR_CLIENT_ID;
    const cfgResp = await request.get(`${NEWADMIN_BASE_URL}/api/distributor-hub-client/${clientId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const value = (await cfgResp.json()).value;

    const currencies: { [key: string]: CurrencyConfig } = {};
    for (const [cur, cfg] of Object.entries<any>(value.currencyConfigs || {})) {
      const tier = (cfg.commissionTiers && cfg.commissionTiers[0]) || {};
      currencies[cur] = {
        min: cfg.minTransactionAmount,
        max: cfg.maxTransactionAmount,
        commission: tier.commission ?? null,
        commissionType: tier.commissionRateType ?? null,
      };
    }

    liveConfig = { currencies };
    configSource = 'live';
    console.log('✅ Loaded live config from admin panel:');
    for (const [cur, c] of Object.entries(currencies)) {
      console.log(`   ${cur}: min=${c.min} max=${c.max} commission=${c.commission} (${c.commissionType})`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    configSource = 'fallback';
    console.log(`⚠️  Could not load admin config, using .env fallback: ${msg}`);
    console.log('⚠️  WARNING: tests are running against STALE .env limits/commission, not live admin config.');
  }
}

// ---- Getters (live config with .env fallback) ----

export function getMinAmount(currency: string): number {
  return liveConfig?.currencies[currency]?.min ?? parseFloat(process.env.MIN_ALLOWED_AMOUNT || '0.02');
}

export function getMaxAmount(currency: string): number {
  return liveConfig?.currencies[currency]?.max ?? parseFloat(process.env.MAX_TRANSACTION_AMOUNT || '100000');
}

export function getCommission(currency: string): number {
  const live = liveConfig?.currencies[currency]?.commission;
  if (live !== null && live !== undefined) return live;
  return parseFloat(process.env[`COMMISSION_${currency}`] || '0.01');
}

export function getCommissionType(currency: string): string {
  return (
    liveConfig?.currencies[currency]?.commissionType ||
    process.env[`COMMISSION_TYPE_${currency}`] ||
    process.env.COMMISSION_TYPE ||
    'FIXED'
  );
}

/**
 * Expected commission for a given amount, per the admin-panel config.
 * FIXED -> flat commission; PERCENTAGE -> amount * rate / 100.
 * Used to verify the back-end deducted the CORRECT commission.
 */
export function computeExpectedCommission(currency: string, amount: number): number {
  const type = getCommissionType(currency);
  const commission = getCommission(currency);
  if (type === 'PERCENTAGE') {
    return (amount * commission) / 100;
  }
  return commission; // FIXED
}

// ---- Derived test amounts (computed from the live limits, so they auto-adapt) ----

/** A normal valid amount (uses the minimum allowed). */
export function getTransactionAmount(currency: string): number {
  return getMinAmount(currency);
}

/** Below the minimum -> should trigger "Amount below minimum". */
export function getBelowMinAmount(currency: string): number {
  return getMinAmount(currency) / 2;
}

/** Above the maximum -> should trigger "Amount above maximum". */
export function getAboveMaxAmount(currency: string): number {
  return getMaxAmount(currency) * 10;
}

/** Below the max but above available balance -> should trigger "Insufficient balance". */
export function getInsufficientAmount(currency: string): number {
  return getMaxAmount(currency) - 1;
}
