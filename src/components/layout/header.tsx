import { auth, signOut } from '@/server/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, User as UserIcon } from 'lucide-react';
import { todayBS, todayNPT } from '@/server/engines/bs';
import { formatBSDate } from '@/lib/format';

export async function Header() {
  const session = await auth();
  const user = session?.user;
  const bsToday = todayBS();
  const nptToday = todayNPT();
  const dateStr = formatBSDate(bsToday.year, bsToday.month, bsToday.day, nptToday);

  return (
    <header className="h-14 border-b bg-card px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs md:text-sm font-medium text-muted-foreground">
          📅 {dateStr}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium hidden sm:inline">{user.name}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {(user as { role?: string }).role || 'MEMBER'}
            </Badge>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <Button variant="ghost" size="sm" type="submit" className="h-8 px-2 text-muted-foreground">
                <LogOut className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">Logout</span>
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
