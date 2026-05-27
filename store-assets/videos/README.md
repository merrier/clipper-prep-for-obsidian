# Product Intro Videos

Generated intro videos for Clipper Prep for Obsidian.

| File | Language | Layout | Size | Duration | Audio | Captions |
| --- | --- | --- | --- | --- | --- | --- |
| `clipper-prep-zh-landscape.mp4` | Chinese | Landscape | 1920x1080 | 00:53 | Neural TTS voiceover | Burned-in + `clipper-prep-zh.srt` |
| `clipper-prep-zh-portrait.mp4` | Chinese | Portrait | 1080x1920 | 00:53 | Neural TTS voiceover | Burned-in + `clipper-prep-zh.srt` |
| `clipper-prep-en-landscape.mp4` | English | Landscape | 1920x1080 | 00:57 | Neural TTS voiceover | Burned-in + `clipper-prep-en.srt` |
| `clipper-prep-en-portrait.mp4` | English | Portrait | 1080x1920 | 00:57 | Neural TTS voiceover | Burned-in + `clipper-prep-en.srt` |

The install segment recommends searching for `Clipper Prep for Obsidian` in the app store or Chrome Web Store instead of directing users to a manual package download.

## Voice Options

The generator supports three text-to-speech providers:

- `edge`: neural TTS without cloning, useful as a no-account fallback.
- `say`: macOS system TTS, useful for local smoke tests.
- `elevenlabs`: ElevenLabs TTS with an existing or newly-created Instant Voice Clone.

Only clone a voice you own or have explicit rights to use. Keep original voice samples outside the repository; `store-assets/videos/voice-samples/` is ignored if you want a local staging folder.

## ElevenLabs Setup

Install dependencies:

```bash
python3 -m pip install --target /tmp/clipper-video-deps edge-tts imageio-ffmpeg
```

Use an existing ElevenLabs voice:

```bash
export ELEVENLABS_API_KEY="..."
export ELEVENLABS_VOICE_ID="..."
PYTHONPATH=/tmp/clipper-video-deps python3 store-assets/videos/generate_plugin_videos.py --tts elevenlabs --langs zh en --layouts landscape portrait
```

Create an Instant Voice Clone once through the API:

```bash
export ELEVENLABS_API_KEY="..."
PYTHONPATH=/tmp/clipper-video-deps python3 store-assets/videos/generate_plugin_videos.py \
  --tts elevenlabs \
  --elevenlabs-create-ivc \
  --voice-samples /absolute/path/to/sample-1.mp3 /absolute/path/to/sample-2.wav \
  --langs zh en \
  --layouts landscape portrait
```

The created `voice_id` is saved to `store-assets/videos/.voice-cache.json`, which is git-ignored. Future runs can omit `--elevenlabs-create-ivc` and `--voice-samples` unless you delete the cache or set `ELEVENLABS_VOICE_ID`.

Regenerate:

```bash
python3 -m pip install --target /tmp/clipper-video-deps edge-tts imageio-ffmpeg
PYTHONPATH=/tmp/clipper-video-deps python3 store-assets/videos/generate_plugin_videos.py --tts edge --langs zh en --layouts landscape portrait
```
