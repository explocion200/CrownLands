"""Compact deterministic renderer and feature extractor for the Phase 6E scale proof."""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import io
import json
import math
import os
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
_MAP_ROOT: Path | None = None
_THUMBNAIL_ROOT: Path | None = None
_ASSET_CACHE: dict[str, Image.Image] = {}
_SHARD_HANDLES: dict[str, object] = {}


def current_peak_working_set_bytes() -> int | None:
    if os.name != "nt":
        try:
            import resource
            return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024)
        except (ImportError, OSError):
            return None
    try:
        class ProcessMemoryCounters(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_ulong),
                ("PageFaultCount", ctypes.c_ulong),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]
        counters = ProcessMemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        kernel32 = ctypes.windll.kernel32
        psapi = ctypes.windll.psapi
        kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(ProcessMemoryCounters), ctypes.c_ulong]
        psapi.GetProcessMemoryInfo.restype = ctypes.c_bool
        process = kernel32.GetCurrentProcess()
        if not psapi.GetProcessMemoryInfo(process, ctypes.byref(counters), counters.cb):
            return None
        return int(counters.PeakWorkingSetSize)
    except (AttributeError, OSError):
        return None


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_json(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return sha256_bytes(payload)


def initialize_worker(root: str, map_root: str, thumbnail_root: str) -> None:
    global _ROOT, _MAP_ROOT, _THUMBNAIL_ROOT, _ASSET_CACHE, _SHARD_HANDLES
    _ROOT = Path(root)
    _MAP_ROOT = Path(map_root)
    _THUMBNAIL_ROOT = Path(thumbnail_root)
    _ASSET_CACHE = {}
    _SHARD_HANDLES = {}


def cached_asset(relative_path: str, mode: str) -> Image.Image:
    cache_key = f"{mode}|{relative_path}"
    if cache_key not in _ASSET_CACHE:
        assert _ROOT is not None
        with Image.open(_ROOT / relative_path) as opened:
            _ASSET_CACHE[cache_key] = opened.convert(mode).copy()
    return _ASSET_CACHE[cache_key].copy()


def transform_foundation(image: Image.Image, transform: str) -> Image.Image:
    transforms = {
        "flip_horizontal": Image.Transpose.FLIP_LEFT_RIGHT,
        "flip_vertical": Image.Transpose.FLIP_TOP_BOTTOM,
        "rotate_180": Image.Transpose.ROTATE_180,
    }
    return image.transpose(transforms[transform]) if transform in transforms else image


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
    values *= 1.0 + field[:, :, None]
    warmth = float(profile["warmth"]) * gradient * 255.0
    values[:, :, 0] += warmth
    values[:, :, 2] -= warmth
    return Image.fromarray(np.clip(values, 0, 255).astype(np.uint8), mode="RGB")


def apply_masked_reference_color_transfer(module: Image.Image, reference: Image.Image) -> Image.Image:
    """Apply an approved regional road palette without changing the road geometry."""
    source = np.asarray(module.convert("RGBA"), dtype=np.float32).copy()
    target = np.asarray(reference.convert("RGBA"), dtype=np.float32)
    source_mask = source[:, :, 3] >= 24
    target_mask = target[:, :, 3] >= 24
    if not np.any(source_mask) or not np.any(target_mask):
        return module
    source_pixels = source[:, :, :3][source_mask]
    target_pixels = target[:, :, :3][target_mask]
    source_mean = source_pixels.mean(axis=0)
    target_mean = target_pixels.mean(axis=0)
    source_std = np.maximum(source_pixels.std(axis=0), 1.0)
    target_std = np.maximum(target_pixels.std(axis=0), 1.0)
    transferred = (source[:, :, :3] - source_mean) * (target_std / source_std) + target_mean
    source[:, :, :3] = np.clip(transferred, 0, 255)
    return Image.fromarray(source.astype(np.uint8), mode="RGBA")


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
    size = (int(placement.get("width", module.width)), int(placement.get("height", module.height)))
    if module.size != size:
        module = module.resize(size, Image.Resampling.LANCZOS)
    road_skin = placement.get("roadSkin")
    if road_skin:
        if road_skin.get("strategy") != "masked-reference-color-transfer-v1":
            raise ValueError(f"Unsupported road skin strategy {road_skin.get('strategy')}.")
        reference = cached_asset(road_skin["referencePath"], "RGBA")
        module = apply_masked_reference_color_transfer(module, reference)
    target = (round(placement["x"]), round(placement["y"]))
    if placement.get("isolateAccentDetails"):
        alpha = module.getchannel("A")
        values = np.asarray(module.convert("RGB"), dtype=np.int16)
        border = np.concatenate((
            values[:16].reshape(-1, 3), values[-16:].reshape(-1, 3),
            values[:, :16].reshape(-1, 3), values[:, -16:].reshape(-1, 3),
        ))
        background = np.median(border, axis=0)
        distance = np.sqrt(np.sum((values - background) ** 2, axis=2))
        detail_values = np.clip((distance - 58) * 12, 0, 255).astype(np.uint8)
        detail = Image.fromarray(detail_values, mode="L").filter(ImageFilter.GaussianBlur(1.6))
        module.putalpha(ImageChops.multiply(alpha, detail))
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
            for x in range(width):
                pixels[x, offset] = alpha
        elif side == "south":
            for x in range(width):
                pixels[x, height - 1 - offset] = alpha
        elif side == "west":
            for y in range(height):
                pixels[offset, y] = alpha
        elif side == "east":
            for y in range(height):
                pixels[width - 1 - offset, y] = alpha
    return Image.composite(tint, image, mask)


def bit_hash(bits: np.ndarray) -> str:
    return np.packbits(bits.astype(np.uint8).reshape(-1)).tobytes().hex()


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
    low_rgb = np.asarray(image.resize((16, 12), Image.Resampling.LANCZOS), dtype=np.uint8).reshape(-1)
    low_gray = np.asarray(image.convert("L").resize((16, 12), Image.Resampling.LANCZOS), dtype=np.uint8).reshape(-1)
    rgb_array = np.asarray(image.resize((64, 48), Image.Resampling.LANCZOS), dtype=np.uint8)
    mean_rgb = rgb_array.reshape(-1, 3).mean(axis=0).astype(np.float32)
    edge_depth = 96
    edge_means = np.asarray([
        full_rgb[:edge_depth].reshape(-1, 3).mean(axis=0),
        full_rgb[:, -edge_depth:].reshape(-1, 3).mean(axis=0),
        full_rgb[-edge_depth:].reshape(-1, 3).mean(axis=0),
        full_rgb[:, :edge_depth].reshape(-1, 3).mean(axis=0),
    ], dtype=np.float32)
    return {
        "difference_hash": int(difference_hash, 16),
        "average_hash": int(average_hash, 16),
        "perceptual_hash": int(perceptual_hash, 16),
        "low_rgb": low_rgb,
        "low_gray": low_gray,
        "mean_rgb": mean_rgb,
        "edge_mean_rgb": edge_means,
    }


def read_staging_record(task: tuple[str, int, int]) -> dict:
    shard_path, offset, length = task
    handle = _SHARD_HANDLES.get(shard_path)
    if handle is None:
        handle = open(shard_path, "rb")
        _SHARD_HANDLES[shard_path] = handle
    handle.seek(offset)
    return json.loads(handle.read(length))


def render_one(task: tuple[str, int, int]) -> dict:
    started = time.perf_counter()
    staging = read_staging_record(task)
    summary = staging["summary"]
    plan = staging["renderPlan"]
    key = summary["key"]
    if plan.get("developmentOnly") is not True or plan.get("productionActivated") is not False:
        raise ValueError(f"{key} is not development-only and inactive.")
    dimensions = plan.get("dimensions", {})
    if (dimensions.get("width"), dimensions.get("height")) != MAP_SIZE:
        raise ValueError(f"{key} drifted from 1448x1086.")
    foundation = cached_asset(plan["foundation"]["path"], "RGB")
    if foundation.size != MAP_SIZE:
        raise ValueError(f"{key} foundation drifted from 1448x1086.")
    canvas = apply_foundation_tone(
        transform_foundation(foundation, plan["foundation"].get("transform", "none")),
        plan.get("foundationToneProfile"),
    ).convert("RGBA")
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
    assert _MAP_ROOT is not None and _THUMBNAIL_ROOT is not None
    map_path = _MAP_ROOT / f"{key}.webp"
    thumbnail_path = _THUMBNAIL_ROOT / f"{key}.webp"
    final.save(map_path, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, lossless=False, exact=True)
    thumbnail = final.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    thumbnail.save(thumbnail_path, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, lossless=False, exact=True)
    raster = {
        "losslessPngHash": lossless_png_hash,
        "rawPixelHash": raw_pixel_hash,
        "webpHash": sha256_file(map_path),
        "thumbnailHash": sha256_file(thumbnail_path),
        "webpBytes": map_path.stat().st_size,
        "thumbnailBytes": thumbnail_path.stat().st_size,
        "mapPath": f"runtime/maps/{key}.webp",
        "thumbnailPath": f"runtime/thumbnails/{key}.webp",
        "dimensions": {"width": final.width, "height": final.height},
        "thumbnailDimensions": {"width": thumbnail.width, "height": thumbnail.height},
    }
    summary["raster"] = raster
    summary["rasterGenerationMs"] = round((time.perf_counter() - started) * 1000, 3)
    summary["totalGenerationMs"] = round(summary["planAndCityGenerationMs"] + summary["rasterGenerationMs"], 3)
    summary["packageHash"] = sha256_json({
        "regionId": summary["regionId"],
        "coordinate": summary["coordinate"],
        "theme": summary["theme"],
        "seed": summary["seed"],
        "compositionPlanHash": summary["hashes"]["compositionPlanHash"],
        "cityDefinitionsHash": summary["hashes"]["cityDefinitionsHash"],
        **({"edgeContractHash": summary["edgeContractHash"]} if summary.get("edgeContractHash") else {}),
        "rawPixelHash": raster["rawPixelHash"],
        "webpHash": raster["webpHash"],
        "thumbnailHash": raster["thumbnailHash"],
    })
    return {
        "index": summary["index"],
        "summary": summary,
        "features": perceptual_features(final),
        "workerPeakWorkingSetBytes": current_peak_working_set_bytes(),
    }


def scan_tasks(shard_root: Path) -> list[tuple[str, int, int]]:
    tasks = []
    for shard in sorted(shard_root.glob("*.jsonl")):
        with shard.open("rb") as handle:
            while True:
                offset = handle.tell()
                line = handle.readline()
                if not line:
                    break
                tasks.append((str(shard), offset, len(line)))
    return tasks


def process_tree_rss() -> int | None:
    try:
        import psutil
        parent = psutil.Process(os.getpid())
        return parent.memory_info().rss + sum(child.memory_info().rss for child in parent.children(recursive=True))
    except (ImportError, OSError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--workers", required=True, type=int)
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output.resolve()
    shard_root = output / "staging"
    map_root = output / "runtime" / "maps"
    thumbnail_root = output / "runtime" / "thumbnails"
    map_root.mkdir(parents=True, exist_ok=True)
    thumbnail_root.mkdir(parents=True, exist_ok=True)
    tasks = scan_tasks(shard_root)
    count = len(tasks)
    if not count:
        raise ValueError("No Phase 6E staging records were found.")
    records: list[dict | None] = [None] * count
    low_rgb = np.empty((count, 16 * 12 * 3), dtype=np.uint8)
    low_gray = np.empty((count, 16 * 12), dtype=np.uint8)
    difference_hash = np.empty(count, dtype=np.uint64)
    average_hash = np.empty(count, dtype=np.uint64)
    perceptual_hash = np.empty(count, dtype=np.uint64)
    mean_rgb = np.empty((count, 3), dtype=np.float32)
    edge_mean_rgb = np.empty((count, 4, 3), dtype=np.float32)
    peak_rss = process_tree_rss() or 0
    peak_worker_working_set = 0
    started = time.perf_counter()
    with ProcessPoolExecutor(
        max_workers=max(1, args.workers),
        initializer=initialize_worker,
        initargs=(str(root), str(map_root), str(thumbnail_root)),
    ) as executor:
        futures = {executor.submit(render_one, task): task for task in tasks}
        for completed, future in enumerate(as_completed(futures), start=1):
            result = future.result()
            index = result["index"]
            records[index] = result["summary"]
            features = result["features"]
            low_rgb[index] = features["low_rgb"]
            low_gray[index] = features["low_gray"]
            difference_hash[index] = features["difference_hash"]
            average_hash[index] = features["average_hash"]
            perceptual_hash[index] = features["perceptual_hash"]
            mean_rgb[index] = features["mean_rgb"]
            edge_mean_rgb[index] = features["edge_mean_rgb"]
            peak_worker_working_set = max(peak_worker_working_set, result["workerPeakWorkingSetBytes"] or 0)
            if completed % 100 == 0 or completed == count:
                peak_rss = max(peak_rss, process_tree_rss() or 0)
                print(f"Phase 6E raster generation: {completed}/{count}", flush=True)
    if any(record is None for record in records):
        raise ValueError("Phase 6E render results are incomplete.")
    manifest_path = output / "compact-manifest.jsonl"
    with manifest_path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, separators=(",", ":"), ensure_ascii=True) + "\n")
    np.savez_compressed(
        output / "visual-features.npz",
        low_rgb=low_rgb,
        low_gray=low_gray,
        difference_hash=difference_hash,
        average_hash=average_hash,
        perceptual_hash=perceptual_hash,
        mean_rgb=mean_rgb,
        edge_mean_rgb=edge_mean_rgb,
    )
    render_index = {
        "schemaVersion": 1,
        "phase": "6E",
        "developmentOnly": True,
        "productionActivated": False,
        "renderer": "phase6e-pillow-compact-v1",
        "pillowVersion": Image.__version__,
        "webpQuality": WEBP_QUALITY,
        "webpMethod": WEBP_METHOD,
        "sampleCount": count,
        "compactManifest": "compact-manifest.jsonl",
        "visualFeatures": "visual-features.npz",
        "renderWallClockMs": round((time.perf_counter() - started) * 1000, 3),
        "approximatePeakProcessTreeRssBytes": peak_rss or None,
        "approximatePeakWorkerWorkingSetBytes": peak_worker_working_set or None,
        "approximatePeakWorkerAggregateBytes": (
            peak_worker_working_set * max(1, args.workers) if peak_worker_working_set else None
        ),
    }
    (output / "render-index.json").write_text(json.dumps(render_index, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
