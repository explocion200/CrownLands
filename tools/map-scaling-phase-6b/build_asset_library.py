"""Build the Phase 6B development-only modular Crownlands raster library.

The approved Phase 6A directional slices are immutable source masters.  Edge,
road, and interior modules are deterministic derivatives of those masters.
Only the four quiet foundation plates and two optional pond sources were
created as new opaque raster sources for Phase 6B.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


MAP_SIZE = (1448, 1086)
LIBRARY_VERSION = "phase6b-modular-crownlands-v1"
EDGE_DEPTH = 196
ROAD_HALF_SPAN = 160
ROAD_VERTICAL_DEPTH = 440
ROAD_HORIZONTAL_DEPTH = 560
FEATHER = 28


THEMES = {
    "west": {
        "id": "west_grassy",
        "label": "West / grassy temperate",
        "edge_family": "grassy_mixed_rock_tree",
        "master": "benchmark-results/map/phase-6a-v3-directional/source/west-grassy-1448x1086.png",
        "foundation": "tools/map-scaling-phase-6b/source/foundations/west-grassy.png",
        "accent_crops": [
            ("farmland-a", "farmland", (865, 95, 1145, 235), 78, 48),
            ("farmland-b", "farmland", (205, 680, 475, 870), 78, 52),
            ("temperate-rocks-a", "rocks", (210, 105, 425, 260), 62, 42),
            ("temperate-rocks-b", "low_hills", (990, 190, 1215, 350), 70, 44),
            ("temperate-woodland-a", "woodland", (330, 190, 555, 365), 72, 52),
            ("temperate-woodland-b", "vegetation", (860, 620, 1095, 805), 75, 54),
        ],
        "water": ("meadow-pond", "water", "tools/map-scaling-phase-6b/source/water/west-meadow-pond.png", (480, 335, 970, 715), 120, 78),
    },
    "north": {
        "id": "north_light_winter",
        "label": "North / light winter",
        "edge_family": "winter_rock_sparse_tree",
        "master": "benchmark-results/map/phase-6a-v3-directional/source/north-light-winter-1448x1086.png",
        "foundation": "tools/map-scaling-phase-6b/source/foundations/north-light-winter.png",
        "accent_crops": [
            ("winter-trees-a", "winter_vegetation", (345, 155, 570, 345), 68, 52),
            ("winter-trees-b", "winter_vegetation", (840, 540, 1065, 725), 68, 50),
            ("winter-rocks-a", "rocks", (265, 365, 475, 525), 64, 42),
            ("winter-rocks-b", "low_hills", (975, 315, 1195, 485), 76, 46),
            ("winter-coppice", "woodland", (820, 650, 1035, 830), 66, 50),
            ("frost-ground", "ground_accent", (540, 190, 850, 390), 82, 48),
        ],
    },
    "east": {
        "id": "east_tropical",
        "label": "East / tropical lush",
        "edge_family": "tropical_mixed_rock_vegetation",
        "master": "benchmark-results/map/phase-6a-v3-directional/source/east-tropical-1448x1086.png",
        "foundation": "tools/map-scaling-phase-6b/source/foundations/east-tropical.png",
        "accent_crops": [
            ("tropical-palms-a", "tropical_vegetation", (345, 135, 580, 335), 72, 56),
            ("tropical-palms-b", "tropical_vegetation", (830, 615, 1065, 810), 76, 58),
            ("lush-rocks-a", "rocks", (790, 90, 1020, 260), 66, 44),
            ("lush-rocks-b", "low_hills", (960, 215, 1190, 390), 70, 46),
            ("lush-coppice", "woodland", (285, 270, 520, 445), 70, 50),
            ("lush-ground", "ground_accent", (570, 430, 870, 640), 80, 48),
        ],
        "water": ("tropical-pond", "water", "tools/map-scaling-phase-6b/source/water/east-tropical-pond.png", (480, 335, 970, 715), 120, 78),
    },
    "south": {
        "id": "south_dry_frontier",
        "label": "South / dry frontier",
        "edge_family": "dry_rock_scrub",
        "master": "benchmark-results/map/phase-6a-v3-directional/source/south-dry-frontier-1448x1086.png",
        "foundation": "tools/map-scaling-phase-6b/source/foundations/south-dry-frontier.png",
        "accent_crops": [
            ("dry-fields-a", "farmland", (860, 105, 1175, 270), 82, 50),
            ("dry-fields-b", "farmland", (195, 670, 480, 845), 78, 48),
            ("dry-rocks-a", "rocks", (420, 320, 645, 485), 72, 45),
            ("dry-ridge", "low_hills", (760, 330, 1015, 500), 88, 46),
            ("dry-scrub-a", "dry_vegetation", (760, 610, 1010, 790), 72, 48),
            ("dry-scrub-b", "dry_vegetation", (1050, 490, 1270, 655), 66, 44),
        ],
    },
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_png(image: Image.Image, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG", optimize=True)


def feather_mask(size: tuple[int, int], edges: tuple[bool, bool, bool, bool], amount: int = FEATHER) -> Image.Image:
    """Return an L mask; edges are left, top, right, bottom fade toggles."""
    width, height = size
    mask = Image.new("L", size, 255)
    pixels = mask.load()
    for y in range(height):
        for x in range(width):
            factors = [255]
            if edges[0]:
                factors.append(min(255, round(255 * x / max(1, amount))))
            if edges[1]:
                factors.append(min(255, round(255 * y / max(1, amount))))
            if edges[2]:
                factors.append(min(255, round(255 * (width - 1 - x) / max(1, amount))))
            if edges[3]:
                factors.append(min(255, round(255 * (height - 1 - y) / max(1, amount))))
            pixels[x, y] = min(factors)
    return mask.filter(ImageFilter.GaussianBlur(1.2))


def crop_module(source: Image.Image, box: tuple[int, int, int, int], fade_edges: tuple[bool, bool, bool, bool]) -> Image.Image:
    crop = source.crop(box).convert("RGBA")
    crop.putalpha(feather_mask(crop.size, fade_edges))
    return crop


def describe_asset(root: Path, file_path: Path, *, asset_id: str, category: str, theme: str, metadata: dict | None = None) -> dict:
    with Image.open(file_path) as image:
        description = {
            "assetId": asset_id,
            "category": category,
            "theme": theme,
            "path": file_path.relative_to(root).as_posix(),
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "opaque": image.mode == "RGB",
            "bytes": file_path.stat().st_size,
            "sha256": sha256_file(file_path),
            "productionQualityCandidate": True,
            "productionActivated": False,
        }
    if metadata:
        description.update(metadata)
    return description


def build(root: Path, output: Path) -> dict:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    assets: list[dict] = []
    width, height = MAP_SIZE
    center_x, center_y = width // 2, height // 2
    opening_left = center_x - ROAD_HALF_SPAN
    opening_right = center_x + ROAD_HALF_SPAN
    opening_top = center_y - ROAD_HALF_SPAN
    opening_bottom = center_y + ROAD_HALF_SPAN

    for theme_key, theme in THEMES.items():
        master_path = root / theme["master"]
        foundation_path = root / theme["foundation"]
        with Image.open(master_path) as opened:
            master = opened.convert("RGB")
        with Image.open(foundation_path) as opened:
            foundation = opened.convert("RGB")
        if master.size != MAP_SIZE or foundation.size != MAP_SIZE:
            raise ValueError(f"{theme_key} source dimensions drifted from {MAP_SIZE}.")

        destination = output / "foundations" / f"{theme_key}.png"
        save_png(foundation, destination)
        assets.append(describe_asset(root, destination, asset_id=f"foundation.{theme_key}", category="foundation", theme=theme_key, metadata={"family": theme["id"], "fullMap": True}))

        segment_specs = {
            "north-west": ((0, 0, opening_left + 40, EDGE_DEPTH), (False, False, True, True), (0, 0)),
            "north-east": ((opening_right - 40, 0, width, EDGE_DEPTH), (True, False, False, True), (opening_right - 40, 0)),
            "south-west": ((0, height - EDGE_DEPTH, opening_left + 40, height), (False, True, True, False), (0, height - EDGE_DEPTH)),
            "south-east": ((opening_right - 40, height - EDGE_DEPTH, width, height), (True, True, False, False), (opening_right - 40, height - EDGE_DEPTH)),
            "west-north": ((0, EDGE_DEPTH - 40, EDGE_DEPTH, opening_top + 40), (False, True, True, True), (0, EDGE_DEPTH - 40)),
            "west-south": ((0, opening_bottom - 40, EDGE_DEPTH, height - EDGE_DEPTH + 40), (False, True, True, True), (0, opening_bottom - 40)),
            "east-north": ((width - EDGE_DEPTH, EDGE_DEPTH - 40, width, opening_top + 40), (True, True, False, True), (width - EDGE_DEPTH, EDGE_DEPTH - 40)),
            "east-south": ((width - EDGE_DEPTH, opening_bottom - 40, width, height - EDGE_DEPTH + 40), (True, True, False, True), (width - EDGE_DEPTH, opening_bottom - 40)),
        }
        for key, (box, fades, position) in segment_specs.items():
            segment = crop_module(master, box, fades)
            segment_path = output / "barriers" / theme_key / f"{key}.png"
            save_png(segment, segment_path)
            side = key.split("-")[0]
            assets.append(describe_asset(root, segment_path, asset_id=f"barrier.{theme_key}.{key}", category="perimeter_barrier", theme=theme_key, metadata={
                "family": theme["edge_family"], "side": side, "placement": {"x": position[0], "y": position[1]}, "touchesImageBoundary": True,
            }))

        road_specs = {
            "north": ((center_x - ROAD_HALF_SPAN, 0, center_x + ROAD_HALF_SPAN, ROAD_VERTICAL_DEPTH), (True, False, True, True), (center_x - ROAD_HALF_SPAN, 0)),
            "east": ((width - ROAD_HORIZONTAL_DEPTH, center_y - ROAD_HALF_SPAN, width, center_y + ROAD_HALF_SPAN), (True, True, False, True), (width - ROAD_HORIZONTAL_DEPTH, center_y - ROAD_HALF_SPAN)),
            "south": ((center_x - ROAD_HALF_SPAN, height - ROAD_VERTICAL_DEPTH, center_x + ROAD_HALF_SPAN, height), (True, True, True, False), (center_x - ROAD_HALF_SPAN, height - ROAD_VERTICAL_DEPTH)),
            "west": ((0, center_y - ROAD_HALF_SPAN, ROAD_HORIZONTAL_DEPTH, center_y + ROAD_HALF_SPAN), (False, True, True, True), (0, center_y - ROAD_HALF_SPAN)),
        }
        for side, (box, fades, position) in road_specs.items():
            road = crop_module(master, box, fades)
            road_path = output / "road-openings" / theme_key / f"{side}.png"
            save_png(road, road_path)
            assets.append(describe_asset(root, road_path, asset_id=f"road-opening.{theme_key}.{side}", category="road_opening", theme=theme_key, metadata={
                "side": side, "placement": {"x": position[0], "y": position[1]}, "edgeOpeningCount": 1, "openGateOverlayCompatible": True,
            }))

        # Edge infills are optional mixed rock/vegetation variants.  They are
        # kept narrow and are never allowed to create another road opening.
        infill_boxes = {
            "mixed-a": (70, 0, 360, EDGE_DEPTH),
            "mixed-b": (width - 360, height - EDGE_DEPTH, width - 70, height),
        }
        for key, box in infill_boxes.items():
            infill = crop_module(master, box, (True, True, True, True))
            infill_path = output / "barrier-infills" / theme_key / f"{key}.png"
            save_png(infill, infill_path)
            assets.append(describe_asset(root, infill_path, asset_id=f"barrier-infill.{theme_key}.{key}", category="mixed_edge_variant", theme=theme_key, metadata={"family": theme["edge_family"], "optional": True}))

        for name, category, box, radius_x, radius_y in theme["accent_crops"]:
            accent = crop_module(master, box, (True, True, True, True))
            accent_path = output / "accents" / theme_key / f"{name}.png"
            save_png(accent, accent_path)
            assets.append(describe_asset(root, accent_path, asset_id=f"accent.{theme_key}.{name}", category=category, theme=theme_key, metadata={
                "blockerFootprint": {"rx": radius_x, "ry": radius_y}, "featheredGroundPatch": True,
            }))

        if theme.get("water"):
            name, category, water_source, box, radius_x, radius_y = theme["water"]
            with Image.open(root / water_source) as opened:
                source = opened.convert("RGB")
            accent = crop_module(source, box, (True, True, True, True))
            accent_path = output / "accents" / theme_key / f"{name}.png"
            save_png(accent, accent_path)
            assets.append(describe_asset(root, accent_path, asset_id=f"accent.{theme_key}.{name}", category=category, theme=theme_key, metadata={
                "blockerFootprint": {"rx": radius_x, "ry": radius_y}, "featheredGroundPatch": True, "optional": True,
            }))

    gate_support = {
        "schemaVersion": 1,
        "developmentOnly": True,
        "bakedIntoBackground": False,
        "runtimeOverlayAsset": "assets/optimized/inner-castle-gatehouse-512x512-2a07ac7597ac.webp",
        "openingCenter": {"north": [724, 0], "east": [1448, 543], "south": [724, 1086], "west": [0, 543]},
        "reservedRadius": 104,
        "rule": "OPEN shows runtime arrow; GATED shows runtime Gate; background stays immutable",
    }
    gate_path = output / "gate-support.json"
    gate_path.write_text(json.dumps(gate_support, indent=2) + "\n", encoding="utf-8")

    category_counts: dict[str, int] = {}
    theme_counts: dict[str, int] = {}
    for asset in assets:
        category_counts[asset["category"]] = category_counts.get(asset["category"], 0) + 1
        theme_counts[asset["theme"]] = theme_counts.get(asset["theme"], 0) + 1
    manifest = {
        "schemaVersion": 1,
        "assetLibraryVersion": LIBRARY_VERSION,
        "developmentOnly": True,
        "productionQualityCandidate": True,
        "productionActivated": False,
        "approvedStyleSource": "Phase 6A v3 directional approval slices",
        "mapDimensions": {"width": MAP_SIZE[0], "height": MAP_SIZE[1]},
        "assetCount": len(assets),
        "categoryCounts": category_counts,
        "themeCounts": theme_counts,
        "gateSupport": gate_path.relative_to(root).as_posix(),
        "themes": {key: {
            "id": value["id"],
            "label": value["label"],
            "edgeFamily": value["edge_family"],
            "approvedMaster": value["master"],
            "approvedMasterSha256": sha256_file(root / value["master"]),
            "foundationSource": value["foundation"],
            "foundationSourceSha256": sha256_file(root / value["foundation"]),
        } for key, value in THEMES.items()},
        "assets": sorted(assets, key=lambda item: item["assetId"]),
    }
    manifest_path = output / "asset-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": manifest_path.as_posix(), "assetCount": len(assets), "categoryCounts": category_counts}, separators=(",", ":")))
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    root = arguments.root.resolve()
    output = (arguments.output or (root / "benchmark-results/map/phase-6b/asset-library")).resolve()
    build(root, output)


if __name__ == "__main__":
    main()
