#!/usr/bin/env bash
#
# predictive-mind bootstrap — SessionStart hook
#
# Per the Claude Code plugin guidelines, runtime state that should
# survive plugin updates lives in ${CLAUDE_PLUGIN_DATA}, not
# ${CLAUDE_PLUGIN_ROOT} (which may be replaced on update).
#
# This script syncs the compiled belief-store MCP server bundle
# (dist/ + package.json) into CLAUDE_PLUGIN_DATA and runs `npm install`
# there if and only if package.json has changed. Subsequent session
# starts are fast (one diff, no install).
#
# Bootstrap is best-effort: on failure we log to stderr and exit 0 so
# the session is never broken. The MCP server will simply fail to
# start and the user can re-run.

set -eu

: "${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT not set}"
: "${CLAUDE_PLUGIN_DATA:?CLAUDE_PLUGIN_DATA not set}"

SRC="${CLAUDE_PLUGIN_ROOT}/mcp/belief-store"
DST="${CLAUDE_PLUGIN_DATA}/belief-store"

mkdir -p "${DST}"

# Always sync the compiled bundle. The build is committed to the repo,
# so no tsc at runtime. We copy to a staging path and swap atomically.
if [ ! -d "${SRC}/dist" ]; then
  echo "[predictive-mind] SRC/dist missing — plugin is not built" >&2
  exit 0
fi

rm -rf "${DST}/dist.new"
cp -R "${SRC}/dist" "${DST}/dist.new"

# Sync package manifest. Installing only when package.json changes is
# the invalidation pattern the Claude Code plugin docs recommend.
cp "${SRC}/package.json" "${DST}/package.json.new"
if [ -f "${SRC}/package-lock.json" ]; then
  cp "${SRC}/package-lock.json" "${DST}/package-lock.json"
fi

if ! diff -q "${DST}/package.json" "${DST}/package.json.new" >/dev/null 2>&1; then
  mv "${DST}/package.json.new" "${DST}/package.json"
  if ! (cd "${DST}" && npm install --no-audit --no-fund --loglevel=error >/dev/null 2>&1); then
    # Reset the installed marker so the next session retries.
    rm -f "${DST}/package.json"
    rm -rf "${DST}/dist.new"
    echo "[predictive-mind] npm install failed — belief-store MCP server will be unavailable this session" >&2
    exit 0
  fi
else
  rm -f "${DST}/package.json.new"
fi

# Atomic swap of dist/. Keeping dist/ separate from node_modules means
# we can update the compiled bundle without reinstalling deps.
rm -rf "${DST}/dist"
mv "${DST}/dist.new" "${DST}/dist"

exit 0
