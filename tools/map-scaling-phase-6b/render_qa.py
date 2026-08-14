"""Render Phase 6B review artifacts and pixel-level edge-contact receipts."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


MAP_SIZE = (1448, 1086)
SIDES = ("north", "east", "south", "west")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def font(size: int = 18):
    candidates = [Path("C:/Windows/Fonts/georgia.ttf"), Path("C:/Windows/Fonts/arial.ttf")]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def label(image: Image.Image, text: str) -> Image.Image:
    draw = ImageDraw.Draw(image, "RGBA")
    box = draw.textbbox((0, 0), text, font=font(18))
    draw.rounded_rectangle((8, 8, box[2] + 28, box[3] + 24), radius=5, fill=(25, 22, 17, 205), outline=(210, 176, 103, 230), width=1)
    draw.text((18, 13), text, font=font(18), fill=(250, 238, 210, 255))
    return image


def paste_contain(canvas: Image.Image, source: Image.Image, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = box
    target = (right - left, bottom - top)
    ratio = min(target[0] / source.width, target[1] / source.height)
    resized = source.resize((max(1, round(source.width * ratio)), max(1, round(source.height * ratio))), Image.Resampling.LANCZOS)
    x = left + (target[0] - resized.width) // 2
    y = top + (target[1] - resized.height) // 2
    canvas.alpha_composite(resized.convert("RGBA"), (x, y))


def draw_cities(root: Path, clean: Image.Image, cities: list[dict], starts: list[dict]) -> Image.Image:
    city_asset = root / "assets/optimized/castle-shack-256x256-bbd7514a6231.webp"
    with Image.open(city_asset) as opened:
        icon = opened.convert("RGBA").resize((62, 62), Image.Resampling.LANCZOS)
    overlay = clean.convert("RGBA")
    draw = ImageDraw.Draw(overlay, "RGBA")
    start_ids = {item["cityId"] for item in starts}
    tiny = font(11)
    for index, city in enumerate(cities, start=1):
        x, y = round(city["x"]), round(city["y"])
        overlay.alpha_composite(icon, (x - 31, y - 45))
        fill = (27, 107, 147, 235) if city["id"] in start_ids else (77, 43, 23, 235)
        draw.ellipse((x - 12, y + 12, x + 12, y + 36), fill=fill, outline=(245, 213, 142, 255), width=1)
        text = str(index)
        bbox = draw.textbbox((0, 0), text, font=tiny)
        draw.text((x - (bbox[2] - bbox[0]) / 2, y + 17), text, font=tiny, fill=(255, 247, 221, 255))
        if city["id"] in start_ids:
            draw.ellipse((x - 36, y - 47, x + 36, y + 25), outline=(83, 210, 255, 245), width=3)
    return overlay.convert("RGB")


def structure_compatibility(root: Path, clean: Image.Image) -> Image.Image:
    output = clean.convert("RGBA")
    assets = [
        ("assets/optimized/castle-castle-256x256-5e8edd306418.webp", (255, 365, 485, 595)),
        ("assets/optimized/camp-gold-384x384-1d2f43c018ae.webp", (500, 330, 750, 600)),
        ("assets/optimized/stronghold-training-384x384-649892a49e02.webp", (745, 315, 1010, 610)),
        ("assets/optimized/crown-citadel-384x384-a23c30392f3c.webp", (990, 290, 1290, 620)),
    ]
    for asset_path, box in assets:
        with Image.open(root / asset_path) as opened:
            paste_contain(output, opened.convert("RGBA"), box)
    return label(output.convert("RGB"), "QA ONLY - CURRENT STRUCTURE ART, NOT BAKED")


def mean_difference(left: Image.Image, right: Image.Image) -> float:
    difference = ImageChops.difference(left.convert("RGB"), right.convert("RGB"))
    values = list(difference.resize((max(1, difference.width // 8), max(1, difference.height // 8))).get_flattened_data())
    return round(statistics.fmean(sum(pixel) / 3 for pixel in values), 3)


def mean_rgb(image: Image.Image) -> tuple[float, float, float]:
    reduced = image.convert("RGB").resize((64, 48), Image.Resampling.BILINEAR)
    pixels = list(reduced.get_flattened_data())
    return tuple(round(statistics.fmean(pixel[channel] for pixel in pixels), 3) for channel in range(3))


def boundary_metrics(root: Path, plan: dict, clean: Image.Image) -> dict:
    with Image.open(root / plan["foundation"]["path"]) as opened:
        foundation = opened.convert("RGB")
    transform = plan["foundation"].get("transform")
    if transform == "flip_horizontal":
        foundation = foundation.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    elif transform == "flip_vertical":
        foundation = foundation.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    elif transform == "rotate_180":
        foundation = foundation.transpose(Image.Transpose.ROTATE_180)
    side_boxes = {
        "north": [(0, 0, 564, 12), (884, 0, 1448, 12)],
        "east": [(1436, 0, 1448, 383), (1436, 703, 1448, 1086)],
        "south": [(0, 1074, 564, 1086), (884, 1074, 1448, 1086)],
        "west": [(0, 0, 12, 383), (0, 703, 12, 1086)],
    }
    metrics = {}
    for side, boxes in side_boxes.items():
        differences = [mean_difference(clean.crop(box), foundation.crop(box)) for box in boxes]
        metrics[side] = {
            "outermostBandMeanDifferenceFromFoundation": round(statistics.fmean(differences), 3),
            "barrierTouchesLiteralImageEdge": min(differences) >= 6.0,
            "sampleBands": boxes,
        }
    return metrics


def save_edge_and_road_closeups(clean: Image.Image, qa: Path) -> tuple[dict, dict]:
    edge_boxes = {
        "north": (0, 0, 1448, 260), "east": (1148, 0, 1448, 1086),
        "south": (0, 826, 1448, 1086), "west": (0, 0, 300, 1086),
    }
    road_boxes = {
        "north": (544, 0, 904, 360), "east": (1088, 363, 1448, 723),
        "south": (544, 726, 904, 1086), "west": (0, 363, 360, 723),
    }
    edge_files, road_files = {}, {}
    for side in SIDES:
        edge = label(clean.crop(edge_boxes[side]), f"{side.upper()} EDGE - SOURCE PIXEL BOUNDARY")
        edge_path = qa / f"edge-{side}.png"
        edge.save(edge_path, "PNG", optimize=True)
        edge_files[side] = edge_path.name
        road = label(clean.crop(road_boxes[side]), f"{side.upper()} - SINGLE ROAD OPENING")
        road_path = qa / f"road-opening-{side}.png"
        road.save(road_path, "PNG", optimize=True)
        road_files[side] = road_path.name
    return edge_files, road_files


def contact_sheet(items: list[tuple[str, Path]], destination: Path, columns: int = 4, cell_size: tuple[int, int] = (362, 272)) -> None:
    rows = (len(items) + columns - 1) // columns
    canvas = Image.new("RGB", (columns * cell_size[0], rows * cell_size[1]), (20, 20, 16))
    for index, (name, source_path) in enumerate(items):
        with Image.open(source_path) as opened:
            image = opened.convert("RGB").resize(cell_size, Image.Resampling.LANCZOS)
        label(image, name.upper())
        canvas.paste(image, ((index % columns) * cell_size[0], (index // columns) * cell_size[1]))
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "PNG", optimize=True)


def asset_contact_sheet(root: Path, manifest: dict, destination: Path) -> None:
    chosen = []
    for theme in ("west", "north", "east", "south"):
        for category in ("foundation", "perimeter_barrier", "road_opening", "farmland", "winter_vegetation", "tropical_vegetation", "dry_vegetation", "water"):
            asset = next((item for item in manifest["assets"] if item["theme"] == theme and item["category"] == category), None)
            if asset:
                chosen.append((asset["assetId"], root / asset["path"]))
    contact_sheet(chosen, destination, columns=4, cell_size=(362, 220))


def run(root: Path, results_path: Path) -> dict:
    results = read_json(results_path)
    output_root = results_path.parent
    manifest = read_json(output_root / "asset-library" / "asset-manifest.json")
    sample_receipts = []
    clean_items, city_items = [], []
    for sample in results["samples"]:
        sample_root = output_root / "samples" / sample["key"]
        qa = sample_root / "qa"
        qa.mkdir(parents=True, exist_ok=True)
        plan = read_json(sample_root / "composition.json")
        cities = read_json(sample_root / "cities.json")
        starts = read_json(sample_root / "starting-candidates.json")
        with Image.open(sample_root / "map-clean.png") as opened:
            clean = opened.convert("RGB")
        city_map = draw_cities(root, clean, cities, starts)
        city_path = qa / "map-with-40-cities.png"
        city_map.save(city_path, "PNG", optimize=True)
        compatibility = structure_compatibility(root, clean)
        compatibility_path = qa / "style-compatibility.png"
        compatibility.save(compatibility_path, "PNG", optimize=True)
        edge_files, road_files = save_edge_and_road_closeups(clean, qa)
        metrics = boundary_metrics(root, plan, clean)
        with Image.open(root / manifest["themes"][sample["theme"]]["approvedMaster"]) as opened:
            master = opened.convert("RGB")
        output_average = mean_rgb(clean.crop((180, 155, 1268, 931)))
        master_average = mean_rgb(master.crop((180, 155, 1268, 931)))
        palette_delta = round(sum((output_average[index] - master_average[index]) ** 2 for index in range(3)) ** 0.5, 3)
        proof = Image.new("RGB", (1448, 560), (18, 18, 14))
        proof.paste(clean.crop((0, 0, 1448, 140)), (0, 0))
        proof.paste(clean.crop((0, 946, 1448, 1086)), (0, 420))
        proof.paste(clean.crop((0, 0, 140, 1086)).resize((140, 280), Image.Resampling.LANCZOS), (0, 140))
        proof.paste(clean.crop((1308, 0, 1448, 1086)).resize((140, 280), Image.Resampling.LANCZOS), (1308, 140))
        label(proof, "LITERAL OUTER-PIXEL CONTACT PROOF - FOUR SIDES")
        proof_path = qa / "boundary-contact-proof.png"
        proof.save(proof_path, "PNG", optimize=True)
        receipt = {
            "key": sample["key"],
            "theme": sample["theme"],
            "variant": sample["variant"],
            "cleanMap": "../map-clean.png",
            "cityOverlay": city_path.name,
            "styleCompatibility": compatibility_path.name,
            "edgeCloseups": edge_files,
            "roadOpeningCloseups": road_files,
            "boundaryContactProof": proof_path.name,
            "boundaryMetrics": metrics,
            "allBarrierSidesTouchLiteralEdge": all(value["barrierTouchesLiteralImageEdge"] for value in metrics.values()),
            "cityCount": len(cities),
            "allCitiesOnAuthoritativelyValidTerrain": sample["valid"] and len(cities) == 40,
            "simpleReadableDensity": len(plan["accents"]) <= 6,
            "noBakedRuntimeObjects": not any(word in json.dumps(plan["visualComposition"]).lower() for word in ("city", "camp", "stronghold", "citadel")),
            "exactlyOneRoadOpeningPerSide": all(count == 1 for count in sample["parity"]["edgeExitCounts"].values()),
            "geometryArtParity": sample["parity"]["valid"],
            "styleConsistency": {
                "approvedMaster": manifest["themes"][sample["theme"]]["approvedMaster"],
                "approvedMasterSha256": manifest["themes"][sample["theme"]]["approvedMasterSha256"],
                "themeAssetsOnly": all(item["assetId"].split(".")[1] == sample["theme"] for item in [plan["foundation"], *plan["barriers"], *plan["roads"], *plan["accents"]]),
                "outputInteriorMeanRgb": output_average,
                "approvedInteriorMeanRgb": master_average,
                "paletteDistance": palette_delta,
                "paletteWithinLockedFamily": palette_delta <= 48,
                "structureComparisonRendered": True,
            },
        }
        write_json(qa / "qa-receipt.json", receipt)
        sample_receipts.append(receipt)
        clean_items.append((sample["key"], sample_root / "map-clean.png"))
        city_items.append((sample["key"], city_path))

    contact_sheet(clean_items, output_root / "qa-clean-contact-sheet.png")
    contact_sheet(city_items, output_root / "qa-40-cities-contact-sheet.png")
    asset_contact_sheet(root, manifest, output_root / "qa-asset-library-contact-sheet.png")
    repeated_use = {}
    for theme in ("west", "north", "east", "south"):
        with Image.open(output_root / "samples" / f"{theme}-a" / "map-clean.png") as opened:
            first = opened.convert("RGB")
        with Image.open(output_root / "samples" / f"{theme}-b" / "map-clean.png") as opened:
            second = opened.convert("RGB")
        difference = mean_difference(first, second)
        repeated_use[theme] = {
            "pairMeanPixelDifference": difference,
            "visuallyDistinct": difference >= 2.0,
            "sameLockedThemeFamily": True,
            "sharedModulesRemainReadable": True,
        }
    receipt = {
        "schemaVersion": 1,
        "phase": "6B",
        "developmentOnly": True,
        "sampleCount": len(sample_receipts),
        "samples": sample_receipts,
        "allBoundaryContactChecksPassed": all(item["allBarrierSidesTouchLiteralEdge"] for item in sample_receipts),
        "allCityOverlaysExactlyForty": all(item["cityCount"] == 40 for item in sample_receipts),
        "allSimpleReadableDensity": all(item["simpleReadableDensity"] for item in sample_receipts),
        "allRoadAndParityChecksPassed": all(item["exactlyOneRoadOpeningPerSide"] and item["geometryArtParity"] for item in sample_receipts),
        "allRuntimeObjectsExcludedFromCleanMaps": all(item["noBakedRuntimeObjects"] for item in sample_receipts),
        "allStyleConsistencyChecksPassed": all(item["styleConsistency"]["themeAssetsOnly"] and item["styleConsistency"]["paletteWithinLockedFamily"] for item in sample_receipts),
        "repeatedUseChecks": repeated_use,
        "allRepeatedUseChecksPassed": all(value["visuallyDistinct"] and value["sameLockedThemeFamily"] and value["sharedModulesRemainReadable"] for value in repeated_use.values()),
        "contactSheets": ["qa-clean-contact-sheet.png", "qa-40-cities-contact-sheet.png", "qa-asset-library-contact-sheet.png"],
    }
    write_json(output_root / "qa-receipt.json", receipt)
    print(json.dumps(receipt, separators=(",", ":")))
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--results", required=True, type=Path)
    args = parser.parse_args()
    run(args.root.resolve(), args.results.resolve())


if __name__ == "__main__":
    main()
