#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres cluster and exercises
# merge_members against it. The function reassigns rows across fourteen tables
# with several unique constraints in play, which is not something you want to
# discover is wrong in production.
#
#   supabase/tests/run.sh
#
# Needs a local postgres (apt install postgresql-16). Nothing here touches your
# Supabase project.
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/var/tmp/homekin-pgtest}
PGPORT=${PGPORT:-5488}
PGSOCK=${PGSOCK:-/var/tmp}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export PGHOST="$PGSOCK" PGPORT PGUSER=postgres

cleanup() {
  if [ "$(id -u)" = "0" ]; then
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true
  else
    "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# The server refuses to run as root, so in a root container (CI, devcontainers)
# everything server-side is done as the postgres system user. The psql client
# is happy either way.
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  as_pg() { su postgres -c "$*"; }
  mkdir -p "$PGDATA"; chown postgres "$PGDATA"; chmod 700 "$PGDATA"
else
  as_pg() { eval "$*"; }
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  as_pg "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
fi

as_pg "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k $PGSOCK' -l $PGDATA/server.log start" >/dev/null
sleep 1

dropdb --if-exists homekin_test >/dev/null 2>&1 || true
createdb homekin_test

echo "--- applying schema"
psql -q -d homekin_test -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql -q -d homekin_test -v ON_ERROR_STOP=1 -f "$f"
  echo "    $(basename "$f")"
done

echo "--- merge_members: full merge"
psql -q -d homekin_test -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/01_merge_members_fixture.sql" >/dev/null
psql -q -d homekin_test -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/02_merge_members_assertions.sql" 2>&1 \
  | sed 's/^psql.*NOTICE:  /    /'

echo "--- merge_members: guard rails"
dropdb --if-exists homekin_test >/dev/null 2>&1
createdb homekin_test
psql -q -d homekin_test -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql -q -d homekin_test -v ON_ERROR_STOP=1 -f "$f"
done
psql -q -d homekin_test -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/03_merge_members_guards.sql" 2>&1 \
  | sed 's/^psql.*NOTICE:  /    /'
