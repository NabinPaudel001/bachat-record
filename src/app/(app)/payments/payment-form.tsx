'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NepaliDatePicker } from '@/components/ui/nepali-date-picker';
import {
  calculateMemberFinancialSummary,
  allocateMemberPayment,
  PaymentType,
} from '@/server/engines/paymentAllocation';
import { formatNPR } from '@/lib/format';
import { recordPaymentAction } from './actions';
import { useRouter } from 'next/navigation';
import { Search, X, CheckCircle2, AlertCircle, Info, ArrowRight } from 'lucide-react';

export interface MemberOption {
  id: string;
  memberNo: string;
  fullName: string;
  monthlyAmount: string;
  advanceBalance: string;
  loans: {
    id: string;
    loanNo: string;
    principalOutstanding: string;
    periods: {
      id: string;
      bsYear: number;
      bsMonth: number;
      accrued: string;
      paid: string;
      capitalised: string;
      finalised: boolean;
    }[];
  }[];
  dues: {
    id: string;
    bsYear: number;
    bsMonth: number;
    amount: string;
    paidAmount: string;
    status: string;
  }[];
  fines: {
    id: string;
    type: string;
    amount: string;
    paidAmount: string;
    waivedAmount: string;
    postedOn: string;
    status: string;
  }[];
}

