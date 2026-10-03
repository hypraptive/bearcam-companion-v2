import { defineStorage } from '@aws-amplify/backend';

/**
 * S3 bucket for BearCam webcam images.
 *
 * - Logical name `bearcam-images`; Amplify appends environment + hash to the
 *   physical bucket name.
 * - Only the `public/*` prefix is defined. Lambda functions access S3 directly
 *   via their IAM execution role (not the Amplify Storage client), so no extra
 *   prefix rules are needed for them here.
 * - Access tiers on `public/*`:
 *     - guest (unauthenticated): read
 *     - authenticated: read
 *     - admin group: read, write, delete
 * - Non-admin users get read only; write/delete is denied by the absence of a
 *   rule (deny-by-default).
 *
 * @see https://docs.amplify.aws/gen2/build-a-backend/storage
 */
export const storage = defineStorage({
  name: 'bearcam-images',
  access: (allow) => ({
    'public/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
  }),
});
