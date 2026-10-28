# Tranzora user manual

This manual describes the screens and rules that are live in this build. Every statement here was checked against the running code; anything the system does not do yet is listed at the end instead of being glossed over.

Developer-facing detail lives in `docs/backend.md`, demo data in `docs/demo-data.md`.

## What the system is for

Tranzora runs one transport business at a time. It records customers, the bookings they make, the trips you dispatch against those bookings, the vehicles and drivers used, the money that comes in and goes out, and the paperwork that supports all of it. Every action is written to an audit trail, and nothing that carries money can be edited after it is posted.

## Getting an account

**Create a business.** Open `/register` and enter your name, email, phone, company name, and a password. This creates a brand-new workspace that only you can see, and your account gets the Business Admin role — full control of that workspace. Passwords need 8–128 characters with at least one letter, one number and one symbol.

**Signing in.** Sessions last 24 hours. Five wrong passwords lock the account for 15 minutes; ask an administrator to reset it if that happens. After a successful sign-in the app shows a "Welcome back" card with a **Continue to dashboard** link.

**New staff accounts are never self-service.** Staff cannot use the register page to join your business — that would create a separate workspace. An administrator creates each account on the Users page.

**Forgotten passwords** use `/forgot-password`. This only works once SMTP is configured (`Smtp:Host`, `Smtp:From`); otherwise the page reports that password recovery email is not configured. The emailed link is valid for 30 minutes and can be used once. Resetting or changing a password signs that account out everywhere.

**Google and Microsoft sign-in** appear as buttons but stay disabled until provider credentials and a matching callback URI are configured (`docs/backend.md`, "Google and Microsoft sign-in"). A first-time provider sign-in takes you through the same registration form and creates a workspace with Business Admin. Connecting a provider to an existing account happens on **My profile** within 10 minutes of signing in; disconnecting it signs out your other devices.

**OTP verification (`/verify-otp`) is not functional** in this build — it reports that OTP verification is not enabled and its countdown is static text.

## The main job: from enquiry to paid invoice

This is the workflow most of the system exists to serve. Money moves in the order below.

### 1. Register the customer

**Customers → Add record.** Required: name, reference, phone. Optional: email, address, notes. Status is Active or Inactive; bookings only accept Active customers, so an inactive customer is your way of parking an account without deleting it. The reference must be unique inside your workspace — use your own customer code.

### 2. Take the booking

**Bookings → Add record.** Required: name, reference, customer, origin, destination, amount, scheduled date.

A booking is the customer's request, not a dispatched job. It starts as **Pending**; move it to **Confirmed** when you accept it. The amount is the quoted value — it is **not** counted as income until you raise an invoice or record income.

### 3. Dispatch the trip

**Trips → Add record.** Required: name, reference, booking, vehicle, driver, start time, end time.

The trip is where the system protects you. It refuses the save when:

- the vehicle or driver is not Active (a vehicle under Maintenance cannot be dispatched);
- the driver's licence expires before the trip ends;
- the vehicle, the driver or the booking is already committed to another trip that overlaps this window;
- the booking has been cancelled, or the end time is not after the start time.

A trip starts **Scheduled**. It then goes **InProgress** and **Completed** — normally by the driver from their own screen. Overlapping trips cannot be saved, and the database enforces that even if two dispatchers submit at the same instant.

### 4. Record what the trip cost

- **Fuel → Add record:** vehicle, trip (optional), litres, unit price, record date. If you link a trip, the vehicle must be the trip's vehicle. Fuel is saved as **Posted** and cannot be edited or deleted afterwards.
- **Maintenance → Add record:** vehicle, scheduled date, amount, then move the status through Scheduled → InProgress → Completed. Only **Completed** amounts count as spending. Completed and Cancelled maintenance cannot be reopened.
- **Expenses → Add record:** amount, category, record date, plus optional trip and vehicle. Same rule: a linked trip must use the same vehicle.

Get these right as you type. There is no edit or delete on posted money — see "Correcting mistakes".

### 5. Invoice the customer

**Invoices → Add record.** Required: name, reference, customer, amount, due date; trip is optional.

If you link a trip, the trip's booking customer must be the invoice customer, so you cannot bill another customer's trip by accident.

