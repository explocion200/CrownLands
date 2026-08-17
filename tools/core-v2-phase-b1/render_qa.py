"""Render Core v2 Phase B1 development-only visual QA artifacts."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


MAP_SIZE = (1448, 1086)
PANEL = (420, 315)
BACKGROUND = (17, 28, 38)


def load_phase_a_renderer(root: Path):
    source = root / "tools/core-v2-phase-a/render_qa.py"
    spec = importlib.util.spec_from_file_location("core_v2_phase_a_render_qa", source)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def closest_pair(cities: list[dict]):
    best = None
    for left_index, left in enumerate(cities):
        for right in cities[left_index + 1:]:
            distance = math.hypot(left["x"] - right["x"], left["y"] - right["y"])
            if best is None or distance < best[0]:
                best = (distance, left, right)
    return best


def tight_cluster_sheet(city_art: Image.Image, cities: list[dict], title: str, renderer) -> Image.Image:
    distance, left, right = closest_pair(cities)
    center_x = round((left["x"] + right["x"]) / 2)
    center_y = round((left["y"] + right["y"]) / 2)
    crop_width, crop_height = 620, 440
    x0 = max(0, min(MAP_SIZE[0] - crop_width, center_x - crop_width // 2))
    y0 = max(0, min(MAP_SIZE[1] - crop_height, center_y - crop_height // 2))
    crop = city_art.crop((x0, y0, x0 + crop_width, y0 + crop_height)).convert("RGBA")
    draw = ImageDraw.Draw(crop, "RGBA")
    for city, color in ((left, (92, 220, 255, 255)), (right, (255, 199, 82, 255))):
        x, y = city["x"] - x0, city["y"] - y0
        draw.ellipse((x - 38, y - 38, x + 38, y + 38), outline=color, width=5)
    renderer.rounded_label(draw, (16, 16), f"{title} — tightest pair {distance:.3f}px")
    return crop.convert("RGB")


def placement_proof(clean: Image.Image, plan: dict, title: str, renderer) -> Image.Image:
    canvas = clean.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    center = (MAP_SIZE[0] // 2, MAP_SIZE[1] // 2)
    objective = plan["coreRegion"]["objective"]
    draw.line((center[0] - 62, center[1], center[0] + 62, center[1]), fill=(93, 220, 255, 245), width=4)
    draw.line((center[0], center[1] - 62, center[0], center[1] + 62), fill=(93, 220, 255, 245), width=4)
    draw.ellipse((center[0] - 9, center[1] - 9, center[0] + 9, center[1] + 9), fill=(93, 220, 255, 255))
    draw.line((center[0], center[1], objective["x"], objective["y"]), fill=(255, 199, 82, 255), width=5)
    draw.ellipse(renderer.ellipse_box(objective), fill=(255, 199, 82, 45), outline=(255, 221, 132, 245), width=5)
    offset = math.hypot(objective["x"] - center[0], objective["y"] - center[1])
    renderer.rounded_label(draw, (20, 20), f"{title} — objective offset {offset:.3f}px")
    return canvas.convert("RGB")


def map_panel(image: Image.Image, label: str, renderer) -> Image.Image:
    panel = image.resize(PANEL, Image.Resampling.LANCZOS).convert("RGBA")
    draw = ImageDraw.Draw(panel, "RGBA")
    draw.rectangle((0, PANEL[1] - 38, PANEL[0], PANEL[1]), fill=(7, 18, 25, 218))
    draw.text((12, PANEL[1] - 31), label, font=renderer.font(16, True), fill=(255, 245, 215, 255))
    return panel.convert("RGB")


def review_board(items: list[dict], output: Path, renderer):
    width = PANEL[0] * 3
    height = 64 + PANEL[1] * len(items)
    board = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(board)
    draw.text((20, 14), "Core v2 Phase B1 — west / northwest five-map review", font=renderer.font(30, True), fill=(255, 235, 174))
    for row, item in enumerate(items):
        y = 64 + row * PANEL[1]
        board.paste(map_panel(item["clean"], "CLEAN", renderer), (0, y))
        board.paste(map_panel(item["city_art"], f"{item['capacity']} CITIES", renderer), (PANEL[0], y))
        board.paste(map_panel(item["objective"], "OBJECTIVE / RESERVATION", renderer), (PANEL[0] * 2, y))
        label = f"{item['name']} ({item['coordinate']['gridX']},{item['coordinate']['gridY']})"
        ImageDraw.Draw(board, "RGBA").text((14, y + 8), label, font=renderer.font(18, True), fill=(255, 248, 222, 255), stroke_width=3, stroke_fill=(7, 18, 25, 230))
    board.save(output / "b1-five-map-review-board.png")


def comparison_grid(items: list[tuple[str, Image.Image]], title: str, columns: int, output_path: Path, renderer):
    rows = math.ceil(len(items) / columns)
    board = Image.new("RGB", (PANEL[0] * columns, 62 + PANEL[1] * rows), BACKGROUND)
    draw = ImageDraw.Draw(board)
    draw.text((18, 14), title, font=renderer.font(28, True), fill=(255, 235, 174))
    for index, (label, image) in enumerate(items):
        x = (index % columns) * PANEL[0]
        y = 62 + (index // columns) * PANEL[1]
        board.paste(map_panel(image, label, renderer), (x, y))
    board.save(output_path)


def runtime_review_board(index: dict, root: Path, output_path: Path, renderer):
    columns = [("low.png", "LOW ZOOM"), ("normal.png", "NORMAL ZOOM"), ("close.png", "CLOSE ZOOM"), ("action-state.png", "ACTION STATE")]
    panel_width, panel_height = 332, 240
    board = Image.new("RGB", (panel_width * len(columns), 66 + panel_height * len(index["prototypes"])), BACKGROUND)
    draw = ImageDraw.Draw(board)
    draw.text((18, 14), "Core v2 Phase B1 — real Crownlands renderer QA", font=renderer.font(28, True), fill=(255, 235, 174))
    for column_index, (_, label) in enumerate(columns):
        draw.text((column_index * panel_width + 12, 47), label, font=renderer.font(14, True), fill=(172, 210, 228))
    for row_index, prototype in enumerate(index["prototypes"]):
        y = 66 + row_index * panel_height
        runtime_dir = root / prototype["outputDirectory"] / "runtime"
        for column_index, (file_name, label) in enumerate(columns):
            image = Image.open(runtime_dir / file_name).convert("RGB").resize((panel_width, panel_height), Image.Resampling.LANCZOS)
            board.paste(image, (column_index * panel_width, y))
        overlay = ImageDraw.Draw(board, "RGBA")
        overlay.rectangle((8, y + 204, panel_width * len(columns) - 8, y + 238), fill=(7, 18, 25, 215))
        overlay.text((16, y + 211), f"{prototype['name']} — {prototype['exactCityCapacity']} cities", font=renderer.font(17, True), fill=(255, 245, 215, 255))
    board.save(output_path)


def neighbor_edge_sheet(by_coordinate: dict[str, dict], root: Path, output_path: Path, renderer):
    existing = {
        "-2,0": load_existing_neighbor(root, "west-support"),
        "0,0": load_existing_neighbor(root, "crown-citadel"),
        "-1,1": load_existing_neighbor(root, "southwest-holding-tower"),
    }
    images = {key: value["clean"] for key, value in by_coordinate.items()} | existing
    pairs = [
        ("-2,-2", "-2,-1", "Warband south ↔ transitional Relic north", "south", "north"),
        ("-1,-2", "-1,-1", "Northern Relic south ↔ Tower north", "south", "north"),
        ("-2,-1", "-1,-1", "Transitional Relic east ↔ Tower west", "east", "west"),
        ("-2,-1", "-2,0", "Transitional Relic south ↔ locked West Support north", "south", "north"),
        ("-1,-1", "-1,0", "Tower south ↔ Aurum north", "south", "north"),
        ("-2,0", "-1,0", "Locked West Support east ↔ Aurum west", "east", "west"),
        ("-1,0", "0,0", "Aurum east ↔ locked Crown Citadel west", "east", "west"),
    ]

    def crop_edge(image: Image.Image, side: str):
        if side == "north": return image.crop((364, 0, 1084, 250))
        if side == "south": return image.crop((364, 836, 1084, 1086))
        if side == "east": return image.crop((1198, 183, 1448, 903)).resize((720, 250), Image.Resampling.LANCZOS)
        return image.crop((0, 183, 250, 903)).resize((720, 250), Image.Resampling.LANCZOS)

    panel_width, panel_height = 720, 250
    board = Image.new("RGB", (panel_width * 2, 64 + panel_height * len(pairs)), BACKGROUND)
    draw = ImageDraw.Draw(board)
    draw.text((18, 14), "Phase B1 cardinal edge and climate continuity", font=renderer.font(28, True), fill=(255, 235, 174))
    for row, (left_key, right_key, label, left_side, right_side) in enumerate(pairs):
        y = 64 + row * panel_height
        board.paste(crop_edge(images[left_key], left_side).resize((panel_width, panel_height), Image.Resampling.LANCZOS), (0, y))
        board.paste(crop_edge(images[right_key], right_side).resize((panel_width, panel_height), Image.Resampling.LANCZOS), (panel_width, y))
        overlay = ImageDraw.Draw(board, "RGBA")
        overlay.rectangle((8, y + 8, 680, y + 43), fill=(7, 18, 25, 220))
        overlay.text((16, y + 14), label, font=renderer.font(17, True), fill=(255, 245, 215, 255))
        overlay.line((panel_width - 1, y, panel_width - 1, y + panel_height), fill=(255, 220, 117, 255), width=3)
    board.save(output_path)


def load_existing_neighbor(root: Path, key: str):
    directory = root / "benchmark-results/map/core-v2-phase-a/prototypes" / key
    return Image.open(directory / "map-clean.png").convert("RGB")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output.resolve()
    renderer = load_phase_a_renderer(root)
    index = read_json(output / "batch-index.json")
    city_art_asset = renderer.load_city_art(root)
    review_items = []
    by_coordinate = {}

    for prototype in index["prototypes"]:
        directory = root / prototype["outputDirectory"]
        qa = directory / "qa"
        qa.mkdir(parents=True, exist_ok=True)
        clean = Image.open(directory / "map-clean.png").convert("RGB")
        cities = read_json(directory / "cities.json")
        plan = read_json(directory / "composition.json")
        name = prototype["name"]
        positions = renderer.render_city_positions(clean, cities, name)
        city_art = renderer.render_city_art(clean, cities, city_art_asset, name)
        objective = renderer.render_objective(clean, plan, root)
        renderer.render_roads(clean, plan).save(qa / "04-road-geometry-overlay.png")
        renderer.render_blockers(clean, plan).save(qa / "05-blocker-overlay.png")
        renderer.render_clearance(clean, cities, plan).save(qa / "06-clearance-proof.png")
        renderer.render_coordinate_overlay(clean, plan).save(qa / "07-coordinate-overlay.png")
        renderer.edge_sheet(clean, f"{name} — literal edge barrier close-ups").save(qa / "08-edge-closeups.png")
        renderer.edge_sheet(clean, f"{name} — one controlled road opening per side", roads_only=True).save(qa / "09-road-opening-closeups.png")
        positions.save(qa / "01-city-position-overlay.png")
        city_art.save(qa / "02-actual-city-art-overlay.png")
        objective.save(qa / "03-objective-overlay.png")
        tight_cluster_sheet(city_art, cities, name, renderer).save(qa / "10-tightest-city-cluster.png")
        placement_proof(clean, plan, name, renderer).save(qa / "11-objective-placement-proof.png")
        item = {
            "name": name,
            "coordinate": prototype["coordinate"],
            "capacity": prototype["exactCityCapacity"],
            "clean": clean,
            "city_art": city_art,
            "objective": objective,
        }
        review_items.append(item)
        by_coordinate[f"{prototype['coordinate']['gridX']},{prototype['coordinate']['gridY']}"] = item

    gallery = output / "gallery"
    gallery.mkdir(parents=True, exist_ok=True)
    review_board(review_items, gallery, renderer)

    climate_items = [
        ("West Support (locked)", load_existing_neighbor(root, "west-support")),
        ("Transitional Relic", by_coordinate["-2,-1"]["clean"]),
        ("Northern Warband", by_coordinate["-2,-2"]["clean"]),
        ("Aurum Keep", by_coordinate["-1,0"]["clean"]),
        ("Transitional Tower", by_coordinate["-1,-1"]["clean"]),
        ("Northern Relic", by_coordinate["-1,-2"]["clean"]),
    ]
    comparison_grid(climate_items, "West → northwest → north climate transition", 3, gallery / "west-north-climate-transition.png", renderer)

    comparison_grid([
        ("Northern Relic — winter stones", by_coordinate["-1,-2"]["clean"]),
        ("Transitional Relic — grass and cool stone", by_coordinate["-2,-1"]["clean"]),
    ], "Relic family — related language, distinct composition", 2, gallery / "relic-comparison.png", renderer)

    neighbor_items = [
        ("West Support (locked)", load_existing_neighbor(root, "west-support")),
        ("Aurum Keep", by_coordinate["-1,0"]["clean"]),
        ("Crown Citadel (locked)", load_existing_neighbor(root, "crown-citadel")),
        ("Transitional Relic", by_coordinate["-2,-1"]["clean"]),
        ("NW Holding Tower", by_coordinate["-1,-1"]["clean"]),
        ("Future Greybanner: topology only", Image.new("RGB", MAP_SIZE, (38, 49, 57))),
    ]
    comparison_grid(neighbor_items, "Batch B1 + approved/future-neighbor continuity", 3, gallery / "neighbor-comparison.png", renderer)

    proof_items = []
    for item in review_items:
        coordinate = f"{item['coordinate']['gridX']},{item['coordinate']['gridY']}"
        prototype = next(p for p in index["prototypes"] if f"{p['coordinate']['gridX']},{p['coordinate']['gridY']}" == coordinate)
        proof = Image.open(root / prototype["outputDirectory"] / "qa/11-objective-placement-proof.png").convert("RGB")
        proof_items.append((item["name"], proof))
    comparison_grid(proof_items, "Objective placement proof — center cross and approved offsets", 3, gallery / "objective-placement-proof.png", renderer)
    runtime_review_board(index, root, gallery / "runtime-review-board.png", renderer)
    neighbor_edge_sheet(by_coordinate, root, gallery / "neighbor-edge-continuity.png", renderer)
    print(json.dumps({"prototypeCount": len(review_items), "gallery": str(gallery)}, separators=(",", ":")))


if __name__ == "__main__":
    main()
