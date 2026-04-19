#!/usr/bin/env bash
# Usage: ADMIN_TOKEN=... SM_TOKEN=... BASE=http://localhost:3001 ./tests/smoke-endpoints.sh
set -e
BASE="${BASE:-http://localhost:3001}"

req() {
  local token="$1"; local path="$2"; local expected="$3"; local label="$4"
  local hdr=()
  [ -n "$token" ] && hdr=(-H "Authorization: Bearer $token")
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' "${hdr[@]}" "$BASE$path")
  if [ "$got" = "$expected" ]; then
    echo "OK   $label ($got)"
  else
    echo "FAIL $label: expected $expected got $got"
    exit 1
  fi
}

req "" /api/health 200 "health public"
req "" /api/calls 401 "calls unauth"
req "" /api/investors 401 "investors unauth"

req "$SM_TOKEN" /api/calls 200 "SM -> calls"
req "$SM_TOKEN" /api/deals 200 "SM -> deals"
req "$SM_TOKEN" /api/reps 200 "SM -> reps"
req "$SM_TOKEN" /api/investors 403 "SM -> investors (denied)"
req "$SM_TOKEN" /api/monday/onboarding 403 "SM -> monday (denied)"
req "$SM_TOKEN" /api/users 403 "SM -> users (admin-only)"

req "$ADMIN_TOKEN" /api/calls 200 "admin -> calls"
req "$ADMIN_TOKEN" /api/investors 200 "admin -> investors"
req "$ADMIN_TOKEN" /api/users 200 "admin -> users"

echo "All smoke checks passed."
