# Distributor HUB - Playwright Testing

**Project:** Automated testing for Distributor HUB API integration  
**Base URL:** `https://distributor.dev.keepz.me`

---

## Overview

### Service Description
Distributor HUB is a service that enables integrators to manage their balances and create payment orders for distributing funds to designated recipients across multiple bank providers.

### Key Concepts
- **Integrators**: Accounts on the system with their own balances
- **Balance System**: Each integrator has a balance that can be used to create orders
- **Deposit Methods**: 
  - Admin Panel: Manual update by administrator
  - Auto Update from Mobile Bank: Automatic balance update from mobile banking
  - Distribution Flow in Keepz System: Balance update from distribution flow within Keepz
- **Order Creation**: Integrators use their balance to create payment orders
  - Amount + Commission is deducted from balance upon order creation
  - If insufficient balance (amount + commission), order creation fails
- **Distribution**: Orders can send money to 4 supported banks

### Banks Supported
- BOG (Bank of Georgia)
- TBC (TBC Bank)
- Liberty Bank
- CREDO Bank

### Currencies
- GEL (Georgian Lari)
- USD (US Dollar)
- EUR (Euro)

### Test Framework
Playwright-based test framework with multi-currency support and comprehensive negative test cases.

---

## Testing Rules

See **[DISTRIBUTOR_HUB_RULES.md](DISTRIBUTOR_HUB_RULES.md)** for comprehensive rules including:
- API Response Validation (MANDATORY)
- Test Report Responses (MANDATORY)
- Code Structure
- Report Generation
- Test Organization

---

## Project Structure

```
Test Automation/
├── CLAUDE.md                           # This file
├── DISTRIBUTOR_HUB_RULES.md            # Testing rules & guidelines
├── .env                                # Configuration & credentials
├── docs/
│   └── Distributor_HUB.md             # API documentation
├── utils/
│   ├── DistributorHubHelper.ts        # API client class
│   └── HtmlReportGenerator.ts         # HTML report generation
└── tests/
    └── Distributor_HUB/
        ├── helpers.ts                  # Test flow functions
        ├── Positive_Cases/
        │   └── positive-tests.spec.ts
        └── Negative_Cases/
            └── negative-tests.spec.ts
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npx playwright test tests/Distributor_HUB/

# Run positive tests only
npx playwright test tests/Distributor_HUB/Positive_Cases/

# Run negative tests only
npx playwright test tests/Distributor_HUB/Negative_Cases/

# Run specific test
npx playwright test tests/Distributor_HUB/Negative_Cases/negative-tests.spec.ts -g "Insufficient Balance"
```

---

## Test Types

### Positive Tests (Happy Path)
1. **Successful Authentication** - Valid credentials
2. **Distributor ALL BANKS** - Create orders for all banks in all currencies

### Negative Tests
1. **Authentication Failures** (3 cases)
   - No Token (401)
   - Incorrect Credentials (400)
   - Incorrect Client ID (400)

2. **Invalid IBAN Cases** (all banks, all currencies)
   - Expected error: "To iban has invalid format,"

3. **Amount Validation Cases** (all banks, all currencies)
   - Insufficient Balance: 99999 (below max, above available)
   - Above Maximum Amount: 999999 (max is 100000)
   - Below Minimum Amount: 0.01 (min is 0.02)

---

## Configuration

All settings in `.env`:
- Authentication credentials
- Bank IBANs (valid & invalid)
- Transaction amount limits (configurable by admin)
- Commission configuration (fixed or percentage-based)

See `.env` file for details.

---

## API Documentation

For complete API technical details, request/response examples, error codes, and implementation notes, see **[docs/Distributor_HUB.md](docs/Distributor_HUB.md)**.

---

## Reports

- **Location:** `distributor-report/` (generated locally; gitignored)
- **Format:** Static HTML (self-contained, shareable) — `index.html` portal + timestamped `DisHubReport-*.html`
- **Content:** Test cases grouped by category, showing exact API responses

### Published reports (GitHub Pages)

- **Live link:** https://lezhavag.github.io/Keepz_Distributor_Hub/ (served from the `gh-pages` branch)
- **Automatic:** every test run auto-publishes the report at the end (Playwright `globalTeardown`), so the link always reflects the latest run. Publishing never fails the test run.
- **Opt out:** run with `PUBLISH_REPORT=false` to skip publishing (e.g. quick local debugging).
- **Manual publish:** `npm run publish-report` pushes `distributor-report/` to `gh-pages` on demand.
- The link is stable/reusable — share it once; every run refreshes it (within ~1 min).

---

## Workflow & Documentation

### Documentation Updates
- When new test cases, categories, or rules are needed, I will **ask first** before updating [DISTRIBUTOR_HUB_RULES.md](DISTRIBUTOR_HUB_RULES.md)
- You decide what to document, where it goes, and how it should be phrased
- This keeps you in control of project documentation
- Once approved, updates are made immediately

### Collaboration Pattern
- Session-specific work tracked in this conversation
- Persistent knowledge saved in memory files (reused across sessions)
- Rules and mandatory guidelines live in markdown files (this document and DISTRIBUTOR_HUB_RULES.md)

---

*For implementation details, see [docs/Distributor_HUB.md](docs/Distributor_HUB.md)*
