#!/bin/sh
# Runs a bun:test style *.test.ts under node (for environments without bun). Usage: scripts/run-test-node.sh src/lib/server/prompts.test.ts
f="$1"; out=".test-shim/out-$(basename "$f" .ts).mjs"
npx esbuild "$f" --bundle --platform=node --format=esm --outfile="$out" --log-level=error --alias:bun:test=$PWD/.test-shim/bun-test.mjs --external:$PWD/.test-shim/bun-test.mjs --alias:@=./src --external:sharp || exit 1
node -e "import('./$out').then(()=>import('$PWD/.test-shim/bun-test.mjs').then(m=>m.__run('$f')))"
