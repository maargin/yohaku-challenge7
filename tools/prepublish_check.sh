#!/usr/bin/env bash
# Run before making the repository public. Fails if tracked files or commit messages contain
# AI-assistant attribution, IP addresses, private hostnames, or key/token patterns.
set -u
fail=0
report() { echo "FAIL: $1"; fail=1; }

names='(c[l]aude|a[n]thropic|o[p]enai|c[h]atgpt|c[o]pilot|c[o]-authored-by)'
git grep -nIiE "$names" -- . ':!package-lock.json' ':!web/vendor' ':!node_modules' && report "AI-assistant names or co-author trailers in files"
git log --format=%B | grep -niE "$names" && report "AI-assistant names or co-author trailers in commit messages"
git grep -nIE '\b(10|100|172|192)\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\b' -- . ':!package-lock.json' ':!web/vendor' ':!web/data' ':!web/tests/fixtures' ':!tools/prepublish_check.sh' && report "private IPv4 address"
git grep -nIiE '(\.ts\.net|tailscale|localhost:[0-9]{4}.*token)' -- . ':!tools/prepublish_check.sh' && report "private hostnames"
git grep -nIE '(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]+|sk-[A-Za-z0-9]{32,})' -- . ':!tools/prepublish_check.sh' && report "secret-like token"
git ls-files | grep -E '(^|/)(\.env|.*\.pem|.*\.key)$' && report "secret files tracked"
[ "$fail" -eq 0 ] && echo "prepublish check OK"
exit "$fail"
