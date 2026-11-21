import { auth } from './index';
import { Role } from '@prisma/client';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export async function requireRole(...roles: Role[]): Promise<AuthUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED');
  }
  const user = session.user as AuthUser;
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}

/** Helper to check role without throwing */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as AuthUser;
}
