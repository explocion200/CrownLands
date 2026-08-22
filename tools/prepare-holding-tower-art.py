"""Prepare transparent, fixed-layout Holding Tower source masters.

The four supplied originals remain byte-for-byte unchanged under
``assets/holding-towers/source``.  Only the border-connected near-black matte
is removed, so enclosed dark windows, doors, roof shadows, and outlines remain
part of the tower artwork.  The prepared masters use Crownlands' existing
640x640 objective-source convention and are consumed by
``tools/optimize-game-art.py``.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "assets" / "holding-towers" / "source"
OUTPUT_DIR = ROOT / "assets" / "holding-towers"
REPORT_PATH = OUTPUT_DIR / "preparation-report.json"

SOURCE_SIZE = (1254, 1254)
MASTER_SIZE = (640, 640)
CONTENT_LIMIT = 600
BACKGROUND_THRESHOLD = 12
FRINGE_THRESHOLD = 28


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def border_connected_mask(max_channel: Image.Image, threshold: int) -> Image.Image:
    """Return an L mask for thresholded pixels connected to the image border."""

    candidates = max_channel.point(lambda value: 255 if value <= threshold else 0)
    connected = candidates.copy()
    width, height = connected.size
    for seed in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        if connected.getpixel(seed) == 255:
            ImageDraw.floodfill(connected, seed, 128, thresh=0)
    return connected.point(lambda value: 255 if value == 128 else 0)


def remove_exterior_matte(source: Image.Image) -> tuple[Image.Image, dict]:
    rgb = source.convert("RGB")
    red, green, blue = rgb.split()
    max_channel = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    exterior = border_connected_mask(max_channel, BACKGROUND_THRESHOLD)
    near_exterior = exterior.filter(ImageFilter.MaxFilter(5))

    rgba = rgb.convert("RGBA")
    pixels = rgba.load()
    maximum = max_channel.load()
    exterior_pixels = exterior.load()
    near_pixels = near_exterior.load()
    width, height = rgba.size
    transparent_pixels = 0
    softened_fringe_pixels = 0

    for y in range(height):
        for x in range(width):
            if exterior_pixels[x, y]:
                red_value, green_value, blue_value, _ = pixels[x, y]
                pixels[x, y] = (red_value, green_value, blue_value, 0)
                transparent_pixels += 1
                continue
            value = maximum[x, y]
            if not near_pixels[x, y] or value >= FRINGE_THRESHOLD:
                continue
            alpha = round(255 * max(0, value - BACKGROUND_THRESHOLD) / (FRINGE_THRESHOLD - BACKGROUND_THRESHOLD))
            alpha = max(1, min(254, alpha))
            red_value, green_value, blue_value, _ = pixels[x, y]
            pixels[x, y] = (
                min(255, round(red_value * 255 / alpha)),
                min(255, round(green_value * 255 / alpha)),
                min(255, round(blue_value * 255 / alpha)),
                alpha,
            )
            softened_fringe_pixels += 1

    alpha = rgba.getchannel("A")
    content_bounds = alpha.getbbox()
    if not content_bounds:
        raise RuntimeError("The exterior-matte pass removed the entire image.")
    content = rgba.crop(content_bounds)
    content.thumbnail((CONTENT_LIMIT, CONTENT_LIMIT), Image.Resampling.LANCZOS, reducing_gap=3.0)
    master = Image.new("RGBA", MASTER_SIZE, (0, 0, 0, 0))
    offset = ((MASTER_SIZE[0] - content.width) // 2, (MASTER_SIZE[1] - content.height) // 2)
    master.alpha_composite(content, offset)
    return master, {
        "sourceContentBounds": list(content_bounds),
        "preparedContentSize": [content.width, content.height],
        "preparedOffset": list(offset),
        "transparentPixels": transparent_pixels,
        "softenedFringePixels": softened_fringe_pixels,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for tower_number in range(1, 5):
        source_path = SOURCE_DIR / f"{tower_number}.png"
        output_path = OUTPUT_DIR / f"tower-{tower_number}.png"
        with Image.open(source_path) as source:
            if source.size != SOURCE_SIZE:
                raise RuntimeError(f"{source_path} must remain {SOURCE_SIZE[0]}x{SOURCE_SIZE[1]}.")
            if source.mode != "RGB":
                raise RuntimeError(f"{source_path} must remain an opaque RGB original.")
            master, metrics = remove_exterior_matte(source)
        master.save(output_path, "PNG", optimize=True)
        records.append({
            "towerNumber": tower_number,
            "source": source_path.relative_to(ROOT).as_posix(),
            "sourceSha256": sha256(source_path),
            "prepared": output_path.relative_to(ROOT).as_posix(),
            "preparedSha256": sha256(output_path),
            "preparedDimensions": list(MASTER_SIZE),
            "hasAlpha": True,
            **metrics,
        })

    report = {
        "schemaVersion": 1,
        "method": "border-connected-near-black-matte-v1",
        "backgroundThreshold": BACKGROUND_THRESHOLD,
        "fringeThreshold": FRINGE_THRESHOLD,
        "sourceDimensions": list(SOURCE_SIZE),
        "preparedDimensions": list(MASTER_SIZE),
        "records": records,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(records)} transparent Holding Tower masters at {MASTER_SIZE[0]}x{MASTER_SIZE[1]}.")


if __name__ == "__main__":
    main()
