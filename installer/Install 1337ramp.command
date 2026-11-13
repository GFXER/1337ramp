#!/bin/bash
# 1337ramp installer (macOS): After Effects speed-ramp panel
cd "$(dirname "$0")" || exit 1
DST="$HOME/Library/Application Support/Adobe/CEP/extensions"
echo "Installing 1337ramp…"
mkdir -p "$DST"
rm -rf "$DST/com.cheats1337.ramp"
cp -R "com.cheats1337.ramp" "$DST/" || { echo "Copy failed."; read -r; exit 1; }
xattr -dr com.apple.quarantine "$DST/com.cheats1337.ramp" 2>/dev/null
chmod +x "$DST/com.cheats1337.ramp/bin/ffmpeg" 2>/dev/null
# unsigned panel: allow it to load (CEP 9–13 = AE 2019–2026)
for v in 9 10 11 12 13; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
echo "✓ Panel installed to: $DST/com.cheats1337.ramp"
if { [ "$(uname -m)" = arm64 ] && "$DST/com.cheats1337.ramp/bin/ffmpeg" -version >/dev/null 2>&1; } || command -v ffmpeg >/dev/null 2>&1 || [ -x /opt/homebrew/bin/ffmpeg ] || [ -x /usr/local/bin/ffmpeg ]; then
  echo "✓ ffmpeg ready (used for the live preview)"
else
  echo "! Intel Mac: the bundled ffmpeg is Apple Silicon only. For the live preview run:  brew install ffmpeg"
fi
echo
echo "Now restart After Effects and open: Window → Extensions → 1337ramp"
echo "(press Return to close)"; read -r
