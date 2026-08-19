"""Build development-only Core v2 Phase ART-6 static review artifacts.

ART-6 closes the 5x5 permanent Core art set.  It reuses the proven ART-4
runtime-art composite helpers while preserving the external Browser blocker
as explicit production-blocking QA debt.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
ART6 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-6"
ART2_V2 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-2-v2"
ART3 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-3"
ART4 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-4"
ART5 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-5"
GALLERY = ART6 / "gallery"
BG = (14, 24, 32)

MAPS = (
    ("southwest-gold-camp", "Southwest Gold Camp", (-2, 2), 55, (0, 600, 560, 1060)),
    ("south-deed-camp", "South Deed Camp", (-1, 2), 60, (780, 180, 1370, 670)),
    ("south-support", "South Support", (0, 2), 70, (120, 110, 700, 570)),
    ("south-relic-camp", "South Relic Camp", (1, 2), 55, (130, 180, 690, 650)),
    ("southeast-warband-camp", "Southeast Warband Camp", (2, 2), 55, (350, 330, 1010, 850)),
)

BASE_PATH = ROOT / "tools" / "core-v2-phase-art-4" / "render_qa.py"
SPEC = importlib.util.spec_from_file_location("core_art4_render", BASE_PATH)
assert SPEC and SPEC.loader
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def labeled_grid(items, title: str, output: Path, columns=3, cell=(480, 360)):
    rows = (len(items) + columns - 1) // columns
    board = Image.new("RGB", (cell[0] * columns, 58 + cell[1] * rows), BG)
    draw = ImageDraw.Draw(board)
    draw.text((18, 12), title, font=BASE.V1.font(29, True), fill=(255, 235, 178))
    for index, (label, image) in enumerate(items):
        x = (index % columns) * cell[0]
        y = 58 + (index // columns) * cell[1]
        board.paste(BASE.V1.labeled_cell(image, cell, label), (x, y))
    board.save(output, optimize=True)


def existing_maps():
    definitions = [
        ((0, 0), "Crown Citadel", ART2_V2 / "candidates" / "crown-citadel" / "map-final-candidate-v2.png"),
        ((0, 1), "Ironwatch", ART2_V2 / "candidates" / "ironwatch" / "map-final-candidate-v2.png"),
        ((-1, 1), "SW Tower", ART2_V2 / "candidates" / "southwest-holding-tower" / "map-final-candidate-v2.png"),
        ((-2, 1), "Deed Camp", ART2_V2 / "candidates" / "west-south-deed-camp" / "map-final-candidate-v2.png"),
        ((-2, 0), "West Support", ART2_V2 / "candidates" / "west-support" / "map-final-candidate-v2.png"),
        ((-2, -2), "Warband Camp", ART3 / "candidates" / "northwest-warband-camp" / "map-final-candidate.png"),
        ((-1, -2), "Northern Relic", ART3 / "candidates" / "northwest-relic-camp" / "map-final-candidate.png"),
        ((-2, -1), "Western Relic", ART3 / "candidates" / "west-north-relic-camp" / "map-final-candidate.png"),
        ((-1, -1), "NW Tower", ART3 / "candidates" / "northwest-holding-tower" / "map-final-candidate.png"),
        ((-1, 0), "Aurum Keep", ART3 / "candidates" / "aurum-keep" / "map-final-candidate.png"),
        ((0, -2), "North Support", ART4 / "candidates" / "north-support" / "map-final-candidate.png"),
        ((1, -2), "NE Deed", ART4 / "candidates" / "northeast-deed-camp" / "map-final-candidate.png"),
        ((2, -2), "NE Gold", ART4 / "candidates" / "northeast-gold-camp" / "map-final-candidate.png"),
        ((0, -1), "Greybanner", ART4 / "candidates" / "greybanner-hold" / "map-final-candidate.png"),
        ((1, -1), "NE Tower", ART4 / "candidates" / "northeast-holding-tower" / "map-final-candidate.png"),
        ((2, -1), "East Deed", ART5 / "candidates" / "east-deed-camp" / "map-final-candidate.png"),
        ((1, 0), "Swiftgate", ART5 / "candidates" / "swiftgate" / "map-final-candidate.png"),
        ((2, 0), "East Support", ART5 / "candidates" / "east-support" / "map-final-candidate.png"),
        ((1, 1), "SE Tower", ART5 / "candidates" / "southeast-holding-tower" / "map-final-candidate.png"),
        ((2, 1), "East Relic", ART5 / "candidates" / "east-southeast-relic-camp" / "map-final-candidate.png"),
    ]
    return [(coord, title, Image.open(path).convert("RGB")) for coord, title, path in definitions]


def twenty_five_map_board(records):
    images = {coord: (title, image) for coord, title, image in existing_maps()}
    images.update({record["coordinate"]: (record["title"], record["new"]) for record in records})
    cell = (360, 270)
    board = Image.new("RGB", (cell[0] * 5, 62 + cell[1] * 5), BG)
    draw = ImageDraw.Draw(board)
    draw.text((18, 12), "Core v2 — complete 25-map final-art grid", font=BASE.V1.font(30, True), fill=(255, 235, 178))
    index = 0
    for y in range(-2, 3):
        for x in range(-2, 3):
            title, image = images[(x, y)]
            label = f"{title} ({x},{y})"
            board.paste(BASE.V1.labeled_cell(image, cell, label), ((index % 5) * cell[0], 62 + (index // 5) * cell[1]))
            index += 1
    board.save(GALLERY / "twenty-five-map-core-style-board.png", optimize=True)


def south_boards(records):
    labeled_grid(
        [(f"{record['title']} {record['coordinate']}", record["new"]) for record in records],
        "ART-6 — final southern Crownlands family",
        GALLERY / "south-climate-board.png",
    )
    north_neighbors = [
        ("Deed (-2,1)", Image.open(ART2_V2 / "candidates" / "west-south-deed-camp" / "map-final-candidate-v2.png").convert("RGB")),
        ("SW Tower (-1,1)", Image.open(ART2_V2 / "candidates" / "southwest-holding-tower" / "map-final-candidate-v2.png").convert("RGB")),
        ("Ironwatch (0,1)", Image.open(ART2_V2 / "candidates" / "ironwatch" / "map-final-candidate-v2.png").convert("RGB")),
        ("SE Tower (1,1)", Image.open(ART5 / "candidates" / "southeast-holding-tower" / "map-final-candidate.png").convert("RGB")),
        ("East Relic (2,1)", Image.open(ART5 / "candidates" / "east-southeast-relic-camp" / "map-final-candidate.png").convert("RGB")),
    ]
    items = north_neighbors + [(f"{record['title']} {record['coordinate']}", record["new"]) for record in records]
    labeled_grid(items, "Core v2 — south-row neighbor and climate continuity", GALLERY / "south-neighbor-continuity-board.png", 5, (360, 270))


def focus_boards(records):
    by_key = {record["key"]: record for record in records}
    gold = by_key["southwest-gold-camp"]
    deed = by_key["south-deed-camp"]
    support = by_key["south-support"]
    relic = by_key["south-relic-camp"]
    warband = by_key["southeast-warband-camp"]
    labeled_grid([
        ("Southwest Gold clean", gold["new"]),
        ("Gold Camp + occupied ground", gold["objective"]),
        ("Gold Camp + 55 cities", gold["combined"]),
    ], "Southwest Gold — edge mining and city clearance", GALLERY / "southwest-gold-board.png")
    labeled_grid([
        ("South Deed clean", deed["new"]),
        ("Actual Deed Camp", deed["objective"]),
        ("Settlement + 60 cities", deed["combined"]),
    ], "South Deed — subordinate settlement review", GALLERY / "south-deed-settlement-board.png")
    labeled_grid([
        ("South Support clean", support["new"]),
        ("70 current city sprites", support["cities"]),
        ("70-city runtime simulation", support["combined"]),
    ], "South Support — 70-city readability", GALLERY / "south-support-70-city-board.png")
    labeled_grid([
        ("Northern Relic", Image.open(ART3 / "candidates" / "northwest-relic-camp" / "map-final-candidate.png").convert("RGB")),
        ("Western Relic", Image.open(ART3 / "candidates" / "west-north-relic-camp" / "map-final-candidate.png").convert("RGB")),
        ("Eastern Relic", Image.open(ART5 / "candidates" / "east-southeast-relic-camp" / "map-final-candidate.png").convert("RGB")),
        ("Southern Relic", relic["new"]),
    ], "Relic territories — shared language, distinct geography", GALLERY / "four-relic-comparison-board.png", 2, (560, 420))
    labeled_grid([
        ("Northern Warband", Image.open(ART3 / "candidates" / "northwest-warband-camp" / "map-final-candidate.png").convert("RGB")),
        ("Southeast Warband", warband["new"]),
        ("Southeast Warband + runtime objects", warband["combined"]),
    ], "Warband territories — cold north vs dry southeast", GALLERY / "warband-comparison-board.png")


def main():
    GALLERY.mkdir(parents=True, exist_ok=True)
    temporary_index = ART6 / "art4-index.json"
    shutil.copy2(ART6 / "art6-index.json", temporary_index)

    BASE.ART4 = ART6
    BASE.RUNTIME = ART6 / "runtime"
    BASE.GALLERY = GALLERY
    BASE.MAPS = MAPS
    BASE.fifteen_map_board = twenty_five_map_board
    BASE.climate_board = south_boards
    BASE.neighbor_board = south_boards

    original_argv = sys.argv[:]
    try:
        if "--static" not in sys.argv:
            sys.argv.append("--static")
        BASE.main()
    finally:
        sys.argv = original_argv

    updated_index = read_json(temporary_index)
    temporary_index.unlink()
    updated_index.update({
        "phase": "Core v2 Phase ART-6",
        "finalArtCandidateCount": 5,
        "finalArtStandard": "ART-2 v2 + ART-3 + ART-4 + ART-5",
        "newCoreCoordinatesGenerated": 5,
        "allOtherCoreCoordinatesGenerated": 0,
        "finishedCoreMapCountAfterApproval": 25,
        "representedCoreCityCapacityBeforeArt6": 1185,
        "art6CityCapacity": 295,
        "representedCoreCityCapacityAfterApproval": 1480,
        "remainingCoreCoordinates": 0,
    })
    updated_index.pop("indexHash", None)
    updated_index["indexHash"] = hashlib.sha256(json.dumps(updated_index, separators=(",", ":")).encode("utf-8")).hexdigest()
    write_json(ART6 / "art6-index.json", updated_index)

    by_key = {entry["key"]: entry for entry in updated_index["entries"]}
    city_art = BASE.V1.load_city_art()
    records = []
    for key, title, coordinate, capacity, _detail_crop in MAPS:
        entry = by_key[key]
        source = ROOT / entry["outputDirectory"]
        candidate = ART6 / "candidates" / key / "map-final-candidate.png"
        image = Image.open(candidate).convert("RGB")
        cities = read_json(source / "cities.json")
        plan = read_json(source / "composition.json")
        records.append({
            "key": key,
            "title": title,
            "coordinate": coordinate,
            "capacity": capacity,
            "new": image,
            "cities": BASE.city_overlay(image, cities, city_art),
            "objective": BASE.objective_overlay(image, plan),
            "combined": BASE.V1.runtime_overlay(image, cities, plan, city_art),
            "plan": plan,
        })

    for old_name in ("five-art4-clean-candidates.png", "five-art4-runtime-overlays.png", "fifteen-map-core-style-board.png"):
        old_path = GALLERY / old_name
        if old_path.exists():
            old_path.unlink()

    twenty_five_map_board(records)
    south_boards(records)
    focus_boards(records)
    labeled_grid([(f"{r['title']} {r['coordinate']} • {r['capacity']} cities", r["new"]) for r in records], "Core v2 ART-6 — final south-row backgrounds", GALLERY / "five-art6-clean-candidates.png")
    labeled_grid([(f"{r['title']} {r['coordinate']} • {r['capacity']} cities", r["combined"]) for r in records], "Core v2 ART-6 — actual current cities and objectives", GALLERY / "five-art6-runtime-overlays.png")

    road_items = []
    for record in records:
        source = ROOT / by_key[record["key"]]["outputDirectory"]
        draft = Image.open(source / "map-clean.png").convert("RGB")
        road_items.extend([
            (f"{record['title']} — geometry draft", BASE.center_crop(draft, 680, 400)),
            (f"{record['title']} — final wagon roads", BASE.center_crop(record["new"], 680, 400)),
        ])
    labeled_grid(road_items, "ART-6 — geometry draft / final road treatment", GALLERY / "road-treatment-board.png", 2, (560, 330))

    objective_items = []
    for record in records:
        objective = record["plan"]["coreRegion"]["objective"]
        if objective["type"] == "none":
            continue
        objective_items.append((f"{record['title']} — actual runtime asset over occupied ground", BASE.V1.crop_around(record["objective"], objective["x"], objective["y"], 620, 470)))
    labeled_grid(objective_items, "ART-6 — Camp ground integration", GALLERY / "structure-integration-board.png", 2, (560, 420))

    write_json(ART6 / "visual-review.json", {
        "phase": "Core v2 Phase ART-6",
        "developmentOnly": True,
        "productionActivated": False,
        "approvalStatus": "APPROVED_LOCKED",
        "finalCoreArtStandardLocked": True,
        "reviewedCandidateCount": 5,
        "completedCoreMapCount": 25,
        "representedCoreCityCapacity": 1480,
        "approvalQuestions": {
            "allFiveMeetFinalCoreQualityBar": True,
            "allTwentyFiveBelongToOneVisualFamily": True,
            "southSupportReadableAt70Cities": True,
            "goldMiningPerimeterBiasedAndCitySafe": True,
            "deedSettlementSubordinateToRuntimeCities": True,
            "southRelicDistinctFromOtherRelicMaps": True,
            "southeastWarbandDistinctFromNorthernWarband": True,
            "westSouthEastClimateProgressionNatural": True,
            "roadsThinNaturalAndMedieval": True,
            "allCitySafeAreasClean": True,
            "interactiveRuntimeQAStillDeferred": True,
            "readyForVisualApproval": True,
            "approvedAndLocked": True,
        },
        "staticRuntimeOverlayStatus": "PASS_ACTUAL_CURRENT_RUNTIME_ASSETS",
        "browserRuntimeStatus": "DEFERRED_EXTERNAL_TOOL_BLOCK",
        "interactiveRuntimeQA": {
            "status": "DEFERRED_EXTERNAL_TOOL_BLOCK",
            "blocker": "CODEX_BROWSER_LOCAL_ORIGIN_PERMISSION",
            "productionBlocking": True,
            "artProductionBlocking": False,
            "requiredBeforeProductionUse": True,
            "futureGate": "FINAL_CONSOLIDATED_INTERACTIVE_CORE_QA_ALL_25_MAPS",
        },
    })
    print(json.dumps({"candidates": len(records), "gallery": str(GALLERY), "interactiveRuntimeQA": "DEFERRED_EXTERNAL_TOOL_BLOCK"}, separators=(",", ":")))


if __name__ == "__main__":
    main()
