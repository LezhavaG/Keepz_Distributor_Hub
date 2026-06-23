# Keepz eCommerce - Playwright Testing

**Project:** Automated testing for Keepz eCommerce API integration  
**Base URL:** `https://gateway.keepz.me/ecommerce-service/api/integrator`

---

## Overview

Playwright-based test framework for Keepz eCommerce payment orders with 4 integrator types:
- **Default — REQUEST** - Multiple orders per receiver (shopping cart)
- **Default — CHECK** - Single order per receiver (checkout page, overwrites)
- **Treasury** - Government/treasury payments
- **Traffic Fine** - Traffic fine payments

---

## Testing Rules

### Console Output
- ✅ Log only essential info: Order Created, Payment URL, Browser status
- ❌ NO step-by-step progress logs, decorative lines, verbose instructions

### Code Structure
- Use **Page Objects** pattern (`pages/` directory)
- Authentication logic → `AuthPage.ts`
- Payment logic → `PaymentPage.ts`
- Remove intermediate console logs from Page Objects
- Only log final results in test files

### Test Execution
- **Hybrid Mode**: API requests via Playwright + Real Chrome for 3DS
- **CRITICAL**: ALWAYS open payment URLs in REAL Chrome using `execAsync`
- **NEVER** use Playwright browser (`page.goto`) - TBC/BOG block it
- No waiting for manual payment completion
- Tests should complete immediately after opening browser

---

## Order Types Quick Reference

| Type | Multiple Orders? | Use Case |
|------|------------------|----------|
| **DEFAULT-REQUEST** | ✅ Yes (unlimited) | E-commerce cart |
| **DEFAULT-CHECK** | ❌ No (overwrites) | Single checkout |
| **TREASURY** | ✅ Yes | Government payments |
| **TRAFFIC_FINE** | ✅ Yes | Traffic fines |

**Key Difference:**
- **REQUEST** type: ახალი ორდერი **ემატება** არსებულებს
- **CHECK** type: ახალი ორდერი **გადაეწერება** ძველს

---

## Documentation

📁 **Detailed Documentation:**
- [API Reference](docs/API.md) - Full API endpoints, parameters, validation
- [Examples](docs/EXAMPLES.md) - Use case examples, code snippets
- [Order Config](config/orders.config.ts) - Integrator credentials structure

📚 **External:**
- [Official API Docs](https://www.developers.keepz.me/eCommerece%20integration/create-an-order)

---

## Project Structure

```
Admin - Playwright/
├── CLAUDE.md                    # This file - project overview & rules
├── docs/
│   ├── API.md                   # Complete API documentation
│   └── EXAMPLES.md              # Use case examples
├── config/
│   └── orders.config.ts         # Order types & credentials structure
├── pages/
│   ├── AuthPage.ts              # Authentication logic
│   └── PaymentPage.ts           # Payment/order logic
└── tests/
    └── payment-flow.spec.ts     # Test scenarios
```

---

## Quick Start

```bash
# Run payment flow test
npx playwright test tests/payment-flow.spec.ts
```

---

*For implementation details, see [docs/API.md](docs/API.md)*
