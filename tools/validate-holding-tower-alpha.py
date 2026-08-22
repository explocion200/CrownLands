"""Validate Holding Tower alpha edges and source/master invariants."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
EXPECTED_SOURCE_HASHES = (
    "ca548783cec61d1bdef60d31f0dc9921a4500931a51cd930236f7332677ebea3",
    "9481bb46be6ebf290e4b09da51818d35cc93c58a0d00d9a5635d705425768b30",
    "4a2e7c2b989c01ca55e50f272616887f68d3c5b86e798710356594f94c397bda",
    "cf37d0b8bd51855cbc2090b5b5b4c2207fcd3d66048fd690a9f78d354b9861fc",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_tower(number: int) -> dict:
    source_path = ROOT / "assets" / "holding-towers" / "source" / f"{number}.png"
    master_path = ROOT / "assets" / "holding-towers" / f"tower-{number}.png"
    if sha256(source_path) != EXPECTED_SOURCE_HASHES[number - 1]:
        raise AssertionError(f"Tower {number} original source changed.")
    with Image.open(source_path) as source:
        if source.mode != "RGB" or source.size != (1254, 1254):
            raise AssertionError(f"Tower {number} original source format changed.")
    with Image.open(master_path) as master:
        rgba = master.convert("RGBA")
    if rgba.size != (640, 640):
        raise AssertionError(f"Tower {number} master is not 640x640.")
    alpha = rgba.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds or bounds[1] < 16 or bounds[3] > 624:
        raise AssertionError(f"Tower {number} safety margin is invalid: {bounds}.")
    if any(alpha.getpixel(point) for point in ((0, 0), (639, 0), (0, 639), (639, 639))):
        raise AssertionError(f"Tower {number} has non-transparent canvas corners.")

    visible = alpha.point(lambda value: 255 if value else 0)
    eroded = visible.filter(ImageFilter.MinFilter(3))
    boundary = ImageChops.subtract(visible, eroded)
    boundary_pixels = 0
    dark_opaque_boundary_pixels = 0
    partial_alpha_pixels = 0
    rgba_pixels = rgba.load()
    boundary_mask = boundary.load()
    for y in range(640):
        for x in range(640):
            red, green, blue, alpha_value = rgba_pixels[x, y]
            if 0 < alpha_value < 255:
                partial_alpha_pixels += 1
            if not boundary_mask[x, y]:
                continue
            boundary_pixels += 1
            if alpha_value >= 192 and max(red, green, blue) <= 12:
                dark_opaque_boundary_pixels += 1
    if not partial_alpha_pixels:
        raise AssertionError(f"Tower {number} has no anti-aliased alpha fringe.")
    if dark_opaque_boundary_pixels:
        raise AssertionError(f"Tower {number} retains {dark_opaque_boundary_pixels} opaque near-black halo pixels.")
    return {
        "tower": number,
        "alphaBounds": bounds,
        "boundaryPixels": boundary_pixels,
        "partialAlphaPixels": partial_alpha_pixels,
        "darkOpaqueBoundaryPixels": dark_opaque_boundary_pixels,
    }


def main() -> None:
    records = [validate_tower(number) for number in range(1, 5)]
    print(f"Validated {len(records)} transparent Holding Tower masters: {records}")


if __name__ == "__main__":
    main()
