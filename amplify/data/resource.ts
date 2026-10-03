import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * BearCam Companion v2 data schema.
 *
 * Four core models: Image, Object, Identification, Bear.
 * Relationship chain:
 *   Image (1) -> Object (many) -> Identification (many)
 *   Bear (reference) <- Identification
 *
 * Denormalized fields (bearCount, bearList, consensusName, consensusConfidence,
 * totalVotes) are maintained by the compute-bear-list Lambda, never written from
 * the frontend.
 *
 * User Pool binding note (verified against @aws-amplify/backend 1.25.1 GA):
 * `defineData()`'s props (DataProps) accept only `schema`, `name`,
 * `authorizationModes`, `functions`, `logging`, and migration/stack overrides —
 * there is no `auth` field. The design doc (§5c) suggested importing `auth` into
 * this file, but the GA API provides no way to pass it to `defineData()`, so an
 * import here would be unused dead code. The Cognito User Pool is bound to the
 * owner- and group-based auth rules automatically when both `auth` and `data`
 * are passed to `defineBackend()` in amplify/backend.ts (task 10). No import of
 * `auth` is required or possible in this file for that binding to work.
 */
const schema = a.schema({
  Image: a
    .model({
      url: a.url(),
      date: a.datetime(),
      s3Key: a.string(),
      bearCount: a.integer(),
      bearList: a.string(),
      camFeed: a.enum(['BF', 'RF', 'BFL', 'KRV', 'RW']),
      objects: a.hasMany('Object', 'imageId'),
    })
    .authorization((allow) => [
      allow.publicApiKey().to(['read']),
      allow.group('admin').to(['create', 'update', 'delete']),
    ]),

  Object: a
    .model({
      label: a.string(),
      confidence: a.float(),
      width: a.float(),
      height: a.float(),
      left: a.float(),
      top: a.float(),
      imageId: a.id().required(),
      image: a.belongsTo('Image', 'imageId'),
      identifications: a.hasMany('Identification', 'objectId'),
      consensusName: a.string(),
      consensusConfidence: a.float(),
      totalVotes: a.integer(),
    })
    .authorization((allow) => [
      allow.publicApiKey().to(['read']),
      allow.group('admin').to(['create', 'update', 'delete']),
    ]),

  Identification: a
    .model({
      bearId: a.id(),
      name: a.string(),
      userId: a.string(),
      userDisplayName: a.string(),
      objectId: a.id().required(),
      object: a.belongsTo('Object', 'objectId'),
      bear: a.belongsTo('Bear', 'bearId'),
    })
    .authorization((allow) => [
      allow.publicApiKey().to(['read']),
      allow.authenticated().to(['create']),
      allow.owner().to(['update', 'delete']),
      allow.group('admin').to(['create', 'update', 'delete']),
    ]),

  Bear: a
    .model({
      number: a.string(),
      name: a.string(),
      displayName: a.string(),
      notes: a.string(),
      active: a.boolean(),
      identifications: a.hasMany('Identification', 'bearId'),
    })
    .authorization((allow) => [
      allow.publicApiKey().to(['read']),
      allow.group('admin').to(['create', 'update', 'delete']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
