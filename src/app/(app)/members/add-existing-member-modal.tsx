'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserPlus, X, Wallet, ShieldCheck, DollarSign, Calendar, Info, Layers } from 'lucide-react';
import { NepaliDatePicker } from '@/components/ui/nepali-date-picker';
import { addExistingMemberAction } from './actions';

export function AddExistingMemberModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic Information
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [email, setEmail] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const [dob, setDob] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('1000');
  const [bankDetails, setBankDetails] = useState('');
  const [notes, setNotes] = useState('');

  // Nominee Details
  const [nomineeName, setNomineeName] = useState('');
  const [nomineeRelation, setNomineeRelation] = useState('');
  const [nomineePhone, setNomineePhone] = useState('');
  const [nomineeId, setNomineeId] = useState('');

  // Class Selection: A, B, or C
  const [memberClass, setMemberClass] = useState<'A' | 'B' | 'C'>('A');

  // 7 Existing Financial Records:
  const [monthlyLevyAccumulated, setMonthlyLevyAccumulated] = useState('0');
  const [monthlyLevyDue, setMonthlyLevyDue] = useState('0');
  const [monthlyLevyFine, setMonthlyLevyFine] = useState('0');
  const [loanAmountRemaining, setLoanAmountRemaining] = useState('0');
  const [loanInterestRemaining, setLoanInterestRemaining] = useState('0');
  const [loanInterestFine, setLoanInterestFine] = useState('0');
  const [advanceBalance, setAdvanceBalance] = useState('0');

  function resetForm() {
    setFullName('');
    setPhone('');
    setAltPhone('');
    setEmail('');
    setPermanentAddress('');
    setCurrentAddress('');
    setIdNumber('');
    setJoinDate('');
    setDob('');
    setMonthlyAmount('1000');
    setBankDetails('');
    setNotes('');
    setNomineeName('');
    setNomineeRelation('');
    setNomineePhone('');
    setNomineeId('');
    setMemberClass('A');
    setMonthlyLevyAccumulated('0');
    setMonthlyLevyDue('0');
    setMonthlyLevyFine('0');
    setLoanAmountRemaining('0');
    setLoanInterestRemaining('0');
    setLoanInterestFine('0');
    setAdvanceBalance('0');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName || !phone || !permanentAddress || !joinDate || !monthlyAmount) {
      setError('Please fill in all required fields marked with *');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await addExistingMemberAction({
        fullName,
        phone,
        altPhone: altPhone || undefined,
        email: email || undefined,
        permanentAddress,
        currentAddress: currentAddress || undefined,
        idNumber: idNumber || undefined,
        dob: dob || undefined,
        joinDate,
        monthlyAmount,
        bankDetails: bankDetails || undefined,
        notes: notes || undefined,
        nomineeName: nomineeName || undefined,
        nomineeRelation: nomineeRelation || undefined,
        nomineePhone: nomineePhone || undefined,
        nomineeId: nomineeId || undefined,
        memberClass,
        monthlyLevyAccumulated: parseFloat(monthlyLevyAccumulated) || 0,
        monthlyLevyDue: parseFloat(monthlyLevyDue) || 0,
        monthlyLevyFine: parseFloat(monthlyLevyFine) || 0,
        loanAmountRemaining: parseFloat(loanAmountRemaining) || 0,
        loanInterestRemaining: parseFloat(loanInterestRemaining) || 0,
        loanInterestFine: parseFloat(loanInterestFine) || 0,
        advanceBalance: parseFloat(advanceBalance) || 0,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        resetForm();
        window.location.reload();
      }
    } catch {
      setError('An error occurred while saving existing member.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 shadow-sm border-dashed"
      >
        <UserPlus className="h-4 w-4 text-primary" /> Add Existing Member
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden bg-card shadow-2xl">
            {/* Header */}
            <CardHeader className="flex flex-row items-center justify-between border-b p-4 bg-muted/20">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Add Existing Member
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record member details along with all opening financial balances and class.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            {/* Form */}
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-6">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium border border-destructive/20">
                  {error}
                </div>
              )}

              {/* SECTION 1: Member Class Selection */}
              <div className="rounded-lg border bg-muted/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    Member Class *
                  </label>
                  <span className="text-[11px] text-muted-foreground">Select historical classification</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(['A', 'B', 'C'] as const).map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setMemberClass(cls)}
                      className={`p-3 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                        memberClass === cls
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary'
                          : 'border-input hover:bg-muted/50 text-foreground'
                      }`}
                    >
                      <span className="text-base font-bold">Class {cls}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {cls === 'A' ? 'Founding / Tier 1' : cls === 'B' ? 'Established / Tier 2' : 'Standard / Tier 3'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION 2: 7 Existing Financial Records */}
              <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4" />
                    Existing Financial Records to Record
                  </h3>
                  <Badge variant="outline" className="text-[10px]">Opening Balances</Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 1. Monthly Levy Accumulated */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Monthly Levy Accumulated (NPR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs text-muted-foreground font-mono">Rs.</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={monthlyLevyAccumulated}
                        onChange={(e) => setMonthlyLevyAccumulated(e.target.value)}
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Total savings deposited to date</span>
                  </div>

                  {/* 2. Monthly Levy Due */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                      Monthly Levy Due (NPR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs text-rose-500 font-mono">Rs.</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={monthlyLevyDue}
                        onChange={(e) => setMonthlyLevyDue(e.target.value)}
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-rose-200 dark:border-rose-900 bg-background pl-9 pr-3 text-sm font-mono text-rose-600 dark:text-rose-400"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Missed/unpaid monthly installments</span>
                  </div>

                  {/* 3. Monthly Levy Fine */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                      Monthly Levy Fine (NPR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs text-rose-500 font-mono">Rs.</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={monthlyLevyFine}
                        onChange={(e) => setMonthlyLevyFine(e.target.value)}
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono text-rose-600 dark:text-rose-400"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Fines on missed monthly contributions</span>
                  </div>

                  {/* 4. Loan Amount Remaining */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Loan Amount Remaining (NPR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs text-amber-500 font-mono">Rs.</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={loanAmountRemaining}
                        onChange={(e) => setLoanAmountRemaining(e.target.value)}
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono text-amber-600 dark:text-amber-400"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Current outstanding loan principal</span>
                  </div>

                  {/* 5. Loan Interest Remaining */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Loan Interest Remaining (NPR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs text-amber-500 font-mono">Rs.</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={loanInterestRemaining}
                        onChange={(e) => setLoanInterestRemaining(e.target.value)}
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono text-amber-600 dark:text-amber-400"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Accrued unpaid loan interest</span>
                  </div>

                  {/* 6. Loan Interest Fine */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                      Loan Interest Fine (NPR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs text-rose-500 font-mono">Rs.</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={loanInterestFine}
                        onChange={(e) => setLoanInterestFine(e.target.value)}
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono text-rose-600 dark:text-rose-400"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Fines on overdue loan interest</span>
                  </div>

                  {/* 7. Advance Balance */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />
                      Advance Balance (NPR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs text-emerald-500 font-mono">Rs.</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={advanceBalance}
                        onChange={(e) => setAdvanceBalance(e.target.value)}
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-emerald-200 dark:border-emerald-900 bg-background pl-9 pr-3 text-sm font-mono text-emerald-600 dark:text-emerald-400"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Surplus advance balance held by the member (offsets fines → interest → principal → dues)
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Personal & Contact Information */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Personal & Contact Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Full Name *</label>
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Ram Bahadur Thapa"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Phone Number *</label>
                    <input
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 9851000000"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Alternate Phone</label>
                    <input
                      value={altPhone}
                      onChange={(e) => setAltPhone(e.target.value)}
                      placeholder="Optional"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Optional"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Permanent Address *</label>
                    <input
                      required
                      value={permanentAddress}
                      onChange={(e) => setPermanentAddress(e.target.value)}
                      placeholder="e.g. Pokhara Ward 5, Kaski"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Current Address</label>
                    <input
                      value={currentAddress}
                      onChange={(e) => setCurrentAddress(e.target.value)}
                      placeholder="e.g. Kathmandu"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Citizenship / ID No</label>
                    <input
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder="Encrypted at rest"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <NepaliDatePicker
                      name="joinDate"
                      label="Join Date (BS) *"
                      required
                      value={joinDate}
                      onChange={(iso) => setJoinDate(iso)}
                      popoverAlign="center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Monthly Installment (NPR) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={monthlyAmount}
                      onChange={(e) => setMonthlyAmount(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: Nominee & Remarks (Optional) */}
              <div className="rounded-lg border bg-muted/5 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  Nominee Details & Notes (Optional)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    value={nomineeName}
                    onChange={(e) => setNomineeName(e.target.value)}
                    placeholder="Nominee Full Name"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    value={nomineeRelation}
                    onChange={(e) => setNomineeRelation(e.target.value)}
                    placeholder="Relation (e.g. Spouse)"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    value={nomineePhone}
                    onChange={(e) => setNomineePhone(e.target.value)}
                    placeholder="Nominee Phone"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <input
                    value={bankDetails}
                    onChange={(e) => setBankDetails(e.target.value)}
                    placeholder="Bank Details (e.g. Nabil Bank - A/C 123...)"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="General remarks or notes"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>

              {/* Footer */}
              <CardFooter className="p-0 pt-3 border-t flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  {loading ? 'Enrolling Member...' : 'Enroll Existing Member'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
