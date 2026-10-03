import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { fetchAuthSession } from 'aws-amplify/auth';
import { isAdmin } from './auth';

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
}));

const mockedFetchAuthSession = vi.mocked(fetchAuthSession);

describe('isAdmin', () => {
  // Feature: project-setup, Property 3: isAdmin() group membership correctness
  // Validates: Requirements 8.4, 8.5
  it('returns true if and only if cognito:groups includes "admin"', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.string()), async (groups) => {
        mockedFetchAuthSession.mockResolvedValue({
          tokens: {
            accessToken: {
              payload: {
                'cognito:groups': groups,
              },
            },
          },
        } as unknown as Awaited<ReturnType<typeof fetchAuthSession>>);

        const result = await isAdmin();
        expect(result).toBe(groups.includes('admin'));
      }),
      { numRuns: 100 },
    );
  });
});
