"""Build development-only Core v2 Phase ART-3 review artifacts."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
B1 = ROOT / "benchmark-results" / "map" / "core-v2-phase-b1"
PROTOTYPES = B1 / "prototypes"
ART2_V2 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-2-v2"
ART3 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-3"
RUNTIME = ART3 / "runtime"
GALLERY = ART3 / "gallery"
MAP_SIZE = (1448, 1086)
BG = (14, 24, 32)

MAPS = (
    ("northwest-warband-camp", "Warband Camp", (-2, -2), 55, (350, 460, 850, 900)),
    ("northwest-relic-camp", "Northern Relic Camp", (-1, -2), 55, (250, 120, 720, 500)),
    ("west-north-relic-camp", "Transitional Relic Camp", (-2, -1), 55, (220, 250, 690, 630)),
    ("northwest-holding-tower", "Northwest Holding Tower", (-1, -1), 55, (120, 90, 650, 470)),
    ("aurum-keep", "Aurum Keep", (-1, 0), 60, (880, 110, 1360, 500)),
)

V1_PATH = ROOT / "tools" / "core-v2-phase-art-2" / "render_qa.py"
SPEC = importlib.util.spec_from_file_location("core_art2_render", V1_PATH)
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
        draw.ellipse((x - 142, y - 126, x + 142, y + 126), fill=(242, 188, 73, 22), outline=(255, 225, 150, 225), width=4)
        draw.line((x - 58, y, x + 58, y), fill=(255, 225, 150, 225), width=4)
        draw.line((x, y - 42, x, y + 42), fill=(255, 225, 150, 225), width=4)
    return canvas.convert("RGB")


def center_crop(image: Image.Image, width=620, height=470) -> Image.Image:
    return V1.crop_around(image, 724, 543, width, height)


def titled_pair(left: Image.Image, right: Image.Image, title: str, left_label: str, right_label: str, cell=(724, 543)) -> Image.Image:
    board = Image.new("RGB", (cell[0] * 2, 54 + cell[1]), BG)
    ImageDraw.Draw(board).text((18, 12), title, font=V1.font(28, True), fill=(255, 235, 178))
    board.paste(V1.labeled_cell(left, cell, left_label), (0, 54))
    board.paste(V1.labeled_cell(right, cell, right_label), (cell[0], 54))
    return board


def map_grid(records: list[dict], key: str, title: str, output: Path):
    cell = (480, 360)
    board = Image.new("RGB", (cell[0] * 3, 54 + cell[1] * 2), BG)
    ImageDraw.Draw(board).text((18, 12), title, font=V1.font(28, True), fill=(255, 235, 178))
    for index, record in enumerate(records):
        x, y = (index % 3) * cell[0], 54 + (index // 3) * cell[1]
        label = f"{record['title']} {record['coordinate']} • {record['capacity']} cities"
        board.paste(V1.labeled_cell(record[key], cell, label), (x, y))
    board.save(output, optimize=True)


def ten_map_board(records: list[dict]):
    approved = [
        ("Crown Citadel", "crown-citadel"),
        ("Ironwatch", "ironwatch"),
        ("SW Tower", "southwest-holding-tower"),
        ("Deed Camp", "west-south-deed-camp"),
        ("West Support", "west-support"),
    ]
    items = [(title, Image.open(ART2_V2 / "candidates" / key / "map-final-candidate-v2.png").convert("RGB")) for title, key in approved]
    items.extend((record["title"], record["new"]) for record in records)
    cell = (360, 270)
    board = Image.new("RGB", (cell[0] * 5, 58 + cell[1] * 2), BG)
    ImageDraw.Draw(board).text((18, 12), "Core v2 — ten final-style backgrounds", font=V1.font(30, True), fill=(255, 235, 178))
    for index, (label, image) in enumerate(items):
        board.paste(V1.labeled_cell(image, cell, label), ((index % 5) * cell[0], 58 + (index // 5) * cell[1]))
    board.save(GALLERY / "ten-map-core-style-board.png", optimize=True)


def road_board(records: list[dict]):
    cell = (560, 330)
    board = Image.new("RGB", (1120, 54 + len(records) * cell[1]), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-3 — ROAD BEFORE / AFTER", font=V1.font(30, True), fill=(255, 235, 178))
    for row, record in enumerate(records):
        y = 54 + row * cell[1]
        board.paste(V1.labeled_cell(center_crop(record["old"], 680, 400), cell, f"{record['title']} — B1 prototype"), (0, y))
        board.paste(V1.labeled_cell(center_crop(record["new"], 680, 400), cell, f"{record['title']} — ART-3 wagon roads"), (560, y))
    board.save(GALLERY / "road-before-after-board.png", optimize=True)


def structure_board(records: list[dict]):
    cell = (560, 420)
    board = Image.new("RGB", (1120, 54 + math.ceil(len(records) / 2) * cell[1]), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-3 — OBJECTIVE GROUND INTEGRATION", font=V1.font(30, True), fill=(255, 235, 178))
    for index, record in enumerate(records):
        label = record["title"] + (" — reservation only" if record["key"] == "northwest-holding-tower" else " — runtime art over occupied ground")
        board.paste(V1.labeled_cell(center_crop(record["objective"], 620, 470), cell, label), ((index % 2) * cell[0], 54 + (index // 2) * cell[1]))
    board.save(GALLERY / "structure-integration-board.png", optimize=True)


def climate_board(records: list[dict]):
    ordered = [records[0], records[1], records[3], records[2], records[4]]
    map_grid(ordered, "new", "ART-3 — north → northwest → west climate continuity", GALLERY / "climate-continuity-board.png")


def relic_board(records: list[dict]):
    relics = [record for record in records if "Relic" in record["title"]]
    titled_pair(relics[0]["new"], relics[1]["new"], "Relic family — shared history, distinct geography", "NORTHERN RELIC", "TRANSITIONAL RELIC").save(GALLERY / "relic-comparison-board.png", optimize=True)


def runtime_board(records: list[dict]):
    if not all((RUNTIME / f"{record['key']}-normal.png").exists() for record in records):
        return
    cell = (480, 360)
    board = Image.new("RGB", (1440, 54 + 720), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-3 — actual Crownlands normal gameplay zoom", font=V1.font(28, True), fill=(255, 235, 178))
    for index, record in enumerate(records):
        shot = Image.open(RUNTIME / f"{record['key']}-normal.png").convert("RGB")
        board.paste(V1.labeled_cell(shot, cell, record["title"]), ((index % 3) * cell[0], 54 + (index // 3) * cell[1]))
    board.save(GALLERY / "normal-runtime-zoom-board.png", optimize=True)


def main():
    static_only = "--static" in sys.argv
    GALLERY.mkdir(parents=True, exist_ok=True)
    city_art = V1.load_city_art()
    b1_index = read_json(B1 / "batch-index.json")
    b1_by_key = {entry["key"]: entry for entry in b1_index["prototypes"]}
    records = []
    entries = []

    for key, title, coordinate, capacity, detail_crop in MAPS:
        prototype = b1_by_key[key]
        source = ROOT / prototype["outputDirectory"]
        candidate_dir = ART3 / "candidates" / key
        qa = candidate_dir / "qa"
        qa.mkdir(parents=True, exist_ok=True)
        old_path = source / "map-clean.png"
        new_path = candidate_dir / "map-final-candidate.png"
        old = Image.open(old_path).convert("RGB")
        new = Image.open(new_path).convert("RGB")
        if old.size != MAP_SIZE or new.size != MAP_SIZE:
            raise ValueError(f"{key}: expected {MAP_SIZE}, got old={old.size}, new={new.size}")
        cities = read_json(source / "cities.json")
        plan = read_json(source / "composition.json")
        if len(cities) != capacity:
            raise ValueError(f"{key}: capacity changed")

        old_combined = V1.runtime_overlay(old, cities, plan, city_art)
        new_cities = city_overlay(new, cities, city_art)
        new_objective = objective_overlay(new, plan)
        new_combined = V1.runtime_overlay(new, cities, plan, city_art)
        objective = plan["coreRegion"]["objective"]

        shutil.copy2(old_path, qa / "01-b1-prototype.png")
        shutil.copy2(new_path, qa / "02-art3-final-candidate.png")
        old_combined.save(qa / "03-prototype-runtime-objects.png", optimize=True)
        new_combined.save(qa / "04-final-runtime-objects.png", optimize=True)
        V1.labeled_cell(V1.crop_around(new_objective, objective["x"], objective["y"], 620, 470), (720, 520), "objective-ground integration" if key != "northwest-holding-tower" else "future Tower reservation — no pad").save(qa / "05-objective-ground-integration.png", optimize=True)
        titled_pair(center_crop(old, 680, 400), center_crop(new, 680, 400), f"{title} — road rendering", "B1 PROTOTYPE", "ART-3 FINAL").save(qa / "06-road-before-after.png", optimize=True)
        V1.labeled_cell(new.crop(detail_crop), (720, 520), "purposeful handcrafted detail between city pockets").save(qa / "07-environmental-detail.png", optimize=True)
        V1.edge_board(new, title).save(qa / "08-perimeter-closeup.png", optimize=True)
        if not static_only and (RUNTIME / f"{key}-normal.png").exists():
            shutil.copy2(RUNTIME / f"{key}-normal.png", qa / "09-normal-in-game-browser.png")
        titled_pair(old, new, f"{title} — B1 prototype vs ART-3", "B1 PROTOTYPE", "ART-3 FINAL-ART CANDIDATE").save(qa / "00-prototype-vs-final.png", optimize=True)
        new.save(candidate_dir / "map-final-candidate.webp", "WEBP", quality=92, method=6)

        record = {"key": key, "title": title, "coordinate": coordinate, "capacity": capacity, "old": old, "new": new, "cities": new_cities, "objective": new_objective, "combined": new_combined}
        records.append(record)
        entries.append({
            "key": key,
            "coordinate": {"gridX": coordinate[0], "gridY": coordinate[1]},
            "capacity": capacity,
            "objective": {"type": objective["type"], "x": objective["x"], "y": objective["y"]},
            "b1PrototypePngSha256": sha256(old_path),
            "candidatePngSha256": sha256(new_path),
            "candidateWebpSha256": sha256(candidate_dir / "map-final-candidate.webp"),
            "citiesSha256": sha256(source / "cities.json"),
            "compositionSha256": sha256(source / "composition.json"),
            "validationReceiptSha256": sha256(source / "validation-receipt.json"),
        })
        shutil.copy2(qa / "00-prototype-vs-final.png", GALLERY / f"{key}-prototype-vs-final.png")

    map_grid(records, "new", "Core v2 ART-3 — B1 final-art candidates", GALLERY / "five-art3-clean-candidates.png")
    map_grid(records, "combined", "Core v2 ART-3 — locked cities and objectives", GALLERY / "five-art3-runtime-overlays.png")
    road_board(records)
    structure_board(records)
    relic_board(records)
    climate_board(records)
    ten_map_board(records)
    if not static_only:
        runtime_board(records)

    receipt = {
        "phase": "Crownlands Core v2 Phase ART-3",
        "developmentOnly": True,
        "productionActivated": False,
        "artRevisionOnly": True,
        "authoritativeArtStandard": "ART-2 v2",
        "newCoreCoordinatesGenerated": 0,
        "candidateBackgroundCount": 5,
        "finishedCoreBackgroundCount": 10,
        "mapDimensions": {"width": 1448, "height": 1086},
        "hardMinimumCoreCitySpacingPx": 68,
        "entries": entries,
    }
    (ART3 / "art3-index.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": len(records), "staticOnly": static_only, "gallery": str(GALLERY)}, separators=(",", ":")))


if __name__ == "__main__":
    main()
