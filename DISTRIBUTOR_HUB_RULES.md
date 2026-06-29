# Distributor HUB - Playwright Testing Rules

**Project:** Automated testing for Distributor HUB API  
**Base URL:** `https://distributor.dev.keepz.me`

---

## Testing Rules

### API Response Validation (MANDATORY)
- **CRITICAL**: When validating API responses, ALWAYS verify actual API behavior
- **NEVER HARDCODE** responses based on user specification alone
- **ALWAYS CHECK** the real API request and actual response before writing tests
- If user says "response should be like X", verify it's actually true
- If you need additional info or permission to test, **ASK IMMEDIATELY**
- Tests must validate real behavior, not assumptions

### Test Report Responses (MANDATORY)
- **ALWAYS display** Status Code + Actual JSON Response in reports
- **NEVER format or summarize** API responses - show exactly what API returns
- **NEVER use** formatted messages like "Got access token" or "Transaction failed"
- **ALWAYS show** full JSON response with proper formatting
- Reports must display real API behavior for verification

### API Request Details in Reports (MANDATORY)
- **For EVERY API request tested**, the report MUST include:
  - **Request URL** - the full endpoint URL called
  - **Request Method** - HTTP method (GET, POST, etc.)
  - **Status Code** - the HTTP status code returned
  - **Request Body** - the payload sent (for POST; "N/A" for GET; mask secrets like client_secret)
  - **Expected Result** - the full response body we expect
  - **Actual Result** - the full response body the API actually returned
- **ALWAYS show all API calls** made during a test (Get Token, Get Balance, Create Order, Get Transaction Details, etc.)
- **Expected vs Actual** must make it clear WHY a test passed or failed:
  - Positive test: Expected = successful response → Actual matches
  - Negative test: Expected = error message → Actual matches the error
- Displayed in a collapsible **Details** section under each test case

### Configuration & Test Data in .env (MANDATORY)
- **NEVER hardcode** configurable values in test/helper code
- **ALWAYS extract to `.env`** any value that could change or vary per test/environment:
  - Credentials (client id, secrets, grant type, balance-update secret)
  - Bank IBANs (valid & invalid)
  - Transaction amount limits (min, max, below-min, above-max, insufficient)
  - Commission configuration
  - Test fixtures: payer (debtor) details, beneficiary details, test description/amount
- Code reads from `process.env` with sensible fallback defaults
- To test with **different values**, edit `.env` only - **no code changes**
- `.env` is gitignored (values/secrets stay local; share separately with teammates)
- **Exception:** documentation examples keep concrete values (for readability) - do NOT variable-ize docs

### Code Structure
- Use **Helper functions** (`tests/Distributor_HUB/helpers.ts`)
- Keep test logic separate from test execution
- Extract all configurable values to `.env` - NO hardcoding (see rule above)
- All test categories should be organized and labeled
- New test cases go in **both** the combined and individual spec files

### Report Generation
- Tests generate combined HTML report after all tests complete
- Test cases grouped by category (Authentication Cases, Invalid IBAN Cases, etc.)
- Categories collapsible, closed by default
- Include error details for failed transactions
- Balance summary for positive tests only

### Test Organization
- **Positive Tests**: Multi-currency transactions (GEL, USD, EUR)
- **Negative Tests**: Grouped by category for clarity
- Transaction polling with configurable retry intervals
- Parallel polling for multiple transactions

---

## Environment Variables

All configurations stored in `.env`:

### Authentication
```
DISTRIBUTOR_CLIENT_ID
DISTRIBUTOR_CLIENT_SECRET
DISTRIBUTOR_WRONG_CLIENT_ID
DISTRIBUTOR_WRONG_CLIENT_SECRET
DISTRIBUTOR_GRANT_TYPE
```

### Bank IBANs
```
BOG_IBAN, TBC_IBAN, LIBERTY_IBAN, CREDO_IBAN (valid)
BOG_INVALID_IBAN, TBC_INVALID_IBAN, LIBERTY_INVALID_IBAN, CREDO_INVALID_IBAN (invalid)
```

### Transaction Amount Limits
```
MIN_ALLOWED_AMOUNT=0.02 (minimum transaction amount)
MAX_TRANSACTION_AMOUNT=100000 (maximum transaction amount)
BELOW_MIN_AMOUNT=0.01 (test value for below minimum)
INSUFFICIENT_BALANCE_AMOUNT=99999 (test value for insufficient balance)
ABOVE_MAX_AMOUNT=999999 (test value for above maximum)
```

### Commission Configuration
```
COMMISSION_TYPE=FIXED (current type)

For FIXED type (current - static amount per currency):
COMMISSION_GEL=0.01 (Georgian Lari)
COMMISSION_USD=0.01 (US Dollar)
COMMISSION_EUR=0.01 (Euro)

For PERCENTAGE type (future - percentage of transaction amount):
COMMISSION_PERCENTAGE=0.5 (0.5% of transaction amount)
```

⚠️ **Note:** When admin changes commission type or amounts, update `.env` values accordingly

⚠️ **Important:** When admin panel changes these values, update corresponding `.env` values

---

## Test Categories

### Positive Tests

#### Transaction Cases
- Successful Authentication
- Distributor ALL BANKS (successful transactions for all 4 banks, all 3 currencies)

#### Balance Check Category
- Get Initial Balances - Verify successful retrieval of GEL, USD, EUR balances
- Verify Final Balances - Verify amounts and commissions deducted correctly from all currencies

### Negative Tests

#### Authentication Cases
- No Token (401 error)
- Incorrect Credentials (400 error - "Incorrect credentials")
- Incorrect Client ID (400 error - "Client not found for given id.")

#### Invalid IBAN Cases
- All 4 banks with invalid IBANs
- Multiple currencies (GEL, USD, EUR)
- Expected error: "To iban has invalid format,"

#### Insufficient Balance Cases
- Amount 99999 (below max, above available balance)
- All 4 banks with all 3 currencies
- Expected error: "Couldn't make transaction. Insufficient balance amount"

#### Amount Validation Cases
- Above Maximum Amount: Amount 999999 (exceeds max of 100000)
  - Expected error: "Amount above maximum transaction amount."
- Below Minimum Amount: Amount 0.01 (below min of 0.02)
  - Expected error: "Amount below minimum transaction amount."

---

*See [tests/Distributor_HUB/](tests/Distributor_HUB/) for implementation*
