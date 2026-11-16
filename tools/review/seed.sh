#!/usr/bin/env bash
# Sign in the dev test user and seed sample study data (WEB John 3) for review screenshots.
# Dev only. Dev Resend key is LIVE: only ever use delivered@resend.dev.
# Usage: BASE=http://localhost:5173 ORIGIN=http://localhost:4000 tools/review/seed.sh cookies.txt
# EMAIL=delivered+<label>@resend.dev gives a parallel worker its own user (own data, own reading quota).
set -euo pipefail
EMAIL=${EMAIL:-delivered@resend.dev}
case "$EMAIL" in delivered@resend.dev|delivered+*@resend.dev) ;; *) echo "EMAIL must be delivered[+label]@resend.dev (live Resend key)"; exit 1;; esac
JAR=${1:-cookies.txt}; B=${BASE:-http://localhost:5173}/api; O=${ORIGIN:-http://localhost:5173}
H=(-b "$JAR" -H "Origin: $O" -H "Content-Type: application/json")
curl -s -H "Origin: $O" -H "Content-Type: application/json" -X POST "$B/auth/email-otp/send-verification-otp" -d "{\"email\":\"$EMAIL\",\"type\":\"sign-in\"}" >/dev/null
# This user's code only (better-auth: identifier "sign-in-otp-<email>"): parallel
# workers send codes at the same time, and the newest of anyone's is someone else's
otp() {
  echo "select value from verification where identifier = 'sign-in-otp-' || :'email' order by created_at desc limit 1" |
    docker exec -i infra-postgres psql -U postgres -d biblestdy_dev -v email="$EMAIL" -tA | cut -d: -f1
}
OTP=""
for _ in 1 2 3 4 5; do sleep 1; OTP=$(otp); [ -n "$OTP" ] && break; done
[ -n "$OTP" ] || { echo "no sign-in code for $EMAIL"; exit 1; }
curl -s -c "$JAR" -H "Origin: $O" -H "Content-Type: application/json" -X POST "$B/auth/sign-in/email-otp" -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP\"}" >/dev/null
A='"translationId":"9879dbb7cfe39e4d-01","book":"JHN","chapter":3'
curl -s "${H[@]}" -X POST "$B/highlights" -d "{$A,\"startVerse\":16,\"startWord\":0,\"endVerse\":16,\"endWord\":12,\"color\":\"gold\"}" >/dev/null
curl -s "${H[@]}" -X POST "$B/highlights" -d "{$A,\"startVerse\":3,\"startWord\":7,\"endVerse\":3,\"endWord\":11,\"color\":\"blue\"}" >/dev/null
curl -s "${H[@]}" -X POST "$B/annotations" -d "{$A,\"startVerse\":5,\"startWord\":10,\"endVerse\":5,\"endWord\":13,\"text\":\"water + Spirit?\"}" >/dev/null
curl -s "${H[@]}" -X POST "$B/notes" -d "{$A,\"startVerse\":14,\"startWord\":0,\"endVerse\":15,\"endWord\":5,\"title\":\"The bronze serpent\",\"body\":\"Compare **Numbers 21:4-9**. Looking up = believing.\"}" >/dev/null
curl -s "${H[@]}" -X POST "$B/tags/passage" -d "{$A,\"name\":\"new-birth\"}" >/dev/null
echo "seeded; cleanup: delete the user's highlights/annotations/notes/tags afterwards (keep the user)"
