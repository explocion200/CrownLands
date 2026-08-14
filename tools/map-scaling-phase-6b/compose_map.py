"""Deterministic offline raster compositor for the Phase 6B asset library."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


MAP_SIZE = (1448, 1086)
THUMBNAIL_SIZE = (320, 240)
WEBP_QUALITY = 84
WEBP_METHOD = 6


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def transform_foundation(image: Image.Image, transform: str) -> Image.Image:
    if transform == "flip_horizontal":
        return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if transform == "flip_vertical":
        return image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if transform == "rotate_180":
        return image.transpose(Image.Transpose.ROTATE_180)
    return image


def place(canvas: Image.Image, root: Path, placement: dict) -> None:
    with Image.open(root / placement["path"]) as opened:
        module = opened.convert("RGBA")
    if placement.get("flipHorizontal"):
        module = module.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if placement.get("flipVertical"):
        module = module.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    width = int(placement.get("width", module.width))
    height = int(placement.get("height", module.height))
    if (width, height) != module.size:
        module = module.resize((width, height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(module, (round(placement["x"]), round(placement["y"])))


def inspect(path: Path) -> dict:
    with Image.open(path) as image:
        return {
            "path": path.name,
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "opaque": image.mode == "RGB",
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }


def render(plan_path: Path, root: Path, output: Path) -> dict:
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if (plan.get("dimensions", {}).get("width"), plan.get("dimensions", {}).get("height")) != MAP_SIZE:
        raise ValueError("Phase 6B maps must remain 1448x1086.")
    if plan.get("developmentOnly") is not True or plan.get("productionActivated") is not False:
        raise ValueError("Phase 6B composition must remain development-only and inactive.")

    with Image.open(root / plan["foundation"]["path"]) as opened:
        foundation = opened.convert("RGB")
    if foundation.size != MAP_SIZE:
        raise ValueError("Foundation dimensions drifted from 1448x1086.")
    canvas = transform_foundation(foundation, plan["foundation"].get("transform", "none")).convert("RGBA")
    for placement in plan.get("barriers", []):
        place(canvas, root, placement)
    for placement in plan.get("roads", []):
        place(canvas, root, placement)
    for placement in plan.get("accents", []):
        place(canvas, root, placement)

    output.mkdir(parents=True, exist_ok=True)
    clean_png = output / "map-clean.png"
    map_webp = output / "map.webp"
    thumbnail_webp = output / "thumbnail.webp"
    final = canvas.convert("RGB")
    final.save(clean_png, format="PNG", optimize=False, compress_level=4)
    final.save(map_webp, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, lossless=False, exact=True)
    final.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS).save(
        thumbnail_webp, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, lossless=False, exact=True
    )
    result = {
        "renderer": "phase6b-pillow-modular-v1",
        "pillowVersion": Image.__version__,
        "quality": WEBP_QUALITY,
        "method": WEBP_METHOD,
        "cleanPng": inspect(clean_png),
        "map": inspect(map_webp),
        "thumbnail": inspect(thumbnail_webp),
    }
    print(json.dumps(result, separators=(",", ":")))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    render(args.plan.resolve(), args.root.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
