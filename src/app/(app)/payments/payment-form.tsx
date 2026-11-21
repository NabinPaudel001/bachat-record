'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { allocateContribution } from '@/server/engines/contributions';
import { formatNPR, bsMonthName } from '@/lib/format';
import { recordPaymentAction } from './actions';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';

export interface MemberOption {
  id: string;
  memberNo: string;
  fullName: string;
  monthlyAmount: string;
  advanceBalance: string;
  loans: { id: string; loanNo: string; principalOutstanding: string }[];
  dues: { id: string; bsYear: number; bsMonth: number; amount: string; paidAmount: string }[];
  fines: { id: string; type: string; amount: string; paidAmount: string; waivedAmount: string; postedOn: string }[];
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
          onClick={() => { setIsOpen(true); setQuery(''); }}
        >
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">{selected.memberNo}</Badge>
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
              onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
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
                      <Badge variant="secondary" className="ml-auto text-[9px]">{m.loans.length} loan(s)</Badge>
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
  const [kind, setKind] = useState<'CONTRIBUTION' | 'LOAN'>('CONTRIBUTION');
  const [loanId, setLoanId] = useState('');
  const [amount, setAmount] = useState('1000');
  const [method, setMethod] = useState('CASH');
  const [receiptNo, setReceiptNo] = useState(`RCP-${Math.floor(100000 + Math.random() * 900000)}`);
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
  }, [selectedMember, kind]);

  const selectedLoan = selectedMember?.loans.find((l) => l.id === loanId);

  // Compute live contribution allocation preview
  let allocationPreview = null;
  if (selectedMember && kind === 'CONTRIBUTION') {
    const amt = parseFloat(amount) || 0;
    if (amt > 0) {
      try {
        allocationPreview = allocateContribution(
          amt,
          selectedMember.dues,
          selectedMember.fines.map((f) => ({ ...f, postedOn: new Date(f.postedOn) })),
          parseFloat(selectedMember.advanceBalance) || 0
        );
      } catch {
        allocationPreview = null;
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    if (kind === 'LOAN') {
      if (!selectedMember || selectedMember.loans.length === 0) {
        setError('The selected member has no active loans to repay.');
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
        kind,
        loanId: kind === 'LOAN' ? loanId : undefined,
        amount: numAmount,
        method,
        paymentDate: new Date().toISOString(),
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
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-base">Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {error && (
            <div className="rounded bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded bg-emerald-500/10 p-3 text-emerald-700 text-sm font-medium">
              {success}
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
              <label className="text-xs font-semibold">Payment Kind *</label>
              <select
                value={kind}
                onChange={(e) => {
                  const newKind = e.target.value as 'CONTRIBUTION' | 'LOAN';
                  setKind(newKind);
                  if (newKind === 'LOAN' && selectedMember && selectedMember.loans.length > 0) {
                    setLoanId(selectedMember.loans[0].id);
                  }
                }}
                className="h-9 w-full rounded border bg-background px-3 text-sm"
              >
                <option value="CONTRIBUTION">Monthly Contribution</option>
                <option value="LOAN">Loan Repayment</option>
              </select>
            </div>
          </div>

          {kind === 'LOAN' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold">Active Loan *</label>
              {!selectedMember || selectedMember.loans.length === 0 ? (
                <div className="text-xs text-amber-700 p-3 bg-amber-50 border border-amber-200 rounded">
                  Selected member has no active loans.
                </div>
              ) : (
                <select
                  value={loanId}
                  onChange={(e) => setLoanId(e.target.value)}
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                >
                  {selectedMember.loans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.loanNo} — Outstanding: {formatNPR(l.principalOutstanding)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
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
          </div>
        </CardContent>
      </Card>

      {/* Allocation Preview for Contribution */}
      {kind === 'CONTRIBUTION' && allocationPreview && (
        <Card className="border-primary/40 shadow-sm">
          <CardHeader className="p-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Automatic Allocation Preview</span>
              <Badge variant="outline" className="text-xs font-mono">
                Total: {formatNPR(amount)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="divide-y text-sm">
              {allocationPreview.allocations.map((a, i) => (
                <div key={i} className="flex justify-between items-center py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={a.target === 'ADVANCE' ? 'secondary' : 'default'} className="text-[10px]">
                      {a.target}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {a.bsYear && a.bsMonth
                        ? `${bsMonthName(a.bsMonth)} ${a.bsYear}`
                        : a.fineId
                        ? 'Late Penalty'
                        : 'Advance Credit'}
                    </span>
                  </div>
                  <span className="font-mono font-medium">{formatNPR(a.amount.toString())}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 flex justify-between text-xs text-muted-foreground">
              <span>Dues: {formatNPR(allocationPreview.totalAllocatedToDues.toString())}</span>
              <span>Fines: {formatNPR(allocationPreview.totalAllocatedToFines.toString())}</span>
              <span>Advance: {formatNPR(allocationPreview.newAdvanceBalance.toString())}</span>
            </div>
          </CardContent>
          <CardFooter className="p-4 border-t bg-muted/10 flex justify-end">
            <Button type="submit" disabled={loading || !amount || parseFloat(amount) <= 0} className="w-full sm:w-auto">
              {loading ? 'Posting...' : 'Confirm & Post Payment'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Loan Repayment Card */}
      {kind === 'LOAN' && (
        <Card className="border-blue-300 shadow-sm">
          <CardHeader className="p-4 border-b bg-blue-50/40">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Loan Repayment Summary</span>
              {selectedLoan && (
                <Badge variant="outline" className="text-xs font-mono bg-blue-100 text-blue-800">
                  Loan {selectedLoan.loanNo}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {selectedLoan ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-muted/30 rounded border">
                  <span className="text-xs text-muted-foreground block">Principal Outstanding</span>
                  <span className="text-base font-bold font-mono text-blue-700">
                    {formatNPR(selectedLoan.principalOutstanding)}
                  </span>
                </div>
                <div className="p-3 bg-muted/30 rounded border">
                  <span className="text-xs text-muted-foreground block">Repayment Amount</span>
                  <span className="text-base font-bold font-mono text-emerald-600">
                    {formatNPR(amount || '0')}
                  </span>
                </div>
                <div className="p-3 bg-muted/30 rounded border">
                  <span className="text-xs text-muted-foreground block">Estimated Remaining</span>
                  <span className="text-base font-bold font-mono">
                    {formatNPR(Math.max(0, parseFloat(selectedLoan.principalOutstanding) - (parseFloat(amount) || 0)).toString())}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No active loan selected.</div>
            )}
          </CardContent>
          <CardFooter className="p-4 border-t bg-muted/10 flex justify-end">
            <Button
              type="submit"
              disabled={loading || !loanId || !amount || parseFloat(amount) <= 0}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? 'Posting...' : 'Confirm Loan Repayment'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </form>
  );
}
