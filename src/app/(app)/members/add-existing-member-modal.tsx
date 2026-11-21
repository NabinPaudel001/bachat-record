'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserPlus, X, Plus, Trash2, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { NepaliDatePicker } from '@/components/ui/nepali-date-picker';
import { addExistingMemberAction } from './actions';

interface ContributionRow {
  bsYear: number; bsMonth: number; amount: number; paidAmount: number; status: 'PAID' | 'PENDING' | 'PARTIAL';
}
interface LoanRow {
  loanNo: string; amount: number; disbursedOn: string; purpose: string; status: 'ACTIVE' | 'CLOSED'; principalOutstanding: number; g1: string; g2: string; g3: string;
}
interface FineRow {
  type: 'CONTRIBUTION' | 'LOAN_INTEREST'; amount: number; paidAmount: number; status: 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED'; postedOn: string;
}

const BS_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashoj','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'];

export function AddExistingMemberModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Basic Info
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
  const [nomineeName, setNomineeName] = useState('');
  const [nomineeRelation, setNomineeRelation] = useState('');
  const [nomineePhone, setNomineePhone] = useState('');
  const [nomineeId, setNomineeId] = useState('');

  // Step 2: Contributions
  const [contributions, setContributions] = useState<ContributionRow[]>([
    { bsYear: 2081, bsMonth: 1, amount: 1000, paidAmount: 1000, status: 'PAID' },
  ]);

  // Step 3: Loans
  const [loans, setLoans] = useState<LoanRow[]>([]);

  // Step 4: Fines
  const [fines, setFines] = useState<FineRow[]>([]);

  function addContribution() {
    const last = contributions[contributions.length - 1];
    let ny = last ? last.bsYear : 2081;
    let nm = last ? last.bsMonth + 1 : 1;
    if (nm > 12) { nm = 1; ny++; }
    setContributions([...contributions, { bsYear: ny, bsMonth: nm, amount: Number(monthlyAmount) || 1000, paidAmount: Number(monthlyAmount) || 1000, status: 'PAID' }]);
  }

  function removeContribution(i: number) {
    setContributions(contributions.filter((_, idx) => idx !== i));
  }

  function updateContribution(i: number, field: keyof ContributionRow, value: string | number) {
    const updated = [...contributions];
    (updated[i] as unknown as Record<string, unknown>)[field] = value;
    setContributions(updated);
  }

  function addLoan() {
    setLoans([...loans, { loanNo: '', amount: 50000, disbursedOn: '', purpose: '', status: 'ACTIVE', principalOutstanding: 50000, g1: '', g2: '', g3: '' }]);
  }

  function removeLoan(i: number) { setLoans(loans.filter((_, idx) => idx !== i)); }

  function updateLoan(i: number, field: keyof LoanRow, value: string | number) {
    const updated = [...loans];
    (updated[i] as unknown as Record<string, unknown>)[field] = value;
    setLoans(updated);
  }

  function addFine() {
    setFines([...fines, { type: 'CONTRIBUTION', amount: 500, paidAmount: 0, status: 'PENDING', postedOn: new Date().toISOString().split('T')[0] }]);
  }

  function removeFine(i: number) { setFines(fines.filter((_, idx) => idx !== i)); }

  function updateFine(i: number, field: keyof FineRow, value: string | number) {
    const updated = [...fines];
    (updated[i] as unknown as Record<string, unknown>)[field] = value;
    setFines(updated);
  }

  async function handleSubmit() {
    if (!fullName || !phone || !permanentAddress || !joinDate || !monthlyAmount) {
      setError('Please fill all required fields in Step 1.');
      setStep(1);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await addExistingMemberAction({
        fullName, phone, altPhone: altPhone || undefined, email: email || undefined,
        permanentAddress, currentAddress: currentAddress || undefined,
        idNumber: idNumber || undefined, dob: dob || undefined,
        joinDate, monthlyAmount,
        bankDetails: bankDetails || undefined, notes: notes || undefined,
        nomineeName: nomineeName || undefined, nomineeRelation: nomineeRelation || undefined,
        nomineePhone: nomineePhone || undefined, nomineeId: nomineeId || undefined,
        contributions: contributions.map((c) => ({
          bsYear: c.bsYear, bsMonth: c.bsMonth, amount: c.amount, paidAmount: c.paidAmount, status: c.status,
        })),
        loans: loans.map((l) => ({
          loanNo: l.loanNo || undefined, amount: l.amount,
          disbursedOn: l.disbursedOn || undefined, purpose: l.purpose || undefined,
          status: l.status, principalOutstanding: l.status === 'ACTIVE' ? l.principalOutstanding : undefined,
          guarantorCodes: [l.g1, l.g2, l.g3].filter(Boolean),
        })),
        fines: fines.map((f) => ({
          type: f.type, amount: f.amount, paidAmount: f.paidAmount, status: f.status, postedOn: f.postedOn,
        })),
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

  function resetForm() {
    setStep(1); setFullName(''); setPhone(''); setAltPhone(''); setEmail('');
    setPermanentAddress(''); setCurrentAddress(''); setIdNumber('');
    setJoinDate(''); setDob(''); setMonthlyAmount('1000'); setBankDetails(''); setNotes('');
    setNomineeName(''); setNomineeRelation(''); setNomineePhone(''); setNomineeId('');
    setContributions([{ bsYear: 2081, bsMonth: 1, amount: 1000, paidAmount: 1000, status: 'PAID' }]);
    setLoans([]); setFines([]); setError(null);
  }

  const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
  const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="flex items-center gap-1.5 shadow-sm">
        <UserPlus className="h-4 w-4" /> Add Existing Member
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden bg-card shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <div>
                <CardTitle className="text-lg">Add Existing Member</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Step {step} of 5 — {['Basic Info','Contributions','Loans','Fines','Review & Confirm'][step - 1]}
                </p>
              </div>
              <button onClick={() => { setOpen(false); resetForm(); }} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <div className="flex border-b px-4 py-2 gap-1">
              {[1,2,3,4,5].map((s) => (
                <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
              ))}
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Full Name *</label>
                      <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="e.g. Ram Bahadur Tamang" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Phone *</label>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="9841234567" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Alt Phone</label>
                      <input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} placeholder="Optional" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Email</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Permanent Address *</label>
                      <input value={permanentAddress} onChange={(e) => setPermanentAddress(e.target.value)} required placeholder="Pokhara, Ward 4" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Current Address</label>
                      <input value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} placeholder="Kathmandu" className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Citizenship / ID No</label>
                      <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="Encrypted at rest" className={inputCls} />
                    </div>
                    <NepaliDatePicker name="joinDatePicker" label="Join Date (BS)" required onChange={(ad) => setJoinDate(ad)} />
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Monthly Amount (NPR) *</label>
                      <input type="number" step="any" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} required className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
                    <NepaliDatePicker name="dobPicker" label="Date of Birth (BS)" onChange={(ad) => setDob(ad)} />
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Bank Details</label>
                      <input value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} placeholder="Bank name, A/C No." className={inputCls} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Notes</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special notes..." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" />
                  </div>
                  <div className="border-t pt-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground">Nominee Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={nomineeName} onChange={(e) => setNomineeName(e.target.value)} placeholder="Nominee Name" className={inputCls} />
                      <input value={nomineeRelation} onChange={(e) => setNomineeRelation(e.target.value)} placeholder="Relation (e.g. Spouse)" className={inputCls} />
                      <input value={nomineePhone} onChange={(e) => setNomineePhone(e.target.value)} placeholder="Nominee Phone" className={inputCls} />
                      <input value={nomineeId} onChange={(e) => setNomineeId(e.target.value)} placeholder="Nominee ID Number" className={inputCls} />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Enter all past contribution months since the member joined.</p>
                  {contributions.map((c, i) => (
                    <div key={i} className="flex items-end gap-2 p-3 bg-muted/20 rounded-md border">
                      <div className="space-y-1 w-20">
                        <label className="text-[10px] font-semibold">BS Year</label>
                        <input type="number" value={c.bsYear} onChange={(e) => updateContribution(i, 'bsYear', Number(e.target.value))} className={inputCls} />
                      </div>
                      <div className="space-y-1 w-28">
                        <label className="text-[10px] font-semibold">Month</label>
                        <select value={c.bsMonth} onChange={(e) => updateContribution(i, 'bsMonth', Number(e.target.value))} className={selectCls}>
                          {BS_MONTHS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1 flex-1">
                        <label className="text-[10px] font-semibold">Amount</label>
                        <input type="number" step="any" value={c.amount} onChange={(e) => updateContribution(i, 'amount', Number(e.target.value))} className={inputCls} />
                      </div>
                      <div className="space-y-1 flex-1">
                        <label className="text-[10px] font-semibold">Paid</label>
                        <input type="number" step="any" value={c.paidAmount} onChange={(e) => updateContribution(i, 'paidAmount', Number(e.target.value))} className={inputCls} />
                      </div>
                      <div className="space-y-1 w-24">
                        <label className="text-[10px] font-semibold">Status</label>
                        <select value={c.status} onChange={(e) => updateContribution(i, 'status', e.target.value)} className={selectCls}>
                          <option value="PAID">Paid</option>
                          <option value="PENDING">Pending</option>
                          <option value="PARTIAL">Partial</option>
                        </select>
                      </div>
                      <button type="button" onClick={() => removeContribution(i)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addContribution} className="flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add Month
                  </Button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Enter any existing loans (optional).</p>
                  {loans.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm border rounded-md bg-muted/10">No loans to import.</div>
                  )}
                  {loans.map((l, i) => (
                    <div key={i} className="p-3 bg-muted/20 rounded-md border space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">Loan {i + 1}</Badge>
                        <button type="button" onClick={() => removeLoan(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1"><label className="text-[10px] font-semibold">Loan No</label><input value={l.loanNo} onChange={(e) => updateLoan(i, 'loanNo', e.target.value)} placeholder="HIST-001" className={inputCls} /></div>
                        <div className="space-y-1"><label className="text-[10px] font-semibold">Amount *</label><input type="number" step="any" value={l.amount} onChange={(e) => updateLoan(i, 'amount', Number(e.target.value))} className={inputCls} /></div>
                        <div className="space-y-1"><label className="text-[10px] font-semibold">Status</label><select value={l.status} onChange={(e) => updateLoan(i, 'status', e.target.value)} className={selectCls}><option value="ACTIVE">Active</option><option value="CLOSED">Closed</option></select></div>
                        {l.status === 'ACTIVE' && <div className="space-y-1"><label className="text-[10px] font-semibold">Outstanding</label><input type="number" step="any" value={l.principalOutstanding} onChange={(e) => updateLoan(i, 'principalOutstanding', Number(e.target.value))} className={inputCls} /></div>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1"><label className="text-[10px] font-semibold">Purpose</label><input value={l.purpose} onChange={(e) => updateLoan(i, 'purpose', e.target.value)} className={inputCls} /></div>
                        <div className="space-y-1"><label className="text-[10px] font-semibold">Disbursed Date (AD)</label><input type="date" value={l.disbursedOn} onChange={(e) => updateLoan(i, 'disbursedOn', e.target.value)} className={inputCls} /></div>
                      </div>
                      {l.status === 'ACTIVE' && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Guarantor Member Codes</label>
                          <div className="grid grid-cols-3 gap-2">
                            <input value={l.g1} onChange={(e) => updateLoan(i, 'g1', e.target.value)} placeholder="GS-0001" className={inputCls} />
                            <input value={l.g2} onChange={(e) => updateLoan(i, 'g2', e.target.value)} placeholder="GS-0002" className={inputCls} />
                            <input value={l.g3} onChange={(e) => updateLoan(i, 'g3', e.target.value)} placeholder="GS-0003" className={inputCls} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addLoan} className="flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add Loan
                  </Button>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Enter any existing fines (optional).</p>
                  {fines.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm border rounded-md bg-muted/10">No fines to import.</div>
                  )}
                  {fines.map((f, i) => (
                    <div key={i} className="flex items-end gap-2 p-3 bg-muted/20 rounded-md border">
                      <div className="space-y-1 w-32"><label className="text-[10px] font-semibold">Type</label><select value={f.type} onChange={(e) => updateFine(i, 'type', e.target.value)} className={selectCls}><option value="CONTRIBUTION">Contribution</option><option value="LOAN_INTEREST">Loan Interest</option></select></div>
                      <div className="space-y-1 flex-1"><label className="text-[10px] font-semibold">Amount</label><input type="number" step="any" value={f.amount} onChange={(e) => updateFine(i, 'amount', Number(e.target.value))} className={inputCls} /></div>
                      <div className="space-y-1 flex-1"><label className="text-[10px] font-semibold">Paid</label><input type="number" step="any" value={f.paidAmount} onChange={(e) => updateFine(i, 'paidAmount', Number(e.target.value))} className={inputCls} /></div>
                      <div className="space-y-1 w-24"><label className="text-[10px] font-semibold">Status</label><select value={f.status} onChange={(e) => updateFine(i, 'status', e.target.value)} className={selectCls}><option value="PAID">Paid</option><option value="PENDING">Pending</option><option value="PARTIAL">Partial</option><option value="WAIVED">Waived</option></select></div>
                      <div className="space-y-1 w-32"><label className="text-[10px] font-semibold">Posted (AD)</label><input type="date" value={f.postedOn} onChange={(e) => updateFine(i, 'postedOn', e.target.value)} className={inputCls} /></div>
                      <button type="button" onClick={() => removeFine(i)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addFine} className="flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add Fine
                  </Button>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md space-y-2">
                    <h3 className="font-semibold text-emerald-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Review & Confirm</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Name:</span> <strong>{fullName}</strong></div>
                      <div><span className="text-muted-foreground">Phone:</span> <strong>{phone}</strong></div>
                      <div><span className="text-muted-foreground">Address:</span> <strong>{permanentAddress}</strong></div>
                      <div><span className="text-muted-foreground">Monthly:</span> <strong>NPR {monthlyAmount}</strong></div>
                      <div><span className="text-muted-foreground">Join Date:</span> <strong>{joinDate}</strong></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Card className="p-3 text-center"><div className="text-xs text-muted-foreground">Contributions</div><div className="text-lg font-bold">{contributions.length}</div></Card>
                    <Card className="p-3 text-center"><div className="text-xs text-muted-foreground">Loans</div><div className="text-lg font-bold">{loans.length}</div></Card>
                    <Card className="p-3 text-center"><div className="text-xs text-muted-foreground">Fines</div><div className="text-lg font-bold">{fines.length}</div></Card>
                  </div>
                  {contributions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Contribution Summary</h4>
                      <p className="text-sm">Total Paid: <strong>NPR {contributions.reduce((s, c) => s + c.paidAmount, 0).toLocaleString()}</strong></p>
                      <p className="text-sm">Pending: <strong>{contributions.filter((c) => c.status !== 'PAID').length} month(s)</strong></p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <CardFooter className="p-4 border-t flex justify-between">
              <Button type="button" variant="outline" onClick={() => step > 1 ? setStep(step - 1) : setOpen(false)} disabled={loading}>
                {step === 1 ? 'Cancel' : <><ArrowLeft className="h-4 w-4 mr-1" /> Back</>}
              </Button>
              {step < 5 ? (
                <Button type="button" onClick={() => setStep(step + 1)}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                  {loading ? 'Saving...' : 'Confirm & Create Member'}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      )}
    </>
  );
}
