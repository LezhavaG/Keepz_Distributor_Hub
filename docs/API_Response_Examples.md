# Distributor HUB - API Response Examples

Complete reference of all API responses for the Distributor HUB service.

---

## 1. Authentication (Get Token)

**Endpoint:** `POST https://distributor.dev.keepz.me/api/auth`

**Request:**
```json
{
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "grant_type": "client_credentials"
}
```

### Success Response (200 OK)
```json
{
  "success": true,
  "value": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 3600
  }
}
```

### Error Response - Incorrect Credentials (400 Bad Request)
```json
{
  "success": false,
  "message": "Incorrect credentials",
  "statusCode": 5040,
  "exceptionGroup": 1
}
```

### Error Response - Client Not Found (400 Bad Request)
```json
{
  "success": false,
  "message": "Client not found for given id.",
  "statusCode": 5040,
  "exceptionGroup": 1
}
```

### Error Response - No Authentication (401 Unauthorized)
```json
{
  "success": false,
  "message": "Authentication failed",
  "statusCode": 401
}
```

---

## 2. Get Balance

**Endpoint:** `GET https://distributor.dev.keepz.me/api/distributor/balance/check?currency=GEL`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `currency`: GEL, USD, or EUR

### Success Response (200 OK)
```json
{
  "success": true,
  "value": {
    "amount": 1500.50,
    "currency": "GEL"
  }
}
```

### Error Response - Invalid Currency (400 Bad Request)
```json
{
  "success": false,
  "message": "Invalid currency",
  "statusCode": 5040,
  "exceptionGroup": 1
}
```

### Error Response - No Authentication (401 Unauthorized)
```json
{
  "success": false,
  "message": "Authentication failed",
  "statusCode": 401
}
```

---

## 3. Update Balance (Top Up)

**Endpoint:** `PUT https://distributor.dev.keepz.me/api/distributor/balance/update`

Updates (tops up) the integrator balance for a given currency.

⚠️ **Important notes:**
- Authentication is done **inside the request body** (`clientId` + `secret`), NOT via a Bearer token.
- The `secret` here is a **SEPARATE credential** from the OAuth `client_secret`. It is stored in `.env` as `DISTRIBUTOR_BALANCE_SECRET`.
- This endpoint returns **NO response body on success** — only a status code (`200 OK`).

**Request:**
```json
{
  "amount": 0.22,
  "clientId": "fb769cdd-7e9d-4355-a331-43028700ca3a",
  "secret": "***",
  "currency": "GEL"
}
```

### Success Response (200 OK)
```
(No response body — success is indicated by status code 200)
```

### Error Response - Incorrect Credential (400 Bad Request)
Returned when the `secret` is wrong (e.g. using the OAuth client_secret instead of the balance secret):
```json
{
  "success": false,
  "message": "Incorrect credential!",
  "statusCode": 5036,
  "exceptionGroup": 1
}
```

### Verification Flow (how it's tested)
For each currency (GEL, USD, EUR):
1. **Get Balance** (initial)
2. **Update Balance** (PUT with amount)
3. **Get Balance** (final)
4. Verify: `final == initial + amount`

---

## 4. Create Order (Create Transaction)

**Endpoint:** `POST https://distributor.dev.keepz.me/api/distributor`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request:**
```json
{
  "amount": 100.50,
  "currency": "GEL",
  "description": "Payment to BOG",
  "toIban": "GE21BL0000000123456789",
  "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
  "beneficiaryName": "John Doe"
}
```

### Success Response (201 Created)
```json
{
  "success": true,
  "value": {
    "transactionId": 12345,
    "status": "INITIAL",
    "statusDescription": "Order created successfully",
    "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-06-29T11:45:30.123Z",
    "commissionAmount": 0.50
  }
}
```

### Error Response - Insufficient Balance (400 Bad Request)
```json
{
  "success": false,
  "message": "Couldn't make transaction. Insufficient balance amount",
  "statusCode": 5045,
  "exceptionGroup": 1
}
```

### Error Response - Invalid IBAN (400 Bad Request)
```json
{
  "success": false,
  "message": "To iban has invalid format,",
  "statusCode": 5045,
  "exceptionGroup": 1
}
```

### Error Response - Amount Below Minimum (400 Bad Request)
```json
{
  "success": false,
  "message": "Amount below minimum transaction amount.",
  "statusCode": 5045,
  "exceptionGroup": 1
}
```

