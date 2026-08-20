#!/usr/bin/env python3
"""Normalize approved PNG charges, trace them, and build the runtime flag sprite.

The production renderer loads one same-origin SVG sprite for the approved selectable
symbols. Legacy-only fallback geometry remains inline so historical player-data IDs
continue to render without being offered by the editor.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import sys

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "assets" / "flag-symbols" / "selected" / "manifest.json"
INDEX_PATH = ROOT / "index.html"
RUNTIME_SPRITE_PATH = ROOT / "assets" / "flag-symbols" / "runtime.svg"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        type=Path,
        help="Directory containing the original user-approved PNG files.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify generated SVGs, the runtime sprite, and inline fallbacks without writing files.",
    )
    return parser.parse_args()


def load_manifest() -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    stable_ids = manifest["stableSymbolIds"]
    if len(stable_ids) != 30 or len(set(stable_ids)) != 30:
        raise ValueError("Manifest must contain exactly 30 unique stable symbol IDs.")

    entries = manifest["entries"]
    selected_ids = [entry["symbolId"] for entry in entries if entry["selected"]]
    if len(selected_ids) != len(set(selected_ids)):
        raise ValueError("Only one selected source is permitted for each symbol ID.")
    if not set(selected_ids).issubset(stable_ids):
        raise ValueError("A selected source references an unknown stable symbol ID.")
    if set(manifest["missingUploadedIds"]) != set(stable_ids) - set(selected_ids):
        raise ValueError("missingUploadedIds does not match selected-source coverage.")
    return manifest


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized_asset_path(entry: dict) -> Path:
    return ROOT / Path(entry["sourceAsset"])


def vector_asset_path(entry: dict) -> Path:
    return ROOT / Path(entry["vectorAsset"])


def normalize_source(source_path: Path, entry: dict, pipeline: dict) -> np.ndarray:
    expected_hash = entry["sourceSha256"]
    actual_hash = sha256(source_path)
    if actual_hash != expected_hash:
        raise ValueError(
            f"Source hash mismatch for {entry['sourceFile']}: {actual_hash} != {expected_hash}"
        )

    with Image.open(source_path) as source:
        if source.size != (entry["sourceWidth"], entry["sourceHeight"]):
            raise ValueError(
                f"Source dimensions changed for {entry['sourceFile']}: {source.size}"
            )
        grayscale = source.convert("L")

    threshold = int(pipeline["threshold"])
    source_pixels = np.asarray(grayscale)
    foreground = source_pixels < threshold
    ys, xs = np.nonzero(foreground)
    if not len(xs):
        raise ValueError(f"No dark artwork detected in {entry['sourceFile']}.")

    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    padding = max(2, round(max(right - left, bottom - top) * 0.06))
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(grayscale.width, right + padding)
    bottom = min(grayscale.height, bottom + padding)
    crop = grayscale.crop((left, top, right, bottom))

    canvas_size = int(pipeline["normalizedCanvas"])
    inner_size = int(pipeline["innerArtwork"])
    scale = min(inner_size / crop.width, inner_size / crop.height)
    resized_size = (
        max(1, round(crop.width * scale)),
        max(1, round(crop.height * scale)),
    )
    resized = crop.resize(resized_size, Image.Resampling.LANCZOS)
    canvas = Image.new("L", (canvas_size, canvas_size), 255)
    origin = ((canvas_size - resized.width) // 2, (canvas_size - resized.height) // 2)
    canvas.paste(resized, origin)
    return np.asarray(canvas) < threshold


def save_transparent_mask(mask: np.ndarray, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    indexed = Image.fromarray(mask.astype(np.uint8), mode="P")
    palette = [0, 0, 0] * 256
    indexed.putpalette(palette)
    indexed.save(output_path, optimize=True, bits=1, transparency=0)


def load_transparent_mask(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        alpha = np.asarray(image.convert("RGBA"))[:, :, 3]
    return alpha > 0


def direction(start: tuple[int, int], end: tuple[int, int]) -> int:
    dx, dy = end[0] - start[0], end[1] - start[1]
    directions = {(1, 0): 0, (0, 1): 1, (-1, 0): 2, (0, -1): 3}
    return directions[(dx, dy)]


def boundary_loops(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    edges: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    for y in range(height):
        for x in range(width):
            if not mask[y, x]:
                continue
            if y == 0 or not mask[y - 1, x]:
                edges.add(((x, y), (x + 1, y)))
            if x == width - 1 or not mask[y, x + 1]:
                edges.add(((x + 1, y), (x + 1, y + 1)))
            if y == height - 1 or not mask[y + 1, x]:
                edges.add(((x + 1, y + 1), (x, y + 1)))
            if x == 0 or not mask[y, x - 1]:
                edges.add(((x, y + 1), (x, y)))

    outgoing: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for start, end in edges:
        outgoing[start].append(end)
    for candidates in outgoing.values():
        candidates.sort()

    unused = set(edges)
    loops: list[list[tuple[int, int]]] = []
    turn_priority = {1: 0, 0: 1, 3: 2, 2: 3}
    for seed in sorted(edges):
        if seed not in unused:
            continue
        start, current = seed
        unused.remove(seed)
        points = [start, current]
        incoming_direction = direction(start, current)

        while current != start:
            candidates = [
                end for end in outgoing[current] if (current, end) in unused
            ]
            if not candidates:
                raise ValueError(f"Open bitmap boundary encountered at {current}.")
            next_point = min(
                candidates,
                key=lambda end: turn_priority[
                    (direction(current, end) - incoming_direction) % 4
                ],
            )
            unused.remove((current, next_point))
            incoming_direction = direction(current, next_point)
            current = next_point
            points.append(current)
            if len(points) > len(edges) + 1:
                raise ValueError("Bitmap boundary traversal did not terminate.")
        loops.append(points[:-1])
    return loops


def polygon_area(points: list[tuple[int, int]]) -> float:
    return 0.5 * sum(
        x1 * y2 - x2 * y1
        for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1])
    )


def remove_collinear(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if len(points) < 4:
        return points
    simplified = []
    count = len(points)
    for index, point in enumerate(points):
        previous = points[(index - 1) % count]
        following = points[(index + 1) % count]
        cross = (
            (point[0] - previous[0]) * (following[1] - point[1])
            - (point[1] - previous[1]) * (following[0] - point[0])
        )
        if cross != 0:
            simplified.append(point)
    return simplified or points


def distance_to_line(
    point: tuple[int, int], start: tuple[int, int], end: tuple[int, int]
) -> float:
    if start == end:
        return math.dist(point, start)
    numerator = abs(
        (end[1] - start[1]) * point[0]
        - (end[0] - start[0]) * point[1]
        + end[0] * start[1]
        - end[1] * start[0]
    )
    return numerator / math.dist(start, end)


def rdp(points: list[tuple[int, int]], epsilon: float) -> list[tuple[int, int]]:
    if len(points) <= 2:
        return points
    distances = [
        distance_to_line(point, points[0], points[-1]) for point in points[1:-1]
    ]
    if not distances:
        return [points[0], points[-1]]
    max_distance = max(distances)
    if max_distance <= epsilon:
        return [points[0], points[-1]]
    split = distances.index(max_distance) + 1
    return rdp(points[: split + 1], epsilon)[:-1] + rdp(points[split:], epsilon)


def simplify_closed_loop(
    points: list[tuple[int, int]], epsilon: float
) -> list[tuple[int, int]]:
    points = remove_collinear(points)
    if len(points) <= 3:
        return points
    anchor = min(points)
    first = max(points, key=lambda point: math.dist(anchor, point))
    second = max(points, key=lambda point: math.dist(first, point))
    first_index = points.index(first)
    rotated = points[first_index:] + points[:first_index]
    second_index = rotated.index(second)
    first_half = rdp(rotated[: second_index + 1], epsilon)
    second_half = rdp(rotated[second_index:] + [rotated[0]], epsilon)
    combined = first_half[:-1] + second_half[:-1]
    return combined if len(combined) >= 3 else points


def format_number(value: float) -> str:
    rounded = round(value, 2)
    if math.isclose(rounded, round(rounded)):
        return str(int(round(rounded)))
    return f"{rounded:.2f}".rstrip("0").rstrip(".")


def trace_path(mask: np.ndarray, epsilon: float) -> str:
    canvas_size = mask.shape[0]
    loops = []
    for loop in boundary_loops(mask):
        if abs(polygon_area(loop)) < 6:
            continue
        simplified = simplify_closed_loop(loop, epsilon)
        if len(simplified) >= 3:
            loops.append(simplified)
    if not loops:
        raise ValueError("No traceable bitmap boundaries found.")

    commands = []
    scale = 100 / canvas_size
    for loop in loops:
        coordinates = [
            (format_number(x * scale), format_number(y * scale)) for x, y in loop
        ]
        commands.append(
            "M" + coordinates[0][0] + " " + coordinates[0][1]
            + "L"
            + " ".join(x + " " + y for x, y in coordinates[1:])
            + "Z"
        )
    return "".join(commands)


def svg_document(path_data: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
        'fill="currentColor">\n'
        f'  <path fill-rule="evenodd" d="{path_data}"/>\n'
        "</svg>\n"
    )


def inline_symbol(symbol_id: str, path_data: str) -> str:
    return (
        f'<symbol id="cl-icon-flag-{symbol_id}" viewBox="0 0 100 100">'
        f'<path fill-rule="evenodd" d="{path_data}"/></symbol>'
    )


def runtime_sprite(stable_ids: list[str], path_data_by_selected_id: dict[str, str]) -> str:
    symbols = [
        inline_symbol(symbol_id, path_data_by_selected_id[symbol_id])
        for symbol_id in stable_ids
        if symbol_id in path_data_by_selected_id
    ]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg">\n  '
        + "\n  ".join(symbols)
        + "\n</svg>\n"
    )


def write_or_check(path: Path, content: str, check: bool) -> None:
    if check:
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            raise ValueError(f"Generated asset is stale: {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def main() -> int:
    args = parse_args()
    manifest = load_manifest()
    pipeline = manifest["pipeline"]
    source_dir = args.source_dir.resolve() if args.source_dir else None
    if source_dir and not source_dir.is_dir():
        raise ValueError(f"Source directory does not exist: {source_dir}")

    path_data_by_selected_id: dict[str, str] = {}
    imported = 0
    for entry in manifest["entries"]:
        source_asset = normalized_asset_path(entry)
        if source_dir:
            source_path = source_dir / entry["sourceFile"]
            if not source_path.is_file():
                raise ValueError(f"Missing source file: {source_path}")
            mask = normalize_source(source_path, entry, pipeline)
            if not args.check:
                save_transparent_mask(mask, source_asset)
            imported += 1
        else:
            if not source_asset.is_file():
                raise ValueError(
                    f"Missing normalized asset {source_asset.relative_to(ROOT)}; rerun with --source-dir."
                )
            mask = load_transparent_mask(source_asset)

        path_data = trace_path(mask, float(pipeline["traceEpsilon"]))
        write_or_check(vector_asset_path(entry), svg_document(path_data), args.check)
        if entry["selected"]:
            path_data_by_selected_id[entry["symbolId"]] = path_data

    write_or_check(
        RUNTIME_SPRITE_PATH,
        runtime_sprite(manifest["stableSymbolIds"], path_data_by_selected_id),
        args.check,
    )

    index = INDEX_PATH.read_text(encoding="utf-8")
    for symbol_id in path_data_by_selected_id:
        pattern = re.compile(
            rf'\s*<symbol id="cl-icon-flag-{re.escape(symbol_id)}"(?=[\s>])[^>]*>.*?</symbol>'
        )
        updated, count = pattern.subn("", index, count=1)
        if args.check and count:
            raise ValueError(f"Approved symbol {symbol_id} must live in the runtime sprite, not index.html.")
        if not args.check and count > 1:
            raise ValueError(f"Expected at most one inline symbol for {symbol_id}; found {count}.")
        index = updated

    for symbol_id in manifest["missingUploadedIds"]:
        count = len(re.findall(rf'<symbol id="cl-icon-flag-{re.escape(symbol_id)}"(?=[\s>])', index))
        if count != 1:
            raise ValueError(f"Expected one inline legacy fallback for {symbol_id}; found {count}.")

    if args.check:
        if INDEX_PATH.read_text(encoding="utf-8") != index:
            raise ValueError("index.html contains stale approved-symbol geometry.")
    else:
        INDEX_PATH.write_text(index, encoding="utf-8", newline="\n")

    action = "Validated" if args.check else "Generated"
    print(
        f"{action} {len(manifest['entries'])} traced source assets, "
        f"{len(path_data_by_selected_id)} approved runtime symbols, "
        f"and {len(manifest['missingUploadedIds'])} inline legacy fallbacks."
    )
    if source_dir:
        print(f"Verified {imported} original PNG hashes from {source_dir}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
