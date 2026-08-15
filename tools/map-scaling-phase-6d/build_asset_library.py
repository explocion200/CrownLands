"""Build the Phase 6D development-only 118-asset macro-variation library.

The approved 86 Phase 6B assets remain immutable and are referenced in place.
Phase 6D contributes exactly eight foundations, sixteen full-side perimeter
alternates, and eight internal-road modules.  No interior accent is added.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, ImageStat


MAP_SIZE = (1448, 1086)
LIBRARY_VERSION = "phase6d-macro-variation-v1"
EDGE_DEPTH = 196
ROAD_HALF_WIDTH = 44
ROAD_SOCKET_DEPTH = 220
THEMES = ("west", "north", "east", "south")
SIDES = ("north", "east", "south", "west")

SOURCE_FOUNDATIONS = {
    theme: {
        variant: f"tools/map-scaling-phase-6d/source/foundations/{theme}-{variant}-raw.png"
        for variant in ("v2", "v3")
    }
    for theme in THEMES
}

APPROVED_MASTERS = {
    "west": "benchmark-results/map/phase-6a-v3-directional/source/west-grassy-1448x1086.png",
    "north": "benchmark-results/map/phase-6a-v3-directional/source/north-light-winter-1448x1086.png",
    "east": "benchmark-results/map/phase-6a-v3-directional/source/east-tropical-1448x1086.png",
    "south": "benchmark-results/map/phase-6a-v3-directional/source/south-dry-frontier-1448x1086.png",
}

ROAD_JUNCTIONS = {
    "west": {"v2": (648, 506), "v3": (812, 612)},
    "north": {"v2": (650, 594), "v3": (804, 466)},
    "east": {"v2": (792, 500), "v3": (638, 620)},
    "south": {"v2": (686, 468), "v3": (808, 606)},
}

ROAD_COLORS = {
    "west": (184, 157, 91),
    "north": (190, 171, 132),
    "east": (177, 146, 77),
    "south": (187, 148, 78),
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


def normalize_foundation_macro_texture(image: Image.Image) -> Image.Image:
    """Keep painterly detail while removing any AI plate-like tonal seams."""
    local_tone = image.filter(ImageFilter.GaussianBlur(24))
    natural_broad_tone = local_tone.filter(ImageFilter.GaussianBlur(72))
    painterly_detail = ImageChops.subtract(image, local_tone, scale=1.0, offset=128)
    return ImageChops.add(natural_broad_tone, painterly_detail, scale=1.0, offset=-128).convert("RGB")


def describe_asset(root: Path, file_path: Path, *, asset_id: str, category: str, theme: str, metadata: dict) -> dict:
    with Image.open(file_path) as image:
        return {
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
            **metadata,
        }


def side_box(side: str) -> tuple[int, int, int, int]:
    width, height = MAP_SIZE
    return {
        "north": (0, 0, width, EDGE_DEPTH),
        "east": (width - EDGE_DEPTH, 0, width, height),
        "south": (0, height - EDGE_DEPTH, width, height),
        "west": (0, 0, EDGE_DEPTH, height),
    }[side]


def side_placement(side: str) -> dict:
    width, height = MAP_SIZE
    return {
        "north": {"x": 0, "y": 0},
        "east": {"x": width - EDGE_DEPTH, "y": 0},
        "south": {"x": 0, "y": height - EDGE_DEPTH},
        "west": {"x": 0, "y": 0},
    }[side]


def perimeter_alpha(size: tuple[int, int], side: str) -> Image.Image:
    width, height = size
    alpha = Image.new("L", size, 255)
    pixels = alpha.load()
    fade = 34
    if side in ("north", "south"):
        for y in range(height):
            inner = height - 1 - y if side == "north" else y
            factor = min(255, round(255 * inner / fade))
            for x in range(width):
                pixels[x, y] = min(pixels[x, y], factor)
        opening_left = MAP_SIZE[0] // 2 - 160
        opening_right = MAP_SIZE[0] // 2 + 160
        ImageDraw.Draw(alpha).rectangle((opening_left, 0, opening_right, height), fill=0)
    else:
        for x in range(width):
            inner = width - 1 - x if side == "west" else x
            factor = min(255, round(255 * inner / fade))
            for y in range(height):
                pixels[x, y] = min(pixels[x, y], factor)
        opening_top = MAP_SIZE[1] // 2 - 160
        opening_bottom = MAP_SIZE[1] // 2 + 160
        ImageDraw.Draw(alpha).rectangle((0, opening_top, width, opening_bottom), fill=0)
    return alpha.filter(ImageFilter.GaussianBlur(1.4))


def build_perimeter_alternate(master: Image.Image, side: str) -> Image.Image:
    module = master.crop(side_box(side)).convert("RGBA")
    if side in ("north", "south"):
        module = ImageOps.mirror(module)
    else:
        module = ImageOps.flip(module)
    module.putalpha(perimeter_alpha(module.size, side))
    return module


def road_paths(theme: str, variant: str) -> list[dict]:
    junction_x, junction_y = ROAD_JUNCTIONS[theme][variant]
    variant_bias = -1 if variant == "v2" else 1
    theme_bias = {"west": -18, "north": 14, "east": 28, "south": -30}[theme]
    return [
        {
            "id": "road-north", "side": "north", "halfWidth": ROAD_HALF_WIDTH,
            "points": [
                {"x": 724, "y": 0}, {"x": 724, "y": ROAD_SOCKET_DEPTH},
                {"x": junction_x - 92 * variant_bias, "y": 342 + theme_bias},
                {"x": junction_x, "y": junction_y},
            ],
        },
        {
            "id": "road-east", "side": "east", "halfWidth": ROAD_HALF_WIDTH,
            "points": [
                {"x": 1448, "y": 543}, {"x": 1448 - ROAD_SOCKET_DEPTH, "y": 543},
                {"x": junction_x + 190, "y": junction_y - 82 * variant_bias},
                {"x": junction_x, "y": junction_y},
            ],
        },
        {
            "id": "road-south", "side": "south", "halfWidth": ROAD_HALF_WIDTH,
            "points": [
                {"x": 724, "y": 1086}, {"x": 724, "y": 1086 - ROAD_SOCKET_DEPTH},
                {"x": junction_x + 86 * variant_bias, "y": junction_y + 178},
                {"x": junction_x, "y": junction_y},
            ],
        },
        {
            "id": "road-west", "side": "west", "halfWidth": ROAD_HALF_WIDTH,
            "points": [
                {"x": 0, "y": 543}, {"x": ROAD_SOCKET_DEPTH, "y": 543},
                {"x": junction_x - 184, "y": junction_y + 78 * variant_bias},
                {"x": junction_x, "y": junction_y},
            ],
        },
    ]


def draw_road_module(foundation: Image.Image, theme: str, variant: str, paths: list[dict]) -> Image.Image:
    canvas = Image.new("RGBA", MAP_SIZE, (0, 0, 0, 0))
    shadow_mask = Image.new("L", MAP_SIZE, 0)
    core_mask = Image.new("L", MAP_SIZE, 0)
    shadow_draw = ImageDraw.Draw(shadow_mask)
    core_draw = ImageDraw.Draw(core_mask)
    for road in paths:
        points = [(round(point["x"]), round(point["y"])) for point in road["points"]]
        shadow_draw.line(points, fill=112, width=104, joint="curve")
        core_draw.line(points, fill=244, width=82, joint="curve")
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(13))
    core_mask = core_mask.filter(ImageFilter.GaussianBlur(7))
    shadow = Image.new("RGBA", MAP_SIZE, (73, 60, 35, 0))
    shadow.putalpha(shadow_mask.point(lambda value: round(value * 0.23)))
    canvas.alpha_composite(shadow)

    quiet = foundation.convert("RGB").filter(ImageFilter.GaussianBlur(0.65))
    road_tone = Image.new("RGB", MAP_SIZE, ROAD_COLORS[theme])
    textured = ImageChops.blend(quiet, road_tone, 0.62)
    stat = ImageStat.Stat(textured.resize((32, 24), Image.Resampling.BILINEAR))
    if max(stat.stddev) < 0.5:
        raise ValueError(f"{theme} {variant} road texture lost painterly variation")
    road_rgba = textured.convert("RGBA")
    road_rgba.putalpha(core_mask)
    canvas.alpha_composite(road_rgba)
    return canvas


def build(root: Path, output: Path) -> dict:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    base_manifest_path = root / "benchmark-results/map/phase-6b/asset-library/asset-manifest.json"
    base_manifest = json.loads(base_manifest_path.read_text(encoding="utf-8"))
    if base_manifest.get("assetCount") != 86:
        raise ValueError("Phase 6D requires the approved 86-asset Phase 6B library.")
    assets = [dict(asset) for asset in base_manifest["assets"]]
    additions: list[dict] = []

    for theme in THEMES:
        master_path = root / APPROVED_MASTERS[theme]
        with Image.open(master_path) as opened:
            master = opened.convert("RGB")
        if master.size != MAP_SIZE:
            raise ValueError(f"Approved {theme} master dimensions drifted.")
        base_foundation_asset = next(asset for asset in base_manifest["assets"] if asset["assetId"] == f"foundation.{theme}")
        with Image.open(root / base_foundation_asset["path"]) as opened:
            base_foundation = opened.convert("RGB")
        foundation_images: dict[str, Image.Image] = {}
        for variant in ("v2", "v3"):
            source_path = root / SOURCE_FOUNDATIONS[theme][variant]
            with Image.open(source_path) as opened:
                foundation = opened.convert("RGB")
            if foundation.size != MAP_SIZE:
                raise ValueError(f"{theme} {variant} foundation must be 1448x1086.")
            # The ImageGen plate supplies meaningful macro organization while
            # the locked Phase 6B plate anchors palette/frequency consistency.
            foundation = normalize_foundation_macro_texture(Image.blend(base_foundation, foundation, 0.52))
            foundation_images[variant] = foundation
            destination = output / "foundations" / f"{theme}-{variant}.png"
            save_png(foundation, destination)
            additions.append(describe_asset(
                root, destination,
                asset_id=f"foundation.{theme}.{variant}", category="foundation", theme=theme,
                metadata={
                    "family": base_manifest["themes"][theme]["id"], "fullMap": True,
                    "macroVariation": variant, "source": SOURCE_FOUNDATIONS[theme][variant],
                    "sourceSha256": sha256_file(source_path),
                },
            ))

        for side in SIDES:
            alternate = build_perimeter_alternate(master, side)
            destination = output / "perimeter-alternates" / theme / f"{side}.png"
            save_png(alternate, destination)
            additions.append(describe_asset(
                root, destination,
                asset_id=f"barrier-alt.{theme}.{side}", category="perimeter_barrier_variant", theme=theme,
                metadata={
                    "family": base_manifest["themes"][theme]["edgeFamily"], "side": side,
                    "placement": side_placement(side), "touchesImageBoundary": True,
                    "replacementForBaseSidePair": True, "edgeOpeningCount": 1,
                },
            ))

        for variant in ("v2", "v3"):
            paths = road_paths(theme, variant)
            module = draw_road_module(foundation_images[variant], theme, variant, paths)
            destination = output / "internal-roads" / theme / f"{variant}.png"
            save_png(module, destination)
            additions.append(describe_asset(
                root, destination,
                asset_id=f"road-plan.{theme}.{variant}", category="internal_road_module", theme=theme,
                metadata={
                    "roadPlanFamily": variant, "socketDepth": ROAD_SOCKET_DEPTH,
                    "socketCenters": base_manifest["themes"][theme].get("socketCenters", {
                        "north": [724, 0], "east": [1448, 543], "south": [724, 1086], "west": [0, 543],
                    }),
                    "roadPaths": paths, "edgeOpeningCountPerSide": 1,
                },
            ))

    if len(additions) != 32:
        raise ValueError(f"Phase 6D must add exactly 32 assets, built {len(additions)}.")
    if Counter(asset["category"] for asset in additions) != Counter({
        "foundation": 8, "perimeter_barrier_variant": 16, "internal_road_module": 8,
    }):
        raise ValueError("Phase 6D addition categories drifted from the locked 8/16/8 expansion.")
    assets.extend(additions)
    category_counts = dict(sorted(Counter(asset["category"] for asset in assets).items()))
    theme_counts = dict(sorted(Counter(asset["theme"] for asset in assets).items()))
    manifest = {
        "schemaVersion": 1,
        "assetLibraryVersion": LIBRARY_VERSION,
        "developmentOnly": True,
        "productionQualityCandidate": True,
        "productionActivated": False,
        "approvedStyleSource": "Phase 6A v3 directional approval slices; Phase 6B art direction locked",
        "baseLibrary": {
            "assetLibraryVersion": base_manifest["assetLibraryVersion"],
            "manifest": base_manifest_path.relative_to(root).as_posix(),
            "assetCount": 86,
            "sha256": sha256_file(base_manifest_path),
            "modified": False,
        },
        "lockedExpansion": {
            "foundations": 8, "perimeterEdgeSegments": 16,
            "internalRoadModules": 8, "interiorAccents": 0,
        },
        "mapDimensions": {"width": MAP_SIZE[0], "height": MAP_SIZE[1]},
        "assetCount": len(assets),
        "categoryCounts": category_counts,
        "themeCounts": theme_counts,
        "gateSupport": base_manifest["gateSupport"],
        "themes": base_manifest["themes"],
        "newAssetIds": sorted(asset["assetId"] for asset in additions),
        "assets": sorted(assets, key=lambda asset: asset["assetId"]),
    }
    if manifest["assetCount"] != 118:
        raise ValueError(f"Expected the locked 118-asset library, built {manifest['assetCount']}.")
    manifest_path = output / "asset-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "manifest": manifest_path.as_posix(), "assetCount": len(assets),
        "newAssets": len(additions), "categoryCounts": category_counts,
    }, separators=(",", ":")))
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    root = arguments.root.resolve()
    output = (arguments.output or root / "benchmark-results/map/phase-6d/asset-library").resolve()
    build(root, output)


if __name__ == "__main__":
    main()
