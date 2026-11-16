#!/bin/zsh
# Installs the daily update of the Airbnb reviews on this Mac (see README.md,
# "Airbnb reviews"): Python environment, clone of the repository, LaunchAgent.
# Then, once each: `ant auth login` (Claude API) and `reviews.py --login` (Airbnb).
set -e
HOME_DIR="$HOME/Library/Application Support/lecolroule-reviews"
VENV="$HOME_DIR/venv"
mkdir -p "$HOME_DIR"
[[ -x "$VENV/bin/python" ]] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --disable-pip-version-check playwright pyyaml anthropic
"$VENV/bin/playwright" install chromium
[[ -d "$HOME_DIR/repo/.git" ]] || git clone -q https://github.com/ChanOJ/lecolroule.git "$HOME_DIR/repo"
PLIST="$HOME/Library/LaunchAgents/fr.lecolroule.reviews.plist"
cp "$(dirname "$0")/fr.lecolroule.reviews.plist" "$PLIST"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed: every day at 20:00. Log: ~/Library/Logs/lecolroule-reviews.log"
