"""Deterministic offline raster compositor for the Phase 6D library."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter, ImageStat


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


def transform(image: Image.Image, name: str) -> Image.Image:
    if name == "flip_horizontal":
        return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if name == "flip_vertical":
        return image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if name == "rotate_180":
        return image.transpose(Image.Transpose.ROTATE_180)
    return image


def apply_foundation_tone(image: Image.Image, profile: dict | None) -> Image.Image:
    if not profile:
        return image
    values = np.asarray(image.convert("RGB"), dtype=np.float32)
    height, width = values.shape[:2]
    y_axis, x_axis = np.mgrid[0:height, 0:width]
    x_norm = x_axis / max(1, width - 1) - 0.5
    y_norm = y_axis / max(1, height - 1) - 0.5
    angle = math.radians(float(profile["angleDegrees"]))
    gradient = (x_norm * math.cos(angle) + y_norm * math.sin(angle)) * math.sqrt(2)
    field = float(profile["strength"]) * (gradient + float(profile["phase"]) * 0.28)
    values *= (1.0 + field[:, :, None])
    warmth = float(profile["warmth"]) * gradient * 255.0
    values[:, :, 0] += warmth
    values[:, :, 2] -= warmth
    return Image.fromarray(np.clip(values, 0, 255).astype(np.uint8), mode="RGB")


def place(canvas: Image.Image, root: Path, placement: dict) -> None:
    with Image.open(root / placement["path"]) as opened:
        module = opened.convert("RGBA")
    crop = placement.get("crop")
    if crop:
        module = module.crop((
            int(crop["x"]), int(crop["y"]),
            int(crop["x"] + crop["width"]), int(crop["y"] + crop["height"]),
        ))
    if placement.get("flipHorizontal"):
        module = module.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if placement.get("flipVertical"):
        module = module.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    size = (int(placement.get("width", module.width)), int(placement.get("height", module.height)))
    if module.size != size:
        module = module.resize(size, Image.Resampling.LANCZOS)
    target = (round(placement["x"]), round(placement["y"]))
    if placement.get("isolateAccentDetails"):
        alpha = module.getchannel("A")
        rgb = module.convert("RGB")
        values = np.asarray(rgb, dtype=np.int16)
        border = np.concatenate((values[:16].reshape(-1, 3), values[-16:].reshape(-1, 3), values[:, :16].reshape(-1, 3), values[:, -16:].reshape(-1, 3)))
        background = np.median(border, axis=0)
        distance = np.sqrt(np.sum((values - background) ** 2, axis=2))
        detail_values = np.clip((distance - 58) * 12, 0, 255).astype(np.uint8)
        detail = Image.fromarray(detail_values, mode="L").filter(ImageFilter.GaussianBlur(1.6))
        detail_alpha = ImageChops.multiply(alpha, detail)
        module.putalpha(detail_alpha)
    if placement.get("harmonizeToFoundation"):
        alpha = module.getchannel("A")
        background = canvas.crop((target[0], target[1], target[0] + module.width, target[1] + module.height)).convert("RGB")
        source_mean = ImageStat.Stat(module.convert("RGB"), mask=alpha).mean
        target_mean = ImageStat.Stat(background, mask=alpha).mean
        adjusted = []
        for channel, source, desired in zip(module.convert("RGB").split(), source_mean, target_mean):
            delta = max(-80, min(80, desired - source))
            adjusted.append(channel.point(lambda value, shift=delta: max(0, min(255, round(value + shift)))))
        harmonized = Image.merge("RGB", adjusted).convert("RGBA")
        harmonized.putalpha(alpha)
        module = harmonized
    canvas.alpha_composite(module, target)


def apply_transition_band(image: Image.Image, band: dict) -> Image.Image:
    width, height = image.size
    depth = int(band["width"])
    maximum = float(band["maximumStrength"])
    target = tuple(int(value) for value in band["targetRgb"])
    tint = Image.new("RGBA", image.size, (*target, 255))
    mask = Image.new("L", image.size, 0)
    pixels = mask.load()
    side = band["side"]
    for offset in range(depth):
        alpha = round(255 * maximum * (1 - offset / max(1, depth - 1)))
        if side == "north":
            y = offset
            for x in range(width): pixels[x, y] = alpha
        elif side == "south":
            y = height - 1 - offset
            for x in range(width): pixels[x, y] = alpha
        elif side == "west":
            x = offset
            for y in range(height): pixels[x, y] = alpha
        elif side == "east":
            x = width - 1 - offset
            for y in range(height): pixels[x, y] = alpha
    return Image.composite(tint, image, mask)


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
        raise ValueError("Phase 6D maps must remain 1448x1086.")
    if plan.get("developmentOnly") is not True or plan.get("productionActivated") is not False:
        raise ValueError("Phase 6D composition must remain development-only and inactive.")
    with Image.open(root / plan["foundation"]["path"]) as opened:
        foundation = opened.convert("RGB")
    if foundation.size != MAP_SIZE:
        raise ValueError("Foundation dimensions drifted from 1448x1086.")
    prepared_foundation = transform(foundation, plan["foundation"].get("transform", "none"))
    canvas = apply_foundation_tone(prepared_foundation, plan.get("foundationToneProfile")).convert("RGBA")
    for placement in plan.get("barriers", []):
        place(canvas, root, placement)
    for placement in plan.get("roads", []):
        place(canvas, root, placement)
    for placement in plan.get("accents", []):
        place(canvas, root, placement)
    for band in plan.get("transitionBands", []):
        canvas = apply_transition_band(canvas, band)

    output.mkdir(parents=True, exist_ok=True)
    clean_png = output / "map-clean.png"
    map_webp = output / "map.webp"
    thumbnail_webp = output / "thumbnail.webp"
    final = canvas.convert("RGB")
    final.save(clean_png, format="PNG", optimize=False, compress_level=4)
    final.save(map_webp, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, lossless=False, exact=True)
    final.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS).save(
        thumbnail_webp, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, lossless=False, exact=True,
    )
    result = {
        "renderer": "phase6d-pillow-modular-v1",
        "pillowVersion": Image.__version__,
        "quality": WEBP_QUALITY,
        "method": WEBP_METHOD,
        "transitionBandCount": len(plan.get("transitionBands", [])),
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
    arguments = parser.parse_args()
    render(arguments.plan.resolve(), arguments.root.resolve(), arguments.output.resolve())


if __name__ == "__main__":
    main()
