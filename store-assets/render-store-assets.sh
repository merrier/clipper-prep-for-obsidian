#!/usr/bin/env bash
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
ASSETS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=128,128 \
  --screenshot="$ASSETS_DIR/icon-128.png" \
  "file://$ASSETS_DIR/icon-128.html"

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1280,800 \
  --screenshot="$ASSETS_DIR/screenshot-1280x800.png" \
  "file://$ASSETS_DIR/screenshot-1280x800.html"

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=440,280 \
  --screenshot="$ASSETS_DIR/promo-small-440x280.png" \
  "file://$ASSETS_DIR/promo-small-440x280.html"

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1400,560 \
  --screenshot="$ASSETS_DIR/promo-marquee-1400x560.png" \
  "file://$ASSETS_DIR/promo-marquee-1400x560.html"
