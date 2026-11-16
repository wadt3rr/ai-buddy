#!/bin/sh
set -eu
for file in /migrations/*.sql; do
  sed '/-- +goose Down/,$d' "$file" | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"
done
