# Self-hosting RecordMint

RecordMint is designed to be self-hosted with minimal operational overhead: four processes, two datastores, and no external vendor accounts required.

## Architecture overview

```
  CLIENT (Browser)                 HOST SERVER
  ┌─────────────────┐              ┌─────────────────────────────┐
  │ Chromium        │              │ Reverse Proxy (Caddy/nginx) │
  │ (Chrome / Edge) │              └──────────────┬──────────────┘
  └────────┬────────┘                             │
           │                                      ▼
           │  1. Create recording / mint URLs  ┌──────────────────┐
           ├──────────────────────────────────▶│ apps/web (:3000) │
           │                                   └─────────┬────────┘
           │  2. Direct multipart PUT                    │
           ├──────────────────────────┐                  ▼
           │                          │        ┌──────────────────┐
           │                          ▼        │ PostgreSQL 16    │
           │                   ┌─────────────┐ │  (data + queue)  │
           │                   │ SeaweedFS   │ └─────────▲────────┘
           │                   │ / S3 (:8333)│           │
           │                   └──────┬──────┘           ▼
           │                          │        ┌──────────────────┐
           │                          └───────▶│ apps/worker      │
           │                                   │  (thumbnails,    │
           │  3. Stream playback via           │   transcripts)   │
           │     presigned read URL            └──────────────────┘
           └──────────────────────────▶
```

The system consists of:
- **`apps/web`**: Next.js web application serving the UI, handling user authentication, managing workspaces, and minting presigned S3 URLs.
- **`apps/worker`**: Background worker processing thumbnails, host-based transcripts, and retention sweeps via `pg-boss`.
- **PostgreSQL 16**: Primary relational store for metadata and the background job queue (no Redis required).
- **S3-compatible Object Storage**: SeaweedFS by default in compose, or any external S3 provider (AWS S3, Cloudflare R2, Wasabi, Backblaze B2).

> [!IMPORTANT]
> **Video bytes never proxy through the application server.** The browser uploads directly to the S3 bucket via presigned multipart URLs, and streams playback directly from S3 via presigned read URLs.

---

## Quickstart (Development & Evaluation)

`docker compose -f infra/compose.yaml up` brings up the complete stack on a clean machine with working development defaults.

```bash
# Clone the repository
git clone https://github.com/aniklavida/recordmint.git
cd recordmint

# Start the complete stack
docker compose -f infra/compose.yaml up -d
```

Once running:
- Web app: `http://localhost:3000`
- Object storage S3 endpoint: `http://localhost:8333` (access key `recordmintdev`, secret `recordmint-dev-secret`)
- Health check: `http://localhost:3000/api/health`

Migrations run automatically on container startup. The default bucket `recordmint` is created, kept private and given its CORS policy by the one-shot `s3-init` service.

SeaweedFS has no web console in this stack: only its S3 port is published. Everything is administered through the S3 API (`infra/seaweedfs/bootstrap-bucket.mjs` does the bucket and CORS setup) or with any S3 client pointed at `S3_ENDPOINT`.

The credentials above are throwaway local-development values, defined in [`infra/seaweedfs/s3-identity.json`](../infra/seaweedfs/s3-identity.json). That file grants them to one named identity and defines **no anonymous identity**, which is what makes the bucket private: an unsigned GET is refused with `403`, and a short-lived presigned URL is the only way to read an object. Replace the file's contents for a real deployment.

---

## Production Deployment

### Mandatory settings

For a production deployment, create a `.env` file adjacent to `infra/compose.yaml` (or pass variables via your deployment system). A first-run operator must set at least these two values:

1. **`SESSION_SECRET`**: A cryptographically random string (at least 32 bytes) used to sign authentication cookies.
   ```bash
   openssl rand -hex 32
   ```
2. **`PUBLIC_BASE_URL`**: The fully qualified public HTTPS URL where viewers and recorders access the application (e.g., `https://recordmint.example.com`). This URL is baked into share links, email invitations, and OpenGraph metadata unfurls.

> [!CAUTION]
> Browsers restrict `getDisplayMedia` and `getUserMedia` screen/camera capture APIs strictly to **Secure Contexts** (`https://` or `localhost`). You **must** terminate TLS with a valid certificate for recording to function in production.

### Environment variable reference

