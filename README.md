# SACCO Admin Portal

A plain HTML / CSS / JavaScript (no build step, no frameworks) staff portal
covering every module of the SACCO backend: members, savings, loans,
accounting, HR & payroll, shares, groups, notifications, risk & compliance,
and user/audit administration.

It shares the same design system and architectural pattern as the member
portal (see that project's README for the general approach — native ES
modules, a tiny `el()` DOM builder, a hash router, no npm dependencies).

## Running it

```bash
cd admin-portal
python3 -m http.server 5174
# then open http://localhost:5174
```

Set the backend URL in `js/config.js` (defaults to `http://localhost:8000`).

Use a different port than the member portal (`5173`) if you're running both
at once locally.

## Project layout

```
index.html            Shell: login screen + sidebar app shell
css/style.css          Same design tokens as the member portal, plus staff-only
                        components (toolbars, pagination, role pills, confirm
                        dialogs, detail panels, journal-entry line builder)
js/config.js, api.js    Same as member portal (API base URL, fetch wrapper)
js/auth.js              Simpler than the member portal's — just the logged-in
                        staff user, no member-profile resolution
js/router.js            Same minimal hash router
js/utils.js             Adds dataTable(), paginationBar(), confirmDialog(),
                        and memberPicker() (search-as-you-type member lookup,
                        used everywhere a form needs "which member is this for")
js/views/*.js           One file per module
```

## Module coverage

| View | What staff can do |
|---|---|
| **Dashboard** | KPIs: total members, active loans + outstanding, portfolio-at-risk, open risk flags. Degrades gracefully if your role can't see risk data. |
| **Members** | Search/paginate, create, edit (contact info + status), exit (soft-delete). Click into a member for a 360 view: contact, next of kin, savings accounts, loans, share holdings. |
| **Savings** | Manage products; find a member, open accounts for them, post deposits/withdrawals, view transaction history. |
| **Loans** | Manage products; browse/filter applications; open an application to see guarantors/collateral, approve or reject, disburse (to savings/mobile money/bank/cash), record repayments, view the amortization schedule. |
| **Accounting** | Chart of accounts, trial balance, and a journal entry builder with a live debit/credit balance check before you can submit an unbalanced entry (the backend also enforces this — the UI just saves you a round trip). |
| **HR & Payroll** | Manage employers; upload a payroll deduction batch (member + loan/savings target + amount per line) and see the reconciliation result immediately, including any exceptions. |
| **Shares** | Manage products; find a member and record subscribe/redeem/transfer transactions; declare dividends with a summary of the payout. |
| **Groups** | Create groups, add members with a role, record and view contributions. |
| **Notifications** | Send a one-off notification to a member (email/SMS/push); view a member's notification history. |
| **Risk & Compliance** | View portfolio-at-risk, trigger the dormancy sweep on demand, raise and resolve risk flags. |
| **Users & Audit** | Create staff/member user accounts, edit role/active status, link a user account to a member profile, browse the audit log. |

## Role-based behavior

The backend enforces RBAC on every mutating endpoint — the UI doesn't
duplicate that logic, it just surfaces whatever the backend says. If a
signed-in user's role doesn't permit an action, the request fails with the
backend's own message (e.g. *"Role 'teller' is not permitted to perform
this action."*) shown as a toast, rather than the UI trying to guess and
hide buttons preemptively. The one exception is the dashboard, which
pre-emptively skips KPI cards a role can't see (PAR and risk-flag counts)
rather than showing an error for each.

## Notes on a few design choices

- **Member/loan/savings lookups use a picker, not raw ID entry** — except
  in the payroll upload form, where you still need to paste a loan or
  savings account ID by hand (find it on the member's detail page in
  Members). A proper "pick this member's specific loan/account" combo
  picker would be the natural next iteration there.
- **The journal entry builder validates balance client-side** before
  submit, purely as a UX nicety — the backend (`accounting_service.post_journal_entry`)
  is the actual source of truth and will reject unbalanced entries
  regardless.
- **User creation goes through the public `/auth/register` endpoint** — as
  flagged in the backend README, that endpoint isn't currently gated to
  admins only. Locking it down (e.g. requiring an admin token to create
  non-member accounts) is a good next step before any public deployment.

## Known gaps

- No bulk actions (e.g. approving several loans at once).
- No CSV export on any table.
- Payroll deduction lines require manually pasting a loan/savings account
  ID rather than picking from a dropdown scoped to the selected member.
- No dedicated "compliance reports" UI, even though the backend model
  (`ComplianceReport`) exists — only risk flags and PAR are wired up here.
