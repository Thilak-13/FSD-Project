# InvoiceFlow demo script (5–7 minutes)

The story: an invoice arrives, the system checks it, a manager approves it, finance pays it, and nothing slips through. Every amount and invoice number below comes from the demo data loaded by `npm run seed`.

## Before you present

- [ ] **Network:** Atlas → *Network Access* lists your current IP, or `0.0.0.0/0`. If the network blocks port 27017 (the college network does), use a phone hotspot.
- [ ] **Fresh data:** `cd server && npm run seed`. Run it shortly before the demo, because due dates are calculated from today.
- [ ] **Start the API:** `cd server && npm run dev`. Wait for `API on http://localhost:5050`.
- [ ] **Start the UI:** `cd client && npm run dev`. Open the URL Vite prints. If port 5173 is taken, it picks the next one, such as **5174**.
- [ ] **Browser:** zoom to about 110% so reviewers can read the screen. Close other tabs.

---

## 1. The login page (30 s)

**Show:** the left side explains the four-step flow: Finance enters the invoice → the system checks it → a manager approves → Finance pays and it closes.

**Say:** "Each role sees its own to-do list. I can sign in as any of them with one click."

**Point:** the product has one clear flow, and each role has a defined part in it.

## 2. Manager approves GLX-312 (1 min)

1. Click **Meera, manager**.
2. On **Home**, point at the **Payment route**: Needs fixing → Waiting for approval → Ready to pay → Partly paid → Paid, each with a count and an amount.
3. Under **Your to-do list → Waiting for your approval**, click **GLX-312** (Globex Logistics, ₹30,000, waiting 4 days).
4. Show the **progress tracker** (Submitted ✓, Checked ✓, Approved is the current step) and the **Automatic checks**. All checks have passed, including *Matches the purchase order*: ₹90,000 invoiced against PO-1002's ₹1,20,000.
5. In **Next step: Your decision is needed**, click **Approve**.

**Reviewers see:** the message "Invoice approved. Finance has been notified to pay it.", the Approved step turns green, and the Activity list records Meera's approval.

**Point:** managers only see invoices that have already passed the checks, so approving takes one click.

## 3. Finance pays it in two parts (1 min)

1. In the sidebar, open **View as** and pick **Farid (finance)**.
2. Open the **bell** (top right). Farid has an alert: "Invoice GLX-312 was approved".
3. Click the alert, or open GLX-312 from **Ready to pay** on Home.
4. In **Next step: Record the payment**, change the amount from ₹30,000 to **10000**, add a reference such as `UTR900001`, and click **Record payment**.
   - Reviewers see "Part-payment of ₹10,000 recorded.", the status changes to **Partly paid**, and the progress bar fills to a third.
5. The amount box now shows the remaining **₹20,000**. Click **Record payment** again.
   - Reviewers see "…The invoice is fully paid.", every step is green, and the **Next step** panel says *Fully paid*.

**Point:** payments are tracked down to the balance, and the server blocks any overpayment.

## 4. When things go wrong (1 min)

1. Go back to **Home**. Under **Needs fixing**, click **INI-77** (Initech Software, ₹5,000).
   - The **Checked** step is red, and the check *Vendor is registered and active* failed with "Vendor is inactive".
   - **Say:** "The system stopped this one before it reached a manager."
2. Go back. Under **Needs fixing**, click **SFS-2302** (Sunrise Facility Services, ₹9,600).
   - **Next step: Rejected by a manager**, with Meera's reason: *"Charged for 12 visits, service log shows 10. Ask vendor for a revised bill."*
   - A **Correct and resubmit** button sends it back through the checks.

**Point:** problems come back to the right person with the reason attached, so nobody has to chase anyone.

## 5. Create an invoice live (1.5 min)

1. Click **New invoice** in the sidebar.
2. Point at the dark panel on the right: **What happens when you submit**, which lists the checks.
3. Fill in the form:
   - **Vendor:** *Acme Office Supplies*. Point out that the **due date fills itself in** from Acme's 30-day terms.
   - **Invoice number:** `ACME/24-25/140`
   - **Amount:** `12000`
   - **Purchase order:** *PO-1001, ₹50,000*. The hint says the total may not exceed ₹51,000 (PO + 2%).
   - Optionally attach any PDF.
4. Click **Submit for checks**.
   - Reviewers see "All checks passed. The invoice has been sent to managers for approval." and the invoice is **Waiting for approval**.
