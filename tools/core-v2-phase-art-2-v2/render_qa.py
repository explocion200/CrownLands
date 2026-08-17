"""Build development-only Core v2 Phase ART-2 v2 visual review artifacts."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PHASE_A = ROOT / "benchmark-results" / "map" / "core-v2-phase-a" / "prototypes"
ART2 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-2"
ART2_V2 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-2-v2"
RUNTIME = ART2_V2 / "runtime"
GALLERY = ART2_V2 / "gallery"
MAP_SIZE = (1448, 1086)
BG = (14, 24, 32)

MAPS = (
    ("crown-citadel", "Crown Citadel", (0, 0), 60, (210, 160, 610, 480)),
    ("ironwatch", "Ironwatch", (0, 1), 60, (810, 135, 1240, 480)),
    ("southwest-holding-tower", "Southwest Holding Tower", (-1, 1), 55, (120, 620, 570, 1010)),
    ("west-south-deed-camp", "Deed Camp", (-2, 1), 60, (980, 250, 1320, 500)),
    ("west-support", "West Support", (-2, 0), 70, (160, 620, 610, 990)),
)

V1_RENDER_PATH = ROOT / "tools" / "core-v2-phase-art-2" / "render_qa.py"
SPEC = importlib.util.spec_from_file_location("core_art2_v1_render", V1_RENDER_PATH)
assert SPEC and SPEC.loader
V1 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V1)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def city_overlay(base: Image.Image, cities: list[dict], city_art: list[Image.Image]) -> Image.Image:
    canvas = base.convert("RGBA")
    for index, city in sorted(enumerate(cities), key=lambda item: item[1]["y"]):
        V1.paste_center(canvas, city_art[index % len(city_art)], city["x"], city["y"])
    return canvas.convert("RGB")


def objective_overlay(base: Image.Image, plan: dict) -> Image.Image:
    canvas = base.convert("RGBA")
    objective = plan["coreRegion"]["objective"]
    art = V1.objective_art(plan)
    if art is not None:
        V1.paste_center(canvas, art, objective["x"], objective["y"], 0.62)
    elif objective["type"] == "holding_tower":
        draw = ImageDraw.Draw(canvas, "RGBA")
        x, y = objective["x"], objective["y"]
        draw.ellipse((x - 142, y - 126, x + 142, y + 126), fill=(242, 188, 73, 26), outline=(255, 225, 150, 235), width=4)
        draw.line((x - 62, y, x + 62, y), fill=(255, 225, 150, 235), width=4)
        draw.line((x, y - 44, x, y + 44), fill=(255, 225, 150, 235), width=4)
    return canvas.convert("RGB")


def titled_pair(left: Image.Image, right: Image.Image, title: str, left_label: str, right_label: str, cell=(724, 543)) -> Image.Image:
    board = Image.new("RGB", (cell[0] * 2, 54 + cell[1]), BG)
    ImageDraw.Draw(board).text((18, 12), title, font=V1.font(28, True), fill=(255, 235, 178))
    board.paste(V1.labeled_cell(left, cell, left_label), (0, 54))
    board.paste(V1.labeled_cell(right, cell, right_label), (cell[0], 54))
    return board


def center_crop(image: Image.Image, width=560, height=430) -> Image.Image:
    return V1.crop_around(image, 724, 543, width, height)


def edge_board(image: Image.Image, title: str) -> Image.Image:
    return V1.edge_board(image, title)


def five_map_board(records: list[dict], key: str, file_name: str, title: str):
    cell = (480, 360)
    board = Image.new("RGB", (cell[0] * 3, 54 + cell[1] * 2), BG)
    ImageDraw.Draw(board).text((18, 12), title, font=V1.font(28, True), fill=(255, 235, 178))
    for index, record in enumerate(records):
        x, y = (index % 3) * cell[0], 54 + (index // 3) * cell[1]
        label = f"{record['title']} {record['coordinate']} • {record['capacity']} cities"
        board.paste(V1.labeled_cell(record[key], cell, label), (x, y))
    board.save(GALLERY / file_name, optimize=True)


def road_before_after_board(records: list[dict]):
    cell = (560, 330)
    board = Image.new("RGB", (1120, 54 + len(records) * cell[1]), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-2 v2 — ROAD BEFORE / AFTER", font=V1.font(30, True), fill=(255, 235, 178))
    for row, record in enumerate(records):
        y = 54 + row * cell[1]
        old = center_crop(record["old"], 680, 400)
        new = center_crop(record["new"], 680, 400)
        board.paste(V1.labeled_cell(old, cell, f"{record['title']} — ART-2 thick road"), (0, y))
        board.paste(V1.labeled_cell(new, cell, f"{record['title']} — v2 medieval wear"), (560, y))
    board.save(GALLERY / "road-before-after-board.png", optimize=True)


def structure_integration_board(records: list[dict]):
    selected = [record for record in records if record["key"] != "west-support"]
    cell = (560, 420)
    board = Image.new("RGB", (1120, 54 + cell[1] * 2), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-2 v2 — STRUCTURE INTEGRATION BOARD", font=V1.font(30, True), fill=(255, 235, 178))
    for index, record in enumerate(selected):
        crop = center_crop(record["objective"], 620, 470)
        x, y = (index % 2) * cell[0], 54 + (index // 2) * cell[1]
        label = record["title"] + (" — reservation only" if record["key"] == "southwest-holding-tower" else " — runtime art over integrated ground")
        board.paste(V1.labeled_cell(crop, cell, label), (x, y))
    board.save(GALLERY / "structure-integration-board.png", optimize=True)


def normal_runtime_board(records: list[dict]):
    cell = (480, 360)
    board = Image.new("RGB", (1440, 54 + 720), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-2 v2 — actual Crownlands normal gameplay zoom", font=V1.font(28, True), fill=(255, 235, 178))
    for index, record in enumerate(records):
        shot = Image.open(RUNTIME / f"{record['key']}-normal.png").convert("RGB")
        x, y = (index % 3) * cell[0], 54 + (index // 3) * cell[1]
        board.paste(V1.labeled_cell(shot, cell, record["title"]), (x, y))
    board.save(GALLERY / "normal-runtime-zoom-board.png", optimize=True)


def main():
    static_only = "--static" in sys.argv
    GALLERY.mkdir(parents=True, exist_ok=True)
    city_art = V1.load_city_art()
    art2_index = read_json(ART2 / "art2-index.json")
    art2_hashes = {entry["key"]: entry["candidatePngSha256"] for entry in art2_index["entries"]}
    records = []
    entries = []

    for key, title, coordinate, capacity, detail_crop in MAPS:
        source = PHASE_A / key
        old_path = ART2 / "candidates" / key / "map-final-candidate.png"
        candidate_dir = ART2_V2 / "candidates" / key
        new_path = candidate_dir / "map-final-candidate-v2.png"
        qa = candidate_dir / "qa"
        qa.mkdir(parents=True, exist_ok=True)
        old = Image.open(old_path).convert("RGB")
        new = Image.open(new_path).convert("RGB")
        if old.size != MAP_SIZE or new.size != MAP_SIZE:
            raise ValueError(f"{key}: expected {MAP_SIZE}, got old={old.size}, new={new.size}")
        if sha256(old_path) != art2_hashes[key]:
            raise ValueError(f"{key}: ART-2 baseline candidate changed")
        cities = read_json(source / "cities.json")
        plan = read_json(source / "composition.json")
        if len(cities) != capacity:
            raise ValueError(f"{key}: capacity changed")
        cities_only = city_overlay(new, cities, city_art)
        objective_only = objective_overlay(new, plan)
        combined = V1.runtime_overlay(new, cities, plan, city_art)

        shutil.copy2(old_path, qa / "01-art2-current-candidate.png")
        shutil.copy2(new_path, qa / "02-art2-v2-improved-candidate.png")
        shutil.copy2(new_path, qa / "03-clean-map.png")
        cities_only.save(qa / "04-map-with-actual-cities.png", optimize=True)
        objective_only.save(qa / "05-objective-overlay.png", optimize=True)
        objective_label = "center negative space — no objective" if key == "west-support" else "objective-ground integration"
        V1.labeled_cell(center_crop(objective_only), (720, 520), objective_label).save(qa / "06-objective-ground-integration.png", optimize=True)
        titled_pair(center_crop(old, 680, 400), center_crop(new, 680, 400), f"{title} — road treatment", "ART-2", "ART-2 v2").save(qa / "07-road-treatment-before-after.png", optimize=True)
        V1.labeled_cell(new.crop(detail_crop), (720, 520), "purposeful terrain detail between city pockets").save(qa / "08-terrain-detail-closeup.png", optimize=True)
        edge_board(new, title).save(qa / "09-perimeter-closeup.png", optimize=True)
        if not static_only:
            shutil.copy2(RUNTIME / f"{key}-normal.png", qa / "10-normal-gameplay-zoom.png")
        titled_pair(old, new, f"{title} — ART-2 vs ART-2 v2", "ART-2 CURRENT", "ART-2 v2 IMPROVED").save(qa / "00-art2-vs-v2-review.png", optimize=True)
        new.save(candidate_dir / "map-final-candidate-v2.webp", "WEBP", quality=92, method=6)

        record = {"key": key, "title": title, "coordinate": coordinate, "capacity": capacity, "old": old, "new": new, "cities": cities_only, "objective": objective_only, "combined": combined}
        records.append(record)
        entries.append({
            "key": key,
            "coordinate": {"gridX": coordinate[0], "gridY": coordinate[1]},
            "capacity": capacity,
            "art2BaselinePngSha256": sha256(old_path),
            "candidateV2PngSha256": sha256(new_path),
            "candidateV2WebpSha256": sha256(candidate_dir / "map-final-candidate-v2.webp"),
            "citiesSha256": sha256(source / "cities.json"),
            "compositionSha256": sha256(source / "composition.json"),
            "validationReceiptSha256": sha256(source / "validation-receipt.json"),
        })

    five_map_board(records, "new", "five-art2-v2-clean-candidates.png", "Core v2 ART-2 v2 — handcrafted final-art candidates")
    five_map_board(records, "combined", "five-art2-v2-runtime-overlays.png", "Core v2 ART-2 v2 — locked cities and objectives")
    road_before_after_board(records)
    structure_integration_board(records)
    if not static_only:
        normal_runtime_board(records)

    receipt = {
        "phase": "Crownlands Core v2 Phase ART-2 v2",
        "developmentOnly": True,
        "productionActivated": False,
        "artRevisionOnly": True,
        "art2BaselineModified": False,
        "newCoreCoordinatesGenerated": 0,
        "candidateBackgroundCount": 5,
        "mapDimensions": {"width": 1448, "height": 1086},
        "hardMinimumCoreCitySpacingPx": 68,
        "entries": entries,
    }
    (ART2_V2 / "art2-v2-index.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": len(records), "staticOnly": static_only, "gallery": str(GALLERY)}, separators=(",", ":")))


if __name__ == "__main__":
    main()
