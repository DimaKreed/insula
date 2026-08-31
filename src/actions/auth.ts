'use server';

import { AuthError } from 'next-auth';
import { z } from 'zod';

import { signIn, signOut } from '@/auth';

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/islands' });
}

/**
 * Sends the magic link. Auth.js redirects to the verifyRequest page on success,
 * which throws a Next.js redirect — so only real failures come back as a value.
 */
export async function signInWithEmail(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const email = z.string().email().safeParse(formData.get('email'));
  if (!email.success) return 'Enter a valid email address.';

  try {
    await signIn('resend', { email: email.data, redirectTo: '/islands' });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return "We couldn't send the link. Try again in a moment.";
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}
