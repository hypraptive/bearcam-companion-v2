/**
 * Development seed script for the image gallery.
 *
 * Populates the sandbox `Image` and `Object` tables with a spread of realistic
 * records so the gallery grid, filters (year / feed / bear-presence), search,
 * pagination, and the image-detail bounding-box overlays can all be exercised
 * in a browser.
 *
 * This is a DEV-ONLY tool, not part of the application or the production data
 * migration. It writes through the Amplify Data client using AWS IAM
 * authorization backed by your local AWS credentials (the same credentials
 * `ampx sandbox` uses). The data API lists `AWS_IAM` as an allowed auth type,
 * and an IAM caller is not subject to the Cognito group rules, so no admin
 * Cognito user needs to exist.
 *
 * Usage (with a sandbox running and amplify_outputs.json present):
 *
 *   npm run seed            # seed ~40 images across feeds/years
 *   npm run seed -- --clear # delete all seeded Images + Objects, then reseed
 *   npm run seed -- --clear-only
 *
 * Images point at Picsum placeholder URLs (stable, seeded) so the grid and
 * detail views render real pictures without needing anything in S3. The
 * bounding boxes are therefore illustrative, not real detections.
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { signIn, signOut } from 'aws-amplify/auth';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import outputs from '../amplify_outputs.json';
import type { Schema } from '../amplify/data/resource';
import { CAM_FEEDS, type CamFeed } from '../src/lib/constants';

Amplify.configure(outputs);

// Writes (create/update/delete) are authorized only for the `admin` Cognito
// group, so the script provisions and signs in as a dedicated seed admin user.
// The user is created with the Cognito Admin API using your local AWS
// credentials (the same ones `ampx sandbox` uses), then signed in through
// Amplify Auth so the Data client writes as a `userPool` caller in the admin
// group.
//
// The seed credentials can be overridden via the SEED_ADMIN_EMAIL and
// SEED_ADMIN_PASSWORD environment variables; they default to dev-sandbox
// literals. The fallback password satisfies the Cognito policy in
// amplify/backend.ts (min 8 chars, upper, lower, number, symbol) — keep any
// replacement default policy-compliant.
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'seed-admin@bearcam.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'SeedAdmin!2026';

const cognito = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region });

/** Create (idempotently) a confirmed admin user and return its credentials. */
async function ensureAdminUser(): Promise<void> {
  const userPoolId = outputs.auth.user_pool_id;

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: SEED_ADMIN_EMAIL,
        MessageAction: 'SUPPRESS', // do not send an invite email
        UserAttributes: [
          { Name: 'email', Value: SEED_ADMIN_EMAIL },
          { Name: 'email_verified', Value: 'true' },
        ],
      }),
    );
    console.log(`Created seed admin user ${SEED_ADMIN_EMAIL}.`);
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      console.log(`Seed admin user ${SEED_ADMIN_EMAIL} already exists.`);
    } else {
      throw err;
    }
  }

  // Set a permanent password so the account is immediately usable (no
  // FORCE_CHANGE_PASSWORD challenge).
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: SEED_ADMIN_EMAIL,
      Password: SEED_ADMIN_PASSWORD,
      Permanent: true,
    }),
  );

  // Add to the admin group (idempotent — repeating is a no-op).
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: SEED_ADMIN_EMAIL,
      GroupName: 'admin',
    }),
  );
}

async function signInAdmin(): Promise<void> {
  // Ensure a clean slate — a stale signed-in session would make signIn throw.
  try {
    await signOut();
  } catch {
    // no-op: nothing was signed in
  }
  await signIn({ username: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD });
  console.log('Signed in as seed admin.');
}

const client = generateClient<Schema>({ authMode: 'userPool' });

const FEEDS = Object.keys(CAM_FEEDS) as CamFeed[];

/** A pool of plausible bear identifications to compose bearList strings from. */
const BEAR_NAMES = [
  '480 Otis',
  '128 Grazer',
  '435 Holly',
  '747',
  '32 Chunk',
  '854 Divot',
  '634 Popeye',
  '901',
  'Unknown',
] as const;

/** Deterministic pseudo-random generator so repeated runs are reproducible. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

type PlannedObject = {
  label: string;
  confidence: number;
  width: number;
  height: number;
  left: number;
  top: number;
  consensusName: string | null;
  consensusConfidence: number | null;
  totalVotes: number;
};

type PlannedImage = {
  url: string;
  date: string;
  s3Key: string;
  camFeed: CamFeed;
  bearCount: number;
  bearList: string;
  objects: PlannedObject[];
};

/**
 * Build a deterministic plan of images spread across feeds, years, and
 * bear-presence states so every filter has something to match.
 */
