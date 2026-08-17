"""Build development-only Core v2 Phase ART-2 visual review artifacts."""

from __future__ import annotations

import hashlib
import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
PHASE_A = ROOT / "benchmark-results" / "map" / "core-v2-phase-a"
ART2 = ROOT / "benchmark-results" / "map" / "core-v2-phase-art-2"
RUNTIME = ART2 / "runtime"
GALLERY = ART2 / "gallery"
MAP_SIZE = (1448, 1086)
BG = (14, 24, 32)

MAPS = (
    ("crown-citadel", "Crown Citadel", (0, 0), 60, (910, 80, 1330, 410)),
    ("ironwatch", "Ironwatch", (0, 1), 60, (820, 40, 1280, 390)),
    ("southwest-holding-tower", "Southwest Holding Tower", (-1, 1), 55, (120, 620, 570, 1010)),
    ("west-south-deed-camp", "Deed Camp", (-2, 1), 60, (800, 70, 1280, 410)),
    ("west-support", "West Support", (-2, 0), 70, (150, 650, 610, 1010)),
)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def font(size: int, bold: bool = False):
    for name in ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "arialbd.ttf" if bold else "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def title_bar(image: Image.Image, title: str, subtitle: str = "") -> Image.Image:
    canvas = image.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    height = 66 if subtitle else 48
    draw.rectangle((0, 0, canvas.width, height), fill=(7, 17, 24, 222))
    draw.text((16, 9), title, font=font(24, True), fill=(255, 239, 191, 255))
    if subtitle:
        draw.text((17, 39), subtitle, font=font(15), fill=(185, 215, 228, 255))
    return canvas.convert("RGB")


def load_city_art() -> list[Image.Image]:
    names = ("shack.png", "keep.png", "fort.png", "city.png", "castle.png")
    return [Image.open(ROOT / "assets" / "castles" / name).convert("RGBA").resize((64, 64), Image.Resampling.LANCZOS) for name in names]


def paste_center(canvas: Image.Image, art: Image.Image, x: float, y: float, anchor: float = 0.5):
    left = round(x - art.width / 2)
    top = round(y - art.height * anchor)
    alpha = art.getchannel("A").filter(ImageFilter.GaussianBlur(4))
    shadow = Image.new("RGBA", art.size, (0, 0, 0, 0))
    shadow.putalpha(alpha.point(lambda value: round(value * 0.38)))
    canvas.alpha_composite(shadow, (left + 3, top + 6))
    canvas.alpha_composite(art, (left, top))


def objective_art(plan: dict):
    objective = plan["coreRegion"]["objective"]
    profile = plan["handcraftedProfile"]
    if objective["type"] == "none" or not profile.get("objectiveArt"):
        return None
    size = int(objective["visualSize"])
    art = Image.open(ROOT / profile["objectiveArt"]).convert("RGBA")
    return art.resize((size, size), Image.Resampling.LANCZOS)