New invoices are **Draft**. Editing the status field to **Issued** is what makes the invoice collectable: payments are only accepted against Issued invoices, and the dashboard counts only Issued invoices as outstanding. **An invoice that has received any payment can no longer be changed or cancelled** — the system rejects it with 409. Cancelled invoices stay in the record; invoices cannot be deleted at all.

### 6. Receive the payment

**Payments → Add record.** Required: name, reference, invoice, amount, method, record date.

Payments are rejected when the invoice is not Issued, or when the payment would exceed the invoice balance. Partial payments are fine and expected. Once posted, a payment is permanent.

### 7. Watch the money

The dashboard is a **cash summary, not double-entry accounting**:

- receipts = payments received + income entries;
- expenses = expenses + fuel (litres × unit price) + completed maintenance;
- cash surplus = receipts − expenses;
- outstanding = issued invoices − payments on them.

The same cost entered as fuel and again as an expense is counted twice. Nothing is auto-generated between stages: completing a trip does not create an invoice, an invoice does not create a reminder, and a payment does not create an income entry.

## Fleet and compliance

**Vehicles → Add record:** registration number (stored uppercase, unique per workspace), vehicle type, capacity, optional odometer. Statuses are Active, Inactive and Maintenance — a vehicle in Maintenance cannot take a trip.

**Drivers → Add record:** phone, licence number (unique per workspace) and licence expiry are all required. Expiry must cover the trip's end time.

**Documents → Add record:** vehicle, driver, storage key/path, expiry date, with Active or Expired status. Documents are paperwork references only: no file upload is wired, the storage key must be a relative path inside your own storage, and expiry dates are never applied automatically — you set the status yourself.

**Suppliers → Add record** keeps vendor names, references, phone, address and status the same way customers do. Nothing links a cost to a supplier in this build, so a vendor's bills are recorded as expenses or maintenance with the supplier named in the notes.

## Correcting mistakes

| Situation | What you do |
| --- | --- |
| Wrong amount in fuel, an expense, income or a payment | Add a new record that offsets it; the original stays. Editing or deleting posted money is refused. |
| Wrong trip details, no payment yet | Edit the trip (or cancel and re-create it). Cancel is only possible while the trip is not Completed or Cancelled. |
| Invoice error before any payment | Edit the invoice, or set it to Cancelled and raise a new one. |
| Invoice error after a payment | Raise a new invoice for the difference; the original is frozen. |
| Screen says the record changed | Someone else saved it. Refresh and re-enter your change; the app refuses blind overwrites so nobody's edit is lost silently. |
| Duplicate submission from a double click | Harmless. The app sends a request key with every save, so an identical retry replays the first result instead of creating a second record. |

## Your team

**Users → New.** Required: name, email, role, password; phone is optional. Role changes are made either here or with the inline role/status controls on the Users list.

| Role | What it can actually do |
| --- | --- |
| Super Admin | Everything, including Users and Settings. Only one is required to stay active; nobody can be demoted if they are the last. |
| Business Admin | Same powers as Super Admin. This is the role a self-registered owner gets. |
| Manager | Everything except Users and Settings, including the audit trail. |
| Dispatcher | Bookings, trips, vehicles, drivers, customers, notifications. Sees the dashboard. No fuel, maintenance or money screens. |
| Accountant | Customers, suppliers, invoices, payments, expenses, income. Read-only on trips, vehicles, drivers, bookings, fuel, maintenance and the dashboard. |
| Driver | Their own workspace only: assigned trips and vehicles, and starting or completing their own trips. |
| Support Staff | Support tickets and notifications, plus customer lookup. |
| Viewer | Reads everything except Users, Settings and the audit trail. Cannot save anything. |

Creating a **Driver** account requires a matching Driver record in your workspace — add the driver first, then link the login. Choose Driver in the dropdown and a driver picker appears.

Changing someone's role or deactivating them signs them out immediately; they must sign in again. You cannot change your own role or deactivate your own account. Roles are enforced by the server, not just hidden in the menu, so a Viewer cannot save anything even by calling the API directly.

Suggested shape for a small operator: two Business Admins (owner plus a deputy), a Manager for daily operations, Dispatchers per shift, one Accountant, a Driver login per driver, and Viewer for anyone who only needs to look.

## The driver's own screens