function planImages(): PlannedImage[] {
  const rng = makeRng(1337);
  const years = [2024, 2025, 2026];
  const plan: PlannedImage[] = [];

  let n = 0;
  for (const year of years) {
    for (const feed of FEEDS) {
      // 2–3 images per (year, feed) combination.
      const count = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < count; i++) {
        n += 1;

        // Spread dates across the year (UTC) for the year filter.
        const month = Math.floor(rng() * 12);
        const day = 1 + Math.floor(rng() * 27);
        const hour = Math.floor(rng() * 24);
        const date = new Date(Date.UTC(year, month, day, hour, 0, 0)).toISOString();

        // ~70% of images have at least one bear; the rest exercise the
        // "without bears" filter.
        const hasBears = rng() < 0.7;
        const bearCount = hasBears ? 1 + Math.floor(rng() * 3) : 0;

        const objects: PlannedObject[] = [];
        const names: string[] = [];
        for (let b = 0; b < bearCount; b++) {
          const name = BEAR_NAMES[Math.floor(rng() * BEAR_NAMES.length)];
          names.push(name);
          const totalVotes = 1 + Math.floor(rng() * 8);
          const agreeing = 1 + Math.floor(rng() * totalVotes);
          objects.push({
            label: 'Bear',
            confidence: 70 + rng() * 29,
            // Normalized 0–1 bounding box, kept inside the frame.
            left: 0.05 + rng() * 0.5,
            top: 0.05 + rng() * 0.5,
            width: 0.1 + rng() * 0.3,
            height: 0.1 + rng() * 0.3,
            consensusName: name,
            consensusConfidence: agreeing / totalVotes,
            totalVotes,
          });
        }

        // Occasionally add a non-bear detection so admin "show all" review
        // (future spec) has data and the Bear-only overlay filter is exercised.
        if (rng() < 0.2) {
          objects.push({
            label: 'Bird',
            confidence: 55 + rng() * 20,
            left: 0.6,
            top: 0.1,
            width: 0.1,
            height: 0.1,
            consensusName: null,
            consensusConfidence: null,
            totalVotes: 0,
          });
        }

        plan.push({
          url: `https://picsum.photos/seed/bearcam-${n}/1280/720`,
          date,
          s3Key: `public/seed-${n}.jpg`,
          camFeed: feed,
          bearCount,
          bearList: names.join(','),
          objects,
        });
      }
    }
  }

  return plan;
}

async function clearSeeded(): Promise<void> {
  console.log('Clearing existing Image and Object records...');

  // Delete Objects first (children), then Images.
  let objectCount = 0;
  let imageCount = 0;

  let token: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof client.models.Object.list>> =
      await client.models.Object.list({ nextToken: token ?? undefined });
    for (const obj of page.data ?? []) {
      await client.models.Object.delete({ id: obj.id });
      objectCount += 1;
    }
    token = page.nextToken ?? null;
  } while (token !== null);

  token = null;
  do {
    const page: Awaited<ReturnType<typeof client.models.Image.list>> =
      await client.models.Image.list({ nextToken: token ?? undefined });
    for (const img of page.data ?? []) {
      await client.models.Image.delete({ id: img.id });
      imageCount += 1;
    }
    token = page.nextToken ?? null;
  } while (token !== null);

  console.log(`Deleted ${objectCount} objects and ${imageCount} images.`);
}

async function seed(): Promise<void> {
  const plan = planImages();
  console.log(`Seeding ${plan.length} images...`);

  let created = 0;
  for (const p of plan) {
    const { data: image, errors } = await client.models.Image.create({
      url: p.url,
      date: p.date,
      s3Key: p.s3Key,
      camFeed: p.camFeed,
      bearCount: p.bearCount,
      bearList: p.bearList,
    });

    if (errors !== undefined && errors.length > 0) {
      console.error('Failed to create image:', JSON.stringify(errors));
      continue;
    }
    if (image === null) continue;

    for (const o of p.objects) {
      const { errors: objErrors } = await client.models.Object.create({
        imageId: image.id,
        label: o.label,
        confidence: o.confidence,
        width: o.width,
        height: o.height,
        left: o.left,
        top: o.top,
        consensusName: o.consensusName,
        consensusConfidence: o.consensusConfidence,
        totalVotes: o.totalVotes,
      });
      if (objErrors !== undefined && objErrors.length > 0) {
        console.error('Failed to create object:', JSON.stringify(objErrors));
      }
    }

    created += 1;
    if (created % 10 === 0) console.log(`  ...${created}/${plan.length}`);
  }

  console.log(`Done. Created ${created} images with their objects.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const clear = args.includes('--clear') || args.includes('--clear-only');
  const clearOnly = args.includes('--clear-only');

  await ensureAdminUser();
  await signInAdmin();

  if (clear) {
    await clearSeeded();
  }
  if (!clearOnly) {
    await seed();
  }

  await signOut();
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
