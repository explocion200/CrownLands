"""Batch raster renderer and deterministic visual-feature extractor for Phase 6D."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter, ImageStat


MAP_SIZE = (1448, 1086)
THUMBNAIL_SIZE = (320, 240)
WEBP_QUALITY = 84
WEBP_METHOD = 6
_ROOT: Path | None = None
_ASSET_CACHE: dict[str, Image.Image] = {}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def initialize_worker(root: str) -> None:
    global _ROOT, _ASSET_CACHE
    _ROOT = Path(root)
    _ASSET_CACHE = {}


def cached_asset(relative_path: str, mode: str) -> Image.Image:
    cache_key = f"{mode}|{relative_path}"
    if cache_key not in _ASSET_CACHE:
        assert _ROOT is not None
        with Image.open(_ROOT / relative_path) as opened:
            _ASSET_CACHE[cache_key] = opened.convert(mode).copy()
    return _ASSET_CACHE[cache_key].copy()


def transform_foundation(image: Image.Image, transform: str) -> Image.Image:
    if transform == "flip_horizontal":
        return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if transform == "flip_vertical":
        return image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if transform == "rotate_180":
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


def place(canvas: Image.Image, placement: dict) -> None:
    module = cached_asset(placement["path"], "RGBA")
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
    size = (
        int(placement.get("width", module.width)),
        int(placement.get("height", module.height)),
    )
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
            for x in range(width): pixels[x, offset] = alpha
        elif side == "south":
            for x in range(width): pixels[x, height - 1 - offset] = alpha
        elif side == "west":
            for y in range(height): pixels[offset, y] = alpha
        elif side == "east":
            for y in range(height): pixels[width - 1 - offset, y] = alpha
    return Image.composite(tint, image, mask)


def bit_hash(bits: np.ndarray) -> str:
    packed = np.packbits(bits.astype(np.uint8).reshape(-1))
    return packed.tobytes().hex()


def perceptual_features(image: Image.Image) -> dict:
    full_rgb = np.asarray(image, dtype=np.uint8)
    gray_9x8 = np.asarray(image.convert("L").resize((9, 8), Image.Resampling.LANCZOS), dtype=np.float32)
    difference_hash = bit_hash(gray_9x8[:, 1:] >= gray_9x8[:, :-1])
    gray_8x8 = np.asarray(image.convert("L").resize((8, 8), Image.Resampling.LANCZOS), dtype=np.float32)
    average_hash = bit_hash(gray_8x8 >= gray_8x8.mean())
    gray_32 = np.asarray(image.convert("L").resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float32)
    axis = np.arange(32, dtype=np.float32)
    frequencies = np.arange(32, dtype=np.float32)[:, None]
    cosine = np.cos((math.pi / 32.0) * (axis + 0.5) * frequencies)
    dct = cosine @ gray_32 @ cosine.T
    low_dct = dct[:8, :8]
    median = np.median(low_dct.reshape(-1)[1:])
    perceptual_hash = bit_hash(low_dct >= median)
    low_rgb = np.asarray(image.resize((16, 12), Image.Resampling.LANCZOS), dtype=np.uint8)
    low_gray = np.asarray(image.convert("L").resize((16, 12), Image.Resampling.LANCZOS), dtype=np.uint8)
    histogram = []
    rgb_array = np.asarray(image.resize((64, 48), Image.Resampling.LANCZOS), dtype=np.uint8)
    for channel in range(3):
        counts, _ = np.histogram(rgb_array[:, :, channel], bins=8, range=(0, 256))
        histogram.extend(int(value) for value in counts)
    mean_rgb = [round(float(value), 3) for value in rgb_array.reshape(-1, 3).mean(axis=0)]
    edge_depth = 96
    edge_mean_rgb = {
        "north": [round(float(value), 3) for value in full_rgb[:edge_depth].reshape(-1, 3).mean(axis=0)],
        "east": [round(float(value), 3) for value in full_rgb[:, -edge_depth:].reshape(-1, 3).mean(axis=0)],
        "south": [round(float(value), 3) for value in full_rgb[-edge_depth:].reshape(-1, 3).mean(axis=0)],
        "west": [round(float(value), 3) for value in full_rgb[:, :edge_depth].reshape(-1, 3).mean(axis=0)],
    }
    return {
        "differenceHash": difference_hash,
        "averageHash": average_hash,
        "perceptualHash": perceptual_hash,
        "lowResolutionRgb": low_rgb.reshape(-1).tolist(),
        "lowResolutionGray": low_gray.reshape(-1).tolist(),
        "colorHistogram": histogram,
        "meanRgb": mean_rgb,
        "edgeBandWidth": edge_depth,
        "edgeMeanRgb": edge_mean_rgb,
    }


def render_one(task: dict) -> dict:
    started = time.perf_counter()
    package_directory = Path(task["packageDirectory"])
    plan = json.loads((package_directory / "composition.json").read_text(encoding="utf-8"))
    if plan.get("developmentOnly") is not True or plan.get("productionActivated") is not False:
        raise ValueError(f"{task['key']} is not development-only and inactive.")
    dimensions = plan.get("dimensions", {})
    if (dimensions.get("width"), dimensions.get("height")) != MAP_SIZE:
        raise ValueError(f"{task['key']} drifted from 1448x1086.")
    foundation = cached_asset(plan["foundation"]["path"], "RGB")
    if foundation.size != MAP_SIZE:
        raise ValueError(f"{task['key']} foundation drifted from 1448x1086.")
    prepared_foundation = transform_foundation(foundation, plan["foundation"].get("transform", "none"))
    canvas = apply_foundation_tone(prepared_foundation, plan.get("foundationToneProfile")).convert("RGBA")
    for placement in plan.get("barriers", []):
        place(canvas, placement)
    for placement in plan.get("roads", []):
        place(canvas, placement)
    for placement in plan.get("accents", []):
        place(canvas, placement)
    for band in plan.get("transitionBands", []):
        canvas = apply_transition_band(canvas, band)
    final = canvas.convert("RGB")
    raw_pixel_hash = sha256_bytes(final.tobytes())
    png_buffer = io.BytesIO()
    final.save(png_buffer, format="PNG", optimize=False, compress_level=4)
    lossless_png_hash = sha256_bytes(png_buffer.getvalue())
    map_path = package_directory / "map.webp"
    thumbnail_path = package_directory / "thumbnail.webp"
    final.save(
        map_path,
        format="WEBP",
        quality=WEBP_QUALITY,
        method=WEBP_METHOD,
        lossless=False,
        exact=True,
    )
    thumbnail = final.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    thumbnail.save(
        thumbnail_path,
        format="WEBP",
        quality=WEBP_QUALITY,
        method=WEBP_METHOD,
        lossless=False,
        exact=True,
    )
    return {
        "key": task["key"],
        "packageDirectory": task["relativePackageDirectory"],
        "losslessPngHash": lossless_png_hash,
        "rawPixelHash": raw_pixel_hash,
        "webpHash": sha256_file(map_path),
        "thumbnailHash": sha256_file(thumbnail_path),
        "webpBytes": map_path.stat().st_size,
        "thumbnailBytes": thumbnail_path.stat().st_size,
        "dimensions": {"width": final.width, "height": final.height},
        "thumbnailDimensions": {"width": thumbnail.width, "height": thumbnail.height},
        "features": perceptual_features(final),
        "rasterGenerationMs": round((time.perf_counter() - started) * 1000, 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--workers", required=True, type=int)
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output.resolve()
    generation = json.loads((output / "generation-index.json").read_text(encoding="utf-8"))
    tasks = [{
        "key": record["key"],
        "packageDirectory": str(output / record["packageDirectory"]),
        "relativePackageDirectory": record["packageDirectory"],
    } for record in generation["records"]]
    records = []
    with ProcessPoolExecutor(
        max_workers=max(1, args.workers),
        initializer=initialize_worker,
        initargs=(str(root),),
    ) as executor:
        futures = {executor.submit(render_one, task): task["key"] for task in tasks}
        for completed, future in enumerate(as_completed(futures), start=1):
            records.append(future.result())
            if completed % 50 == 0 or completed == len(tasks):
                print(f"Phase 6D raster generation: {completed}/{len(tasks)}", flush=True)
    records.sort(key=lambda record: record["key"])
    result = {
        "schemaVersion": 1,
        "phase": "6D",
        "developmentOnly": True,
        "productionActivated": False,
        "renderer": "phase6d-pillow-batch-v1",
        "pillowVersion": Image.__version__,
        "webpQuality": WEBP_QUALITY,
        "webpMethod": WEBP_METHOD,
        "sampleCount": len(records),
        "records": records,
    }
    (output / "render-index.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
