#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import math
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

try:
    import imageio_ffmpeg
except ImportError as exc:
    raise SystemExit(
        "Missing imageio-ffmpeg. Install it with: "
        "python3 -m pip install --target /tmp/clipper-video-deps imageio-ffmpeg"
    ) from exc

try:
    import edge_tts
except ImportError:
    edge_tts = None


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "store-assets"
OUT_DIR = ASSET_DIR / "videos"
VOICE_CACHE_PATH = OUT_DIR / ".voice-cache.json"
ELEVENLABS_API_BASE = "https://api.elevenlabs.io"
FPS = 24
PALETTE = {
    "ink": (19, 24, 27),
    "muted": (71, 84, 91),
    "green": (31, 111, 74),
    "green_dark": (35, 82, 70),
    "line": (215, 226, 218),
    "paper": (248, 251, 247),
    "purple": (74, 40, 120),
    "yellow": (240, 200, 90),
}


@dataclass(frozen=True)
class Segment:
    title: str
    body: str
    vo: str
    visual: str


@dataclass(frozen=True)
class ElevenLabsConfig:
    api_key: str
    voice_id: str
    model_id: str
    output_format: str


SCRIPTS = {
    "zh": {
        "say_voice": "Tingting",
        "say_rate": "192",
        "edge_voice": "zh-CN-XiaoxiaoNeural",
        "edge_rate": "+18%",
        "name": "Clipper Prep for Obsidian",
        "segments": [
            Segment(
                "复杂网页，先准备再剪藏",
                "为 Obsidian Web Clipper 清理页面结构。",
                "Clipper Prep for Obsidian，让复杂网页在剪藏前先准备好。",
                "hero",
            ),
            Segment(
                "问题：页面不总是普通 HTML",
                "懒加载图片、虚拟滚动文档、隐藏在 data-href 里的链接，都可能让 Markdown 缺内容。",
                "有些页面并不是真正的普通 HTML。图片懒加载，文档虚拟滚动，链接还可能藏在 data href 里。",
                "problem",
            ),
            Segment(
                "插件会在页面里做预处理",
                "规范图片、镜像文档、保留真实链接，然后让官方剪藏器读取准备好的 DOM。",
                "插件会在页面中规范图片，镜像文档，并保留真实链接。",
                "solution",
            ),
            Segment(
                "覆盖常见高难度页面",
                "支持微信公众号、ByteTech 文章，以及 Feishu 和 Lark 文档。",
                "它支持微信公众号，ByteTech 文章，以及 Feishu 和 Lark 文档。",
                "sites",
            ),
            Segment(
                "链接保持 Markdown 形态",
                "渲染链接可以被保留为 [text](url)，减少剪藏后的手动修补。",
                "像浏览器插件这样的渲染链接，会被保留为 Markdown 链接。",
                "links",
            ),
            Segment(
                "工作流不变",
                "打开目标页面，然后继续使用官方 Obsidian Web Clipper。",
                "安装后打开目标页面，再使用官方 Obsidian Web Clipper 正常剪藏。",
                "workflow",
            ),
            Segment(
                "推荐从应用商店安装",
                "在应用商店搜索 Clipper Prep for Obsidian，然后添加到浏览器。",
                "安装方式很简单。在应用商店搜索 Clipper Prep for Obsidian，然后添加到浏览器。",
                "install",
            ),
            Segment(
                "可控、透明、按需启用",
                "站点增强和全局 Markdown 链接处理，都可以在 Options 里开关。",
                "你可以在 Options 中开关站点增强和全局处理。",
                "options",
            ),
            Segment(
                "少一点修补，多一点干净 Markdown",
                "Clipper Prep for Obsidian，让剪藏更顺手。",
                "少一点修补，多一点干净 Markdown。Clipper Prep for Obsidian。",
                "outro",
            ),
        ],
    },
    "en": {
        "say_voice": "Samantha",
        "say_rate": "190",
        "edge_voice": "en-US-AriaNeural",
        "edge_rate": "+12%",
        "name": "Clipper Prep for Obsidian",
        "segments": [
            Segment(
                "Prepare complex pages before clipping",
                "Cleaner captures for Obsidian Web Clipper.",
                "Meet Clipper Prep for Obsidian, a small helper that prepares complex pages before you clip.",
                "hero",
            ),
            Segment(
                "The problem: pages are not always plain HTML",
                "Lazy images, virtual documents, shadow DOM, and hidden data-href links can all break clean Markdown.",
                "Many pages are not plain HTML. They use lazy images, virtual documents, shadow DOM, and hidden data href links.",
                "problem",
            ),
            Segment(
                "It prepares the live page DOM",
                "Images are normalized, documents are mirrored, and rendered links stay real.",
                "Clipper Prep normalizes images, mirrors documents, and keeps rendered links as real links.",
                "solution",
            ),
            Segment(
                "Built for the pages you actually clip",
                "WeChat Official Accounts, ByteTech articles, and Feishu or Lark documents.",
                "It works with WeChat Official Accounts, ByteTech articles, and Feishu or Lark documents.",
                "sites",
            ),
            Segment(
                "Markdown links stay intact",
                "Rendered links can survive as [text](url), reducing cleanup after capture.",
                "Rendered links can survive as Markdown links, so you spend less time fixing notes afterward.",
                "links",
            ),
            Segment(
                "Your workflow stays the same",
                "Open the page, then clip with the official Obsidian Web Clipper.",
                "Your workflow stays the same. Open the page, then use the official Obsidian Web Clipper.",
                "workflow",
            ),
            Segment(
                "Install from the app store",
                "Search for Clipper Prep for Obsidian in the app store, then add it to your browser.",
                "To install it, search for Clipper Prep for Obsidian in the app store, then add it to your browser.",
                "install",
            ),
            Segment(
                "Control what runs",
                "Toggle site enhancers and global Markdown link processing from Options.",
                "You can turn site enhancers and global Markdown link processing on or off from Options.",
                "options",
            ),
            Segment(
                "Less cleanup. Cleaner Markdown.",
                "Clipper Prep for Obsidian prepares the page so your clipper can do better work.",
                "Less cleanup, cleaner Markdown. That is Clipper Prep for Obsidian.",
                "outro",
            ),
        ],
    },
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate localized product intro videos.")
    parser.add_argument("--langs", nargs="+", default=["zh", "en"], choices=["zh", "en"])
    parser.add_argument("--layouts", nargs="+", default=["landscape", "portrait"], choices=["landscape", "portrait"])
    parser.add_argument("--tts", default="edge", choices=["edge", "say", "elevenlabs"])
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--elevenlabs-create-ivc", action="store_true", help="Create an ElevenLabs Instant Voice Clone when no voice id is configured.")
    parser.add_argument("--voice-samples", nargs="*", default=[], help="Audio files used when creating an ElevenLabs Instant Voice Clone.")
    parser.add_argument("--elevenlabs-voice-name", default="Clipper Prep Voice", help="Name used when creating an ElevenLabs Instant Voice Clone.")
    parser.add_argument("--elevenlabs-model", default="eleven_multilingual_v2", help="ElevenLabs text-to-speech model id.")
    parser.add_argument("--elevenlabs-output-format", default="mp3_44100_128", help="ElevenLabs audio output format.")
    parser.add_argument("--elevenlabs-remove-background-noise", action="store_true", help="Ask ElevenLabs to remove background noise from clone samples.")
    args = parser.parse_args()

    elevenlabs_config = None
    if args.tts == "elevenlabs" and not args.skip_audio:
        elevenlabs_config = resolve_elevenlabs_config(args)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    assets = load_assets()
    fonts = load_fonts()

    for lang in args.langs:
        script = SCRIPTS[lang]
        timeline, audio_path = build_audio(
            lang,
            script,
            ffmpeg,
            tts=args.tts,
            elevenlabs_config=elevenlabs_config,
            skip_audio=args.skip_audio,
        )
        write_srt(lang, timeline)

        for layout in args.layouts:
            size = (1920, 1080) if layout == "landscape" else (1080, 1920)
            output = OUT_DIR / f"clipper-prep-{lang}-{layout}.mp4"
            render_video(ffmpeg, output, lang, layout, size, script, timeline, audio_path, assets, fonts)
            print(f"OK {output}")

    return 0


def load_assets() -> dict[str, Image.Image]:
    paths = {
        "logo": ASSET_DIR / "icon-128.png",
        "screenshot": ASSET_DIR / "screenshot-1280x800.png",
        "small": ASSET_DIR / "promo-small-440x280.png",
        "marquee": ASSET_DIR / "promo-marquee-1400x560.png",
    }
    return {name: Image.open(path).convert("RGBA") for name, path in paths.items()}


def load_fonts() -> dict[str, ImageFont.FreeTypeFont]:
    candidates = [
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    font_path = next((Path(path) for path in candidates if Path(path).exists()), None)
    if not font_path:
        raise SystemExit("No suitable font found")

    def font(size: int) -> ImageFont.FreeTypeFont:
        return ImageFont.truetype(str(font_path), size)

    return {
        "title": font(72),
        "title_small": font(54),
        "body": font(34),
        "body_small": font(28),
        "label": font(24),
        "caption": font(34),
        "caption_small": font(30),
        "mono": font(32),
    }


def build_audio(
    lang: str,
    script: dict,
    ffmpeg: str,
    tts: str,
    elevenlabs_config: ElevenLabsConfig | None,
    skip_audio: bool = False,
) -> tuple[list[dict], Path | None]:
    timeline = []
    cursor = 0.0
    min_segment = 5.25
    audio_dir = OUT_DIR / "audio" / lang
    audio_dir.mkdir(parents=True, exist_ok=True)

    audio_parts = []
    for index, segment in enumerate(script["segments"]):
        raw_ext = "mp3" if tts in {"edge", "elevenlabs"} else "aiff"
        raw_speech_path = audio_dir / f"{index + 1:02d}.{raw_ext}"
        speech_path = audio_dir / f"{index + 1:02d}-speech.wav"
        if skip_audio:
            speech_duration = 4.0
        else:
            synthesize_speech(script, segment.vo, raw_speech_path, tts, elevenlabs_config)
            run([
                ffmpeg,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(raw_speech_path),
                "-ac",
                "1",
                "-ar",
                "44100",
                "-c:a",
                "pcm_s16le",
                str(speech_path),
            ])
            speech_duration = get_audio_duration(speech_path)
            audio_parts.append(speech_path)

        segment_duration = max(min_segment, speech_duration + 0.38)
        silence_duration = max(0.1, segment_duration - speech_duration)

        if not skip_audio:
            silence_path = audio_dir / f"{index + 1:02d}-silence.wav"
            run([
                ffmpeg,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=mono:sample_rate=44100",
                "-t",
                f"{silence_duration:.3f}",
                "-ac",
                "1",
                "-ar",
                "44100",
                "-c:a",
                "pcm_s16le",
                str(silence_path),
            ])
            audio_parts.append(silence_path)

        timeline.append({
            "index": index,
            "start": cursor,
            "end": cursor + segment_duration,
            "duration": segment_duration,
            "caption": segment.vo,
        })
        cursor += segment_duration

    if skip_audio:
        return timeline, None

    concat_list = audio_dir / "concat.txt"
    concat_list.write_text("".join(f"file '{path}'\n" for path in audio_parts), encoding="utf-8")
    narration = OUT_DIR / f"clipper-prep-{lang}-voiceover.m4a"
    run([
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_list),
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        str(narration),
    ])
    return timeline, narration


def synthesize_speech(script: dict, text: str, output: Path, tts: str, elevenlabs_config: ElevenLabsConfig | None) -> None:
    if tts == "edge":
        if edge_tts is None:
            raise SystemExit(
                "Missing edge-tts. Install it with: "
                "python3 -m pip install --target /tmp/clipper-video-deps edge-tts imageio-ffmpeg"
            )
        asyncio.run(synthesize_edge(text, output, script["edge_voice"], script["edge_rate"]))
        return

    if tts == "elevenlabs":
        if elevenlabs_config is None:
            raise SystemExit("ElevenLabs configuration was not initialized.")
        synthesize_elevenlabs(text, output, elevenlabs_config)
        return

    run(["say", "-v", script["say_voice"], "-r", script["say_rate"], "-o", str(output), text])


async def synthesize_edge(text: str, output: Path, voice: str, rate: str) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(str(output))


def resolve_elevenlabs_config(args: argparse.Namespace) -> ElevenLabsConfig:
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise SystemExit(
            "Missing ELEVENLABS_API_KEY. Export it before using --tts elevenlabs."
        )

    voice_id = os.environ.get("ELEVENLABS_VOICE_ID")
    if voice_id:
        return ElevenLabsConfig(
            api_key=api_key,
            voice_id=voice_id,
            model_id=args.elevenlabs_model,
            output_format=args.elevenlabs_output_format,
        )

    cached_voice_id = read_cached_elevenlabs_voice_id()
    if cached_voice_id:
        return ElevenLabsConfig(
            api_key=api_key,
            voice_id=cached_voice_id,
            model_id=args.elevenlabs_model,
            output_format=args.elevenlabs_output_format,
        )

    if not args.elevenlabs_create_ivc:
        raise SystemExit(
            "Missing ELEVENLABS_VOICE_ID and no cached voice id found. "
            "Set ELEVENLABS_VOICE_ID or pass --elevenlabs-create-ivc with --voice-samples."
        )

    sample_paths = validate_voice_samples(args.voice_samples)
    voice_id = create_elevenlabs_ivc(
        api_key=api_key,
        name=args.elevenlabs_voice_name,
        sample_paths=sample_paths,
        remove_background_noise=args.elevenlabs_remove_background_noise,
    )
    write_cached_elevenlabs_voice_id(voice_id, args.elevenlabs_voice_name, sample_paths)
    return ElevenLabsConfig(
        api_key=api_key,
        voice_id=voice_id,
        model_id=args.elevenlabs_model,
        output_format=args.elevenlabs_output_format,
    )


def read_cached_elevenlabs_voice_id() -> str | None:
    if not VOICE_CACHE_PATH.exists():
        return None
    try:
        cache = json.loads(VOICE_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Could not read {VOICE_CACHE_PATH}: {exc}") from exc

    if cache.get("provider") != "elevenlabs":
        return None
    voice_id = cache.get("voice_id")
    return voice_id if isinstance(voice_id, str) and voice_id else None


def write_cached_elevenlabs_voice_id(voice_id: str, voice_name: str, sample_paths: list[Path]) -> None:
    cache = {
        "provider": "elevenlabs",
        "voice_id": voice_id,
        "voice_name": voice_name,
        "sample_count": len(sample_paths),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    VOICE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    VOICE_CACHE_PATH.write_text(json.dumps(cache, indent=2) + "\n", encoding="utf-8")


def validate_voice_samples(samples: list[str]) -> list[Path]:
    if not samples:
        raise SystemExit("--elevenlabs-create-ivc requires at least one --voice-samples file.")

    paths = [Path(sample).expanduser() for sample in samples]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise SystemExit("Voice sample file not found: " + ", ".join(missing))
    return paths


def create_elevenlabs_ivc(
    api_key: str,
    name: str,
    sample_paths: list[Path],
    remove_background_noise: bool,
) -> str:
    fields = [
        ("name", name),
        ("remove_background_noise", "true" if remove_background_noise else "false"),
        ("description", "Instant voice clone for Clipper Prep for Obsidian promo videos."),
    ]
    try:
        response = post_multipart_elevenlabs(
            api_key,
            "/v1/voices/add",
            fields=fields,
            files=[("files", path) for path in sample_paths],
        )
    except SystemExit as exc:
        if "422" not in str(exc):
            raise
        response = post_multipart_elevenlabs(
            api_key,
            "/v1/voices/add",
            fields=fields,
            files=[("files[]", path) for path in sample_paths],
        )

    voice_id = response.get("voice_id")
    if not isinstance(voice_id, str) or not voice_id:
        raise SystemExit("ElevenLabs did not return a voice_id.")

    requires_verification = response.get("requires_verification")
    if requires_verification:
        print("ElevenLabs reports that this voice requires verification before use.", file=sys.stderr)
    return voice_id


def synthesize_elevenlabs(text: str, output: Path, config: ElevenLabsConfig) -> None:
    voice_id = urllib.parse.quote(config.voice_id, safe="")
    output_format = urllib.parse.quote(config.output_format, safe="")
    body = json.dumps({
        "text": text,
        "model_id": config.model_id,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{ELEVENLABS_API_BASE}/v1/text-to-speech/{voice_id}?output_format={output_format}",
        data=body,
        headers={
            "xi-api-key": config.api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        method="POST",
    )
    output.write_bytes(urlopen_bytes(request))


def post_multipart_elevenlabs(
    api_key: str,
    path: str,
    fields: list[tuple[str, str]],
    files: list[tuple[str, Path]],
) -> dict:
    boundary = "----clipper-prep-elevenlabs-boundary"
    body = build_multipart_body(boundary, fields, files)
    request = urllib.request.Request(
        f"{ELEVENLABS_API_BASE}{path}",
        data=body,
        headers={
            "xi-api-key": api_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    payload = urlopen_bytes(request)
    try:
        return json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit("ElevenLabs returned a non-JSON response while creating the voice clone.") from exc


def build_multipart_body(
    boundary: str,
    fields: list[tuple[str, str]],
    files: list[tuple[str, Path]],
) -> bytes:
    chunks: list[bytes] = []
    for name, value in fields:
        chunks.extend([
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
            value.encode("utf-8"),
            b"\r\n",
        ])

    for field_name, path in files:
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        chunks.extend([
            f"--{boundary}\r\n".encode("utf-8"),
            (
                f'Content-Disposition: form-data; name="{field_name}"; '
                f'filename="{path.name}"\r\n'
            ).encode("utf-8"),
            f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
            path.read_bytes(),
            b"\r\n",
        ])

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks)


def urlopen_bytes(request: urllib.request.Request) -> bytes:
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"ElevenLabs API request failed with HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"ElevenLabs API request failed: {exc.reason}") from exc


def render_video(
    ffmpeg: str,
    output: Path,
    lang: str,
    layout: str,
    size: tuple[int, int],
    script: dict,
    timeline: list[dict],
    audio_path: Path | None,
    assets: dict[str, Image.Image],
    fonts: dict[str, ImageFont.FreeTypeFont],
) -> None:
    global current_timeline
    current_timeline = timeline

    width, height = size
    total_duration = timeline[-1]["end"]
    silent = output.with_name(output.stem + "-silent.mp4")
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{width}x{height}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(silent),
    ]
    proc = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert proc.stdin is not None

    frame_count = math.ceil(total_duration * FPS)
    background = make_background(width, height)
    for frame in range(frame_count):
        timestamp = frame / FPS
        segment_info = find_segment(timeline, timestamp)
        segment = script["segments"][segment_info["index"]]
        local_t = (timestamp - segment_info["start"]) / segment_info["duration"]
        image = draw_frame(background, lang, layout, script["name"], segment, local_t, segment_info, assets, fonts)
        proc.stdin.write(image.convert("RGB").tobytes())

    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit(f"ffmpeg failed while rendering {silent}")

    if audio_path:
        run([
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(silent),
            "-i",
            str(audio_path),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            str(output),
        ])
        silent.unlink(missing_ok=True)
    else:
        silent.rename(output)


def draw_frame(
    background: Image.Image,
    lang: str,
    layout: str,
    product_name: str,
    segment: Segment,
    local_t: float,
    segment_info: dict,
    assets: dict[str, Image.Image],
    fonts: dict[str, ImageFont.FreeTypeFont],
) -> Image.Image:
    image = background.copy()
    draw = ImageDraw.Draw(image, "RGBA")
    width, height = image.size
    progress = ease(local_t)

    if layout == "landscape":
        draw_brand(draw, image, assets["logo"], product_name, (112, 78), fonts, compact=False)
        draw_text_block(draw, (112, 210), 720, segment.title, segment.body, fonts["title"], fonts["body"])
        draw_visual(draw, image, segment.visual, (920, 150, 850, 620), assets, fonts, progress)
        draw_progress(draw, width, height, segment_info)
        draw_caption(draw, image, segment.vo, fonts["caption"], max_width=1500)
    else:
        draw_brand(draw, image, assets["logo"], product_name, (78, 78), fonts, compact=True)
        draw_text_block(draw, (78, 238), 910, segment.title, segment.body, fonts["title_small"], fonts["body"])
        draw_visual(draw, image, segment.visual, (86, 560, 908, 760), assets, fonts, progress)
        draw_progress(draw, width, height, segment_info)
        draw_caption(draw, image, segment.vo, fonts["caption_small"], max_width=900)

    return image


def draw_brand(draw: ImageDraw.ImageDraw, image: Image.Image, logo: Image.Image, name: str, xy: tuple[int, int], fonts, compact: bool) -> None:
    x, y = xy
    size = 90 if compact else 84
    paste_rounded(image, logo.resize((size, size), Image.Resampling.LANCZOS), (x, y), 18)
    text_x = x + size + 24
    draw.text((text_x, y + 4), name, fill=PALETTE["ink"], font=fonts["body"], anchor=None)
    draw.text((text_x, y + 48), "Chrome extension", fill=(98, 112, 134), font=fonts["label"])


def draw_text_block(draw, xy, max_width, title, body, title_font, body_font) -> None:
    x, y = xy
    title_lines = wrap_text(draw, title, title_font, max_width)
    draw_multiline(draw, (x, y), title_lines, title_font, PALETTE["ink"], 1.05)
    title_height = len(title_lines) * int(title_font.size * 1.1)
    body_lines = wrap_text(draw, body, body_font, max_width)
    draw_multiline(draw, (x, y + title_height + 28), body_lines, body_font, PALETTE["muted"], 1.22)


def draw_visual(draw, image, visual, box, assets, fonts, progress) -> None:
    x, y, w, h = box
    draw.rounded_rectangle((x, y, x + w, y + h), radius=34, fill=(255, 255, 255, 235), outline=(207, 222, 211, 255), width=2)

    if visual in {"hero", "outro"}:
        fit = cover(assets["marquee"], w - 56, h - 56, zoom=1.02 + 0.025 * progress)
        paste_rounded(image, fit, (x + 28, y + 28), 26)
    elif visual in {"problem", "solution"}:
        fit = cover(assets["screenshot"], w - 64, h - 160, zoom=1.04 + 0.02 * progress)
        paste_rounded(image, fit, (x + 32, y + 32), 24)
        labels = ["Lazy images", "Virtual docs", "Rendered links"] if visual == "problem" else ["Images normalized", "Docs mirrored", "Links preserved"]
        draw_pills(draw, labels, x + 46, y + h - 96)
    elif visual == "sites":
        cards = ["WeChat", "ByteTech", "Feishu / Lark"]
        for i, card in enumerate(cards):
            cx = x + 52 + i * ((w - 104) // 3)
            cw = (w - 128) // 3
            draw.rounded_rectangle((cx, y + 120, cx + cw, y + h - 120), radius=28, fill=(240, 247, 241), outline=(191, 216, 198))
            draw.text((cx + 30, y + 170), card, fill=PALETTE["green"], font=fonts["body"])
            draw.text((cx + 30, y + 230), "Cleaner clips", fill=PALETTE["muted"], font=fonts["body_small"])
    elif visual == "links":
        code = "Read [browser extension]\n(https://...)\n\n- semantic article HTML\n- normalized images\n- cleaner links"
        draw.rounded_rectangle((x + 60, y + 120, x + w - 60, y + h - 120), radius=26, fill=(245, 250, 246), outline=(191, 216, 198))
        draw.text((x + 100, y + 165), code, fill=PALETTE["ink"], font=fonts["mono"], spacing=14)
    elif visual == "workflow":
        steps = ["Open page", "Prepare DOM", "Clip to Obsidian"]
        draw_flow(draw, x, y, w, h, steps, fonts)
    elif visual == "install":
        draw_store_search(draw, x, y, w, h, fonts)
    elif visual == "options":
        draw_options(draw, x, y, w, h, fonts)


def draw_pills(draw, labels, x, y) -> None:
    cursor = x
    for label in labels:
        text_w = text_size(draw, label, ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 28))[0]
        draw.rounded_rectangle((cursor, y, cursor + text_w + 44, y + 48), radius=24, fill=(31, 111, 74, 255))
        draw.text((cursor + 22, y + 9), label, fill=(255, 255, 255), font=ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 28))
        cursor += text_w + 60


def draw_flow(draw, x, y, w, h, steps, fonts) -> None:
    center_y = y + h // 2
    for i, step in enumerate(steps):
        cx = x + 145 + i * ((w - 290) // 2)
        draw.ellipse((cx - 58, center_y - 58, cx + 58, center_y + 58), fill=(31, 111, 74), outline=(255, 255, 255), width=5)
        draw.text((cx, center_y - 22), str(i + 1), fill=(255, 255, 255), font=fonts["title_small"], anchor="mm")
        draw.text((cx, center_y + 105), step, fill=PALETTE["ink"], font=fonts["body"], anchor="mm")
        if i < len(steps) - 1:
            draw.line((cx + 72, center_y, cx + ((w - 290) // 2) - 72, center_y), fill=(191, 216, 198), width=8)


def draw_store_search(draw, x, y, w, h, fonts) -> None:
    draw.text((x + 70, y + 115), "App Store / Chrome Web Store", fill=PALETTE["green"], font=fonts["body"])
    search = (x + 70, y + 205, x + w - 70, y + 300)
    draw.rounded_rectangle(search, radius=48, fill=(247, 250, 247), outline=(191, 216, 198), width=3)
    draw.text((search[0] + 44, search[1] + 28), "Search: Clipper Prep for Obsidian", fill=PALETTE["ink"], font=fonts["body"])
    draw.rounded_rectangle((x + 70, y + 350, x + 390, y + 430), radius=24, fill=PALETTE["green"])
    draw.text((x + 230, y + 390), "Add to browser", fill=(255, 255, 255), font=fonts["body"], anchor="mm")


def draw_options(draw, x, y, w, h, fonts) -> None:
    rows = ["Markdown links", "Feishu / Lark docs", "WeChat images", "ByteTech articles"]
    top = y + 100
    for i, row in enumerate(rows):
        ry = top + i * 96
        draw.rounded_rectangle((x + 80, ry, x + w - 80, ry + 68), radius=20, fill=(247, 250, 247), outline=(215, 226, 218))
        draw.rounded_rectangle((x + 105, ry + 18, x + 137, ry + 50), radius=9, fill=PALETTE["green"])
        draw.text((x + 121, ry + 34), "✓", fill=(255, 255, 255), font=fonts["label"], anchor="mm")
        draw.text((x + 160, ry + 18), row, fill=PALETTE["ink"], font=fonts["body_small"])


def draw_caption(draw, image, caption, font, max_width) -> None:
    width, height = image.size
    lines = wrap_text(draw, caption, font, max_width)
    line_h = int(font.size * 1.28)
    box_h = line_h * len(lines) + 42
    box_w = min(max_width + 80, width - 120)
    x0 = (width - box_w) // 2
    y0 = height - box_h - 54
    draw.rounded_rectangle((x0, y0, x0 + box_w, y0 + box_h), radius=24, fill=(17, 20, 22, 218))
    y = y0 + 22
    for line in lines:
        draw.text((width // 2, y), line, fill=(255, 255, 255), font=font, anchor="mt")
        y += line_h


def draw_progress(draw, width, height, segment_info) -> None:
    total = sum(s["duration"] for s in current_timeline)
    progress = segment_info["end"] / total
    draw.rounded_rectangle((80, height - 24, width - 80, height - 14), radius=5, fill=(215, 226, 218, 190))
    draw.rounded_rectangle((80, height - 24, 80 + int((width - 160) * progress), height - 14), radius=5, fill=PALETTE["green"])


def write_srt(lang: str, timeline: list[dict]) -> None:
    path = OUT_DIR / f"clipper-prep-{lang}.srt"
    lines = []
    for i, item in enumerate(timeline, start=1):
        lines.append(str(i))
        lines.append(f"{format_srt_time(item['start'])} --> {format_srt_time(item['end'])}")
        lines.append(item["caption"])
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def format_srt_time(seconds: float) -> str:
    millis = int(round((seconds - int(seconds)) * 1000))
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d},{millis:03d}"


def make_background(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), (247, 249, 246))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            gx = x / max(1, width - 1)
            gy = y / max(1, height - 1)
            warm = max(0.0, (gx + gy - 1.0)) * 34
            green = max(0.0, 1.0 - gx * 1.4 - gy * 0.45) * 24
            pixels[x, y] = (
                int(247 - green * 0.3 + warm * 0.35),
                int(249 - warm * 0.15),
                int(246 - green * 0.2 - warm * 0.55),
            )
    return image.convert("RGBA")


def cover(source: Image.Image, width: int, height: int, zoom: float = 1.0) -> Image.Image:
    scale = max(width / source.width, height / source.height) * zoom
    resized = source.resize((int(source.width * scale), int(source.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def paste_rounded(base: Image.Image, source: Image.Image, xy: tuple[int, int], radius: int) -> None:
    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, source.width, source.height), radius=radius, fill=255)
    base.paste(source, xy, mask)


def wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    tokens = tokenize(text)
    lines = []
    current = ""
    for token in tokens:
        candidate = token if not current else current + token
        if text_size(draw, candidate, font)[0] <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current.strip())
        current = token.strip()
    if current:
        lines.append(current.strip())
    return lines


def tokenize(text: str) -> list[str]:
    if re.search(r"[\u4e00-\u9fff]", text):
        return list(text)
    pieces = re.split(r"(\s+)", text)
    return [piece for piece in pieces if piece]


def draw_multiline(draw, xy, lines, font, fill, spacing=1.2) -> None:
    x, y = xy
    line_h = int(font.size * spacing)
    for line in lines:
        draw.text((x, y), line, fill=fill, font=font)
        y += line_h


def text_size(draw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def find_segment(timeline, timestamp: float) -> dict:
    for item in timeline:
        if item["start"] <= timestamp < item["end"]:
            return item
    return timeline[-1]


def get_audio_duration(path: Path) -> float:
    result = subprocess.run(["afinfo", str(path)], check=True, text=True, capture_output=True)
    match = re.search(r"estimated duration:\s+([\d.]+)\s+sec", result.stdout)
    if not match:
        raise SystemExit(f"Could not read duration from {path}")
    return float(match.group(1))


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


current_timeline: list[dict] = []


if __name__ == "__main__":
    raise SystemExit(main())
