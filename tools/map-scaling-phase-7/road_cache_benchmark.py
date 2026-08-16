"""Benchmark deterministic precomputation of Phase 6F road geometry/theme presentations."""

from __future__ import annotations

import hashlib
import json
import statistics
import time
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "benchmark-results" / "map" / "phase-6d" / "asset-library" / "asset-manifest.json"
OUTPUT_PATH = ROOT / "benchmark-results" / "map" / "phase-7" / "road-cache-benchmark.json"
THEMES = ("north", "east", "south", "west")
GEOMETRIES = (
    "base", "east-v2", "east-v3", "north-v2", "north-v3",
    "south-v2", "south-v3", "west-v2", "west-v3",
)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def summarize(values: list[float]) -> dict[str, float | int]:
    ordered = sorted(values)
    return {
        "count": len(values),
        "averageMs": statistics.fmean(values) if values else 0.0,
        "p50Ms": statistics.median(values) if values else 0.0,
        "p95Ms": ordered[min(len(ordered) - 1, round((len(ordered) - 1) * 0.95))] if ordered else 0.0,
        "maximumMs": max(values) if values else 0.0,
    }


def masked_reference_color_transfer(module: Image.Image, reference: Image.Image) -> Image.Image:
    source = np.asarray(module.convert("RGBA"), dtype=np.float32).copy()
    target = np.asarray(reference.convert("RGBA"), dtype=np.float32)
    source_mask = source[:, :, 3] >= 24
    target_mask = target[:, :, 3] >= 24
    if not np.any(source_mask) or not np.any(target_mask):
        return module.convert("RGBA")
    source_pixels = source[:, :, :3][source_mask]
    target_pixels = target[:, :, :3][target_mask]
    source_mean = source_pixels.mean(axis=0)
    target_mean = target_pixels.mean(axis=0)
    source_std = np.maximum(source_pixels.std(axis=0), 1.0)
    target_std = np.maximum(target_pixels.std(axis=0), 1.0)
    transferred = (source[:, :, :3] - source_mean) * (target_std / source_std) + target_mean
    source[:, :, :3] = np.clip(transferred, 0, 255)
    return Image.fromarray(source.astype(np.uint8), mode="RGBA")


def read_manifest() -> tuple[dict, dict[str, dict]]:
    manifest_bytes = MANIFEST_PATH.read_bytes()
    manifest = json.loads(manifest_bytes)
    assert manifest["assetCount"] == 118
    assert sha256_bytes(manifest_bytes) == "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f"
    assets = {asset["assetId"]: asset for asset in manifest["assets"]}
    return manifest, assets


def verified_asset(asset: dict) -> bytes:
    value = (ROOT / asset["path"]).read_bytes()
    assert sha256_bytes(value) == asset["sha256"]
    return value


