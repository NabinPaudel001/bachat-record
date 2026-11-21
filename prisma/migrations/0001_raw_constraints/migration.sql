-- Raw constraints migration for Bachat Record
-- This migration adds CHECK constraints, immutability triggers,
-- journal balance enforcement, and row-level security.

-- ============================================================
-- 1. CHECK constraint on JournalLine
-- ============================================================
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_debit_credit_chk"
  CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0));

-- ============================================================
-- 2. Immutability triggers on Journal and JournalLine
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_journal_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Journals are immutable – reverse and re-post instead';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_immutable
  BEFORE UPDATE OR DELETE ON "Journal"
  FOR EACH ROW EXECUTE FUNCTION prevent_journal_mutation();

CREATE TRIGGER trg_journal_line_immutable
  BEFORE UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION prevent_journal_mutation();

-- ============================================================
-- 3. Deferred constraint trigger: journal lines must balance
-- ============================================================
CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debit  NUMERIC;
  v_total_credit NUMERIC;
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM "JournalLine"
   WHERE "journalId" = NEW."journalId";

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Journal % does not balance: debits=% credits=%',
      NEW."journalId", v_total_debit, v_total_credit;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_journal_balance
  AFTER INSERT ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

-- ============================================================
-- 4. Enable Row-Level Security on ALL tables
-- ============================================================
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContributionDue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Fine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Loan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanGuarantor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanInterestPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavingsAccrual" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanAccrual" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvestmentCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Investment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvestmentValuation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OtherAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Journal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountingPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OtherIncome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Distribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DistributionLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CronRun" ENABLE ROW LEVEL SECURITY;
