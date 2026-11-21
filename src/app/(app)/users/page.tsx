import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';

export default async function UsersPage() {
  await requireRole(Role.ADMIN);

  const staffUsers = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
  });

  async function createStaffAction(formData: FormData) {
    'use server';
    await requireRole(Role.ADMIN);

    const name = formData.get('name') as string;
    const email = (formData.get('email') as string).toLowerCase().trim();
    const role = formData.get('role') as Role;
    const password = formData.get('password') as string;

    if (!name || !email || !password) return;

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        name,
        email,
        role,
        passwordHash,
      },
    });

    revalidatePath('/users');
  }

  async function toggleUserActiveAction(userId: string, currentActive: boolean) {
    'use server';
    await requireRole(Role.ADMIN);

    await prisma.user.update({
      where: { id: userId },
      data: { active: !currentActive },
    });

    revalidatePath('/users');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff User Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage system logins for Admin, Treasurer, and Helper roles
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create Staff Form */}
        <Card className="md:col-span-1">
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm font-semibold">Add Staff User</CardTitle>
          </CardHeader>
          <form action={createStaffAction}>
            <CardContent className="p-4 space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Full Name *</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Ramesh Adhikari"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Email Address *</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="e.g. treasurer@bachat.com"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Staff Role *</label>
                <select
                  name="role"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                >
                  <option value="HELPER">Helper (Limited, payments pending approval)</option>
                  <option value="TREASURER">Treasurer (Finance & Ledger operations)</option>
                  <option value="ADMIN">Admin (Full Group Leader permissions)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Initial Password *</label>
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="Min 8 characters"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>

              <Button type="submit" className="w-full">
                Create User
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* Staff List */}
        <Card className="md:col-span-2">
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm font-semibold">Registered Staff ({staffUsers.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">Staff Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {staffUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/20">
                    <td className="p-3 font-medium">{u.name}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3">
                      <Badge variant="outline">{u.role}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={u.active ? 'success' : 'destructive'} className="text-[10px]">
                        {u.active ? 'ACTIVE' : 'LOCKED'}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <form
                        action={async () => {
                          'use server';
                          await toggleUserActiveAction(u.id, u.active);
                        }}
                      >
                        <Button variant="ghost" size="sm" type="submit" className="h-7 text-xs">
                          {u.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
