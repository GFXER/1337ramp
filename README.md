# 1337ramp

**A speed-ramp panel for After Effects.** Pick a clip or precomp, shape the speed curve, watch it play back live, and write it back onto your timeline layer with one click. No more fighting the time-remap graph.

## Features

- **Works on what's already in your timeline.** Select a video layer or a precomp layer and the panel follows it. **Apply** writes the ramp onto that exact layer. It keeps the layer's start point and effects, and one Cmd/Ctrl+Z undoes it.
- **Speed curve editor.**
  - Drag points, double-click to add one, Alt-click to delete.
  - Each point has its own ease (AE-style influence).
  - The speed axis is logarithmic, 5 %–1000 %, so slow-mo and speed bursts are equally easy to shape.
- **Beat sync.** Enter the song's BPM to get a beat grid on the graph. Points snap to quarter beats, and the **½ / 1 / 2 / 4 / 8 beats** buttons set the ramp to an exact musical length.
- **Live preview.** It plays at your comp frame rate from small proxy frames, with frame blending and motion blur simulated.
  - The proxy frames are made once with ffmpeg and cached.
  - Precomps preview from the main video inside them, through any number of nesting levels.
  - Compare against the original speed with one checkbox.
- **Frame consistency check.** A strip under the curve shows, frame by frame, where the ramp will look clean (green), repeat frames and stutter (orange), or skip frames and strobe (red), for your blending and motion-blur settings.
- **Frame blending + motion blur.** Choose Off, Frame Mix or Pixel Motion, plus the motion blur switch and shutter angle. These are applied with the ramp.
- **Two timing modes.**
  - Default: you draw the speeds, and the panel tells you how much footage that uses.
  - **Lock source end:** the speeds are scaled so the ramp ends exactly on a source frame you choose.
- **Presets:** flow ramp (fast-slow-fast), slow-mo hit, ramp into or out of slow-mo, speed burst, bullet time.
- **Re-editable.** The ramp settings are saved on the layer. Select the layer later and the curve loads back.

## Install (macOS)

1. Download **[1337ramp-mac.zip](https://github.com/GFXER/1337ramp/releases/latest/download/1337ramp-mac.zip)** and unzip it.
2. Double-click **Install 1337ramp.command**. If macOS blocks it: right-click it → Open → Open.
3. Restart After Effects, then open **Window → Extensions → 1337ramp**.

ffmpeg (used only for the live preview) is included for Apple Silicon. On Intel Macs run `brew install ffmpeg`.

Windows: the code is written to support Windows, but it's untested and there's no installer yet.

## How it works

The ramp is baked as one linear time-remap keyframe per output frame. Each value is the integral of your speed curve, computed with 8 sub-samples per frame. So what you see in the panel is exactly what AE renders, with no bezier surprises in the value graph.

```
cep/ramp.js    curve + integration math (no DOM; node test/ramp_test.js)
cep/main.js    panel UI, proxy preview, timeline-selection tracking
cep/host.jsx   After Effects side: list clips/precomps, read the selection, bake time remap
build.py       build (+ --install) the CEP extension;  FFMPEG=/path/to/ffmpeg bundles ffmpeg
make_release.py  release/1337ramp-mac.zip
```

The panel is unsigned, so the installer turns on `PlayerDebugMode` for CEP 9–13.

## License

MIT
