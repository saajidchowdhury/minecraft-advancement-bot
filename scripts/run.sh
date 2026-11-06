#!/bin/sh
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) PLATFORM="darwin-arm64" ;;
    Darwin-x86_64) PLATFORM="darwin-x64" ;;
    Linux-aarch64|Linux-arm64) PLATFORM="linux-arm64" ;;
    Linux-x86_64) PLATFORM="linux-x64" ;;
    *) PLATFORM="" ;;
esac
LOCAL_NODE="$PROJECT_DIR/.tools/node-v26.13.0-${PLATFORM}/bin"
if [ -x "$LOCAL_NODE/node" ]; then
    PATH="$LOCAL_NODE:$PATH"
elif command -v node >/dev/null 2>&1; then
    :
elif [ "$(uname -s)" = Darwin ] && "$PROJECT_DIR/.tools/node-v26.13.0-darwin-x64/bin/node" --version >/dev/null 2>&1; then
    PATH="$PROJECT_DIR/.tools/node-v26.13.0-darwin-x64/bin:$PATH"
else
    echo "Node.js 22+ required. Run ./scripts/bootstrap.sh first." >&2
    exit 1
fi
export PATH
if [ "$#" -gt 0 ]; then
    MC_PORT="$1"
    export MC_PORT
fi
cd "$PROJECT_DIR"
[ -f .env ] || cp .env.example .env
exec node --env-file-if-exists=.env src/index.js
