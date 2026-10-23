# InvoiceFlow

Vendors send their bills here. Each bill is checked automatically, reviewed by finance, approved by a manager and paid, and everyone involved can see where it is. Reminders go out before anything is overdue, and reports show what is owed.

**Presenting?** Follow the step-by-step script in [DEMO.md](DEMO.md).

## Run

Needs Node 18+ and a MongoDB Atlas cluster.

1. In Atlas → **Network Access**, allow your current IP (or `0.0.0.0/0`). Networks that block port 27017 can't reach Atlas; use a hotspot there.
2. Configure and start the API:
   ```bash
   cd server
   cp .env.example .env      # set MONGO_URI (Atlas connection string) and JWT_SECRET
   npm install
   npm run seed              # demo data (erases the database first)
   npm run dev               # API on http://localhost:5050
   ```
3. Start the UI:
   ```bash
   cd client
   npm install
   npm run dev               # opens on :5173, or the next free port; proxies /api to :5050
   ```

On the sign-in page, click a role to sign in, or use `vendor@demo.com`, `finance@demo.com`, `manager@demo.com` or `admin@demo.com` with the password `password123`.

Tests: `cd server && npm test` runs 29 tests: the verification rules and invoice numbering, plus API tests against a throwaway in-memory MongoDB (Atlas is never touched). The full project report is in [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md).

## How a bill moves

| Step | Who | What happens |
|---|---|---|
| Send | Vendor | The vendor enters the bill (line items with GST, the purchase order it is for, the PDF). **Generate** fills in the next invoice number, such as `GL/26-27/0008`. |
| Check | Automatic | The vendor is active, the invoice number is new for that vendor, the amount is above 0, the due date is on or after the invoice date, and, if a purchase order is linked, the total billed against it stays within the order amount + 0.5%. A failure goes straight back to the vendor with what to change. |
| Review | Finance | Finance sends the bill to a manager, or returns it to the vendor with a note. |
| Approve | Manager | Approve, or reject with a reason. A rejected bill goes back to the vendor. |
| Pay | Finance | Partial or full payments; overpaying is blocked. The vendor is told each time. |
| Reminders | Daily at 09:00, or **Run reminder check now** on the Users page | Waiting more than 2 days for review → Finance. Due within 3 days → Finance. Overdue → Finance and Managers. Waiting more than 2 days for approval → Managers. Never repeated for the same invoice on the same day. |
| Reports | Finance, Manager | Paid vs still owed, how late the unpaid amounts are, payments per month, invoices by stage, top vendors, average time to approve and to pay, CSV export. |

**Admin** adds, changes and removes the vendor, finance and manager accounts, and has no access to invoices, payments or reports. Roles are enforced on the server; the browser only hides what a role can't use.

## Purchase orders

Finance raises an order before a vendor bills: what is being bought, why, who asked for it and when it is needed. Each order's page shows how much has been billed against it, how much is left, and every bill sent against it. Vendors see only the orders placed with them.

## Architecture

```
 Browser (React + Vite)
        │  /api/*  (Vite dev proxy)
        ▼
 Express API :5050 ── JWT auth + requireRole per route
   │   ├─ routes/        auth, users, vendors, purchase orders, invoices, reports, notifications
   │   ├─ services/      verify.js (rules, shared with the browser), numbering.js, notify.js
   │   └─ jobs/          reminders.js  ◄── node-cron, daily 09:00
        │  Mongoose
        ▼
 MongoDB Atlas  (users, vendors, purchaseorders, invoices, notifications)
```

Uploaded bills are stored in `server/uploads/` and can only be opened by signed-in users who are allowed to see that invoice.

## Layout

```
server/  index.js · app.js · models/index.js · routes/ · services/ · jobs/reminders.js · seed.js · verify.test.js · test/
client/  src/main.jsx · api.js · auth.jsx · format.js · components/ · pages/
```
