# Bachat Record — Business Rules (Plain-English Guide)

This document is the plain-English business rule specification for Bachat Record (Group Savings, Loan & Investment Tracker), reflecting Section 3 of the Master Build Specification.

---

## 3.1 Calendar & Dates
- **Dual Calendar**: All primary operations, month-ends, and financial due dates are tracked in Bikram Sambat (BS). Every date display shows both BS and AD: `2083-07-19 BS (2026-11-05)`.
- **BS Months**: Baisakh (1), Jestha (2), Ashadh (3), Shrawan (4), Bhadra (5), Ashoj (6), Kartik (7), Mangsir (8), Poush (9), Magh (10), Falgun (11), Chaitra (12).
- **Day-Count Basis**: 365 days per year (admin editable setting `dayCountBasis`). Interest accrues for each calendar day (AD days).
- **Time Zone**: `Asia/Kathmandu` (UTC+5:45). All "today" checks use Nepal time.

---

## 3.2 Members & Classes
- **Fields**: Unique member number (`GS-0001`, `GS-0002`...), full name, photo, DOB, phone numbers, email, addresses, encrypted citizenship/ID number, nominee details, bank/digital wallet, join date, monthly installment amount, notes, and documents.
- **Classes (A / B / C)**: Derived automatically from join dates according to admin-editable `ClassRule` definitions. Staff never type member classes manually.
- **Rejoining**: When a closed member returns, they are registered as a **new member record** with a new member number, new join date, and new class rule. The history is linked via `previousMemberId`.

---

## 3.3 Monthly Contributions
- For every active member, one `ContributionDue` row exists per BS month starting from their join month.
- Default installment: NPR 1,000 per month (admin editable).
- Due statuses: `PENDING`, `PARTIAL`, `PAID`.
- "Total Deposited": The sum of all contribution amounts actually collected and allocated (plus unused advance credit).
- "Pending Contribution": Sum of `amount - paidAmount` for dues whose month has started.

---

## 3.4 Contribution Fines (NPR 200 default)
- **Grace Period**: Month M installment is due on the 1st of month M and must be paid by the **end of day 10 of month M+1** (`contributionGraceDay = 10`). Paying on or before day 10 carries **no fine**.
- **Fine Posting**: If unpaid by day 10 of month M+1, **exactly one fine of NPR 200** (`contributionFine = 200`) is posted on day 11 (or the next daily job).
- **No Compounding Fines**: The same monthly due is **never fined twice**, regardless of how many months it remains unpaid. Each new unpaid month generates its own single fine.
- **Accounting**: A fine is group income when collected. It is separate from member deposits and does NOT add to savings balance.

---

## 3.5 Payment Allocation Hierarchy
When a contribution payment is received for a member, funds are applied in this strict order:
1. **Oldest unpaid contribution due first** (by BS year, month).
2. **Unpaid contribution fines, oldest first** (by posted date).
3. **Advance credit**: Any remaining amount is credited as advance and applied automatically to the next month's dues.

An allocation preview is displayed before confirming.

---

## 3.6 Loans & Guarantors
- Only `ACTIVE` members can borrow.
- **Exactly 3 Guarantors**: All 3 must be active members, all distinct, and none can be the borrower.
- **Guarantors are Reference Only**: Guarantors are not liable if the borrower defaults. No debt recovery is sought from guarantors.
- **Maker-Checker**: A Treasurer can propose a loan; only the **Admin** approves and disburses it.

---

## 3.7 Loan Interest, Monthly Billing & Fines
- **Daily Interest**: `principalOutstanding × loanRate / 100 / 365`.
- **Monthly Billing**: Interest is billed per BS month. If unpaid by day 10 of the next BS month, **one fine of NPR 100** (`loanInterestFine = 100`) is posted for that period.
- **Convert Interest to Principal (Admin only)**: Admin can capitalise unpaid interest into principal. The principal increases, unpaid interest decreases, a `CAPITALISE` event is logged, and a non-cash journal is posted. From that day onward, interest accrues on the new principal.

---

## 3.8 Global Interest Rates with History
- Two global rates: `SAVINGS` and `LOAN`.
- Admin sets a new rate with an **effective-from date**. The new rate applies to **all loans and savings** from that date forward. Past days keep their respective historical rates.
- Rates used in closed/locked periods cannot be altered retroactively.

---

## 3.9 Savings Interest and Bonus Distribution
- **Daily Savings Interest**: Accrues daily on actual contributions paid (`savingsBase × savingsRate / 100 / 365`). Unpaid scheduled dues earn no daily savings interest.
- **Bonus**: Annual or periodic payout. Formula: `bonusBase × bonusPercent / 100`.
  - **Bonus Base includes unpaid scheduled contributions** up to the book-close month (`bonusIncludesUnpaid = true`). The unpaid part remains pending and does not turn into cash. Fines remain active.
- **Payout Modes**:
  - `PAYABLE` (default): Credited as an amount payable to the member.
  - `REINVEST`: Adds directly to the member's deposit balance.

---

## 3.10 Reserve and Bonus Planner
A built-in tool that calculates distributable profits:
1. `realizedNetProfit = realized income - expenses - past distributions in window`
2. `reserve = reservePercent% of net profit (or fixed amount)`
3. `distributable = realizedNetProfit - reserve`
4. `suggestedBonusPct = distributable / bonusBase × 100`
5. Unrealised investment gains (property/stock appreciation) are **never distributable**.
6. If admin picks a higher bonus, it draws from the reserve (`allowReserveDraw = true`), but cannot go below `reserveFloor`.

---

## 3.11 Loan Payment Allocation Hierarchy
Loan repayments are allocated strictly in this order:
1. **Loan fines** (oldest first).
2. **Loan interest** (oldest finalized periods first, then current month accrual).
3. **Principal reduction**.
Overpayment exceeding the total balance owed is rejected.

---

## 3.12 Immutable Double-Entry Ledger
- Every financial event posts a balanced journal (`Sum of Debits = Sum of Credits`) through `postJournal()`.
- **Zero In-Place Edits**: Journal tables never permit `UPDATE` or `DELETE`. Corrections are made via equal-and-opposite `reverseJournal()` entries linked to the original.
- **Period Locking**: Admin can lock an accounting period to prevent backdated entries.

---

## 3.13 Fine Waivers
- Admin only. Fines can be waived partially or fully with a mandatory reason.
- A waived fine posts no cash journal (as no cash was received). It is recorded on the fine and logged in the audit trail.

---

## 3.14 Account Closure & Exit
- Admin only.
- Blocked if the member has an active loan.
- If the member guards an active loan, admin must replace the guarantor first.
- Net payout = actual member deposits + payable credits.
- Record becomes read-only and no future dues are created.

---

## 3.15 Maker-Checker for Helper Role
- Payments entered by a `HELPER` remain `PENDING_APPROVAL`.
- Balances, dues, and journals do not update until an Admin or Treasurer reviews and approves the entry.