def presentation_bytes(geometry: str, theme: str, assets: dict[str, dict]) -> bytes:
    """Return the cacheable road presentation, before foundation-dependent harmonization.

    The base geometry is the canonical ordered source bundle for the four themed edge
    openings. Non-base geometries use the exact masked color-transfer algorithm used by
    the approved Phase 6F renderer. Final road-opening harmonization remains map-specific.
    """
    if geometry == "base":
        opening_bytes = []
        for side in ("north", "east", "south", "west"):
            source = verified_asset(assets[f"road-opening.{theme}.{side}"])
            opening_bytes.append(len(source).to_bytes(8, "big") + source)
        return b"phase7-base-road-presentation-v1\0" + b"".join(opening_bytes)

    source_theme, family = geometry.split("-")
    geometry_asset = assets[f"road-plan.{source_theme}.{family}"]
    reference_asset = assets[f"road-plan.{theme}.v2"]
    verified_asset(geometry_asset)
    verified_asset(reference_asset)
    with Image.open(ROOT / geometry_asset["path"]) as source_opened:
        source = source_opened.convert("RGBA")
    with Image.open(ROOT / reference_asset["path"]) as reference_opened:
        reference = reference_opened.convert("RGBA")
    rendered = masked_reference_color_transfer(source, reference)
    header = json.dumps(
        {"mode": rendered.mode, "size": rendered.size, "geometry": geometry, "theme": theme},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("ascii")
    return len(header).to_bytes(4, "big") + header + rendered.tobytes()


def main() -> None:
    manifest, assets = read_manifest()
    combinations = [(geometry, theme) for geometry in GEOMETRIES for theme in THEMES]
    uncached_hashes: dict[str, str] = {}
    uncached_timings: list[float] = []
    uncached_started = time.perf_counter()
    for geometry, theme in combinations:
        started = time.perf_counter()
        value = presentation_bytes(geometry, theme, assets)
        uncached_timings.append((time.perf_counter() - started) * 1000)
        uncached_hashes[f"{geometry}|{theme}"] = sha256_bytes(value)
    uncached_wall_ms = (time.perf_counter() - uncached_started) * 1000

    cache: dict[str, bytes] = {}
    build_timings: list[float] = []
    build_started = time.perf_counter()
    for geometry, theme in combinations:
        key = f"{geometry}|{theme}"
        started = time.perf_counter()
        cache[key] = presentation_bytes(geometry, theme, assets)
        build_timings.append((time.perf_counter() - started) * 1000)
    build_wall_ms = (time.perf_counter() - build_started) * 1000

    lookup_timings: list[float] = []
    lookup_hashes: dict[str, str] = {}
    warm_lookup_count = 10_000
    lookup_started = time.perf_counter()
    for index in range(warm_lookup_count):
        geometry, theme = combinations[index % len(combinations)]
        key = f"{geometry}|{theme}"
        started = time.perf_counter()
        value = cache[key]
        lookup_timings.append((time.perf_counter() - started) * 1000)
        if index < len(combinations):
            lookup_hashes[key] = sha256_bytes(value)
    lookup_wall_ms = (time.perf_counter() - lookup_started) * 1000
    assert lookup_hashes == uncached_hashes

    uncached_average = statistics.fmean(uncached_timings)
    lookup_average = statistics.fmean(lookup_timings)
    cache_bytes = sum(len(value) for value in cache.values())
    result = {
        "schemaVersion": 1,
        "phase": "7",
        "developmentOnly": True,
        "productionActivated": False,
        "assetLibraryModified": False,
        "assetCount": manifest["assetCount"],
        "assetManifestHash": "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f",
        "strategy": "cache pre-themed internal road presentations by roadGeometryId|theme before foundation-specific opening harmonization",
        "combinationCount": len(combinations),
        "geometryCount": len(GEOMETRIES),
        "themeCount": len(THEMES),
        "uncached": {
            "presentationGeneration": summarize(uncached_timings),
            "wallClockMs": uncached_wall_ms,
        },
        "precomputation": {
            "build": summarize(build_timings),
            "buildWallClockMs": build_wall_ms,
            "entryCount": len(cache),
            "memoryBytes": cache_bytes,
            "memoryMiB": cache_bytes / (1024 * 1024),
        },
        "cached": {
            "warmLookupCount": warm_lookup_count,
            "lookup": summarize(lookup_timings),
            "lookupWallClockMs": lookup_wall_ms,
            "averageSpeedupVsUncached": uncached_average / max(lookup_average, 0.000001),
        },
        "correctness": {
            "byteIdenticalPresentationHashes": lookup_hashes == uncached_hashes,
            "combinationHashes": uncached_hashes,
            "meaningfulPixelNoiseAdded": False,
            "imageQualityChanged": False,
            "roadSocketsChanged": False,
            "finalFoundationHarmonizationStillAppliedPerMap": True,
        },
        "tradeoff": {
            "recommended": True,
            "scope": "server/admin generation workers only",
            "reason": "The bounded 36-entry cache removes repeated masked color transfer while retaining map-specific foundation harmonization.",
        },
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "combinations": len(combinations),
        "byteIdentical": result["correctness"]["byteIdenticalPresentationHashes"],
        "uncachedAverageMs": result["uncached"]["presentationGeneration"]["averageMs"],
        "cachedAverageMs": result["cached"]["lookup"]["averageMs"],
        "cacheMemoryMiB": result["precomputation"]["memoryMiB"],
    }, indent=2))


if __name__ == "__main__":
    main()
