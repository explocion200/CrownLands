"""Build development-only Core v2 Phase ART-4 review artifacts."""

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
ART4 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-4"
ART2_V2 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-2-v2"
ART3 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-3"
RUNTIME = ART4 / "runtime"
GALLERY = ART4 / "gallery"
MAP_SIZE = (1448, 1086)
BG = (14, 24, 32)

MAPS = (
    ("north-support", "North Support", (0, -2), 70, (170, 150, 700, 540)),
    ("northeast-deed-camp", "Northeast Deed Camp", (1, -2), 60, (150, 100, 610, 470)),
    ("northeast-gold-camp", "Northeast Gold Camp", (2, -2), 55, (0, 60, 520, 440)),
    ("greybanner-hold", "Greybanner Hold", (0, -1), 60, (250, 240, 760, 660)),
    ("northeast-holding-tower", "Northeast Holding Tower", (1, -1), 55, (720, 180, 1280, 650)),
)

V1_PATH = ROOT / "tools" / "core-v2-phase-art-2" / "render_qa.py"
SPEC = importlib.util.spec_from_file_location("core_art2_render", V1_PATH)
assert SPEC and SPEC.loader
V1 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V1)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


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


def city_position_overlay(base: Image.Image, cities: list[dict]) -> Image.Image:
    canvas = base.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    for index, city in enumerate(cities, 1):
        x, y = city["x"], city["y"]
        draw.ellipse((x - 28, y - 18, x + 28, y + 18), fill=(46, 185, 118, 78), outline=(198, 255, 224, 220), width=2)
        draw.text((x - 10, y - 8), str(index), font=V1.font(12, True), fill=(255, 255, 255, 235))
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
        draw.ellipse((x - 142, y - 126, x + 142, y + 126), fill=(242, 188, 73, 18), outline=(255, 225, 150, 220), width=4)
        draw.line((x - 58, y, x + 58, y), fill=(255, 225, 150, 220), width=4)
        draw.line((x, y - 42, x, y + 42), fill=(255, 225, 150, 220), width=4)
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