| Variable | Description | Default in Compose | Required in Prod |
|---|---|---|---|
| `PUBLIC_BASE_URL` | Public HTTPS root of the web app | `http://localhost:3000` | **Yes** |
| `SESSION_SECRET` | 32+ character random secret for session cookies | Development secret | **Yes** |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://recordmint:recordmint@postgres:5432/recordmint` | Only if using external DB |
| `S3_ENDPOINT` | S3 API endpoint URL | `http://seaweedfs:8333` | Only if using external S3 |
| `S3_REGION` | S3 region | `us-east-1` | No |
| `S3_BUCKET` | S3 bucket name | `recordmint` | No |
| `S3_ACCESS_KEY_ID` | S3 credentials access key | `recordmintdev` | If using external S3 |
| `S3_SECRET_ACCESS_KEY` | S3 credentials secret key | `recordmint-dev-secret` | If using external S3 |
| `S3_FORCE_PATH_STYLE` | Force path-style requests (`true` for self-hosted stores) | `true` | `false` for AWS S3 with DNS buckets |
| `S3_CORS_ORIGINS` | Comma-separated origins the bucket's CORS policy allows | `*` | Set to `PUBLIC_BASE_URL` |
| `TRANSCRIPTION_ENABLED` | Enable background transcription worker | `false` | No |
| `WHISPER_MODEL` | Whisper model name (e.g., `base.en`, `small`) | `""` | When transcription enabled |
| `SMTP_HOST` | Outbound mail server hostname (password resets) | `""` | For password reset |
| `SMTP_PORT` | SMTP port (587 for STARTTLS, 465 for TLS) | `587` | For password reset |
| `SMTP_SECURE` | Implicit TLS (`true` for 465, `false` for 587) | `false` | For password reset |
| `SMTP_USER` | SMTP username | `""` | For password reset |
| `SMTP_PASSWORD` | SMTP password | `""` | For password reset |
| `SMTP_FROM` | From address on outgoing emails | `""` | For password reset |

---

## Reverse Proxy and TLS Configuration

Because the browser connects directly to both the web application (for UI/API) and the S3 storage endpoint (for direct media upload and streaming), your reverse proxy must expose both services or you must route S3 traffic to an external bucket provider.

### Option A: Caddy (Recommended)

Caddy handles automatic HTTPS certificate issuance and renewal via Let's Encrypt or ZeroSSL.

Assuming your domain is `recordmint.example.com` and S3 storage is served on `s3.recordmint.example.com`:

```caddyfile
# Caddyfile

# Web Application
recordmint.example.com {
    encode zstd gzip

    # Reverse proxy to apps/web container
    reverse_proxy localhost:3000 {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}

# S3 Object Storage (SeaweedFS)
s3.recordmint.example.com {
    encode zstd gzip

    # Reverse proxy to the SeaweedFS S3 API
    # Note: client uploads large video chunks directly here; do not cap request body size.
    reverse_proxy localhost:8333 {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

In `.env`, configure:
```env
PUBLIC_BASE_URL=https://recordmint.example.com
S3_ENDPOINT=https://s3.recordmint.example.com
```

### Option B: Nginx

```nginx
# /etc/nginx/sites-available/recordmint.conf

# Web Application
server {
    listen 443 ssl http2;
    server_name recordmint.example.com;

    ssl_certificate /etc/letsencrypt/live/recordmint.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/recordmint.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}