def runtime_overlay(base: Image.Image, cities: list[dict], plan: dict, city_art: list[Image.Image]) -> Image.Image:
    canvas = base.convert("RGBA")
    for index, city in sorted(enumerate(cities), key=lambda item: item[1]["y"]):
        paste_center(canvas, city_art[index % len(city_art)], city["x"], city["y"])
    objective = plan["coreRegion"]["objective"]
    art = objective_art(plan)
    if art is not None:
        paste_center(canvas, art, objective["x"], objective["y"], 0.62)
    elif objective["type"] == "holding_tower":
        draw = ImageDraw.Draw(canvas, "RGBA")
        x, y = objective["x"], objective["y"]
        draw.ellipse((x - 142, y - 126, x + 142, y + 126), fill=(242, 188, 73, 35), outline=(255, 225, 150, 238), width=4)
        draw.line((x - 62, y, x + 62, y), fill=(255, 225, 150, 238), width=4)
        draw.line((x, y - 44, x, y + 44), fill=(255, 225, 150, 238), width=4)
    return canvas.convert("RGB")


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.convert("RGB")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, BG)
    canvas.paste(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return canvas


def labeled_cell(image: Image.Image, size: tuple[int, int], label: str) -> Image.Image:
    cell = fit(image, size).convert("RGBA")
    draw = ImageDraw.Draw(cell, "RGBA")
    draw.rectangle((0, size[1] - 38, size[0], size[1]), fill=(6, 15, 22, 216))
    draw.text((12, size[1] - 31), label, font=font(17, True), fill=(255, 241, 205, 255))
    return cell.convert("RGB")


def four_panel(old_clean: Image.Image, new_clean: Image.Image, old_overlay: Image.Image, new_overlay: Image.Image, title: str) -> Image.Image:
    cell = (724, 543)
    board = Image.new("RGB", (1448, 1136), BG)
    draw = ImageDraw.Draw(board)
    draw.text((20, 14), title, font=font(30, True), fill=(255, 235, 178))
    panels = (
        (old_clean, "OLD PROTOTYPE — clean"), (new_clean, "FINAL-ART CANDIDATE — clean"),
        (old_overlay, "OLD — locked cities/objective"), (new_overlay, "NEW — same locked cities/objective"),
    )
    for index, (image, label) in enumerate(panels):
        x = (index % 2) * cell[0]
        y = 50 + (index // 2) * cell[1]
        board.paste(labeled_cell(image, cell, label), (x, y))
    return board


def runtime_board(key: str, title: str) -> Image.Image:
    size = (498, 360)
    board = Image.new("RGB", (size[0] * 3, 416), BG)
    draw = ImageDraw.Draw(board)
    draw.text((18, 12), f"{title} — actual Crownlands runtime zoom QA", font=font(27, True), fill=(255, 235, 178))
    for index, zoom in enumerate(("low", "normal", "close")):
        image = Image.open(RUNTIME / f"{key}-{zoom}.png").convert("RGB")
        board.paste(labeled_cell(image, size, zoom.upper()), (index * size[0], 56))
    return board


def edge_board(image: Image.Image, title: str) -> Image.Image:
    crops = (
        ("NORTH", image.crop((504, 0, 944, 260))),
        ("EAST", image.crop((1088, 340, 1448, 746))),
        ("SOUTH", image.crop((504, 826, 944, 1086))),
        ("WEST", image.crop((0, 340, 360, 746))),
    )
    board = Image.new("RGB", (880, 586), BG)
    draw = ImageDraw.Draw(board)
    draw.text((16, 12), f"{title} — literal-edge barrier and road openings", font=font(25, True), fill=(255, 235, 178))
    for index, (label, crop) in enumerate(crops):
        x = (index % 2) * 440
        y = 54 + (index // 2) * 266
        board.paste(labeled_cell(crop, (440, 266), label), (x, y))
    return board


def tight_pair(cities: list[dict]) -> tuple[dict, dict, float]:
    best = None
    for left_index, left in enumerate(cities):
        for right in cities[left_index + 1:]:
            distance = math.hypot(left["x"] - right["x"], left["y"] - right["y"])
            if best is None or distance < best[2]:
                best = (left, right, distance)
    assert best is not None
    return best


def crop_around(image: Image.Image, x: float, y: float, width=620, height=450) -> Image.Image:
    left = max(0, min(image.width - width, round(x - width / 2)))
    top = max(0, min(image.height - height, round(y - height / 2)))
    return image.crop((left, top, left + width, top + height))


def pair_board(old_overlay: Image.Image, new_overlay: Image.Image, cities: list[dict], title: str) -> tuple[Image.Image, float]:
    left_city, right_city, distance = tight_pair(cities)
    x = (left_city["x"] + right_city["x"]) / 2
    y = (left_city["y"] + right_city["y"]) / 2
    board = Image.new("RGB", (1240, 500), BG)
    draw = ImageDraw.Draw(board)
    draw.text((16, 12), f"{title} — tightest locked city pair: {distance:.3f}px", font=font(25, True), fill=(255, 235, 178))
    board.paste(labeled_cell(crop_around(old_overlay, x, y), (620, 450), "OLD PROTOTYPE"), (0, 50))
    board.paste(labeled_cell(crop_around(new_overlay, x, y), (620, 450), "FINAL-ART CANDIDATE"), (620, 50))
    return board, distance


def thematic_board(old_clean: Image.Image, new_clean: Image.Image, crop: tuple[int, int, int, int], title: str) -> Image.Image:
    board = Image.new("RGB", (1120, 430), BG)
    draw = ImageDraw.Draw(board)
    draw.text((16, 12), f"{title} — thematic feature comparison", font=font(25, True), fill=(255, 235, 178))
    board.paste(labeled_cell(old_clean.crop(crop), (560, 380), "OLD PROTOTYPE"), (0, 50))
    board.paste(labeled_cell(new_clean.crop(crop), (560, 380), "FINAL-ART CANDIDATE"), (560, 50))
    return board


def five_map_board(records: list[dict]):
    cell = (480, 360)
    board = Image.new("RGB", (cell[0] * 3, 54 + cell[1] * 2), BG)
    ImageDraw.Draw(board).text((18, 12), "Core v2 ART-2 — five final-art Phase A candidates", font=font(28, True), fill=(255, 235, 178))
    for index, record in enumerate(records):
        x, y = (index % 3) * cell[0], 54 + (index // 3) * cell[1]
        label = f"{record['title']} {record['coordinate']} • {record['capacity']} cities"
        board.paste(labeled_cell(record["new"], cell, label), (x, y))
    board.save(GALLERY / "five-final-art-candidates.png", optimize=True)


def five_map_overlay_board(records: list[dict]):
    cell = (480, 360)
    board = Image.new("RGB", (cell[0] * 3, 54 + cell[1] * 2), BG)
    ImageDraw.Draw(board).text((18, 12), "Core v2 ART-2 — locked runtime cities and objectives", font=font(28, True), fill=(255, 235, 178))
    for index, record in enumerate(records):
        x, y = (index % 3) * cell[0], 54 + (index // 3) * cell[1]
        label = f"{record['title']} {record['coordinate']} • {record['capacity']} cities"
        board.paste(labeled_cell(record["overlay"], cell, label), (x, y))
    board.save(GALLERY / "five-final-art-runtime-overlays.png", optimize=True)


def transition_board(records: list[dict]):
    by_key = {record["key"]: record for record in records}
    pairs = (
        ("crown-citadel", "ironwatch", "CENTER → SOUTH-CENTRAL", "south", "north"),
        ("west-support", "west-south-deed-camp", "WEST → SOUTHWEST", "south", "north"),
        ("west-south-deed-camp", "southwest-holding-tower", "DEED → CONTESTED", "east", "west"),
        ("southwest-holding-tower", "ironwatch", "SOUTHWEST → IRONWATCH", "east", "west"),
    )

    def side(image: Image.Image, which: str):
        if which == "north": return image.crop((364, 0, 1084, 250))
        if which == "south": return image.crop((364, 836, 1084, 1086))
        if which == "east": return image.crop((848, 439, 1448, 647))
        return image.crop((0, 439, 600, 647))

    board = Image.new("RGB", (1440, 54 + 250 * len(pairs)), BG)
    ImageDraw.Draw(board).text((18, 12), "ART-2 shared-edge road and climate-transition review", font=font(28, True), fill=(255, 235, 178))
    for row, (left, right, label, left_side, right_side) in enumerate(pairs):
        y = 54 + row * 250
        board.paste(labeled_cell(side(by_key[left]["new"], left_side), (720, 250), label + " — A"), (0, y))
        board.paste(labeled_cell(side(by_key[right]["new"], right_side), (720, 250), label + " — B"), (720, y))
    board.save(GALLERY / "climate-transition-overview.png", optimize=True)


def style_reference_board(records: list[dict]):
    assets = (
        ("CITY STAGE 1", ROOT / "assets/castles/shack.png"),
        ("CITY STAGE 3", ROOT / "assets/castles/fort.png"),
        ("CITY STAGE 5", ROOT / "assets/castles/castle.png"),
        ("CROWN CITADEL", ROOT / "assets/crown-citadel.png"),
        ("IRONWATCH", ROOT / "assets/defense-stronghold.png"),
        ("DEED CAMP", ROOT / "assets/camps/deed.png"),
    )
    board = Image.new("RGB", (1440, 636), BG)
    draw = ImageDraw.Draw(board)
    draw.text((18, 12), "ART-2 style-family comparison — structures and final terrain", font=font(28, True), fill=(255, 235, 178))
    for index, (label, path) in enumerate(assets):
        image = Image.open(path).convert("RGBA")
        checker = Image.new("RGB", (240, 300), (44, 48, 46))
        image.thumbnail((220, 250), Image.Resampling.LANCZOS)
        checker.paste(image, ((240 - image.width) // 2, 8), image)
        board.paste(labeled_cell(checker, (240, 300), label), (index * 240, 54))
    for index, record in enumerate(records):
        crop = record["new"].crop((240, 180, 1208, 906))
        board.paste(labeled_cell(crop, (288, 270), record["title"]), (index * 288, 360))
    board.save(GALLERY / "structure-style-reference-comparison.png", optimize=True)


def main():
    GALLERY.mkdir(parents=True, exist_ok=True)
    city_art = load_city_art()
    records = []
    index_entries = []
    for key, title, coordinate, capacity, thematic_crop in MAPS:
        source = PHASE_A / "prototypes" / key
        candidate_dir = ART2 / "candidates" / key
        qa = candidate_dir / "qa"
        qa.mkdir(parents=True, exist_ok=True)
        old_clean = Image.open(source / "map-clean.png").convert("RGB")
        new_clean = Image.open(candidate_dir / "map-final-candidate.png").convert("RGB")
        if old_clean.size != MAP_SIZE or new_clean.size != MAP_SIZE:
            raise ValueError(f"{key}: expected {MAP_SIZE}, got old={old_clean.size}, new={new_clean.size}")
        cities = read_json(source / "cities.json")
        plan = read_json(source / "composition.json")
        if len(cities) != capacity:
            raise ValueError(f"{key}: capacity changed from {capacity} to {len(cities)}")
        old_overlay = runtime_overlay(old_clean, cities, plan, city_art)
        new_overlay = runtime_overlay(new_clean, cities, plan, city_art)
        shutil.copy2(source / "map-clean.png", qa / "01-old-prototype.png")
        shutil.copy2(candidate_dir / "map-final-candidate.png", qa / "02-new-clean-final-art-candidate.png")
        old_overlay.save(qa / "03-old-with-locked-cities-objective.png", optimize=True)
        new_overlay.save(qa / "04-new-with-locked-cities-objective.png", optimize=True)
        shutil.copy2(RUNTIME / f"{key}-normal.png", qa / "05-normal-runtime.png")
        shutil.copy2(RUNTIME / f"{key}-low.png", qa / "06-low-runtime.png")
        shutil.copy2(RUNTIME / f"{key}-close.png", qa / "07-close-runtime.png")
        pair, minimum = pair_board(old_overlay, new_overlay, cities, title)
        pair.save(qa / "08-tightest-city-cluster.png", optimize=True)
        edge_board(new_clean, title).save(qa / "09-perimeter-closeups.png", optimize=True)
        thematic_board(old_clean, new_clean, thematic_crop, title).save(qa / "10-thematic-feature-closeup.png", optimize=True)
        four_panel(old_clean, new_clean, old_overlay, new_overlay, f"{title} — old prototype vs final-art candidate").save(qa / "00-old-vs-new-review.png", optimize=True)
        runtime_board(key, title).save(qa / "11-runtime-zoom-review.png", optimize=True)
        new_clean.save(candidate_dir / "map-final-candidate.webp", "WEBP", quality=92, method=6)
        records.append({"key": key, "title": title, "coordinate": coordinate, "capacity": capacity, "old": old_clean, "new": new_clean, "overlay": new_overlay})
        index_entries.append({
            "key": key,
            "coordinate": {"gridX": coordinate[0], "gridY": coordinate[1]},
            "capacity": capacity,
            "candidatePngSha256": sha256(candidate_dir / "map-final-candidate.png"),
            "candidateWebpSha256": sha256(candidate_dir / "map-final-candidate.webp"),
            "oldPrototypePngSha256": sha256(source / "map-clean.png"),
            "citiesSha256": sha256(source / "cities.json"),
            "compositionSha256": sha256(source / "composition.json"),
            "validationReceiptSha256": sha256(source / "validation-receipt.json"),
            "minimumCitySpacingPx": round(minimum, 3),
            "qaArtifacts": 12,
        })
    five_map_board(records)
    five_map_overlay_board(records)
    transition_board(records)
    style_reference_board(records)
    receipt = {
        "phase": "Crownlands Core v2 Phase ART-2",
        "developmentOnly": True,
        "productionActivated": False,
        "newCoreCoordinatesGenerated": 0,
        "prototypeBackgroundsOverwritten": 0,
        "candidateBackgroundCount": 5,
        "mapDimensions": {"width": 1448, "height": 1086},
        "hardMinimumCoreCitySpacingPx": 68,
        "outerGeneratedPlayerRegionSpacingPx": 112,
        "entries": index_entries,
    }
    (ART2 / "art2-index.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": len(records), "gallery": str(GALLERY), "qaArtifactsPerMap": 12}, separators=(",", ":")))


if __name__ == "__main__":
    main()
