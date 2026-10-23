# InvoiceFlow demo script (6–8 minutes)

The story: a vendor sends a bill, the system checks it, finance reviews it, a manager approves it, finance pays it, and the vendor sees the payment. Every amount and invoice number below comes from the demo data loaded by `npm run seed`.

## Before you present

- [ ] **Network:** Atlas → *Network Access* lists your current IP, or `0.0.0.0/0`. If the network blocks port 27017 (the college network does), use a phone hotspot.
- [ ] **Fresh data:** `cd server && npm run seed`. Run it shortly before the demo, because due dates are calculated from today. It erases whatever is in the database.
- [ ] **Start the API:** `cd server && npm run dev`. Wait for `API on http://localhost:5050`.
- [ ] **Start the UI:** `cd client && npm run dev`. Open the URL Vite prints. If port 5173 is taken, it picks the next one, such as **5174**.
- [ ] **Browser:** zoom to about 110% so reviewers can read the screen. Close other tabs.

All demo logins use the password `password123`: `vendor@demo.com` (Ravi, Globex Logistics), `finance@demo.com` (Farid), `manager@demo.com` (Meera), `admin@demo.com` (Asha).

---

## 1. The sign-in page (30 s)

**Show:** the sample bill on the left ticks through the five checks and gets stamped *Approved*. On the right, the four demo accounts each say what that person does.

**Say:** "Four roles, one bill passing between them. Each person only sees and does their own part."

## 2. The vendor sends a bill (1.5 min)

1. Click **Ravi, vendor**. The sidebar is short: Ravi only sees Globex's own invoices and purchase orders.
2. Click **New invoice**. *Billing as Globex Logistics* is filled in, and the due date comes from Globex's 45-day terms.
3. Click **Generate** next to the invoice number. It fills in **GL/26-27/0001** (vendor initials, financial year, sequence).
4. **Purchase order this bill is for:** pick **PO-1002, Inbound freight from Mumbai port (₹30,600 left)**.
5. Line item: `October freight`, quantity `1`, rate `20000`, GST `18%`. The total shows **₹23,600**.
6. Point at **Checks** on the right: every check says *Passes* before anything is sent.
   - *Optional:* change the rate to `30000`. The total becomes ₹35,400 and *Matches the purchase order* turns to **Will fail**, with "How to fix" advice. Change it back.
7. Click **Submit for checks**. The bill moves to **Finance review**.

**Point:** problems are caught while the vendor is typing, not after someone has paid.

## 3. Finance reviews (1 min)

1. In the sidebar, open **View as** and pick **Farid (finance)**.
2. On **Home**, **Waiting for your review** lists the new bill and **NWE-0462** (Northwind Electricals).
3. Open the new Globex bill. **Next step: Review this bill**. Click **Send to a manager**.
4. Open **NWE-0462**, click **Return to vendor…**, type `Attach the signed delivery note` and confirm. It goes back to Northwind with that note.

**Point:** a person looks at every bill before a manager is asked to approve it, and a returned bill always says why.

## 4. The manager approves (45 s)

1. **View as → Meera (manager)**. Her to-do list shows **Waiting for your approval**: the Globex bill and **GLX-312**.
2. Open the Globex bill. The progress tracker shows Submitted ✓, Checked ✓, Reviewed ✓, and Approved as the current step. Click **Approve**.

**Point:** managers only see bills that passed the checks and finance's review, so approving takes one click.

## 5. Finance pays it in two parts (1 min)

1. **View as → Farid (finance)**. The approved bill is now under **Ready to pay**.
2. In **Next step: Record the payment**, change the amount to **10000**, add a reference such as `UTR900001`, and click **Record payment**. The status becomes **Partly paid**.
3. Record the remaining **₹13,600**. Every step turns green and the panel says *Fully paid*.
4. **View as → Ravi (vendor)** and open the **bell**: Ravi was told about both payments.

