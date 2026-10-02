#!/usr/bin/env node
// Bucket and CORS bootstrap for local development and CI. Idempotent: it is
// safe to run against a bucket that already exists and already carries this
// CORS policy, which is what happens on every `docker compose up` after the
// first.
//
// Deliberately the plain S3 API (CreateBucket, PutBucketCors) through the AWS
// SDK this repository already ships in packages/storage, rather than a
// vendor-specific client binary: the store behind S3_ENDPOINT is not this
// repository's business, and a bootstrap step that speaks only one vendor's
// dialect cannot be pointed at a hosted bucket.
//
// Privacy is a property of the identity file, not of this script: the file
// mounted into the store (s3-identity.json) grants credentials to named
// identities only and defines no anonymous one, so an unsigned GET is refused
// with 403 and a short-lived presigned URL is the only way to read an object.
// The application is the access-control boundary; see docs/SELF_HOSTING.md.
//
// CORS: the browser PUTs parts straight to the bucket while recording, so the
// bucket must answer the preflight and must expose ETag — multipart completion
// reads the ETag back off each part response. Zero runtime dependencies beyond
// the workspace's own AWS SDK.

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION ?? "us-east-1";
const bucket = process.env.S3_BUCKET ?? "recordmint";
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

for (const [name, value] of [
  ["S3_ENDPOINT", endpoint],
  ["S3_ACCESS_KEY_ID", accessKeyId],
  ["S3_SECRET_ACCESS_KEY", secretAccessKey],
]) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const allowedOrigins = (process.env.S3_CORS_ORIGINS ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: { accessKeyId, secretAccessKey },
  // This runs once against a store that is still coming up on CI, so give
  // the SDK's own retry budget a real chance instead of failing on the first
  // connection reset.
  maxAttempts: 5,
});

async function bootstrap() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket '${bucket}' already exists.`);
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404) throw error;
    // AWS rejects a LocationConstraint of us-east-1 and requires nothing for
    // it; every other region requires the constraint. S3-compatible stores
    // generally ignore it, and sending it keeps the script honest if it is
    // ever pointed at a hosted bucket outside us-east-1.
    await client.send(
      new CreateBucketCommand({
        Bucket: bucket,
        CreateBucketConfiguration:
          region === "us-east-1" ? undefined : { LocationConstraint: region },
      }),
    );
    console.log(`Bucket '${bucket}' created.`);
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log(`CORS applied to '${bucket}' (origins: ${allowedOrigins.join(", ")}).`);
  console.log(`Bucket '${bucket}' ready.`);
}

// The S3 gateway's port opens before the filer behind it can serve a request,
// so a single attempt races the store's own startup. Retry the whole
// bootstrap rather than the individual calls: CreateBucket is idempotent
// through the HeadBucket check above, so a retry can never create two buckets.
const attempts = Number(process.env.S3_BOOTSTRAP_ATTEMPTS ?? 30);
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await bootstrap();
    process.exit(0);
  } catch (error) {
    if (attempt === attempts) {
      console.error(`Bucket bootstrap failed after ${attempts} attempt(s):`);
      console.error(error);
      process.exit(1);
    }
    console.error(`Attempt ${attempt}/${attempts} failed, retrying in 2s…`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