5. **The duplicate:** click **New invoice** again. Choose **Acme Office Supplies**, enter the **same** number `ACME/24-25/140` and any amount, then click **Submit for checks**.
   - Reviewers see "Saved, but 1 check failed." with *Not a duplicate of an earlier invoice* in red: "Invoice number ACME/24-25/140 already exists for this vendor".

**Point:** duplicate payments are a costly real-world mistake, and the system catches them automatically.

*Optional:* link PO-1001 again with an amount of **40000**. It fails *Matches the purchase order*, because ₹20,000 + ₹12,000 + ₹40,000 is more than ₹51,000.

## 6. Admin and reminders (1 min)

1. Under **View as**, pick **Asha (admin)**. The admin's to-do list shows every group.
2. Click **Run reminder check now** at the top of Home. This is the same job that runs automatically every day at 09:00.
   - Reviewers see "Reminder check done: N reminders sent".
3. Open the **bell**. It shows overdue alerts such as "Invoice ACME/24-25/131 is 70 days overdue" and "Invoice GLX-310 is 25 days overdue".
4. Click **Run reminder check now** a second time: "nothing new to remind about today".

**Point:** reminders are automatic and never repeat for the same invoice on the same day. Finance also gets "due soon" alerts, for example GLX-311, due in 2 days.

## 7. Reports (45 s)

Click **Reports** in the sidebar.

- **Top cards:** paid to vendors, still owed, average days to approve, and average days from approval to payment.
- **How late is what we owe?** Unpaid amounts grouped into *Not yet due / 0-30 / 31-60 / 61-90 / 90+* days past due.
- **Payments each month**, **Invoices by stage**, and **Biggest vendors by amount paid**.
- Set an **Invoice date from / to** range to filter everything, then click **Download CSV** to export.

**Point:** finance can see what it owes and where it's slow, without building a spreadsheet.

---

## Likely reviewer questions

**What's the tech stack?**
MERN: MongoDB Atlas with Mongoose 8, Express 5, React 18 with Vite 6, React Router and Recharts. Logins use JWT tokens and passwords are hashed with bcrypt. File uploads use Multer, and the daily job uses node-cron.

**How does verification work?**
When an invoice is submitted, `server/services/verify.js` runs five rules:
- the vendor is active
- the invoice number isn't already used for that vendor
- the amount is above 0
- the due date is on or after the invoice date
- if a PO is linked: the PO is open, belongs to the same vendor, and the total invoiced against it stays within the PO amount + 2%.

The rule function is pure, so the API runs it with data loaded from the database and the unit tests (`npm test`) run it directly. Any failure sets the invoice to *Needs fixing*, and the reason is stored on the invoice.

**What stops a manager from paying, or finance from approving?**
Roles are checked on the server by the `requireRole` middleware on each route. Hiding buttons in the browser is only for convenience. For example, a manager calling the payments API directly gets **403 Forbidden**.

**What if two people pay the same invoice at the same moment?**
The Invoice schema has Mongoose's **optimistic concurrency** turned on. Each save checks the document's version number, so if two payments race, the second save fails (409 Conflict) instead of overpaying. Every payment is also checked against the remaining balance, in whole paise to avoid rounding errors.

**Can one person enter and approve the same invoice?**
No. Whoever entered an invoice can't approve or reject it, even an admin; the server returns 403 and the invoice page says another approver is needed. That is separation of duties, the basic control against invoice fraud.

**What if the same invoice is submitted twice at the same moment?**
The database has a unique index on vendor + invoice number for live invoices, so only one can get through. There's an automated test that fires three identical submissions at once and checks that exactly one survives.

**How did you test it?**
`npm test` in `server/` runs 19 automated tests: 6 unit tests of the rules, plus 13 integration tests that start the real API against a throwaway database (login, roles, the full lifecycle, PO limits, reminders, reports, CSV safety, duplicates, rounding, dates). The whole flow was also driven in a real browser across all three roles.

**How do reminders avoid spamming people?**
Before creating a reminder, the job checks whether one of the same type for the same invoice already exists today. Running it twice sends nothing new.

**Why MongoDB?**
An invoice is naturally one document holding its checks, history and payments, so a single read shows the whole story. The aggregation pipeline produces all the reports in one query. Atlas also gives a hosted database with no server to manage.

**What would you add next?**
Email or WhatsApp reminders, reading invoice PDFs automatically (OCR), a portal where vendors submit invoices and see payment status, multi-level approval for large amounts, and deployment with HTTPS.
