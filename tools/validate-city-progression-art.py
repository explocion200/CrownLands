"""Validate the corrected Crownlands city progression asset contract."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
STAGES = ("shack", "fort", "keep", "castle", "city")
EXPECTED_HEIGHTS = (500, 555, 610, 645, 750)
DESKTOP_BOXES = (66, 69, 72, 75, 78)
SOURCE_SIZE = (768, 768)
RUNTIME_SIZE = (256, 256)


def alpha_bounds(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int]:
    bounds = image.getchannel("A").point(lambda value: 255 if value >= threshold else 0).getbbox()
    if not bounds:
        raise AssertionError("City source has no visible pixels")
    return bounds


def component_count(image: Image.Image, threshold: int = 32) -> int:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited = set()
    count = 0
    for y in range(alpha.height):
        for x in range(alpha.width):
            if pixels[x, y] < threshold or (x, y) in visited:
                continue
            count += 1
            pending = [(x, y)]
            visited.add((x, y))
            while pending:
                px, py = pending.pop()
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < alpha.width and 0 <= ny < alpha.height and pixels[nx, ny] >= threshold and (nx, ny) not in visited:
                        visited.add((nx, ny))
                        pending.append((nx, ny))
    return count


def main() -> None:
    manifest = json.loads((ROOT / "assets/optimized/manifest.json").read_text(encoding="utf-8"))
    entries = {entry["id"]: entry for entry in manifest["assets"]}
    game_js = (ROOT / "game.js").read_text(encoding="utf-8")
    styles = (ROOT / "styles.css").read_text(encoding="utf-8")
    optimizer = (ROOT / "tools/optimize-game-art.py").read_text(encoding="utf-8")
    visible_heights = []
    visible_widths = []
    visible_areas = []

    for index, name in enumerate(STAGES):
        source_path = ROOT / "assets/castles" / f"{name}.png"
        with Image.open(source_path) as opened:
            image = opened.convert("RGBA")
        assert image.size == SOURCE_SIZE, f"{name}: source canvas is {image.size}, expected {SOURCE_SIZE}"
        bounds = alpha_bounds(image)
        width = bounds[2] - bounds[0]
        height = bounds[3] - bounds[1]
        area = sum(image.getchannel("A").histogram()[24:])
        assert height == EXPECTED_HEIGHTS[index], f"{name}: visible height {height}, expected {EXPECTED_HEIGHTS[index]}"
        assert component_count(image) == 1, f"{name}: detached visible components found"
        assert bounds[0] > 0 and bounds[1] > 0 and bounds[2] < 768 and bounds[3] < 768, f"{name}: artwork touches source edge"
        visible_heights.append(height * DESKTOP_BOXES[index] / SOURCE_SIZE[1])
        visible_widths.append(width * DESKTOP_BOXES[index] / SOURCE_SIZE[0])
        visible_areas.append(area * (DESKTOP_BOXES[index] / SOURCE_SIZE[0]) ** 2)

        entry = entries[f"castle-{name}"]
        assert entry["category"] == "city-object", f"{name}: optimized category is not city-object"
        assert (entry["width"], entry["height"]) == RUNTIME_SIZE, f"{name}: optimized canvas is not 256x256"
        assert entry["hasAlpha"], f"{name}: optimized asset lost alpha"
        runtime_path = ROOT / entry["output"]
        assert runtime_path.exists(), f"{name}: optimized runtime file is missing"
        with Image.open(runtime_path) as opened:
            assert opened.size == RUNTIME_SIZE, f"{name}: runtime file dimensions are incorrect"
            assert "A" in opened.getbands(), f"{name}: runtime file has no alpha channel"
        assert entry["output"] in game_js, f"{name}: game.js does not reference the manifest output"
        assert f'.city-node.castle-stage-{index + 1} {{ --city-art-size: {DESKTOP_BOXES[index]}px; }}' in styles

    assert all(later > earlier for earlier, later in zip(visible_heights, visible_heights[1:])), visible_heights
    assert all(later > earlier for earlier, later in zip(visible_widths, visible_widths[1:])), visible_widths
    assert all(later > earlier for earlier, later in zip(visible_areas, visible_areas[1:])), visible_areas
    assert visible_heights[-1] >= visible_heights[-2] * 1.15, "Stage 5 is not at least 15% taller than Stage 4 in-game"
    assert '"city-object"' in optimizer and optimizer.count('"city-object"') >= 6, "Optimizer fixed-layout city category is missing"
    print("City progression art validation passed.")
    print("Desktop visible sizes: " + ", ".join(
        f"S{index + 1} {width:.1f}x{height:.1f}px"
        for index, (width, height) in enumerate(zip(visible_widths, visible_heights))
    ))


if __name__ == "__main__":
    main()
