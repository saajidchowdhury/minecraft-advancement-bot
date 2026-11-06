#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules ]; then
    echo "First run: downloading what the bot needs (about a minute)..."
    ./scripts/bootstrap.sh || { echo "Setup failed. Check your internet connection and try again."; exit 1; }
fi
port=""
while ! printf '%s' "$port" | grep -Eq '^[0-9]{1,5}$'; do
    printf '\nType the port number from Minecraft chat, then press Enter: '
    read -r port || exit 1
done
echo "Starting the bot. Close this window to stop it."
./scripts/run.sh "$port"
