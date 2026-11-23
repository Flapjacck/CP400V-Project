#!/bin/sh
set -e

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v email="$ADMIN_EMAIL" \
  -v pass="$ADMIN_PASSWORD" <<'EOSQL'
INSERT INTO users (email, password_hash, display_name, role)
VALUES (:'email', crypt(:'pass', gen_salt('bf', 10)), 'Admin', 'admin')
ON CONFLICT (email) DO NOTHING;
EOSQL