function MemberSearchSelect({
  members,
  selectedId,
  onSelect,
}: {
  members: MemberOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = members.find((m) => m.id === selectedId);

  const filtered = useMemo(() => {
    if (!query.trim()) return members;
    const q = query.toLowerCase();
    return members.filter(
      (m) =>
        m.memberNo.toLowerCase().includes(q) ||
        m.fullName.toLowerCase().includes(q)
    );
  }, [query, members]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-1" ref={ref}>
      <label className="text-xs font-semibold">Select Member *</label>
      {selected && !isOpen ? (
        <div
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm flex items-center justify-between cursor-pointer hover:bg-muted/50"
          onClick={() => {
            setIsOpen(true);
            setQuery('');
          }}
        >
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">
              {selected.memberNo}
            </Badge>
            <span className="truncate">{selected.fullName}</span>
          </span>
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Search by member code or name..."
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
              autoFocus
            />
          </div>
          {isOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-card shadow-lg">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">No members found</div>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect(m.id);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/60 transition-colors ${
                      m.id === selectedId ? 'bg-primary/10 font-medium' : ''
                    }`}
                  >
                    <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{m.memberNo}</span>
                    <span className="truncate">{m.fullName}</span>
                    {m.loans.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[9px]">
                        {m.loans.length} loan(s)
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PaymentForm({
  members,
  defaultMemberId,
}: {
  members: MemberOption[];
  defaultMemberId?: string;
}) {
  const router = useRouter();
  const [memberId, setMemberId] = useState(defaultMemberId || (members[0]?.id ?? ''));
  const [paymentType, setPaymentType] = useState<PaymentType>('AUTOMATIC');
  const [loanId, setLoanId] = useState('');
  const [amount, setAmount] = useState('1000');
  const [method, setMethod] = useState('CASH');
  const [receiptNo, setReceiptNo] = useState(`RCP-${Math.floor(100000 + Math.random() * 900000)}`);
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedMember = members.find((m) => m.id === memberId);

  // Keep loanId in sync with selected member
  useEffect(() => {
    if (selectedMember && selectedMember.loans.length > 0) {
      if (!loanId || !selectedMember.loans.some((l) => l.id === loanId)) {
        setLoanId(selectedMember.loans[0].id);
      }
    } else {
      setLoanId('');
    }
  }, [selectedMember]);

  // Compute live member records and advance deduction
  const memberSummary = useMemo(() => {
    if (!selectedMember) return null;
    return calculateMemberFinancialSummary({
      advanceBalance: selectedMember.advanceBalance,
      dues: selectedMember.dues,
      fines: selectedMember.fines,
      loans: selectedMember.loans,
    });
  }, [selectedMember]);

  // Compute live automatic allocation preview
  const allocationResult = useMemo(() => {
    if (!selectedMember) return null;
    const numAmt = parseFloat(amount) || 0;
    if (numAmt <= 0) return null;

    try {
      return allocateMemberPayment({
        amount: numAmt,
        paymentType,
        dues: selectedMember.dues,
        fines: selectedMember.fines,
        loans: selectedMember.loans,
        selectedLoanId: loanId || undefined,
      });
    } catch {
      return null;
    }
  }, [selectedMember, paymentType, amount, loanId]);

  const isLoanSpecificType =
    paymentType === 'LOAN_PRINCIPAL' ||
    paymentType === 'LOAN_INTEREST' ||
    paymentType === 'LOAN_FINE';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    if (isLoanSpecificType) {
      if (!selectedMember || selectedMember.loans.length === 0) {
        setError('The selected member has no active loans for this loan payment type.');
        return;
      }
      if (!loanId) {
        setError('Please select an active loan for repayment.');
        return;
      }
    }

    setLoading(true);
    const idempotencyKey = `PAY-${memberId}-${receiptNo}-${Date.now()}`;

    try {
      const res = await recordPaymentAction({
        memberId,
        paymentType,
        loanId: loanId || undefined,
        amount: numAmount,
        method,
        paymentDate,
        receiptNo,
        idempotencyKey,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess('Payment recorded and posted successfully!');
        setReceiptNo(`RCP-${Math.floor(100000 + Math.random() * 900000)}`);
        router.refresh();
      }
    } catch {
      setError('An error occurred while posting payment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Member Selection & Financial Records Display */}
      <Card className="border-border">
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-base">Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-5">
          {error && (
            <div className="rounded bg-destructive/10 p-3 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="rounded bg-emerald-500/10 p-3 text-emerald-700 text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MemberSearchSelect
              members={members}
              selectedId={memberId}
              onSelect={(id) => {
                setMemberId(id);
                const mem = members.find((m) => m.id === id);
                if (mem && mem.loans.length > 0) {
                  setLoanId(mem.loans[0].id);
                } else {
                  setLoanId('');
                }
              }}
            />

            <div className="space-y-1">
              <label className="text-xs font-semibold">Payment Type *</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                className="h-9 w-full rounded border bg-background px-3 text-sm font-medium"
              >
                <option value="AUTOMATIC">Automatic Allocation</option>
                <option value="MONTHLY_LEVY_CONTRIBUTION">Monthly Levy Contribution</option>
                <option value="MONTHLY_LEVY_FINE">Monthly Levy Fine Payment</option>
                <option value="LOAN_INTEREST">Loan Interest Repayment</option>
                <option value="LOAN_FINE">Loan Fine Payment</option>
                <option value="LOAN_PRINCIPAL">Loan Principal Repayment</option>
              </select>
            </div>
          </div>

          {/* Member Financial Status Grid */}
          {memberSummary && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Member Financial Records ({selectedMember?.fullName})
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {selectedMember?.memberNo}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {/* 1. Monthly Levy Accumulated */}
                <div className="p-2.5 rounded border bg-background space-y-1">
                  <span className="text-muted-foreground block font-medium">Monthly Levy Accumulated</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-sm font-bold text-emerald-600">
                      {formatNPR(memberSummary.monthlyLevyAccumulatedAmount.toString())}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      ({memberSummary.monthlyLevyAccumulatedMonths}{' '}
                      {memberSummary.monthlyLevyAccumulatedMonths === 1 ? 'month' : 'months'})
                    </span>
                  </div>
                </div>

                {/* 2. Monthly Levy Due */}
                <div className="p-2.5 rounded border bg-background space-y-1">
                  <span className="text-muted-foreground block font-medium">Monthly Levy Due</span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-sm font-bold ${
                        memberSummary.monthlyLevyDueAmount.gt(0) ? 'text-amber-600' : 'text-muted-foreground'
                      }`}
                    >
                      {formatNPR(memberSummary.monthlyLevyDueAmount.toString())}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      ({memberSummary.monthlyLevyDueMonths}{' '}
                      {memberSummary.monthlyLevyDueMonths === 1 ? 'month' : 'months'})
                    </span>
                  </div>
                </div>

                {/* 3. Monthly Levy Fine */}
                <div className="p-2.5 rounded border bg-background space-y-1">
                  <span className="text-muted-foreground block font-medium">Monthly Levy Fine</span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-sm font-bold ${
                        memberSummary.monthlyLevyFineAmount.gt(0) ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {formatNPR(memberSummary.monthlyLevyFineAmount.toString())}
                    </span>
                    {memberSummary.advanceOffset.advToLevyFine.gt(0) && (
                      <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50">
                        -{formatNPR(memberSummary.advanceOffset.advToLevyFine.toString())} by Adv
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 4. Loan Amount Remaining */}
                <div className="p-2.5 rounded border bg-background space-y-1">
                  <span className="text-muted-foreground block font-medium">Loan Amount Remaining</span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-sm font-bold ${
                        memberSummary.loanPrincipalRemaining.gt(0) ? 'text-blue-700' : 'text-muted-foreground'
                      }`}
                    >
                      {formatNPR(memberSummary.loanPrincipalRemaining.toString())}
                    </span>
                    {memberSummary.advanceOffset.advToPrincipal.gt(0) && (
                      <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50">
                        -{formatNPR(memberSummary.advanceOffset.advToPrincipal.toString())} by Adv
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 5. Loan Interest Remaining */}
                <div className="p-2.5 rounded border bg-background space-y-1">
                  <span className="text-muted-foreground block font-medium">Loan Interest Remaining</span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-sm font-bold ${
                        memberSummary.loanInterestRemaining.gt(0) ? 'text-amber-600' : 'text-muted-foreground'
                      }`}
                    >
                      {formatNPR(memberSummary.loanInterestRemaining.toString())}
                    </span>
                    {memberSummary.advanceOffset.advToInterest.gt(0) && (
                      <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50">
                        -{formatNPR(memberSummary.advanceOffset.advToInterest.toString())} by Adv
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 6. Loan Interest Fine */}
                <div className="p-2.5 rounded border bg-background space-y-1">
                  <span className="text-muted-foreground block font-medium">Loan Interest Fine</span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-sm font-bold ${
                        memberSummary.loanInterestFineAmount.gt(0) ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {formatNPR(memberSummary.loanInterestFineAmount.toString())}
                    </span>
                    {memberSummary.advanceOffset.advToLoanFine.gt(0) && (
                      <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50">
                        -{formatNPR(memberSummary.advanceOffset.advToLoanFine.toString())} by Adv
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* 7. Advance Status & Deduction Breakdown */}
              <div className="border-t pt-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Advance Balance:</span>
                  <span className="font-mono font-bold text-sm text-emerald-700">
                    {formatNPR(memberSummary.advanceOffset.remainingAdvance.toString())}
                  </span>
                  {memberSummary.advanceBalance.gt(0) && (
                    <span className="text-muted-foreground text-[11px]">
                      (Original: {formatNPR(memberSummary.advanceBalance.toString())})
                    </span>
                  )}
                </div>

                {(memberSummary.advanceOffset.advToLoanFine.gt(0) ||
                  memberSummary.advanceOffset.advToLevyFine.gt(0) ||
                  memberSummary.advanceOffset.advToInterest.gt(0) ||
                  memberSummary.advanceOffset.advToPrincipal.gt(0)) && (
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span>
                      Advance offset: fines{' '}
                      {formatNPR(
                        memberSummary.advanceOffset.advToLoanFine
                          .plus(memberSummary.advanceOffset.advToLevyFine)
                          .toString()
                      )}
                      {memberSummary.advanceOffset.advToInterest.gt(0) &&
                        ` • interest ${formatNPR(memberSummary.advanceOffset.advToInterest.toString())}`}
                      {memberSummary.advanceOffset.advToPrincipal.gt(0) &&
                        ` • loan ${formatNPR(memberSummary.advanceOffset.advToPrincipal.toString())}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active Loan Selection if loan payment type */}
          {(isLoanSpecificType || (paymentType === 'AUTOMATIC' && (selectedMember?.loans.length ?? 0) > 1)) && (
            <div className="space-y-1">
              <label className="text-xs font-semibold">Target Loan *</label>
              {!selectedMember || selectedMember.loans.length === 0 ? (
                <div className="text-xs text-amber-700 p-3 bg-amber-50 border border-amber-200 rounded">
                  Selected member has no active loans.
                </div>
              ) : (
                <select
                  value={loanId}
                  onChange={(e) => setLoanId(e.target.value)}
                  className="h-9 w-full rounded border bg-background px-3 text-sm font-medium"
                >
                  {selectedMember.loans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.loanNo} — Principal Outstanding: {formatNPR(l.principalOutstanding)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Amount (NPR) *</label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 w-full rounded border bg-background px-3 text-sm font-mono font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Payment Method *</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-9 w-full rounded border bg-background px-3 text-sm"
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank Transfer</option>
                <option value="ESEWA">eSewa</option>
                <option value="KHALTI">Khalti</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Receipt Number *</label>
              <input
                type="text"
                required
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold">Payment Date (BS) *</label>
                <span className="text-[9px] font-mono font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                  Dev Only (Backdate)
                </span>
              </div>
              <NepaliDatePicker
                name="devPaymentDate"
                placeholder="Select Date (BS)"
                popoverAlign="right"
                onChange={(adDate) => {
                  const d = new Date(`${adDate}T12:00:00.000Z`);
                  setPaymentDate(d.toISOString());
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Automatic Allocation Preview Card */}
      {allocationResult && (
        <Card className="border-primary/40 shadow-sm">
          <CardHeader className="p-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>Automatic Allocation Preview</span>
                <Badge variant="secondary" className="text-[10px]">
                  {paymentType === 'AUTOMATIC' ? 'Waterfall Priority' : paymentType.replace(/_/g, ' ')}
                </Badge>
              </div>
              <Badge variant="outline" className="text-xs font-mono font-bold">
                Total: {formatNPR(amount)}
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-4 space-y-4">
            {allocationResult.allocations.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 text-center">
                No active obligations or advance to allocate.
              </div>
            ) : (
              <div className="divide-y text-sm">
                {allocationResult.allocations.map((a, i) => (
                  <div key={i} className="flex justify-between items-center py-2.5 hover:bg-muted/10 px-1 rounded transition-colors">
                    <div className="flex items-center gap-2.5">
                      <Badge
                        variant={
                          a.target === 'LOAN_FINE' || a.target === 'CONTRIBUTION_FINE'
                            ? 'destructive'
                            : a.target === 'LOAN_INTEREST'
                            ? 'warning'
                            : a.target === 'LOAN_PRINCIPAL'
                            ? 'default'
                            : a.target === 'ADVANCE'
                            ? 'success'
                            : 'secondary'
                        }
                        className="text-[10px] uppercase font-bold"
                      >
                        {a.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                        {a.description}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-foreground">
                      {formatNPR(a.amount.toString())}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t pt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-muted-foreground bg-muted/30 p-2.5 rounded">
              <div>
                <span className="block text-[10px] text-muted-foreground">Interest Fine</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatNPR(allocationResult.totalLoanFine.toString())}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Levy Fine</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatNPR(allocationResult.totalLevyFine.toString())}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Interest</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatNPR(allocationResult.totalInterest.toString())}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Principal / Dues</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatNPR(allocationResult.totalPrincipal.plus(allocationResult.totalDues).toString())}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Advance Credit</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {formatNPR(allocationResult.totalAdvance.toString())}
                </span>
              </div>
            </div>
          </CardContent>

          <CardFooter className="p-4 border-t bg-muted/10 flex justify-end">
            <Button
              type="submit"
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="w-full sm:w-auto"
            >
              {loading ? 'Posting...' : 'Confirm & Post Payment'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </form>
  );
}
