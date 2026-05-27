#!/usr/bin/env python3
"""Render HTML/SVG-backed store assets to PNG with Chrome and verify sizes."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote


DEFAULT_CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "msedge",
]


@dataclass(frozen=True)
class Asset:
    source: str
    width: int
    height: int
    output: str


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-dir", required=True, type=Path, help="Directory containing source files.")
    parser.add_argument(
        "--asset",
        action="append",
        default=[],
        metavar="SOURCE:WIDTHxHEIGHT:OUTPUT",
        help="Asset render spec. Can be repeated.",
    )
    parser.add_argument("--chrome", help="Chrome/Chromium executable path.")
    args = parser.parse_args()

    assets = [parse_asset(value) for value in args.asset]
    if not assets:
        parser.error("Provide at least one --asset SOURCE:WIDTHxHEIGHT:OUTPUT")

    chrome = find_chrome(args.chrome)
    asset_dir = args.asset_dir.resolve()
    if not asset_dir.exists():
        raise SystemExit(f"Asset directory does not exist: {asset_dir}")

    for asset in assets:
        render_asset(chrome, asset_dir, asset)
        verify_dimensions(asset_dir / asset.output, asset.width, asset.height)
        print(f"OK {asset.output} {asset.width}x{asset.height}")

    return 0


def parse_asset(value: str) -> Asset:
    try:
        source, size, output = value.split(":", 2)
        width_text, height_text = size.lower().split("x", 1)
        width = int(width_text)
        height = int(height_text)
    except ValueError as exc:
        raise SystemExit(f"Invalid --asset value {value!r}; expected SOURCE:WIDTHxHEIGHT:OUTPUT") from exc

    if width <= 0 or height <= 0:
        raise SystemExit(f"Invalid size in --asset value {value!r}")

    return Asset(source=source, width=width, height=height, output=output)


def find_chrome(explicit: str | None) -> str:
    if explicit:
      path = Path(explicit)
      if path.exists():
          return str(path)
      resolved = shutil.which(explicit)
      if resolved:
          return resolved
      raise SystemExit(f"Chrome executable not found: {explicit}")

    for candidate in DEFAULT_CHROME_PATHS:
        path = Path(candidate)
        if path.exists():
            return str(path)
        resolved = shutil.which(candidate)
        if resolved:
            return resolved

    raise SystemExit("Chrome/Chromium executable not found; pass --chrome /path/to/chrome")


def render_asset(chrome: str, asset_dir: Path, asset: Asset) -> None:
    source_path = asset_dir / asset.source
    output_path = asset_dir / asset.output

    if not source_path.exists():
        raise SystemExit(f"Source asset does not exist: {source_path}")

    url = "file://" + quote(str(source_path), safe="/:")
    command = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--window-size={asset.width},{asset.height}",
        f"--screenshot={output_path}",
        url,
    ]
    subprocess.run(command, check=True)


def verify_dimensions(path: Path, expected_width: int, expected_height: int) -> None:
    try:
        from PIL import Image
    except ImportError:
        verify_dimensions_with_sips(path, expected_width, expected_height)
        return

    with Image.open(path) as image:
        width, height = image.size

    if (width, height) != (expected_width, expected_height):
        raise SystemExit(
            f"Wrong size for {path}: got {width}x{height}, expected {expected_width}x{expected_height}",
        )


def verify_dimensions_with_sips(path: Path, expected_width: int, expected_height: int) -> None:
    sips = shutil.which("sips")
    if not sips:
        print(f"WARN cannot verify dimensions without Pillow or sips: {path}", file=sys.stderr)
        return

    result = subprocess.run(
        [sips, "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        check=True,
        text=True,
        capture_output=True,
    )
    width = parse_sips_value(result.stdout, "pixelWidth")
    height = parse_sips_value(result.stdout, "pixelHeight")

    if (width, height) != (expected_width, expected_height):
        raise SystemExit(
            f"Wrong size for {path}: got {width}x{height}, expected {expected_width}x{expected_height}",
        )


def parse_sips_value(output: str, key: str) -> int:
    for line in output.splitlines():
        if key in line:
            return int(line.rsplit(":", 1)[1].strip())
    raise SystemExit(f"Could not parse {key} from sips output")


if __name__ == "__main__":
    raise SystemExit(main())
