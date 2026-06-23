# 💳 Payment Flow Test - Hybrid Mode

ავტომატური Order შექმნა + **თქვენი Chrome-ით 3DS გადახდა**

---

## 🚀 გაშვება

```bash
npx playwright test tests/payment-flow.spec.ts --timeout=0
```

---

## ✨ რა აკეთებს

1. ✅ **Playwright** → SMS Authentication (ავტომატურად)
2. ✅ **Playwright** → Login და access token-ის მიღება (ავტომატურად)
3. ✅ **Playwright** → Order შექმნა (ავტომატურად)
4. 🌐 **თქვენი რეალური Chrome** → Payment გვერდი გაიხსნება!
5. 👤 **თქვენ** → ბარათით გადახდა + 3DS (ხელით)
6. ✅ **დასრულებულია!**

---

## 🎯 უპირატესობები

✅ **ავტომატური** - Order შექმნა სრულად ავტომატურია  
✅ **თქვენი Chrome** - გადახდა თქვენს რეალურ ბრაუზერში  
✅ **3DS მუშაობს** - ბანკი არ ბლოკავს (არა bot!)  
✅ **შენახული ბარათები** - ყველაფერი თქვენი Chrome-დან  
✅ **QA Testing** - სრული verification შესაძლებელია  

---

## 📋 მაგალითი

```
🎯 HYBRID MODE: Playwright + Your Real Chrome
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 Step 1: Sending SMS...
✅ SMS sent

📱 Step 2: Verifying SMS...
✅ SMS verified

🔐 Step 3: Logging in...
✅ Logged in, token acquired

🆔 Generated UUID: 605b19b2-b024-4b1a-ad7f-23fa573d4ac1

🔒 Step 5: Encrypting order data...
✅ Data encrypted

📦 Step 6: Creating order...
✅ Order created

🔓 Step 7: Decrypting to get payment link...
🎉 Payment URL generated: https://tiny.dev.keepz.me/mejwva5k

✅ Order created successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 Payment URL:
    https://tiny.dev.keepz.me/mejwva5k

🌐 Opening in your REAL Chrome browser...
✅ Payment page opened in your browser!

💳 INSTRUCTIONS:
   1. Payment page opened in YOUR browser
   2. Complete 3DS payment manually
   3. After payment, press ENTER here to verify
```

---

## 📁 პროექტის სტრუქტურა

```
Admin - Playwright/
├── README.md                        # 📖 ინსტრუქციები
├── playwright.config.ts             # ⚙️ კონფიგურაცია
├── package.json
│
├── pages/                           # 🎯 Page Objects
│   ├── AuthPage.ts                 # SMS/Login ლოგიკა
│   └── PaymentPage.ts              # Payment შექმნის ლოგიკა
│
└── tests/
    └── payment-flow.spec.ts        # ✅ HYBRID მთავარი ტესტი
```

---

## ⚙️ კონფიგურაცია

**receiverId შეცვლა:**

[tests/payment-flow.spec.ts](tests/payment-flow.spec.ts)
```typescript
receiverId: 'db1bb73d-30cf-4718-ad2b-bc25cd13b09c', // ← შეცვალეთ აქ
```

**Amount შეცვლა:**
```typescript
amount: 0.1, // ← შეცვალეთ აქ
```

---

## 🔄 როგორ მუშაობს

### **ნაბიჯი 1: Order შექმნა (ავტომატური)**
Playwright API-ით:
- ✅ SMS გაგზავნა
- ✅ SMS verify
- ✅ Login (token-ის მიღება)
- ✅ Order data encryption
- ✅ Order შექმნა
- ✅ Payment URL decryption

### **ნაბიჯი 2: Payment გვერდის გახსნა**
Playwright ავტომატურად გახსნის თქვენს **რეალურ Chrome-ში** payment URL-ს

### **ნაბიჯი 3: 3DS გადახდა (ხელით)**
თქვენ:
- 💳 ბარათის რეკვიზიტების შეყვანა
- 🔐 3DS OTP-ის შეყვანა
- ✅ გადახდის დადასტურება

---

## 💡 რატომ Hybrid Mode?

**პრობლემა:** Playwright ბრაუზერი → ბანკმა იცნობს bot-ად → 3DS ბლოკავს

**გამოსავალი:** 
- ✅ Playwright → Order შექმნა (API-ით - არა bot detection)
- ✅ თქვენი Chrome → Payment (რეალური user - 3DS მუშაობს!)

---

## 📦 Dependencies

```bash
npm install
```

მხოლოდ Playwright - დამატებითი დაყენება არ სჭირდება!

---

## ✅ მზადაა გამოსაყენებლად!

```bash
npx playwright test tests/payment-flow.spec.ts --timeout=0
```

🎊 **Order ავტომატურად შეიქმნება → თქვენს Chrome-ში გაიხსნება → 3DS გაიარეთ!**
