import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Returns true if the current user's access token contains the "admin" Cognito
 * group. Returns false for unauthenticated users, when the `cognito:groups`
 * claim is absent, or if any error occurs while resolving the session
 * (Requirements 8.4, 8.5). This helper never throws.
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const session = await fetchAuthSession();
    const groups =
      (session.tokens?.accessToken?.payload?.['cognito:groups'] as
        | string[]
        | undefined) ?? [];
    return groups.includes('admin');
  } catch {
    return false;
  }
}