**Point:** payments are tracked down to the balance, the server blocks overpaying, and the vendor doesn't have to call to ask.

## 6. Why a purchase order exists (45 s)

1. As Farid, click **Purchase orders**. Each order shows what was bought, who asked for it, how much has been billed and how much is left.
2. Open **PO-1002**. **Why this order exists**: the reason, who requested it, when it is needed and who raised it. **Bills against this order** lists every invoice billed to it.

**Point:** a bill is matched against an order someone actually approved, and only 0.5% over the order amount is allowed in total.

## 7. Admin manages accounts (45 s)

1. **View as → Asha (admin)**. Asha sees only **Users**: no invoices, payments or reports.
2. The cards at the top count vendor, finance and manager logins, and show which vendors have no login yet.
3. Click **Change** on a user to switch their role or set a new password.
4. Click **Run reminder check now**. It is the same job that runs every day at 09:00.

**Point:** the person who manages accounts can't touch the money, which is a basic control in any finance team.

## 8. Reports (45 s)

**View as → Meera** or Farid, then click **Reports**: paid vs still owed, how late the unpaid amounts are, payments each month, invoices by stage, biggest vendors, average days to approve and to pay. Filter by invoice date and click **Download CSV**.

---

## Likely reviewer questions

**What's the tech stack?**
MongoDB Atlas with Mongoose 8, Express 5, React 18 with Vite 6, React Router, Framer Motion and Recharts. Logins use JWT tokens and passwords are hashed with bcrypt. File uploads use Multer, and the daily job uses node-cron.

**Who can do what?**
- **Vendor:** sends and fixes bills for one vendor; sees only that vendor's invoices and purchase orders.
- **Finance:** reviews bills, returns them with a note or sends them to a manager, keeps vendors and purchase orders, records payments, sees reports.
- **Manager:** approves or rejects reviewed bills, sees reports.
- **Admin:** adds, changes and removes vendor, finance and manager accounts, and can run the reminder check. Admin has no access to invoices, payments or reports.

Roles are checked on the server by the `requireRole` middleware on every route; hiding buttons in the browser is only for convenience. A vendor asking for another vendor's invoice gets **404**, as if it didn't exist.

**How does verification work?**
`server/services/verify.js` runs five rules on every submission:
- the vendor is active
- the invoice number isn't already used for that vendor
- the amount is above 0
- the due date is on or after the invoice date
- if a purchase order is linked: it is open, belongs to the same vendor, and the total billed against it stays within the order amount + 0.5%.

The rule function is pure, so the API, the unit tests and the invoice form in the browser all run the same code. Any failure sends the bill back to the vendor with the reason and how to fix it.

**What if two people pay the same invoice at the same moment?**
The Invoice schema has Mongoose's **optimistic concurrency** turned on. If two payments race, the second save fails (409 Conflict) instead of overpaying. Every payment is also checked against the remaining balance, in whole paise.

**What if the same invoice is submitted twice at the same moment?**
A unique index on vendor + invoice number for live invoices lets only one through. An automated test fires three identical submissions at once and checks that exactly one survives.

**How did you test it?**
`npm test` in `server/` runs 29 automated tests: unit tests of the rules and invoice numbering, plus integration tests that start the real API against a throwaway in-memory database (roles, the full vendor → finance → manager → payment flow, returns, vendor isolation, purchase order limits, reminders, reports, CSV safety, duplicates, rounding). Each role was also driven in a real browser.

**How do reminders avoid spamming people?**
Before creating a reminder, the job checks whether one of the same type for the same invoice already exists today. Running it twice sends nothing new.

**Why MongoDB?**
An invoice is naturally one document holding its line items, checks, history and payments, so a single read shows the whole story. The aggregation pipeline produces the reports in one query.

**What would you add next?**
Email or WhatsApp reminders, reading invoice PDFs automatically (OCR), splitting GST into CGST/SGST or IGST by state, a second approval for large amounts, and deployment with HTTPS.
