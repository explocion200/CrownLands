"""Deterministic Phase 5 development-only map baker.

This renderer intentionally uses procedural QA primitives. It does not claim to
replace the production Crownlands modular art library planned for Phase 6.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


MAP_SIZE = (1448, 1086)
THUMBNAIL_SIZE = (320, 240)
WEBP_QUALITY = 82
WEBP_METHOD = 6


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rgba(hex_value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = str(hex_value or "#000000").lstrip("#")
    if len(value) != 6:
        value = "000000"
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4)) + (alpha,)


def ellipse_bounds(element: dict) -> tuple[float, float, float, float]:
    return (
        float(element["x"]) - float(element["rx"]),
        float(element["y"]) - float(element["ry"]),
        float(element["x"]) + float(element["rx"]),
        float(element["y"]) + float(element["ry"]),
    )


def draw_ground_patch(draw: ImageDraw.ImageDraw, element: dict) -> None:
    opacity = max(0.0, min(1.0, float(element.get("opacity", 0.15))))
    draw.ellipse(ellipse_bounds(element), fill=rgba(element.get("color", "#777755"), round(opacity * 255)))


def draw_road(draw: ImageDraw.ImageDraw, element: dict) -> None:
    points = [(round(point["x"]), round(point["y"])) for point in element.get("points", [])]
    if len(points) < 2:
        return
    half_width = max(4, round(float(element.get("halfWidth", 30))))
    draw.line(points, fill=(61, 49, 37, 210), width=half_width * 2 + 10, joint="curve")
    draw.line(points, fill=rgba(element.get("color", "#786347"), 255), width=half_width * 2, joint="curve")
    draw.line(points, fill=(127, 105, 72, 180), width=max(2, half_width // 3), joint="curve")


def draw_water(draw: ImageDraw.ImageDraw, element: dict) -> None:
    bounds = ellipse_bounds(element)
    draw.ellipse(bounds, fill=rgba(element.get("color", "#526f72"), 255), outline=(47, 76, 73, 255), width=5)
    left, top, right, bottom = bounds
    for fraction in (0.35, 0.55, 0.72):
        y = top + (bottom - top) * fraction
        draw.arc((left + 12, y - 8, right - 12, y + 8), 190, 345, fill=(132, 157, 143, 190), width=2)


def draw_forest(draw: ImageDraw.ImageDraw, element: dict) -> None:
    bounds = ellipse_bounds(element)
    draw.ellipse(bounds, fill=rgba(element.get("color", "#314831"), 245), outline=(38, 61, 39, 255), width=4)
    x = float(element["x"])
    y = float(element["y"])
    rx = float(element["rx"])
    ry = float(element["ry"])
    for index in range(13):
        angle = index * 2.399963229728653
        radius = math.sqrt((index + 0.5) / 13)
        cx = x + math.cos(angle) * rx * radius * 0.72
        cy = y + math.sin(angle) * ry * radius * 0.67
        crown = max(7, min(rx, ry) * (0.10 + (index % 3) * 0.025))
        draw.ellipse((cx - crown, cy - crown, cx + crown, cy + crown), fill=(49, 82, 48, 255), outline=(35, 60, 37, 220), width=1)


def draw_mountain(draw: ImageDraw.ImageDraw, element: dict) -> None:
    bounds = ellipse_bounds(element)
    draw.ellipse(bounds, fill=(91, 89, 70, 230), outline=(68, 67, 55, 255), width=4)
    x = float(element["x"])
    y = float(element["y"])
    rx = float(element["rx"])
    ry = float(element["ry"])
    for offset, scale in ((-0.45, 0.55), (0.0, 0.78), (0.43, 0.58)):
        cx = x + rx * offset
        points = [(cx - rx * 0.28, y + ry * 0.48), (cx, y - ry * scale), (cx + rx * 0.28, y + ry * 0.48)]
        draw.polygon(points, fill=(104, 99, 78, 255), outline=(65, 63, 53, 255))
        draw.line((cx, y - ry * scale, cx - rx * 0.10, y - ry * 0.08), fill=(151, 143, 111, 210), width=3)


def draw_marsh(draw: ImageDraw.ImageDraw, element: dict) -> None:
    bounds = ellipse_bounds(element)
    draw.ellipse(bounds, fill=(78, 93, 67, 245), outline=(58, 72, 55, 255), width=4)
    left, top, right, bottom = bounds
    for index in range(10):
        x = left + (index + 0.7) / 11 * (right - left)
        base = bottom - (index % 3) * 5 - 10
        draw.line((x, base, x - 3, base - 22 - (index % 4) * 4), fill=(91, 105, 64, 230), width=2)


def draw_rotated_blocker(
    overlay: Image.Image,
    element: dict,
    renderer,
) -> None:
    radius_x = max(1, round(float(element.get("rx", 1))))
    radius_y = max(1, round(float(element.get("ry", 1))))
    padding = 12
    tile = Image.new("RGBA", (radius_x * 2 + padding * 2, radius_y * 2 + padding * 2), (0, 0, 0, 0))
    local = dict(element)
    local["x"] = radius_x + padding
    local["y"] = radius_y + padding
    local["rot"] = 0
    renderer(ImageDraw.Draw(tile, "RGBA"), local)
    rotation = float(element.get("rot", 0))
    if abs(rotation) > 0.000001:
        tile = tile.rotate(math.degrees(rotation), resample=Image.Resampling.BICUBIC, expand=True)
    destination = (
        round(float(element["x"]) - tile.width / 2),
        round(float(element["y"]) - tile.height / 2),
    )
    overlay.alpha_composite(tile, destination)


def render(input_path: Path, map_path: Path, thumbnail_path: Path) -> dict:
    source = json.loads(input_path.read_text(encoding="utf-8"))
    dimensions = source.get("dimensions", {})
    if (int(dimensions.get("width", 0)) != MAP_SIZE[0] or int(dimensions.get("height", 0)) != MAP_SIZE[1]):
        raise ValueError("Phase 5 maps must be exactly 1448x1086.")

    palette = source.get("palette", {})
    image = Image.new("RGB", MAP_SIZE, rgba(palette.get("ground", "#71844b"))[:3])
    overlay = Image.new("RGBA", MAP_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    land_polygon = [(round(point["x"]), round(point["y"])) for point in source.get("landPolygon", [])]
    if len(land_polygon) >= 3:
        draw.polygon(land_polygon, fill=rgba(palette.get("ground", "#71844b"), 255))

    for element in sorted(source.get("visualComposition", []), key=lambda item: (item.get("drawOrder", 0), item.get("id", ""))):
        category = element.get("category")
        if category == "ground_patch":
            draw_ground_patch(draw, element)
        elif category == "road":
            draw_road(draw, element)
        elif category == "water":
            draw_rotated_blocker(overlay, element, draw_water)
        elif category == "dense_forest":
            draw_rotated_blocker(overlay, element, draw_forest)
        elif category == "mountain":
            draw_rotated_blocker(overlay, element, draw_mountain)
        elif category == "marsh":
            draw_rotated_blocker(overlay, element, draw_marsh)

    # Development watermark is intentionally baked into QA outputs so these
    # procedural composites cannot be mistaken for final production artwork.
    font = ImageFont.load_default()
    label = "PHASE 5 DEV COMPOSITE - NOT PRODUCTION ART"
    text_box = draw.textbbox((0, 0), label, font=font)
    text_width = text_box[2] - text_box[0]
    x = MAP_SIZE[0] - text_width - 24
    y = MAP_SIZE[1] - 30
    draw.rounded_rectangle((x - 9, y - 6, MAP_SIZE[0] - 10, MAP_SIZE[1] - 9), radius=5, fill=(34, 28, 22, 180))
    draw.text((x, y), label, font=font, fill=(236, 224, 195, 255))

    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    map_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(map_path, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, lossless=False, exact=True)
    thumbnail = image.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    thumbnail.save(thumbnail_path, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, lossless=False, exact=True)

    with Image.open(map_path) as baked_map, Image.open(thumbnail_path) as baked_thumbnail:
        result = {
            "renderer": "pillow-procedural-qa-v1",
            "pillowVersion": Image.__version__,
            "quality": WEBP_QUALITY,
            "method": WEBP_METHOD,
            "map": {
                "path": map_path.name,
                "width": baked_map.width,
                "height": baked_map.height,
                "mode": baked_map.mode,
                "opaque": baked_map.mode == "RGB",
                "bytes": map_path.stat().st_size,
                "sha256": sha256_file(map_path),
            },
            "thumbnail": {
                "path": thumbnail_path.name,
                "width": baked_thumbnail.width,
                "height": baked_thumbnail.height,
                "mode": baked_thumbnail.mode,
                "opaque": baked_thumbnail.mode == "RGB",
                "bytes": thumbnail_path.stat().st_size,
                "sha256": sha256_file(thumbnail_path),
            },
        }
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--map", required=True, type=Path)
    parser.add_argument("--thumbnail", required=True, type=Path)
    arguments = parser.parse_args()
    print(json.dumps(render(arguments.input, arguments.map, arguments.thumbnail), separators=(",", ":")))


if __name__ == "__main__":
    main()