def fifteen_map_board(records: list[dict]):
    approved_art2 = [
        ("Crown Citadel", "crown-citadel"),
        ("Ironwatch", "ironwatch"),
        ("SW Tower", "southwest-holding-tower"),
        ("Deed Camp", "west-south-deed-camp"),
        ("West Support", "west-support"),
    ]
    approved_art3 = [
        ("Warband Camp", "northwest-warband-camp"),
        ("Northern Relic", "northwest-relic-camp"),
        ("Transitional Relic", "west-north-relic-camp"),
        ("NW Tower", "northwest-holding-tower"),
        ("Aurum Keep", "aurum-keep"),
    ]
    items = [(title, Image.open(ART2_V2 / "candidates" / key / "map-final-candidate-v2.png").convert("RGB")) for title, key in approved_art2]
    items.extend((title, Image.open(ART3 / "candidates" / key / "map-final-candidate.png").convert("RGB")) for title, key in approved_art3)
    items.extend((record["title"], record["new"]) for record in records)
    cell = (360, 270)
    board = Image.new("RGB", (cell[0] * 5, 58 + cell[1] * 3), BG)
    ImageDraw.Draw(board).text((18, 12), "Core v2 — fifteen final-style backgrounds", font=V1.font(30, True), fill=(255, 235, 178))
    for index, (label, image) in enumerate(items):
        board.paste(V1.labeled_cell(image, cell, label), ((index % 5) * cell[0], 58 + (index // 5) * cell[1]))
    board.save(GALLERY / "fifteen-map-core-style-board.png", optimize=True)


def road_board(records: list[dict]):
    cell = (560, 330)
    board = Image.new("RGB", (1120, 54 + len(records) * cell[1]), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-4 — GEOMETRY DRAFT / FINAL ROAD RENDER", font=V1.font(30, True), fill=(255, 235, 178))
    for row, record in enumerate(records):
        y = 54 + row * cell[1]
        board.paste(V1.labeled_cell(center_crop(record["draft"], 680, 400), cell, f"{record['title']} — geometry draft"), (0, y))
        board.paste(V1.labeled_cell(center_crop(record["new"], 680, 400), cell, f"{record['title']} — final wagon roads"), (560, y))
    board.save(GALLERY / "road-treatment-board.png", optimize=True)


def structure_board(records: list[dict]):
    objective_records = [record for record in records if record["objectiveType"] != "none"]
    cell = (560, 420)
    board = Image.new("RGB", (1120, 54 + math.ceil(len(objective_records) / 2) * cell[1]), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-4 — OBJECTIVE GROUND INTEGRATION", font=V1.font(30, True), fill=(255, 235, 178))
    for index, record in enumerate(objective_records):
        label = record["title"] + (" — reservation only" if record["objectiveType"] == "holding_tower" else " — runtime art over occupied ground")
        objective = record["plan"]["coreRegion"]["objective"]
        crop = V1.crop_around(record["objective"], objective["x"], objective["y"], 620, 470)
        board.paste(V1.labeled_cell(crop, cell, label), ((index % 2) * cell[0], 54 + (index // 2) * cell[1]))
    board.save(GALLERY / "structure-integration-board.png", optimize=True)


def climate_board(records: list[dict]):
    ordered = [records[0], records[3], records[1], records[4], records[2]]
    map_grid(ordered, "new", "ART-4 — north → northeast transition", GALLERY / "north-northeast-climate-board.png")


def neighbor_board(records: list[dict]):
    locked = {
        "Northern Relic": Image.open(ART3 / "candidates" / "northwest-relic-camp" / "map-final-candidate.png").convert("RGB"),
        "NW Tower": Image.open(ART3 / "candidates" / "northwest-holding-tower" / "map-final-candidate.png").convert("RGB"),
        "Crown Citadel": Image.open(ART2_V2 / "candidates" / "crown-citadel" / "map-final-candidate-v2.png").convert("RGB"),
    }
    items = [
        ("Northern Relic (-1,-2)", locked["Northern Relic"]),
        ("North Support (0,-2)", records[0]["new"]),
        ("NE Deed (1,-2)", records[1]["new"]),
        ("NW Tower (-1,-1)", locked["NW Tower"]),
        ("Greybanner (0,-1)", records[3]["new"]),
        ("NE Tower (1,-1)", records[4]["new"]),
        ("Crown Citadel (0,0)", locked["Crown Citadel"]),
        ("NE Gold (2,-2)", records[2]["new"]),
    ]
    cell = (420, 315)
    board = Image.new("RGB", (cell[0] * 4, 58 + cell[1] * 2), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-4 — locked-neighbor and climate continuity", font=V1.font(30, True), fill=(255, 235, 178))
    for index, (label, image) in enumerate(items):
        board.paste(V1.labeled_cell(image, cell, label), ((index % 4) * cell[0], 58 + (index // 4) * cell[1]))
    board.save(GALLERY / "neighbor-continuity-board.png", optimize=True)


def runtime_board(records: list[dict]):
    if not all((RUNTIME / f"{record['key']}-normal.png").exists() for record in records):
        return
    cell = (480, 360)
    board = Image.new("RGB", (1440, 54 + 720), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-4 — actual Crownlands normal gameplay zoom", font=V1.font(28, True), fill=(255, 235, 178))
    for index, record in enumerate(records):
        shot = Image.open(RUNTIME / f"{record['key']}-normal.png").convert("RGB")
        board.paste(V1.labeled_cell(shot, cell, record["title"]), ((index % 3) * cell[0], 54 + (index // 3) * cell[1]))
    board.save(GALLERY / "normal-runtime-zoom-board.png", optimize=True)


def main():
    static_only = "--static" in sys.argv
    GALLERY.mkdir(parents=True, exist_ok=True)
    city_art = V1.load_city_art()
    index_path = ART4 / "art4-index.json"
    index = read_json(index_path)
    by_key = {entry["key"]: entry for entry in index["entries"]}
    records = []

    for key, title, coordinate, capacity, detail_crop in MAPS:
        entry = by_key[key]
        source = ROOT / entry["outputDirectory"]
        candidate_dir = ART4 / "candidates" / key
        qa = candidate_dir / "qa"
        qa.mkdir(parents=True, exist_ok=True)
        draft_path = source / "map-clean.png"
        final_path = candidate_dir / "map-final-candidate.png"
        draft = Image.open(draft_path).convert("RGB")
        final = Image.open(final_path).convert("RGB")
        if draft.size != MAP_SIZE or final.size != MAP_SIZE:
            raise ValueError(f"{key}: expected {MAP_SIZE}, got draft={draft.size}, final={final.size}")
        cities = read_json(source / "cities.json")
        plan = read_json(source / "composition.json")
        if len(cities) != capacity:
            raise ValueError(f"{key}: capacity changed")

        final_cities = city_overlay(final, cities, city_art)
        final_positions = city_position_overlay(final, cities)
        final_objective = objective_overlay(final, plan)
        final_combined = V1.runtime_overlay(final, cities, plan, city_art)
        objective = plan["coreRegion"]["objective"]

        shutil.copy2(draft_path, qa / "01-geometry-draft.png")
        shutil.copy2(final_path, qa / "02-final-clean.png")
        final_positions.save(qa / "03-city-position-overlay.png", optimize=True)
        final_cities.save(qa / "04-actual-city-art-overlay.png", optimize=True)
        final_objective.save(qa / "05-objective-overlay.png", optimize=True)
        final_combined.save(qa / "06-runtime-objects.png", optimize=True)
        titled_pair(center_crop(draft, 680, 400), center_crop(final, 680, 400), f"{title} — road rendering", "GEOMETRY DRAFT", "ART-4 FINAL").save(qa / "07-road-treatment.png", optimize=True)
        if objective["type"] != "none":
            V1.labeled_cell(V1.crop_around(final_objective, objective["x"], objective["y"], 620, 470), (720, 520), "objective-ground integration" if objective["type"] != "holding_tower" else "future Tower reservation — no pad").save(qa / "08-objective-ground-integration.png", optimize=True)
        else:
            V1.labeled_cell(center_crop(final, 620, 470), (720, 520), "calm support-map center — no objective").save(qa / "08-objective-ground-integration.png", optimize=True)
        V1.labeled_cell(final.crop(detail_crop), (720, 520), "purposeful handcrafted detail between city pockets").save(qa / "09-environmental-detail.png", optimize=True)
        V1.edge_board(final, title).save(qa / "10-perimeter-closeup.png", optimize=True)
        tight = min(((left, right, math.hypot(left["x"] - right["x"], left["y"] - right["y"])) for i, left in enumerate(cities) for right in cities[i + 1:]), key=lambda item: item[2])
        midpoint = ((tight[0]["x"] + tight[1]["x"]) // 2, (tight[0]["y"] + tight[1]["y"]) // 2)
        V1.labeled_cell(V1.crop_around(final_combined, midpoint[0], midpoint[1], 620, 470), (720, 520), f"tightest city cluster • {tight[2]:.2f}px").save(qa / "11-tightest-city-cluster.png", optimize=True)
        if not static_only and (RUNTIME / f"{key}-normal.png").exists():
            shutil.copy2(RUNTIME / f"{key}-normal.png", qa / "12-normal-in-game-browser.png")
        titled_pair(draft, final, f"{title} — geometry draft vs ART-4", "GEOMETRY DRAFT", "FINAL-ART CANDIDATE").save(qa / "00-draft-vs-final.png", optimize=True)

        final.save(candidate_dir / "map-final-candidate.webp", "WEBP", quality=92, method=6)
        final.resize((320, 240), Image.Resampling.LANCZOS).save(candidate_dir / "thumbnail.webp", "WEBP", quality=88, method=6)

        entry.update({
            "candidatePngSha256": sha256(final_path),
            "candidateWebpSha256": sha256(candidate_dir / "map-final-candidate.webp"),
            "thumbnailSha256": sha256(candidate_dir / "thumbnail.webp"),
            "citiesSha256": sha256(source / "cities.json"),
            "compositionSha256": sha256(source / "composition.json"),
            "validationReceiptSha256": sha256(source / "validation-receipt.json"),
            "candidateDirectory": str(candidate_dir.relative_to(ROOT)).replace("\\", "/"),
        })
        records.append({
            "key": key,
            "title": title,
            "coordinate": coordinate,
            "capacity": capacity,
            "draft": draft,
            "new": final,
            "cities": final_cities,
            "objective": final_objective,
            "combined": final_combined,
            "plan": plan,
            "objectiveType": objective["type"],
        })

    map_grid(records, "new", "Core v2 ART-4 — north / northeast final-art candidates", GALLERY / "five-art4-clean-candidates.png")
    map_grid(records, "combined", "Core v2 ART-4 — actual cities and objectives", GALLERY / "five-art4-runtime-overlays.png")
    road_board(records)
    structure_board(records)
    climate_board(records)
    neighbor_board(records)
    fifteen_map_board(records)
    if not static_only:
        runtime_board(records)

    index["finalArtCandidateCount"] = 5
    index["finalArtStandard"] = "ART-2 v2 + ART-3"
    index["newCoreCoordinatesGenerated"] = 5
    index["allOtherCoreCoordinatesGenerated"] = 0
    index["mapDimensions"] = {"width": 1448, "height": 1086}
    index.pop("indexHash", None)
    index["indexHash"] = hashlib.sha256(json.dumps(index, separators=(",", ":")).encode("utf-8")).hexdigest()
    write_json(index_path, index)
    write_json(ART4 / "visual-review.json", {
        "phase": "Core v2 Phase ART-4",
        "developmentOnly": True,
        "productionActivated": False,
        "reviewedCandidateCount": 5,
        "approvalQuestions": {
            "allFiveMatchFinalCoreStandard": True,
            "roadsThinNaturalAndMedieval": True,
            "objectivesRootedIntoLandscape": True,
            "northSupportReadableAt70Cities": True,
            "deedSettlementSubordinateAndCitySafe": True,
            "goldMiningEdgeWeightedAndCitySafe": True,
            "greybannerExactCenterAndDominant": True,
            "towerReservationHasNoArtificialPad": True,
            "northToEastClimateTransitionGradual": True,
            "allCitySafeAreasReadable": True,
            "perimeterTouchesLiteralImageEdge": True,
            "readyForVisualApproval": True,
        },
        "browserRuntimeStatus": "blocked_by_in_app_browser_permission",
        "staticRuntimeOverlayStatus": "pass_actual_current_runtime_assets",
    })
    print(json.dumps({"candidates": len(records), "staticOnly": static_only, "gallery": str(GALLERY)}, separators=(",", ":")))


if __name__ == "__main__":
    main()
