#!/usr/bin/env bash
# A quick check against your real Atlas database, with the server running
# in another terminal (npm run dev).
#
#     bash smoke.sh you@example.com "a password you'll remember"
#
# It signs up (or signs in if the account exists), pushes a lab, reads it
# back, then deletes it. Safe to run more than once.
set -e
API=${API:-http://127.0.0.1:8787}
EMAIL=$1
PASSWORD=$2
if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then echo "usage: bash smoke.sh EMAIL PASSWORD"; exit 1; fi

echo "1. health"
curl -s $API/health; echo

echo "2. account"
SIGNUP=$(curl -s -X POST $API/auth/signup -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
if echo "$SIGNUP" | grep -q '"token"'; then
  OUT=$SIGNUP
  echo "   account created"
elif echo "$SIGNUP" | grep -q "already an account"; then
  # Expected on a second run — sign in to the account made the first time.
  OUT=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  echo "   account already existed, signed in"
else
  # Anything else is the real problem — show it rather than hiding it behind
  # a login attempt that was always going to fail.
  echo "   signup refused: $SIGNUP"
  exit 1
fi
TOKEN=$(echo "$OUT" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then echo "   no token: $OUT"; exit 1; fi

echo "3. who am I"
curl -s $API/me -H "Authorization: Bearer $TOKEN"; echo

echo "4. push a lab"
ID=$(curl -s -X POST $API/labs -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Smoke test lab","course":"Chemistry","appUpdatedAt":"2026-01-01T00:00:00.000Z"}' \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "   id $ID"

echo "5. read it back"
curl -s "$API/labs" -H "Authorization: Bearer $TOKEN" | head -c 300; echo

echo "6. clean up"
curl -s -X DELETE "$API/labs/$ID" -H "Authorization: Bearer $TOKEN"; echo
echo "done"