Drivers land on `/driver`, which shows their counts of scheduled, in-progress and completed trips, recent assignments and their vehicles.

**My trips → Start trip** moves a Scheduled trip to InProgress; **Complete trip** finishes it. Only these two steps are offered, only on trips assigned to that driver, and the system re-checks at start time that the driver, the vehicle and the licence are all still valid. Both actions are audited. A driver whose login is not linked to a driver record sees a message telling them to ask their administrator.

## Day-to-day admin

- **Notifications** is a manual register. Nothing in the system writes a notification for you — completing a trip or an overdue invoice does not create one. The only per-record control is the `read` flag in the edit form.
- **Help & support** is a real ticket list (Open → Closed) that Support Staff and Administrators can work.
- **Audit trail** lists who created, updated or deleted what, and driver start/complete actions. It is read-only and available to administrators and Managers.
- **Settings** edits the workspace name. Currency is displayed but there is no conversion; one workspace, one currency.
- **My profile** edits your name and phone, and shows connected sign-in providers.
- **Security** changes your password and then forces you to sign in again.

List pages refresh themselves every 20 seconds and the dashboard figures are cached for 30 seconds, so a colleague's save appears on its own. Search, status filter, page size (10/20/50/100), Refresh and Previous/Next sit in each list's toolbar. If you hammer Refresh hard enough you can hit the request limit and the app tells you to wait a minute.

## Screens that are not wired up yet

Do not promise these to your team:

- Live tracking, route management, geofencing — they explain that a map provider is not configured.
- Roles and permissions editing beyond the fixed role list — the page states policy editing is not enabled.
- Backup, restore, database, system and integration settings — deployment operations, not app screens.
- Subscription/billing, payment methods, appearance settings.
- Payroll, challans, alerts, passengers, and the OTP flow.
- File uploads, credit notes, multi-currency, a general ledger, automatic invoice numbering, automatic notifications, and automatic document expiry.

These screens are honest about their state; the workflow above is the part that runs a business today.

## Backup operations

Backup and restore are operator tasks, outside the application UI. An isolated logical restore has been demonstrated; see [backup-restore.md](backup-restore.md). Scheduled backups and point-in-time recovery are not yet verified.

## Recovery email

Use Forgot password with the email of an active account in this installation. Google account ownership alone does not create a Tranzora account. The recovery page deliberately gives the same response for unknown addresses. Check spam if the email is missing. Reset links expire after 30 minutes and are single-use.


## Reset-password layout

The reset-password form is centered on desktop and phone screens, includes visible password requirements, and provides an underlined Back to sign in link.

## App icon

Browser tabs and newly saved mobile home-screen shortcuts use the Tranzora truck logo. An existing saved shortcut may need to be removed and added again to update its cached icon.

## English and Bengali

Use the Language selector beside the theme button in the landing or workspace navbar. Choose Bengali or English; common navigation, page headings, table/form actions, account fields and landing content update immediately. Your browser remembers the choice across pages and refreshes. Saved names, references, financial values and business data stay as entered. Untranslated specialist descriptions and server error messages retain their original English wording.

On narrow phones the workspace navbar uses two rows so menu/search and language/theme/account actions remain reachable. Existing selected navigation and theme effects are retained.


## Language icon and landing illustration

Language selection now uses the globe icon beside the theme button. Click it to open English/Bengali choices; the checkmark identifies your saved selection. Escape closes the menu. The landing hero includes an animated illustrative transport map, not a live GPS feed.

## Public delivery

Production setup and acceptance steps are documented in [render-deployment.md](render-deployment.md). Use a real owner registration; development demo accounts are not automatically created in production. Landing dashboard figures are explicitly illustrative, and business totals appear after sign-in. Password recovery requires an existing registered account and configured SMTP. Advanced integrations are not active merely because a navigation/design preview exists.

Registration creates a Business Admin workspace owner. Super Admin access is reserved for platform operators and is not granted automatically to workspace owners.


The landing navbar and content share responsive gutters, with wider desktop layouts and wrapped controls on narrow phones. Workspace headers share consistent spacing; focusing search highlights the complete search field, without a second outline around its text input.


English typography uses locally hosted Manrope headings and Plus Jakarta Sans interface text. Bengali retains its existing typeface. Font licenses are included in public/fonts.