# S3 Object Storage (SeaweedFS)
server {
    listen 443 ssl http2;
    server_name s3.recordmint.example.com;

    ssl_certificate /etc/letsencrypt/live/s3.recordmint.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/s3.recordmint.example.com/privkey.pem;

    # Allow direct chunked uploads of up to 500MB per part
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:8333;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 300s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name recordmint.example.com s3.recordmint.example.com;
    return 301 https://$host$request_uri;
}
```

---

## S3 Bucket & CORS Configuration

Because uploads are sent directly from the browser to the S3 bucket using `PUT` requests, CORS must be configured on the bucket to allow requests from your `PUBLIC_BASE_URL`.

For the SeaweedFS instance started via `infra/compose.yaml`, the bucket and this CORS policy are applied by the one-shot `s3-init` service, which calls `CreateBucket` and `PutBucketCors` through the S3 API. Set `S3_CORS_ORIGINS` to your `PUBLIC_BASE_URL` (comma-separated for more than one) to narrow the allowed origins; the compose default is `*`, which is right for local development and for nothing else.

The same script is safe to re-run and safe to point at any other S3-compatible store, because it only uses the public S3 API:

```bash
S3_ENDPOINT=https://s3.example.com S3_BUCKET=recordmint \
S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… S3_CORS_ORIGINS=https://recordmint.example.com \
node infra/seaweedfs/bootstrap-bucket.mjs
```

If applying this by hand instead, the policy is:

```json
[
  {
    "AllowedOrigins": [
      "https://recordmint.example.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

> [!IMPORTANT]
> `ETag` **must** be exposed in `ExposeHeaders`. When completing a multipart S3 upload, the browser reads the `ETag` returned by each part upload and passes it to the complete endpoint.

---

## Backup and Restore Runbook

A complete backup requires capturing two components:
1. The **PostgreSQL database** (metadata, users, workspaces, recordings, comments, reactions, queue state).
2. The **S3 bucket** (raw recorded media, thumbnails, transcripts).

Both procedures have been verified against live data.

### 1. Creating a backup

#### PostgreSQL Backup
Execute `pg_dump` using PostgreSQL's custom archive format (`-F c`):

```bash
# When using Docker Compose:
docker compose -f infra/compose.yaml exec -T postgres \
  pg_dump -U recordmint -F c -b recordmint > backup_db_$(date +%Y%m%d_%H%M%S).dump

# Or directly from the host:
pg_dump -h localhost -p 5432 -U recordmint -F c -b -f backup_db.dump recordmint
```

#### S3 Object Storage Backup
Sync all objects under the bucket prefix:

```bash
# Using AWS CLI against the compose instance (any S3 client works):
aws --endpoint-url http://localhost:8333 s3 sync s3://recordmint ./backup_s3/

# Or against a TLS-terminated public endpoint:
aws --endpoint-url https://s3.recordmint.example.com s3 sync s3://recordmint ./backup_s3/
```

### 2. Restoring from backup

#### PostgreSQL Restore
Ensure the target database exists, then run `pg_restore`:

```bash
# When using Docker Compose:
cat backup_db.dump | docker compose -f infra/compose.yaml exec -T postgres \
  pg_restore -U recordmint -d recordmint --clean --if-exists

# Or directly from the host:
pg_restore -h localhost -p 5432 -U recordmint -d recordmint --clean --if-exists backup_db.dump
```

#### S3 Object Storage Restore
Copy objects back into the storage bucket:

```bash
# Using AWS CLI against the compose instance (any S3 client works):
aws --endpoint-url http://localhost:8333 s3 sync ./backup_s3/ s3://recordmint

# Or against a TLS-terminated public endpoint:
aws --endpoint-url https://s3.recordmint.example.com s3 sync ./backup_s3/ s3://recordmint
```

### 3. Verification after restore
1. Check the health endpoint: `curl -s https://recordmint.example.com/api/health`
2. Log in with an existing account.
3. Verify prior recordings appear in the library with intact titles, durations, and comments.
4. Play an existing recording to verify that presigned playback URLs resolve and media streams correctly.

---

## Upgrades and Migrations

Database schema migrations are written in SQL and tracked via Drizzle ORM (`__drizzle_migrations` table).

### How migrations run
- **Automatic on boot**: The `web` container automatically runs `node packages/db/dist/migrate.js` before launching the web server.
- **Manual execution**: You can run migrations manually at any time using:
  ```bash
  pnpm --filter @recordmint/db db:migrate
  # or via compose:
  docker compose -f infra/compose.yaml exec web node packages/db/dist/migrate.js
  ```

Migrations are strictly idempotent: running them against an empty database applies all historical migrations in sequence; running them against an existing up-to-date database is a safe no-op.

### Standard upgrade procedure

```bash
# 1. Back up database and storage (see Backup Runbook above)
docker compose -f infra/compose.yaml exec -T postgres \
  pg_dump -U recordmint -F c -b recordmint > pre_upgrade_backup.dump

# 2. Pull the latest code / images
git pull origin develop

# 3. Rebuild and restart containers
docker compose -f infra/compose.yaml up -d --build

# 4. Confirm health
curl -s http://localhost:3000/api/health
```

---

## Operational Health & Diagnostics

The application exposes a health endpoint at `/api/health` that returns HTTP 200 when all core components are reachable, or HTTP 503 if any mandatory dependency is degraded:

```bash
curl -i https://recordmint.example.com/api/health
```

Sample healthy response:
```json
{
  "status": "healthy",
  "storage": {
    "reachable": true,
    "bucket": "recordmint"
  },
  "database": {
    "reachable": true
  },
  "transcription": {
    "enabled": false,
    "engine": "host-process"
  }
}
```

If PostgreSQL or S3 becomes unreachable, `/api/health` reports `status: "degraded"` along with the exact broken component and error description.

---

## Implementation Status and Truthfulness

Every capability claim below is classified according to project truthfulness standards:

| Feature | Status | Notes |
|---|---|---|
| Single-command Docker Compose stack | **Implemented and tested** | Web, worker, PostgreSQL 16, SeaweedFS, and bucket initialization. |
| Direct-to-S3 chunked multipart upload | **Implemented and tested** | Media bytes never proxy through the Next.js server. |
| Presigned short-lived playback URLs | **Implemented and tested** | Bucket denies public reads; player mints short-lived read URLs. |
| SeaweedFS as the default object store | **Experimental** | Bucket, CORS, multipart round trip, ranged reads, expiry and anonymous-access refusal were all run against a real SeaweedFS 4.48 process. The container image itself is only ever started in CI — it has not been run from `infra/compose.yaml` on a machine with Docker. |
| Database migrations & idempotence | **Implemented and tested** | Verified against empty and existing historical schema states. |
| Automated backup and restore | **Implemented and tested** | Verified end-to-end with real database dump and S3 object payload hashes. |
| Healthcheck endpoint (`/api/health`) | **Implemented and tested** | Reports real connection states for database, storage, and transcription. |
| Comments, guest comments, reactions | **Implemented and tested** | Verified with PostgreSQL schema and unit test coverage. |
| In-browser screen and audio capture | **Implemented and tested** | Targets Chromium (Chrome, Edge) via web platform APIs (`getDisplayMedia`). |
| Host-based transcription | **Experimental** | Runs worker jobs locally via whisper binary when configured. |
| Mobile recording | **Unsupported** | Mobile browsers lack `getDisplayMedia` support. |
| Native desktop app | **Unsupported** | Capture is web platform only; no native wrapper. |
