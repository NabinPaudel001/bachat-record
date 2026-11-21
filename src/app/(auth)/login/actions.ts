'use server';

import { signIn } from '@/server/auth';
import { AuthError } from 'next-auth';

export async function login(formData: FormData): Promise<{ error?: string } | undefined> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Please enter both email and password.' };
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    return undefined;
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password' };
        default:
          return { error: 'Authentication failed. Please check your credentials.' };
      }
    }
    if (error instanceof Error && error.message.includes('ACCOUNT_LOCKED')) {
      return { error: 'Account is locked. Try again in 15 minutes.' };
    }
    const err = error as Record<string, unknown>;
    if (
      err?.message === 'NEXT_REDIRECT' ||
      (typeof err?.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT'))
    ) {
      throw error;
    }
    return { error: error instanceof Error ? error.message : 'Invalid credentials' };
  }
}
