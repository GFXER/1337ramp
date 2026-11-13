"""Build release/1337ramp-mac.zip (panel + installer). Run build.py first (with FFMPEG set to a static arm64 ffmpeg).
python3 make_release.py"""
import os, zipfile
HERE = os.path.dirname(os.path.abspath(__file__)); PANEL = os.path.join(HERE, 'build', 'com.cheats1337.ramp'); OUT = os.path.join(HERE, 'release')
README = '''1337ramp 1.0 - speed-ramp panel for After Effects (macOS)

1. Double-click "Install 1337ramp.command"  (if macOS blocks it: right-click -> Open -> Open)
2. Restart After Effects
3. Window -> Extensions -> 1337ramp

Apple Silicon: ffmpeg (for the live preview) is included. Intel Macs: brew install ffmpeg
Guide: https://github.com/GFXER/1337ramp
'''
os.makedirs(OUT, exist_ok=True); z = os.path.join(OUT, '1337ramp-mac.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('1337ramp/README.txt', README)
    inst = os.path.join(HERE, 'installer', 'Install 1337ramp.command')
    zi = zipfile.ZipInfo('1337ramp/Install 1337ramp.command'); zi.external_attr = 0o755 << 16; zf.writestr(zi, open(inst, 'rb').read())
    for root, _, files in os.walk(PANEL):
        for f in files:
            p = os.path.join(root, f); a = os.path.join('1337ramp', os.path.relpath(p, os.path.dirname(PANEL)))
            zi = zipfile.ZipInfo(a); zi.external_attr = (0o755 if f == 'ffmpeg' else 0o644) << 16; zi.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(zi, open(p, 'rb').read())
print(z, os.path.getsize(z) // 1024, 'KB')
