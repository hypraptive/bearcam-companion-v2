import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  storage,
});

/**
 * Apply password policy via CDK override.
 * defineAuth() in Amplify Gen 2 v1.x does not expose passwordPolicy directly —
 * it must be set on the underlying L1 CfnUserPool resource.
 * @see https://docs.amplify.aws/react/build-a-backend/auth/override-cognito/
 */
const { cfnUserPool } = backend.auth.resources.cfnResources;
cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true,
  },
};
