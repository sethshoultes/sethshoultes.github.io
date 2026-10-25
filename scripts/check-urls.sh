#!/usr/bin/env bash
# Request every URL in scripts/baseline-urls.txt (the sitemap as of the #83 baseline)
# and fail unless each ends in a 200, directly or through redirects.
#   scripts/check-urls.sh [base-url]     default https://sethshoultes.com
set -u
base="${1:-https://sethshoultes.com}"
list="$(dirname "$0")/baseline-urls.txt"
fail=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  code=$(curl -s -o /dev/null -L -w '%{http_code}' --max-time 20 "${base}$(printf '%s' "$path" | sed 's/ /%20/g')")
  if [ "$code" != "200" ]; then echo "FAIL $code $path"; fail=1; fi
done < "$list"
[ "$fail" = 0 ] && echo "ok: all $(grep -c . "$list") baseline URLs return 200"
exit $fail
