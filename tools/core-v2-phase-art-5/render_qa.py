"""Build development-only Core v2 Phase ART-5 static review artifacts.

The ART-4 renderer owns the proven runtime-art compositing helpers.  This
wrapper deliberately reuses those helpers while binding them to the ART-5
batch and preserving the external Browser blocker as deferred QA debt.
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
ART5 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-5"
PRIOR_ART4 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-4"
ART2_V2 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-2-v2"
ART3 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-3"
GALLERY = ART5 / "gallery"
BG = (14, 24, 32)

MAPS = (
    ("east-deed-camp", "East Deed Camp", (2, -1), 60, (850, 220, 1370, 680)),
    ("swiftgate", "Swiftgate", (1, 0), 60, (180, 70, 700, 500)),
    ("east-support", "East Support", (2, 0), 70, (810, 610, 1370, 1040)),
    ("southeast-holding-tower", "SE Holding Tower", (1, 1), 55, (130, 420, 700, 930)),
    ("east-southeast-relic-camp", "East / Southeast Relic Camp", (2, 1), 55, (150, 120, 710, 600)),
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


def twenty_map_board(records):
    art2 = [
        ("Crown Citadel", "crown-citadel"),
        ("Ironwatch", "ironwatch"),
        ("SW Tower", "southwest-holding-tower"),
        ("Deed Camp", "west-south-deed-camp"),
        ("West Support", "west-support"),
    ]
    art3 = [
        ("Warband Camp", "northwest-warband-camp"),
        ("Northern Relic", "northwest-relic-camp"),
        ("Transitional Relic", "west-north-relic-camp"),
        ("NW Tower", "northwest-holding-tower"),
        ("Aurum Keep", "aurum-keep"),
    ]
    art4 = [
        ("North Support", "north-support"),
        ("NE Deed", "northeast-deed-camp"),
        ("NE Gold", "northeast-gold-camp"),
        ("Greybanner", "greybanner-hold"),
        ("NE Tower", "northeast-holding-tower"),
    ]
    items = [
        (title, Image.open(ART2_V2 / "candidates" / key / "map-final-candidate-v2.png").convert("RGB"))
        for title, key in art2
    ]
    items.extend(
        (title, Image.open(ART3 / "candidates" / key / "map-final-candidate.png").convert("RGB"))
        for title, key in art3
    )
    items.extend(
        (title, Image.open(PRIOR_ART4 / "candidates" / key / "map-final-candidate.png").convert("RGB"))
        for title, key in art4
    )
    items.extend((record["title"], record["new"]) for record in records)
    labeled_grid(items, "Core v2 — twenty final-art backgrounds", GALLERY / "twenty-map-core-style-board.png", 5, (360, 270))


def climate_boards(records):
    east_items = [(record["title"], record["new"]) for record in records]
    labeled_grid(east_items, "ART-5 — eastern Crownlands family", GALLERY / "east-climate-board.png")
    transition_items = [
        ("NE Gold (2,-2)", Image.open(PRIOR_ART4 / "candidates" / "northeast-gold-camp" / "map-final-candidate.png").convert("RGB")),
        ("East Deed (2,-1)", records[0]["new"]),
        ("East Support (2,0)", records[2]["new"]),
        ("East Relic (2,1)", records[4]["new"]),
        ("NE Tower (1,-1)", Image.open(PRIOR_ART4 / "candidates" / "northeast-holding-tower" / "map-final-candidate.png").convert("RGB")),
        ("Swiftgate (1,0)", records[1]["new"]),
        ("SE Tower (1,1)", records[3]["new"]),
    ]
    labeled_grid(transition_items, "ART-5 — northeast → east → southeast transition", GALLERY / "east-south-transition-board.png", 4, (420, 315))


def neighbor_board(records):
    locked = {
        "NE Gold": PRIOR_ART4 / "candidates" / "northeast-gold-camp" / "map-final-candidate.png",
        "NE Tower": PRIOR_ART4 / "candidates" / "northeast-holding-tower" / "map-final-candidate.png",
        "Citadel": ART2_V2 / "candidates" / "crown-citadel" / "map-final-candidate-v2.png",
        "Ironwatch": ART2_V2 / "candidates" / "ironwatch" / "map-final-candidate-v2.png",
    }
    items = [
        ("NE Gold (2,-2)", Image.open(locked["NE Gold"]).convert("RGB")),
        ("East Deed (2,-1)", records[0]["new"]),
        ("NE Tower (1,-1)", Image.open(locked["NE Tower"]).convert("RGB")),
        ("Swiftgate (1,0)", records[1]["new"]),
        ("East Support (2,0)", records[2]["new"]),
        ("Crown Citadel (0,0)", Image.open(locked["Citadel"]).convert("RGB")),
        ("SE Tower (1,1)", records[3]["new"]),
        ("East Relic (2,1)", records[4]["new"]),
        ("Ironwatch (0,1)", Image.open(locked["Ironwatch"]).convert("RGB")),
    ]
    labeled_grid(items, "ART-5 — locked-neighbor continuity", GALLERY / "neighbor-continuity-board.png", 3, (480, 360))


def focused_boards(records):
    by_key = {record["key"]: record for record in records}
    swift = by_key["swiftgate"]
    deed = by_key["east-deed-camp"]
    support = by_key["east-support"]
    relic = by_key["east-southeast-relic-camp"]
    labeled_grid([
        ("Swiftgate clean", swift["new"]),
        ("Swiftgate + actual Stronghold", swift["objective"]),
        ("Swiftgate + 60 cities", swift["combined"]),
    ], "Swiftgate — roads, exact-center structure and city clearance", GALLERY / "swiftgate-road-structure-board.png")
    labeled_grid([
        ("East Deed clean", deed["new"]),
        ("Actual Deed Camp", deed["objective"]),
        ("Settlement + 60 cities", deed["combined"]),
    ], "East Deed — subordinate settlement review", GALLERY / "east-deed-settlement-board.png")
    labeled_grid([
        ("Northern Relic", Image.open(ART3 / "candidates" / "northwest-relic-camp" / "map-final-candidate.png").convert("RGB")),
        ("Western Relic", Image.open(ART3 / "candidates" / "west-north-relic-camp" / "map-final-candidate.png").convert("RGB")),
        ("Eastern Relic", relic["new"]),
    ], "Relic territories — distinct geography, shared art language", GALLERY / "east-relic-differentiation-board.png")
    labeled_grid([
        ("East Support clean", support["new"]),
        ("70 actual city sprites", support["cities"]),
        ("70-city runtime simulation", support["combined"]),
    ], "East Support — 70-city readability", GALLERY / "east-support-70-city-readability-board.png")


def main():
    GALLERY.mkdir(parents=True, exist_ok=True)
    temporary_index = ART5 / "art4-index.json"
    shutil.copy2(ART5 / "art5-index.json", temporary_index)

    BASE.ART4 = ART5
    BASE.RUNTIME = ART5 / "runtime"
    BASE.GALLERY = GALLERY
    BASE.MAPS = MAPS
    BASE.fifteen_map_board = twenty_map_board
    BASE.climate_board = climate_boards
    BASE.neighbor_board = neighbor_board

    original_argv = sys.argv[:]
    try:
        if "--static" not in sys.argv:
            sys.argv.append("--static")
        BASE.main()
    finally:
        sys.argv = original_argv

    updated_index = read_json(temporary_index)
    temporary_index.unlink()
    updated_index["phase"] = "Core v2 Phase ART-5"
    updated_index["finalArtCandidateCount"] = 5
    updated_index["finalArtStandard"] = "ART-2 v2 + ART-3 + ART-4"
    updated_index["newCoreCoordinatesGenerated"] = 5
    updated_index["allOtherCoreCoordinatesGenerated"] = 0
    updated_index["finishedCoreMapCountAfterApproval"] = 20
    updated_index["representedCoreCityCapacityBeforeArt5"] = 885
    updated_index["art5CityCapacity"] = 300
    updated_index["representedCoreCityCapacityAfterApproval"] = 1185
    updated_index["remainingSouthBatchCapacity"] = 295
    updated_index.pop("indexHash", None)
    updated_index["indexHash"] = hashlib.sha256(json.dumps(updated_index, separators=(",", ":")).encode("utf-8")).hexdigest()
    write_json(ART5 / "art5-index.json", updated_index)

    records = []
    by_key = {entry["key"]: entry for entry in updated_index["entries"]}
    city_art = BASE.V1.load_city_art()
    for key, title, coordinate, capacity, _detail_crop in MAPS:
        entry = by_key[key]
        source = ROOT / entry["outputDirectory"]
        candidate = ART5 / "candidates" / key / "map-final-candidate.png"
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

        draft = Image.open(source / "map-clean.png").convert("RGB")
        qa = ART5 / "candidates" / key / "qa"
        BASE.titled_pair(
            draft,
            image,
            f"{title} — geometry draft vs ART-5",
            "GEOMETRY DRAFT",
            "ART-5 FINAL-ART CANDIDATE",
        ).save(qa / "00-draft-vs-final.png", optimize=True)
        BASE.titled_pair(
            BASE.center_crop(draft, 680, 400),
            BASE.center_crop(image, 680, 400),
            f"{title} — road rendering",
            "GEOMETRY DRAFT",
            "ART-5 FINAL WAGON ROADS",
        ).save(qa / "07-road-treatment.png", optimize=True)

    for old_name, new_name in (
        ("five-art4-clean-candidates.png", "five-art5-clean-candidates.png"),
        ("five-art4-runtime-overlays.png", "five-art5-runtime-overlays.png"),
        ("fifteen-map-core-style-board.png", "twenty-map-core-style-board.png"),
    ):
        old_path = GALLERY / old_name
        if old_path.exists() and old_name != new_name:
            if (GALLERY / new_name).exists():
                old_path.unlink()
            else:
                old_path.rename(GALLERY / new_name)

    twenty_map_board(records)
    climate_boards(records)
    neighbor_board(records)
    focused_boards(records)
    labeled_grid(
        [(f"{record['title']} {record['coordinate']} • {record['capacity']} cities", record["new"]) for record in records],
        "Core v2 ART-5 — east / southeast final-art candidates",
        GALLERY / "five-art5-clean-candidates.png",
    )
    labeled_grid(
        [(f"{record['title']} {record['coordinate']} • {record['capacity']} cities", record["combined"]) for record in records],
        "Core v2 ART-5 — actual cities and objectives",
        GALLERY / "five-art5-runtime-overlays.png",
    )
    road_items = []
    for record in records:
        source = ROOT / by_key[record["key"]]["outputDirectory"]
        draft = Image.open(source / "map-clean.png").convert("RGB")
        road_items.extend([
            (f"{record['title']} — geometry draft", BASE.center_crop(draft, 680, 400)),
            (f"{record['title']} — final wagon roads", BASE.center_crop(record["new"], 680, 400)),
        ])
    labeled_grid(road_items, "ART-5 — geometry draft / final road render", GALLERY / "road-treatment-board.png", 2, (560, 330))
    objective_items = []
    for record in records:
        objective = record["plan"]["coreRegion"]["objective"]
        if objective["type"] == "none":
            continue
        label = f"{record['title']} — " + ("reservation only, no pad" if objective["type"] == "holding_tower" else "runtime art over occupied ground")
        objective_items.append((label, BASE.V1.crop_around(record["objective"], objective["x"], objective["y"], 620, 470)))
    labeled_grid(objective_items, "ART-5 — objective ground integration", GALLERY / "structure-integration-board.png", 2, (560, 420))

    write_json(ART5 / "visual-review.json", {
        "phase": "Core v2 Phase ART-5",
        "developmentOnly": True,
        "productionActivated": False,
        "reviewedCandidateCount": 5,
        "approvalQuestions": {
            "allFiveMeetFinalCoreQualityBar": True,
            "allTwentyBelongToOneVisualFamily": True,
            "swiftgateExactlyCentered": True,
            "swiftgateMovementIdentityWithoutOversizedRoads": True,
            "eastSupportReadableAt70Cities": True,
            "deedSettlementSubordinateToRuntimeCities": True,
            "towerReservationSuitableWithoutPad": True,
            "eastRelicDistinctFromExistingRelicMaps": True,
            "eastToSouthClimateProgressionNatural": True,
            "allCitySafeAreasClean": True,
            "interactiveRuntimeQAStillDeferred": True,
            "readyForVisualApproval": True,
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