### Error Response - Amount Above Maximum (400 Bad Request)
```json
{
  "success": false,
  "message": "Amount above maximum transaction amount.",
  "statusCode": 5045,
  "exceptionGroup": 1
}
```

### Error Response - No Authentication (401 Unauthorized)
```json
{
  "success": false,
  "message": "Authentication failed",
  "statusCode": 401
}
```

---

## 5. Get Transaction Details

**Endpoint:** `GET https://distributor.dev.keepz.me/api/distributor/details?transaction_id=12345`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `transaction_id`: Numeric transaction ID (required)

### Success Response (200 OK) - Initial Status
```json
{
  "success": true,
  "value": {
    "transactionId": 12345,
    "status": "INITIAL",
    "statusDescription": "Order created successfully",
    "amount": 100.50,
    "toIban": "GE21BL0000000123456789",
    "currency": "GEL",
    "paymentDescription": "Payment to BOG",
    "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-06-29T11:45:30.123Z",
    "commissionAmount": 0.50
  }
}
```

### Success Response (200 OK) - Pending Status
```json
{
  "success": true,
  "value": {
    "transactionId": 12345,
    "status": "PENDING",
    "statusDescription": "Transaction is being processed",
    "amount": 100.50,
    "toIban": "GE21BL0000000123456789",
    "currency": "GEL",
    "paymentDescription": "Payment to BOG",
    "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-06-29T11:45:30.123Z",
    "commissionAmount": 0.50
  }
}
```

### Success Response (200 OK) - Completed Status
```json
{
  "success": true,
  "value": {
    "transactionId": 12345,
    "status": "COMPLETED",
    "statusDescription": "Transaction completed successfully",
    "amount": 100.50,
    "toIban": "GE21BL0000000123456789",
    "currency": "GEL",
    "paymentDescription": "Payment to BOG",
    "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-06-29T11:45:30.123Z",
    "commissionAmount": 0.50
  }
}
```

### Success Response (200 OK) - Failed Status
```json
{
  "success": true,
  "value": {
    "transactionId": 12345,
    "status": "FAILED",
    "statusDescription": "Transaction failed - IBAN not found",
    "amount": 100.50,
    "toIban": "GE21BL0000000123456789",
    "currency": "GEL",
    "paymentDescription": "Payment to BOG",
    "uniqueId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-06-29T11:45:30.123Z",
    "commissionAmount": 0.50
  }
}
```

### Error Response - Transaction Not Found (404 Not Found)
```json
{
  "success": false,
  "message": "Transaction not found",
  "statusCode": 5044,
  "exceptionGroup": 1
}
```

### Error Response - No Authentication (401 Unauthorized)
```json
{
  "success": false,
  "message": "Authentication failed",
  "statusCode": 401
}
```

---

## Transaction Status Values

| Status | Description | Final? |
|--------|-------------|--------|
| INITIAL | Order just created | No |
| PENDING | Transaction processing | No |
| COMPLETED | Transaction successful | Yes |
| SUCCESS | Transaction successful (alternate) | Yes |
| FAILED | Transaction failed | Yes |
| REJECTED | Transaction rejected | Yes |
| CANCELLED | Transaction cancelled | Yes |

---

## Common Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Successful GET request |
| 201 | Created | Successful POST request (order created) |
| 400 | Bad Request | Invalid input, validation error |
| 401 | Unauthorized | Missing or invalid authentication token |
| 404 | Not Found | Resource not found (e.g., transaction) |
| 5040 | Auth Error | Authentication/credentials error |
| 5044 | Not Found | Transaction not found |
| 5045 | Validation Error | Business logic error (balance, IBAN, amount, etc.) |

---

## Error Response Fields

All error responses follow this structure:

```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 5045,
  "exceptionGroup": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `false` for errors |
| message | string | Human-readable error message |
| statusCode | number | Numeric error code |
| exceptionGroup | number | Error category (1-10) |

---

## Response Field Descriptions

### Balance Response
- `amount` (number): Current balance amount
- `currency` (string): Currency code (GEL, USD, EUR)

### Transaction Response
- `transactionId` (number): Unique transaction ID
- `status` (string): Current transaction status
- `statusDescription` (string): Human-readable status
- `amount` (number): Transaction amount
- `toIban` (string): Recipient IBAN
- `currency` (string): Transaction currency
- `paymentDescription` (string): Payment description
- `uniqueId` (string): Client-provided unique identifier
- `createdAt` (string): ISO 8601 timestamp
- `commissionAmount` (number): Commission deducted from balance
