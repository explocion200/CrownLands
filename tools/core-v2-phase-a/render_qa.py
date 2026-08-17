"""Render Core v2 Phase A development-only visual QA artifacts."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter


MAP_SIZE = (1448, 1086)
CITY_SIZE = 64
PANEL_SIZE = (420, 315)
BACKGROUND = (17, 28, 38)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "arialbd.ttf" if bold else "arial.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def rounded_label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill=(12, 25, 35, 225), accent=(242, 201, 92, 255)):
    text_font = font(20, True)
    box = draw.textbbox((0, 0), text, font=text_font)
    width = box[2] - box[0] + 24
    height = box[3] - box[1] + 16
    x, y = xy
    draw.rounded_rectangle((x, y, x + width, y + height), radius=8, fill=fill, outline=accent, width=2)
    draw.text((x + 12, y + 7), text, font=text_font, fill=(255, 247, 218, 255))


def ellipse_box(shape: dict, padding: float = 0):
    rx = float(shape.get("radiusX", shape.get("rx", shape.get("radius", 1)))) + padding
    ry = float(shape.get("radiusY", shape.get("ry", shape.get("radius", 1)))) + padding
    x, y = float(shape["x"]), float(shape["y"])
    return (round(x - rx), round(y - ry), round(x + rx), round(y + ry))


def load_city_art(root: Path) -> Image.Image:
    path = root / "assets/optimized/castle-city-256x256-96961dc8d50b.webp"
    return Image.open(path).convert("RGBA").resize((CITY_SIZE, CITY_SIZE), Image.Resampling.LANCZOS)


def paste_center(canvas: Image.Image, art: Image.Image, x: float, y: float, y_anchor=0.5):
    left = round(x - art.width / 2)
    top = round(y - art.height * y_anchor)
    shadow_alpha = art.getchannel("A").filter(ImageFilter.GaussianBlur(5))
    shadow = Image.new("RGBA", art.size, (0, 0, 0, 0))
    shadow.putalpha(shadow_alpha.point(lambda value: round(value * 0.45)))
    canvas.alpha_composite(shadow, (left + 3, top + 7))
    canvas.alpha_composite(art, (left, top))


def render_city_positions(clean: Image.Image, cities: list[dict], title: str) -> Image.Image:
    canvas = clean.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    for index, city in enumerate(cities, 1):
        x, y = city["x"], city["y"]
        draw.ellipse((x - 32, y - 32, x + 32, y + 32), fill=(22, 154, 217, 88), outline=(177, 235, 255, 235), width=3)
        draw.text((x, y), str(index), font=font(12, True), anchor="mm", fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(8, 26, 38, 230))
    rounded_label(draw, (22, 20), f"{title} — {len(cities)} exact city positions")
    return canvas.convert("RGB")


def render_city_art(clean: Image.Image, cities: list[dict], city_art: Image.Image, title: str) -> Image.Image:
    canvas = clean.convert("RGBA")
    for city in sorted(cities, key=lambda item: item["y"]):
        paste_center(canvas, city_art, city["x"], city["y"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    rounded_label(draw, (22, 20), f"{title} — actual Crownlands runtime city art")
    return canvas.convert("RGB")


def render_objective(clean: Image.Image, plan: dict, root: Path) -> Image.Image:
    canvas = clean.convert("RGBA")
    region = plan["coreRegion"]
    objective = region["objective"]
    profile = plan["handcraftedProfile"]
    draw = ImageDraw.Draw(canvas, "RGBA")
    if objective["type"] == "none":
        rounded_label(draw, (22, 20), f"{region['name']} — no fixed objective; open support territory")
        return canvas.convert("RGB")
    draw.ellipse(ellipse_box(objective), fill=(240, 178, 43, 46), outline=(255, 221, 119, 245), width=5)
    if profile.get("objectiveArt"):
        size = int(objective["visualSize"])
        art = Image.open(root / profile["objectiveArt"]).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        paste_center(canvas, art, objective["x"], objective["y"], 0.62)
        status = "actual objective asset overlay"
    else:
        draw.rounded_rectangle((objective["x"] - 82, objective["y"] - 62, objective["x"] + 82, objective["y"] + 62), radius=16, fill=(239, 176, 54, 65), outline=(255, 225, 131, 255), width=5)
        draw.line((objective["x"] - 64, objective["y"], objective["x"] + 64, objective["y"]), fill=(255, 225, 131, 255), width=4)
        draw.line((objective["x"], objective["y"] - 45, objective["x"], objective["y"] + 45), fill=(255, 225, 131, 255), width=4)
        status = "development-only reservation; no Tower art baked"
    rounded_label(draw, (22, 20), f"{profile['objectiveLabel']} — {status}")
    return canvas.convert("RGB")


def render_roads(clean: Image.Image, plan: dict) -> Image.Image:
    canvas = clean.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    colors = {"north": (90, 222, 255, 235), "east": (255, 205, 83, 235), "south": (255, 111, 96, 235), "west": (113, 241, 142, 235)}
    for road in plan["roadSystem"]["edgeRoads"]:
        points = [(point["x"], point["y"]) for point in road["points"]]
        draw.line(points, fill=(4, 13, 22, 185), width=int(road["halfWidth"] * 2 + 8), joint="curve")
        draw.line(points, fill=colors[road["side"]], width=7, joint="curve")
        for point in points:
            draw.ellipse((point[0] - 7, point[1] - 7, point[0] + 7, point[1] + 7), fill=colors[road["side"]])
    rounded_label(draw, (22, 20), f"Road geometry — {plan['roadGeometryId']} / fixed cardinal sockets")
    return canvas.convert("RGB")


def render_blockers(clean: Image.Image, plan: dict) -> Image.Image:
    canvas = clean.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    for blocker in plan["blockers"]:
        draw.ellipse(ellipse_box(blocker), fill=(222, 66, 174, 65), outline=(255, 145, 220, 245), width=4)
        draw.text((blocker["x"], blocker["y"]), blocker["type"], font=font(15, True), anchor="mm", fill=(255, 240, 251, 255), stroke_width=2, stroke_fill=(54, 7, 40, 255))
    rounded_label(draw, (22, 20), f"Authoritative blockers — {len(plan['blockers'])} restrained accent zones")
    return canvas.convert("RGB")


def render_clearance(clean: Image.Image, cities: list[dict], plan: dict) -> Image.Image:
    canvas = clean.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    for road in plan["roadSystem"]["edgeRoads"]:
        draw.line([(point["x"], point["y"]) for point in road["points"]], fill=(255, 103, 79, 95), width=int(road["halfWidth"] * 2 + 80), joint="curve")
    for blocker in plan["blockers"]:
        draw.ellipse(ellipse_box(blocker, 42), fill=(220, 56, 170, 72), outline=(255, 150, 224, 210), width=3)
    objective = plan["coreRegion"]["objective"]
    if objective["type"] != "none":
        draw.ellipse(ellipse_box(objective, 46), fill=(255, 189, 53, 74), outline=(255, 224, 132, 235), width=4)
    for city in cities:
        x, y = city["x"], city["y"]
        draw.ellipse((x - 32, y - 32, x + 32, y + 32), fill=(41, 208, 119, 78), outline=(152, 255, 201, 240), width=3)
    rounded_label(draw, (22, 20), "Clearance proof — green cities clear roads, blockers, transitions and objective influence")
    return canvas.convert("RGB")


def render_coordinate_overlay(clean: Image.Image, plan: dict) -> Image.Image:
    canvas = clean.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    for x in range(0, MAP_SIZE[0] + 1, 181):
        draw.line((x, 0, x, MAP_SIZE[1]), fill=(233, 244, 255, 40), width=1)
        draw.text((x + 5, 5), str(x), font=font(13), fill=(255, 255, 255, 210))
    for y in range(0, MAP_SIZE[1] + 1, 181):
        draw.line((0, y, MAP_SIZE[0], y), fill=(233, 244, 255, 40), width=1)
        draw.text((5, y + 5), str(y), font=font(13), fill=(255, 255, 255, 210))
    coordinate = plan["coreRegion"]["coordinate"]
    rounded_label(draw, (22, 38), f"Core coordinate ({coordinate['gridX']},{coordinate['gridY']}) — 1448×1086")
    return canvas.convert("RGB")


def edge_sheet(clean: Image.Image, title: str, roads_only: bool = False) -> Image.Image:
    crop_width, crop_height = (420, 230) if not roads_only else (330, 250)
    if roads_only:
        crops = [
            ("N", clean.crop((559, 0, 889, 250))),
            ("E", clean.crop((1118, 418, 1448, 668))),
            ("S", clean.crop((559, 836, 889, 1086))),
            ("W", clean.crop((0, 418, 330, 668))),
        ]
    else:
        crops = [
            ("North edge", clean.crop((514, 0, 934, 230))),
            ("East edge", clean.crop((1028, 350, 1448, 580)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)),
            ("South edge", clean.crop((514, 856, 934, 1086))),
            ("West edge", clean.crop((0, 350, 420, 580))),
        ]
    sheet = Image.new("RGB", (crop_width * 2, crop_height * 2 + 52), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 12), title, font=font(24, True), fill=(255, 241, 201))
    for index, (label, crop) in enumerate(crops):
        crop = crop.resize((crop_width, crop_height), Image.Resampling.LANCZOS)
        x = (index % 2) * crop_width
        y = 52 + (index // 2) * crop_height
        sheet.paste(crop, (x, y))
        ImageDraw.Draw(sheet, "RGBA").rectangle((x + 8, y + 8, x + 132, y + 38), fill=(8, 22, 31, 205))
        ImageDraw.Draw(sheet).text((x + 16, y + 12), label, font=font(16, True), fill=(255, 255, 255))
    return sheet


def review_board(items: list[dict], output: Path):
    width = PANEL_SIZE[0] * 3
    height = 64 + PANEL_SIZE[1] * len(items)
    board = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(board)
    draw.text((20, 14), "Core v2 Phase A — five-map visual approval board", font=font(30, True), fill=(255, 235, 174))
    headers = ["CLEAN MAP", "ACTUAL CITY ART", "OBJECTIVE / RESERVATION"]
    for column, header in enumerate(headers):
        draw.text((column * PANEL_SIZE[0] + 12, 48), header, font=font(14, True), fill=(172, 210, 228))
    for row, item in enumerate(items):
        y = 64 + row * PANEL_SIZE[1]
        for column, key in enumerate(("clean", "city_art", "objective")):
            image = item[key].resize(PANEL_SIZE, Image.Resampling.LANCZOS)
            board.paste(image, (column * PANEL_SIZE[0], y))
        label = f"{item['name']}  ({item['coordinate']['gridX']},{item['coordinate']['gridY']})  •  {item['capacity']} cities"
        overlay = ImageDraw.Draw(board, "RGBA")
        overlay.rectangle((8, y + 276, width - 8, y + 312), fill=(7, 18, 25, 215))
        overlay.text((18, y + 283), label, font=font(18, True), fill=(255, 245, 215, 255))
    board.save(output / "five-map-review-board.png", format="PNG")


def neighbor_sheet(items_by_coordinate: dict[str, dict], output: Path):
    pairs = [
        ("0,0", "0,1", "Crown Citadel south → Ironwatch north", "south", "north"),
        ("-1,1", "0,1", "Holding Tower east → Ironwatch west", "east", "west"),
        ("-2,1", "-1,1", "Deed Camp east → Holding Tower west", "east", "west"),
        ("-2,0", "-2,1", "West Support south → Deed Camp north", "south", "north"),
    ]
    panel_width, panel_height = 720, 220
    sheet = Image.new("RGB", (panel_width * 2, 62 + panel_height * len(pairs)), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 14), "Connected Core road sockets and climate-transition comparisons", font=font(28, True), fill=(255, 235, 174))
    for row, (left_key, right_key, label, left_side, right_side) in enumerate(pairs):
        left = items_by_coordinate[left_key]["clean"]
        right = items_by_coordinate[right_key]["clean"]
        def crop_side(image, side):
            if side == "south": return image.crop((364, 786, 1084, 1086))
            if side == "north": return image.crop((364, 0, 1084, 300))
            if side == "east": return image.crop((728, 243, 1448, 843))
            return image.crop((0, 243, 720, 843))
        left_crop = crop_side(left, left_side).resize((panel_width, panel_height), Image.Resampling.LANCZOS)
        right_crop = crop_side(right, right_side).resize((panel_width, panel_height), Image.Resampling.LANCZOS)
        y = 62 + row * panel_height
        sheet.paste(left_crop, (0, y))
        sheet.paste(right_crop, (panel_width, y))
        overlay = ImageDraw.Draw(sheet, "RGBA")
        overlay.rectangle((8, y + 8, 600, y + 42), fill=(7, 18, 25, 215))
        overlay.text((18, y + 13), label, font=font(18, True), fill=(255, 245, 215, 255))
        overlay.line((panel_width - 1, y, panel_width - 1, y + panel_height), fill=(255, 220, 117, 255), width=3)
    sheet.save(output / "neighbor-transitions.png", format="PNG")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output.resolve()
    index = read_json(output / "prototype-index.json")
    city_art = load_city_art(root)
    review_items = []
    items_by_coordinate = {}
    for prototype in index["prototypes"]:
        directory = root / prototype["outputDirectory"]
        qa = directory / "qa"
        qa.mkdir(parents=True, exist_ok=True)
        clean = Image.open(directory / "map-clean.png").convert("RGB")
        cities = read_json(directory / "cities.json")
        plan = read_json(directory / "composition.json")
        name = prototype["name"]
        position = render_city_positions(clean, cities, name)
        art = render_city_art(clean, cities, city_art, name)
        objective = render_objective(clean, plan, root)
        roads = render_roads(clean, plan)
        blockers = render_blockers(clean, plan)
        clearance = render_clearance(clean, cities, plan)
        coordinates = render_coordinate_overlay(clean, plan)
        position.save(qa / "01-city-position-overlay.png")
        art.save(qa / "02-actual-city-art-overlay.png")
        objective.save(qa / "03-objective-overlay.png")
        roads.save(qa / "04-road-geometry-overlay.png")
        blockers.save(qa / "05-blocker-overlay.png")
        clearance.save(qa / "06-clearance-proof.png")
        coordinates.save(qa / "07-coordinate-overlay.png")
        edge_sheet(clean, f"{name} — literal edge barrier close-ups").save(qa / "08-edge-closeups.png")
        edge_sheet(clean, f"{name} — one controlled road opening per side", roads_only=True).save(qa / "09-road-opening-closeups.png")
        item = {
            "name": name,
            "coordinate": prototype["coordinate"],
            "capacity": prototype["exactCityCapacity"],
            "clean": clean,
            "city_art": art,
            "objective": objective,
        }
        review_items.append(item)
        coordinate_key = f"{prototype['coordinate']['gridX']},{prototype['coordinate']['gridY']}"
        items_by_coordinate[coordinate_key] = item
    gallery = output / "gallery"
    gallery.mkdir(parents=True, exist_ok=True)
    review_board(review_items, gallery)
    neighbor_sheet(items_by_coordinate, gallery)
    print(json.dumps({"prototypeCount": len(review_items), "gallery": str(gallery)}, separators=(",", ":")))


if __name__ == "__main__":
    main()
