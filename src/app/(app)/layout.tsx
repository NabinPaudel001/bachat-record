import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { auth } from '@/server/auth';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const role = (session.user as { role?: string }).role;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar userRole={role} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
