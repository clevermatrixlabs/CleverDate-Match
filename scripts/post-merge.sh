#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Keep merged workspaces reproducible without prompting for input.
npm install --no-audit --no-fund --ignore-scripts
npm run build