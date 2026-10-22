# InvoiceFlow: Invoice Verification & Vendor Payment Platform (MERN)

Gets every vendor invoice from entry to paid. It checks invoices automatically, sends clean ones to a manager for approval, tracks payments, reminds people before anything goes overdue, and reports on what is owed.

**Presenting?** Follow the step-by-step script in [DEMO.md](DEMO.md).

## Run

Needs Node 18+ and a MongoDB Atlas cluster.

1. In Atlas → **Network Access**, allow your current IP (or `0.0.0.0/0`). Networks that block port 27017 can't reach Atlas; use a hotspot there.
2. Configure and start the API:
   ```bash
   cd server
   cp .env.example .env      # set MONGO_URI (Atlas connection string) and JWT_SECRET
   npm install
   npm run seed              # demo data (resets the database)
   npm run dev               # API on http://localhost:5050
   ```
3. Start the UI:
   ```bash
   cd client
   npm install
   npm run dev               # opens on :5173, or the next free port; proxies /api to :5050
   ```

On the login page, click a role to sign in. Or use `admin@demo.com`, `finance@demo.com` or `manager@demo.com` with the password `password123`.

Tests: `cd server && npm test` runs 19 tests (the verification rules, plus API integration tests against a throwaway in-memory MongoDB; Atlas is never touched). The full project report is in [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md).

## How it works

| Step | Who | What happens |
|---|---|---|
| Submit | Finance | The invoice is checked automatically: the vendor is active, the invoice number is unique for that vendor, the amount is above 0, and the due date is on or after the invoice date. If a PO is linked, the PO must be open, belong to the same vendor, and the total invoiced must stay within the PO amount + 2%. Pass → *Waiting for approval* and managers get an alert. Fail → *Needs fixing* with the reason, ready to correct and resubmit. |
| Approve / reject | Manager | Rejecting needs a reason. Finance gets an alert either way. |
| Pay | Finance | Partial or full payments. The balance is prefilled and overpaying is blocked. → *Partly paid* / *Paid*. |
| Reminders | Daily at 09:00, or the admin's **Run reminder check now** | Due within 3 days → Finance. Overdue → Finance and Admin. Waiting for approval more than 2 days → Managers. Never repeated for the same invoice on the same day. |
| Reports | Finance, Manager | Paid vs still owed, how overdue the unpaid amounts are, payments per month, invoices by stage, top vendors, average time to approve and to pay, CSV export. |

Admin can do everything and also manages users. Roles are enforced on the server; the browser only hides buttons.

## What the UI gives you

- **Payment route:** the Home page shows every invoice grouped by stage (Needs fixing → Waiting for approval → Ready to pay → Partly paid → Paid), with counts and amounts. Click a stage to see its invoices.
- **To-do list for each role:** managers see what to approve; finance sees what to pay (most urgent first) and what to fix.
- **Invoice page:** a progress tracker (Submitted → Checked → Approved → Paid), a **Next step** panel that says whose turn it is and holds the action (approve or reject, the payment form, fix and resubmit), the check results, a payment progress bar and an activity history.
- **Alerts bell** for approvals, rejections and reminders, plus confirmation messages after every action.
- **View as** switcher in the sidebar and one-click demo logins, for moving between roles during a demo.

## Architecture

```
 Browser (React + Vite)
        │  /api/*  (Vite dev proxy)
        ▼
 Express API :5050 ── JWT auth + requireRole per route
   │   ├─ routes/        auth, users, vendors, purchase orders, invoices, reports, notifications
   │   ├─ services/      verify.js (rules, pure function), notify.js
   │   └─ jobs/          reminders.js  ◄── node-cron, daily 09:00
        │  Mongoose
        ▼
 MongoDB Atlas  (users, vendors, purchaseorders, invoices, notifications)
```

Uploaded invoice files are stored in `server/uploads/` and can only be downloaded by signed-in users.

## Layout

```
server/  index.js · models/index.js · routes/ · services/ · jobs/reminders.js · seed.js · verify.test.js
client/  src/main.jsx · api.js · auth.jsx · format.js · components/ · pages/
```
