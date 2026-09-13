#!/bin/sh
# Bucket bootstrap for local development. Idempotent: safe to run against a
# bucket that already exists, which is what happens on every `docker compose up`
# after the first. Anonymous access stays "none" — the bucket is never public
# (DECISIONS.md); the app hands out short-lived presigned URLs instead.
set -eu

mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$MINIO_BUCKET"
mc anonymous set none "local/$MINIO_BUCKET"
echo "Bucket '$MINIO_BUCKET' ready."
