'use client';

import { Printer, Download } from 'lucide-react';

export function PrintButton({
  label = 'Print Statement',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ||
        'no-print bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded flex items-center gap-1.5 hover:bg-primary/90 shadow-sm'
      }
    >
      <Printer className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function ReportExportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted shadow-sm"
    >
      <Download className="h-4 w-4" /> Print / Export PDF
    </button>
  );
}
