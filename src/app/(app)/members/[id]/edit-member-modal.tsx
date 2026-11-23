'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Pencil, X } from 'lucide-react';
import { updateMemberAction } from './actions';
import { NepaliDatePicker } from '@/components/ui/nepali-date-picker';

interface EditMemberModalProps {
  member: {
    id: string;
    fullName: string;
    phone: string;
    altPhone?: string | null;
    email?: string | null;
    permanentAddress: string;
    currentAddress?: string | null;
    bankDetails?: string | null;
    notes?: string | null;
    nomineeName?: string | null;
    nomineeRelation?: string | null;
    nomineePhone?: string | null;
    monthlyAmount: string;
    dob?: string | null; // ISO date string
    idNumber?: string | null; // already decrypted
  };
}


const inputClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring';

export function EditMemberModal({ member }: EditMemberModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [fullName, setFullName] = useState(member.fullName);
  const [phone, setPhone] = useState(member.phone);
  const [altPhone, setAltPhone] = useState(member.altPhone ?? '');
  const [email, setEmail] = useState(member.email ?? '');
  const [permanentAddress, setPermanentAddress] = useState(member.permanentAddress);
  const [currentAddress, setCurrentAddress] = useState(member.currentAddress ?? '');
  const [bankDetails, setBankDetails] = useState(member.bankDetails ?? '');
  const [notes, setNotes] = useState(member.notes ?? '');
  const [nomineeName, setNomineeName] = useState(member.nomineeName ?? '');
  const [nomineeRelation, setNomineeRelation] = useState(member.nomineeRelation ?? '');
  const [nomineePhone, setNomineePhone] = useState(member.nomineePhone ?? '');
  const [monthlyAmount, setMonthlyAmount] = useState(member.monthlyAmount);
  const [dobAd, setDobAd] = useState(member.dob ?? '');
  const [idNumber, setIdNumber] = useState(member.idNumber ?? '');

  async function handleSubmit() {
    if (!fullName || !phone || !permanentAddress || !monthlyAmount) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await updateMemberAction({
        memberId: member.id,
        fullName,
        phone,
        altPhone: altPhone || undefined,
        email: email || undefined,
        permanentAddress,
        currentAddress: currentAddress || undefined,
        bankDetails: bankDetails || undefined,
        notes: notes || undefined,
        nomineeName: nomineeName || undefined,
        nomineeRelation: nomineeRelation || undefined,
        nomineePhone: nomineePhone || undefined,
        monthlyAmount,
        dob: dobAd || undefined,
        idNumber: idNumber || undefined,
      });
      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setTimeout(() => setOpen(false), 1000);
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); setError(null); setSuccess(false); }}
        className="flex items-center gap-1.5"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit Member
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden bg-card shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4 shrink-0">
              <CardTitle className="text-lg">Edit Member — {member.fullName}</CardTitle>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              {success && (
                <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 font-medium">
                  Member updated successfully!
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Full Name *</label>
                  <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Phone *</label>
                  <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Alt Phone</label>
                  <input className={inputClass} value={altPhone} onChange={(e) => setAltPhone(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Email</label>
                  <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Permanent Address *</label>
                  <input className={inputClass} value={permanentAddress} onChange={(e) => setPermanentAddress(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Current Address</label>
                  <input className={inputClass} value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Monthly Amount (NPR) *</label>
                  <input className={inputClass} type="number" step="100" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Bank Details</label>
                  <input className={inputClass} value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} />
                </div>
              </div>

              <NepaliDatePicker
                name="dob"
                label="Date of Birth (BS)"
                value={dobAd}
                onChange={(ad) => setDobAd(ad)}
              />

              <div className="space-y-1">
                <label className="text-xs font-semibold">Citizenship / ID No</label>
                <input
                  className={inputClass}
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="Will be re-encrypted on save"
                />
                <p className="text-xs text-muted-foreground">Shown in plain text to Admin. Will be re-encrypted when saved.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Notes</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="border-t pt-3 space-y-2">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">Nominee</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Name</label>
                    <input className={inputClass} value={nomineeName} onChange={(e) => setNomineeName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Relation</label>
                    <input className={inputClass} value={nomineeRelation} onChange={(e) => setNomineeRelation(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Phone</label>
                    <input className={inputClass} value={nomineePhone} onChange={(e) => setNomineePhone(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <CardFooter className="p-4 border-t flex justify-end gap-2 shrink-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </>
  );
}
