#!/bin/sh
set -eu

NODE_VERSION="26.13.0"
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TOOLS_DIR="$PROJECT_DIR/.tools"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLATFORM="darwin-arm64" ;;
  Darwin-x86_64) PLATFORM="darwin-x64" ;;
  Linux-aarch64|Linux-arm64) PLATFORM="linux-arm64" ;;
  Linux-x86_64) PLATFORM="linux-x64" ;;
  *)
    echo "Unsupported platform: $(uname -s) $(uname -m)" >&2
    exit 1
    ;;
esac

ARCHIVE="node-v${NODE_VERSION}-${PLATFORM}.tar.gz"
URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"
INSTALL_DIR="$TOOLS_DIR/node-v${NODE_VERSION}-${PLATFORM}"

mkdir -p "$TOOLS_DIR"
if [ ! -x "$INSTALL_DIR/bin/node" ]; then
  echo "Downloading Node.js ${NODE_VERSION} (${PLATFORM})..."
  curl --fail --location --proto '=https' --tlsv1.2 "$URL" -o "$TOOLS_DIR/$ARCHIVE"
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o "$TOOLS_DIR/SHASUMS256.txt"
  EXPECTED=$(awk -v name="$ARCHIVE" '$2 == name { print $1 }' "$TOOLS_DIR/SHASUMS256.txt")
  ACTUAL=$(shasum -a 256 "$TOOLS_DIR/$ARCHIVE" | awk '{ print $1 }')
  if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Node.js archive checksum verification failed." >&2
    exit 1
  fi
  tar -xzf "$TOOLS_DIR/$ARCHIVE" -C "$TOOLS_DIR"
fi

PATH="$INSTALL_DIR/bin:$PATH"
export PATH
echo "Using $(node --version) and npm $(npm --version)"
cd "$PROJECT_DIR"
npm ci --no-audit --no-fund
echo "Ready. Copy .env.example to .env, edit it, then run:"
echo "  ./scripts/run.sh"
