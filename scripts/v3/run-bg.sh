#!/bin/sh
# Usage: scripts/v3/run-bg.sh <script-name-without-ext> [ENV=VAL ...]   -> bundles scripts/v3/<name>.ts, runs it in the
# background with nohup, logs to /tmp/v3-<name>.log. Poll with: tail -n 40 /tmp/v3-<name>.log   (finished when it ends with DONE)
name="$1"; shift
npx esbuild "scripts/v3/$name.ts" --bundle --platform=node --format=esm --outfile=".run-$name.mjs" --log-level=error --external:sharp || exit 1
( env "$@" nohup sh -c "node .run-$name.mjs; echo DONE \$?" > "/tmp/v3-$name.log" 2>&1 & )
echo "started $name -> /tmp/v3-$name.log"
