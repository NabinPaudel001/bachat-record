import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Role } from '@prisma/client';

export const runtime = 'nodejs';

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  await requireRole(Role.ADMIN);
  const { entity } = await searchParams;

  const logs = await prisma.auditLog.findMany({
    where: entity ? { entity } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security & Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Immutable audit record of all financial mutations, approvals, and administrative actions
        </p>
      </div>

      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-sm font-semibold">Activity Trail ({logs.length} entries)</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 border-b uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Action</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Entity ID</th>
                <th className="p-3">User ID</th>
                <th className="p-3">Snapshot Details</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground font-sans">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {log.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="p-3 font-semibold text-primary">{log.action}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px]">
                        {log.entity}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground truncate max-w-[120px]">
                      {log.entityId || '—'}
                    </td>
                    <td className="p-3 text-muted-foreground truncate max-w-[100px]">
                      {log.userId}
                    </td>
                    <td className="p-3 text-xs max-w-[300px] truncate text-muted-foreground">
                      {log.after ? JSON.stringify(log.after) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
