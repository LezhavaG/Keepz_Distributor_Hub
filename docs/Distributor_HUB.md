# Distributor HUB Service Documentation

## Overview
Distributor HUB is a service that enables integrators to manage their balances and create payment orders for distributing funds to designated recipients across multiple bank providers.

### Key Concepts
- **Integrators**: Accounts on the system with their own balances
- **Balance System**: Each integrator has a balance that can be used to create orders
- **Deposit Methods**: 
  - Manual Update: Integrator provides IBAN + description, when money arrives matching those details, system auto-credits balance
  - Admin Panel: (Not used in testing for now)
- **Order Creation**: Integrators use their balance to create payment orders
  - Amount + Commission is deducted from balance upon order creation
  - If insufficient balance (amount + commission), order creation fails
- **Distribution**: Orders can send money to 4 supported banks:
  - BOG (Bank of Georgia)
  - TBC (TBC Bank)
  - Liberty Bank
  - CREDO Bank

---

## API Base URL
```
https://distributor.dev.keepz.me
```

---

## Authentication

### Get Access Token
**Endpoint:** `POST /api/auth`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "client_id": "fb769cdd-7e9d-4355-a331-43028700ca3a",
  "client_secret": "zK7fb2lRUghzD9",
  "grant_type": "client_credentials"
}
```

**Success Response (HTTP 200):**
```json
{
  "value": {
    "access_token": "eyJhbGciOiJIUzUxMiJ9...",
    "expires_in": 1800,
    "token_type": "Bearer"
  }
}
```

**Token Details:**
- Valid for 1800 seconds (30 minutes)
- Use in all subsequent requests: `Authorization: Bearer <access_token>`
- Type: Bearer token

**Error Response:**
```json
{
  "message": "[error description]",
  "statusCode": [error code]
}
```

---

## API Endpoints

### 1. Check Balance
**Endpoint:** `GET /api/distributor/balance/check`

**Authentication:** Required (Bearer Token)

**Query Parameters:**
- `currency` (optional): GEL, USD, or EUR
  - If omitted, returns default account balance

**Success Response (HTTP 200):**
```json
{
  "value": {
    "amount": 5.0,
    "currency": "GEL"
  }
}
```

**Error Response:**
```json
{
  "message": "Client balance not found with given client id",
  "statusCode": 5015
}
```

---

### 2. Create Transaction (Order)
**Endpoint:** `POST /api/distributor`

**Authentication:** Required (Bearer Token)

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <access_token>
```

**Request Body:**

**Required Fields:**
- `amount` (number): Payment sum, max 10 digits with 2 decimals
- `currency` (string): GEL, USD, or EUR
- `description` (string): Payment narrative for beneficiary bank statement
- `uniqueId` (UUID v4): Client-provided transaction identifier for idempotency

**Recipient Fields (mutually exclusive):**
- `toIban` (string): Direct Georgian bank account number
- `receiverId` (UUID v4) + `receiverType` (string): References registered Keepz receiver (USER or BRANCH)

**Optional Fields:**
- Beneficiary details:
  - `beneficiaryName` (string)
  - `beneficiaryIdentityNumber` (string)
  - `beneficiaryAddress` (string)
  - `beneficiaryBirthDate` (string)
- Payer details (restricted access):
  - `debtorName` (string)
  - `debtorIban` (string)
  - `debtorIdentityNumber` (string)

**Example Request:**
```json
{
  "amount": 100.50,
  "currency": "GEL",
  "description": "Payment for services",
  "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
  "toIban": "GE00BG0000000000000000GEL",
  "beneficiaryName": "Test Recipient"
}
```

**Success Response (HTTP 200/201):**
```json
{
  "value": {
    "transactionId": 12345,
    "status": "PENDING",
    "statusDescription": "Transaction created successfully",
    "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2024-06-23T12:34:56Z"
  }
}
```

**Error Response:**
```json
{
  "message": "Insufficient balance",
  "statusCode": 5001
}
```

---

### 3. Get Transaction Details
**Endpoint:** `GET /api/distributor/details`

**Authentication:** Required (Bearer Token)

**Query Parameters:**
- `transaction_id` (number, required): Unique identifier of the transaction in Keepz system

**Success Response (HTTP 200):**
```json
{
  "value": {
    "transactionId": 12345,
    "status": "COMPLETED",
    "statusDescription": "Transaction completed successfully",
    "amount": 100.50,
    "toIban": "GE00BG0000000000000000GEL",
    "currency": "GEL",
    "paymentDescription": "Payment for services",
    "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2024-06-23T12:34:56Z",
    "commissionAmount": 0.50
  }
}
```

**Error Response:**
```json
{
  "message": "Transaction not found",
  "statusCode": 5002
}
```

---

## Transaction Statuses

| Status | Description |
|--------|-------------|
| PENDING | Transaction created, awaiting processing |
| PROCESSING | Transaction is being processed |
| COMPLETED | Transaction completed successfully |
| FAILED | Transaction failed |
| REJECTED | Transaction rejected |
| CANCELLED | Transaction cancelled |

---

## Common Error Codes

| Error Code | Message | Description |
|------------|---------|-------------|
| 5001 | Insufficient balance | Balance is not enough for the transaction |
| 5002 | Transaction not found | Transaction ID does not exist |
| 5015 | Client balance not found | Client ID is invalid |
| 4001 | Invalid client credentials | Authentication failed |
| 4002 | Invalid request body | Required fields missing or invalid |
| 4003 | Invalid currency | Currency not supported (GEL, USD, EUR) |
| 5000 | Server error | Internal server error |

---

## Test Credentials

**Distributor ID (Test):**
```
client_id: fb769cdd-7e9d-4355-a331-43028700ca3a
client_secret: zK7fb2lRUghzD9
grant_type: client_credentials
```

---

## Supported Banks for Distribution

1. **BOG** (Bank of Georgia)
2. **TBC** (TBC Bank)
3. **Liberty Bank**
4. **CREDO Bank**

---

## Implementation Notes

- All timestamps are in ISO 8601 format (UTC)
- Amount values support up to 2 decimal places
- The `uniqueId` ensures idempotency - sending the same request twice with the same `uniqueId` will not create duplicate transactions
- Balance check is real-time and may change frequently
- Token expires after 1800 seconds (30 minutes), new token must be obtained for subsequent requests

---

## Ready for Review

Is this documentation accurate? Any corrections or additions needed before we proceed with writing test cases?
