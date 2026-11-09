#!/usr/bin/env bash
# Pre-commit hygiene: secrets scan, tests, lint, typecheck.
# Exit 0 = clean, 1 = a check failed, 2 = possible secrets to review.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

status=0
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

run() {
  local name="$1"
  shift
  if "$@" >"$log" 2>&1; then
    echo "PASS $name"
  else
    echo "FAIL $name"
    tail -n 30 "$log"
    status=1
  fi
}

git diff --staged --stat

# Lists file names only, so a real secret is never printed.
secret_files="$(git diff --staged -U0 --diff-filter=ACMR --no-color \
  | awk '/^\+\+\+ b\//{f=substr($0,7);next} /^\+/&&tolower($0)~/password|secret|api_key|token/{print f}' \
  | sort -u)"

run tests npm test
run lint npm run lint
run typecheck npx tsc --noEmit

if [ -n "$secret_files" ]; then
  echo "REVIEW possible secrets in:"
  echo "$secret_files"
  [ "$status" -eq 0 ] && status=2
else
  echo "PASS secrets"
fi

exit "$status"
