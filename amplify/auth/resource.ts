import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource.
 *
 * Password policy (min 8 chars, uppercase, lowercase, numbers, symbols) is
 * applied via a CDK override in amplify/backend.ts because Amplify Gen 2
 * v1.x does not expose passwordPolicy directly on defineAuth().
 *
 * @see https://docs.amplify.aws/react/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    preferredUsername: {
      required: false,
      mutable: true,
    },
  },
  groups: ['admin'],
});
