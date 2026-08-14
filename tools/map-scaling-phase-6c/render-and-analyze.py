"""Batch raster renderer and deterministic visual-feature extractor for Phase 6C."""

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
from PIL import Image


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


def place(canvas: Image.Image, placement: dict) -> None:
    module = cached_asset(placement["path"], "RGBA")
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
    canvas.alpha_composite(module, (round(placement["x"]), round(placement["y"])))


def bit_hash(bits: np.ndarray) -> str:
    packed = np.packbits(bits.astype(np.uint8).reshape(-1))
    return packed.tobytes().hex()


def perceptual_features(image: Image.Image) -> dict:
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
    return {
        "differenceHash": difference_hash,
        "averageHash": average_hash,
        "perceptualHash": perceptual_hash,
        "lowResolutionRgb": low_rgb.reshape(-1).tolist(),
        "lowResolutionGray": low_gray.reshape(-1).tolist(),
        "colorHistogram": histogram,
        "meanRgb": mean_rgb,
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
    canvas = transform_foundation(foundation, plan["foundation"].get("transform", "none")).convert("RGBA")
    for placement in plan.get("barriers", []):
        place(canvas, placement)
    for placement in plan.get("roads", []):
        place(canvas, placement)
    for placement in plan.get("accents", []):
        place(canvas, placement)
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
                print(f"Phase 6C raster generation: {completed}/{len(tasks)}", flush=True)
    records.sort(key=lambda record: record["key"])
    result = {
        "schemaVersion": 1,
        "phase": "6C",
        "developmentOnly": True,
        "productionActivated": False,
        "renderer": "phase6c-pillow-batch-v1",
        "pillowVersion": Image.__version__,
        "webpQuality": WEBP_QUALITY,
        "webpMethod": WEBP_METHOD,
        "sampleCount": len(records),
        "records": records,
    }
    (output / "render-index.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
