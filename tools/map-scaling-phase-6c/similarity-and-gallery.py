"""Multi-metric visual similarity analysis and QA gallery generation for Phase 6C."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


THUMBNAIL_SIZE = (320, 240)
NEAR_DUPLICATE_THRESHOLD = 0.965
HIGH_SIMILARITY_THRESHOLD = 0.98


def round_number(value: float, precision: int = 6) -> float:
    return round(float(value), precision)


def hamming_similarity(left: str, right: str) -> float:
    bits = max(len(left), len(right)) * 4
    return 1.0 - ((int(left, 16) ^ int(right, 16)).bit_count() / max(1, bits))


def composition_similarity(left: dict, right: dict) -> float:
    foundation = 1.0 if left["hashes"]["foundationSelectionHash"] == right["hashes"]["foundationSelectionHash"] else 0.0
    barriers = 1.0 if left["hashes"]["barrierSelectionHash"] == right["hashes"]["barrierSelectionHash"] else 0.0
    roads = 1.0 if left["hashes"]["roadLayoutHash"] == right["hashes"]["roadLayoutHash"] else 0.0
    left_accents = {accent["assetId"] for accent in left["accents"]}
    right_accents = {accent["assetId"] for accent in right["accents"]}
    accent_union = left_accents | right_accents
    accent_jaccard = len(left_accents & right_accents) / max(1, len(accent_union))
    left_by_asset = {accent["assetId"]: accent for accent in left["accents"]}
    right_by_asset = {accent["assetId"]: accent for accent in right["accents"]}
    placement_scores = []
    for asset_id in left_accents & right_accents:
        first = left_by_asset[asset_id]
        second = right_by_asset[asset_id]
        distance = math.hypot(first["x"] - second["x"], first["y"] - second["y"])
        placement_scores.append(max(0.0, 1.0 - distance / 900.0))
    placement = sum(placement_scores) / max(1, len(placement_scores))
    return 0.30 * foundation + 0.20 * barriers + 0.10 * roads + 0.20 * accent_jaccard + 0.20 * placement


def structural_similarity_matrix(gray: np.ndarray) -> np.ndarray:
    means = gray.mean(axis=1)
    centered = gray - means[:, None]
    covariance = (centered @ centered.T) / max(1, gray.shape[1] - 1)
    variances = np.diag(covariance)
    c1 = (0.01 * 255.0) ** 2
    c2 = (0.03 * 255.0) ** 2
    luminance = (2 * means[:, None] * means[None, :] + c1) / (
        means[:, None] ** 2 + means[None, :] ** 2 + c1
    )
    structure = (2 * covariance + c2) / (variances[:, None] + variances[None, :] + c2)
    return np.clip(luminance * structure, -1.0, 1.0)


def analyze_similarity(packages: list[dict], renders: dict[str, dict]) -> tuple[dict, list[dict]]:
    pairs = []
    by_theme = defaultdict(list)
    for package in packages:
        by_theme[package["theme"]].append(package)
    for theme, theme_packages in sorted(by_theme.items()):
        rgb = np.asarray([
            renders[package["key"]]["features"]["lowResolutionRgb"] for package in theme_packages
        ], dtype=np.float32)
        gray = np.asarray([
            renders[package["key"]]["features"]["lowResolutionGray"] for package in theme_packages
        ], dtype=np.float32)
        norms = np.sum(rgb * rgb, axis=1)
        squared = np.maximum(0.0, norms[:, None] + norms[None, :] - 2.0 * (rgb @ rgb.T))
        rgb_rmse = np.sqrt(squared / (rgb.shape[1] * 255.0 * 255.0))
        ssim = structural_similarity_matrix(gray)
        for left_index in range(len(theme_packages)):
            left = theme_packages[left_index]
            left_features = renders[left["key"]]["features"]
            for right_index in range(left_index + 1, len(theme_packages)):
                right = theme_packages[right_index]
                right_features = renders[right["key"]]["features"]
                difference_similarity = hamming_similarity(
                    left_features["differenceHash"], right_features["differenceHash"]
                )
                perceptual_similarity = hamming_similarity(
                    left_features["perceptualHash"], right_features["perceptualHash"]
                )
                average_similarity = hamming_similarity(
                    left_features["averageHash"], right_features["averageHash"]
                )
                structural = max(0.0, float(ssim[left_index, right_index]))
                low_resolution = max(0.0, 1.0 - float(rgb_rmse[left_index, right_index]))
                visual = (
                    0.20 * difference_similarity
                    + 0.20 * perceptual_similarity
                    + 0.10 * average_similarity
                    + 0.30 * structural
                    + 0.20 * low_resolution
                )
                composition = composition_similarity(left, right)
                pairs.append({
                    "left": left["key"],
                    "right": right["key"],
                    "theme": theme,
                    "visualSimilarity": round_number(visual),
                    "compositionSimilarity": round_number(composition),
                    "differenceHashSimilarity": round_number(difference_similarity),
                    "perceptualHashSimilarity": round_number(perceptual_similarity),
                    "averageHashSimilarity": round_number(average_similarity),
                    "structuralSimilarity": round_number(structural),
                    "lowResolutionRgbSimilarity": round_number(low_resolution),
                })
    pairs.sort(key=lambda pair: (-pair["visualSimilarity"], -pair["compositionSimilarity"], pair["left"], pair["right"]))
    near = [pair for pair in pairs if pair["visualSimilarity"] >= NEAR_DUPLICATE_THRESHOLD]
    high = [pair for pair in pairs if pair["visualSimilarity"] >= HIGH_SIMILARITY_THRESHOLD]
    involved = {key for pair in near for key in (pair["left"], pair["right"])}
    theme_near = Counter(pair["theme"] for pair in near)
    analysis = {
        "method": {
            "version": "phase6c-multi-metric-v1",
            "sameThemePairsEvaluated": len(pairs),
            "nearDuplicateThreshold": NEAR_DUPLICATE_THRESHOLD,
            "highSimilarityThreshold": HIGH_SIMILARITY_THRESHOLD,
            "metrics": [
                "64-bit difference hash",
                "64-bit perceptual DCT hash",
                "64-bit average hash",
                "16x12 structural similarity",
                "16x12 RGB root-mean-square similarity",
                "normalized composition feature similarity",
            ],
        },
        "flaggedPairCount": len(near),
        "flaggedPairRate": round_number(len(near) / max(1, len(pairs))),
        "highSimilarityPairCount": len(high),
        "highSimilarityPairRate": round_number(len(high) / max(1, len(pairs))),
        "mapsInFlaggedPairs": len(involved),
        "mapsInFlaggedPairsRate": round_number(len(involved) / max(1, len(packages))),
        "flaggedByTheme": dict(sorted(theme_near.items())),
        "maximumVisualSimilarity": pairs[0]["visualSimilarity"] if pairs else 0,
        "p95VisualSimilarity": round_number(np.quantile([pair["visualSimilarity"] for pair in pairs], 0.95)) if pairs else 0,
        "medianVisualSimilarity": round_number(np.median([pair["visualSimilarity"] for pair in pairs])) if pairs else 0,
    }
    return analysis, pairs[:25]


def color_distance(left: list[float], right: list[float]) -> float:
    return math.sqrt(sum((float(a) - float(b)) ** 2 for a, b in zip(left, right)))


def analyze_neighbors(packages: list[dict], renders: dict[str, dict]) -> tuple[dict, dict, list[tuple[str, str]]]:
    by_coordinate = {(record["coordinate"]["gridX"], record["coordinate"]["gridY"]): record for record in packages}
    neighbor_pairs = []
    transition_pairs = []
    for (x, y), record in sorted(by_coordinate.items()):
        for dx, dy in ((1, 0), (0, 1)):
            neighbor = by_coordinate.get((x + dx, y + dy))
            if not neighbor:
                continue
            first, second = sorted((record["key"], neighbor["key"]))
            neighbor_pairs.append((first, second))
            if record["theme"] != neighbor["theme"]:
                transition_pairs.append((first, second))
    package_by_key = {record["key"]: record for record in packages}
    same_theme_deltas = []
    cross_theme_deltas = []
    transition_counts = Counter()
    transition_deltas = defaultdict(list)
    for left_key, right_key in neighbor_pairs:
        left = package_by_key[left_key]
        right = package_by_key[right_key]
        delta = color_distance(
            renders[left_key]["features"]["meanRgb"],
            renders[right_key]["features"]["meanRgb"],
        )
        if left["theme"] == right["theme"]:
            same_theme_deltas.append(delta)
        else:
            cross_theme_deltas.append(delta)
            pair_key = "-".join(sorted((left["theme"], right["theme"])))
            transition_counts[pair_key] += 1
            transition_deltas[pair_key].append(delta)
    all_road_aligned = all(
        record["parity"]["roadPairs"] == 4
        and all(count == 1 for count in record["parity"]["edgeExitCounts"].values())
        for record in packages
    )
    cohesion = {
        "cardinalNeighborPairCount": len(neighbor_pairs),
        "crossThemeNeighborPairCount": len(transition_pairs),
        "allRoadAnchorsAligned": all_road_aligned,
        "allEdgePackagesCompatible": all(record["parity"]["valid"] for record in packages),
        "sequentialRun25Covered": len(packages[:25]) == 25,
        "sequentialRun100Covered": len(packages[:100]) == 100,
        "completeLayerOneCount": sum(record["layer"] == 1 for record in packages),
        "completeLayerTwoCount": sum(record["layer"] == 2 for record in packages),
        "themePairCounts": dict(sorted(transition_counts.items())),
    }
    same_average = float(np.mean(same_theme_deltas)) if same_theme_deltas else 0.0
    cross_average = float(np.mean(cross_theme_deltas)) if cross_theme_deltas else 0.0
    transition_detail = {
        key: {
            "count": len(values),
            "averageMeanRgbDistance": round_number(np.mean(values)),
            "maximumMeanRgbDistance": round_number(np.max(values)),
        }
        for key, values in sorted(transition_deltas.items())
    }
    transitions = {
        "classifierRulePreserved": "dominant axis; exact diagonal ties resolve North/South",
        "sameThemeAverageMeanRgbDistance": round_number(same_average),
        "crossThemeAverageMeanRgbDistance": round_number(cross_average),
        "crossToSameThemeDistanceRatio": round_number(cross_average / max(0.001, same_average)),
        "transitionFamilies": transition_detail,
        "sameWorldPaletteRange": cross_average < 80.0,
        "deterministicBlendProfileRecommended": cross_average >= 65.0,
        "recommendation": (
            "Retain the four primary identities; introduce a deterministic edge-band profile only if full-size human review finds the measured transition distance abrupt."
            if cross_average >= 65.0
            else "No transition blending is required by the measured palette distance; retain the locked deterministic classifier."
        ),
    }
    return cohesion, transitions, transition_pairs


def load_thumbnail(output: Path, package: dict, size: tuple[int, int] = (200, 150)) -> Image.Image:
    path = output / package["packageDirectory"] / "thumbnail.webp"
    with Image.open(path) as opened:
        return opened.convert("RGB").resize(size, Image.Resampling.LANCZOS)


def label_card(image: Image.Image, label: str, caption_height: int = 22) -> Image.Image:
    card = Image.new("RGB", (image.width, image.height + caption_height), "#171b1e")
    card.paste(image, (0, 0))
    draw = ImageDraw.Draw(card)
    draw.text((5, image.height + 4), label, fill="#f4ead2", font=ImageFont.load_default())
    return card


def save_grid(cards: list[Image.Image], columns: int, target: Path, background: str = "#101417") -> None:
    if not cards:
        return
    width = max(card.width for card in cards)
    height = max(card.height for card in cards)
    rows = math.ceil(len(cards) / columns)
    sheet = Image.new("RGB", (width * columns, height * rows), background)
    for index, card in enumerate(cards):
        x = (index % columns) * width
        y = (index // columns) * height
        sheet.paste(card, (x, y))
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, format="PNG", optimize=True)


def city_overlay(output: Path, package: dict) -> Image.Image:
    image = load_thumbnail(output, package, THUMBNAIL_SIZE)
    cities_path = output / package["packageDirectory"] / "cities.json"
    cities = json.loads(cities_path.read_text(encoding="utf-8"))
    draw = ImageDraw.Draw(image)
    for city in cities:
        x = city["x"] / 1448.0 * image.width
        y = city["y"] / 1086.0 * image.height
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill="#f6d365", outline="#4b210b", width=1)
    return image


def deterministic_selection(packages: list[dict], count: int, salt: str) -> list[dict]:
    return sorted(
        packages,
        key=lambda package: hashlib.sha256(f"{salt}|{package['key']}".encode("utf-8")).hexdigest(),
    )[:count]


def generate_gallery(
    output: Path,
    packages: list[dict],
    most_similar: list[dict],
    transition_pairs: list[tuple[str, str]],
) -> dict:
    gallery = output / "gallery"
    gallery.mkdir(parents=True, exist_ok=True)
    by_key = {package["key"]: package for package in packages}
    random_25 = deterministic_selection(packages, 25, "phase6c-random-gallery-v1")
    save_grid([
        label_card(load_thumbnail(output, package), f"{package['key']} {package['theme']}")
        for package in random_25
    ], 5, gallery / "random-25-maps.png")
    save_grid([
        label_card(city_overlay(output, package), f"{package['key']} 40 cities")
        for package in random_25
    ], 5, gallery / "random-25-city-layouts.png")
    pair_cards = []
    for pair in most_similar:
        left = load_thumbnail(output, by_key[pair["left"]], (150, 113))
        right = load_thumbnail(output, by_key[pair["right"]], (150, 113))
        panel = Image.new("RGB", (304, 138), "#171b1e")
        panel.paste(left, (0, 0))
        panel.paste(right, (154, 0))
        draw = ImageDraw.Draw(panel)
        draw.text((4, 117), f"{pair['left']} / {pair['right']}  {pair['visualSimilarity']:.4f}", fill="#f4ead2", font=ImageFont.load_default())
        pair_cards.append(panel)
    save_grid(pair_cards, 5, gallery / "most-similar-25-pairs.png")
    for theme in ("north", "east", "south", "west"):
        selected = deterministic_selection([package for package in packages if package["theme"] == theme], 16, f"theme-{theme}")
        save_grid([
            label_card(load_thumbnail(output, package), f"{package['key']} {package['variant']}")
            for package in selected
        ], 4, gallery / f"representative-{theme}.png")
    save_grid([
        label_card(load_thumbnail(output, package, (180, 135)), f"{package['key']} {package['theme']}")
        for package in packages[:25]
    ], 5, gallery / "sequential-25.png")
    save_grid([
        label_card(load_thumbnail(output, package, (128, 96)), f"{package['index'] + 1}:{package['theme'][0].upper()}", 16)
        for package in packages[:100]
    ], 10, gallery / "sequential-100.png")
    for layer in (1, 2):
        selected = [package for package in packages if package["layer"] == layer]
        save_grid([
            label_card(load_thumbnail(output, package, (160, 120)), f"{package['clockwiseOrderIndex'] + 1}:{package['theme'][0].upper()}", 18)
            for package in selected
        ], 8 if layer == 2 else 6, gallery / f"complete-layer-{layer}.png")
    transition_cards = []
    transition_families: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for left_key, right_key in transition_pairs:
        family = "-".join(sorted((by_key[left_key]["theme"], by_key[right_key]["theme"])))
        transition_families[family].append((left_key, right_key))
    required_families = ("east-north", "east-south", "south-west", "north-west")
    for family in required_families:
        selected_pairs = sorted(
            transition_families.get(family, []),
            key=lambda pair: hashlib.sha256(f"transition|{family}|{pair[0]}|{pair[1]}".encode("utf-8")).hexdigest(),
        )[:6]
        for left_key, right_key in selected_pairs:
            left = load_thumbnail(output, by_key[left_key], (160, 120))
            right = load_thumbnail(output, by_key[right_key], (160, 120))
            panel = Image.new("RGB", (324, 140), "#171b1e")
            panel.paste(left, (0, 0))
            panel.paste(right, (164, 0))
            ImageDraw.Draw(panel).text((4, 123), family.replace("-", " / "), fill="#f4ead2", font=ImageFont.load_default())
            transition_cards.append(panel)
    save_grid(transition_cards, 4, gallery / "directional-transitions.png")
    foundation_cards = []
    edge_cards = []
    road_cards = []
    for theme in ("north", "east", "south", "west"):
        selected = deterministic_selection([package for package in packages if package["theme"] == theme], 6, f"repeat-{theme}")
        for package in selected:
            full = load_thumbnail(output, package, THUMBNAIL_SIZE)
            foundation_cards.append(label_card(full.resize((200, 150), Image.Resampling.LANCZOS), f"{theme} {package['foundation']['transform']}"))
            edge = full.crop((0, 0, 320, 72)).resize((240, 72), Image.Resampling.LANCZOS)
            edge_cards.append(label_card(edge, f"{theme} north edge", 18))
            road = full.crop((110, 0, 210, 100)).resize((180, 180), Image.Resampling.LANCZOS)
            road_cards.append(label_card(road, f"{theme} north road", 18))
    save_grid(foundation_cards, 6, gallery / "repeated-foundations.png")
    save_grid(edge_cards, 6, gallery / "repeated-edges.png")
    save_grid(road_cards, 6, gallery / "repeated-road-layouts.png")
    gallery_files = [
        "random-25-maps.png",
        "random-25-city-layouts.png",
        "most-similar-25-pairs.png",
        "representative-north.png",
        "representative-east.png",
        "representative-south.png",
        "representative-west.png",
        "sequential-25.png",
        "sequential-100.png",
        "complete-layer-1.png",
        "complete-layer-2.png",
        "directional-transitions.png",
        "repeated-foundations.png",
        "repeated-edges.png",
        "repeated-road-layouts.png",
    ]
    sections = "\n".join(
        f'<section><h2>{html.escape(name.replace(".png", "").replace("-", " ").title())}</h2><img src="{html.escape(name)}" alt="{html.escape(name)}"></section>'
        for name in gallery_files
    )
    index = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crownlands Phase 6C repetition gallery</title>
<style>body{{background:#0d1114;color:#eee2c8;font:16px system-ui;margin:24px}}section{{margin:32px 0}}img{{max-width:100%;height:auto;border:1px solid #6c5a3d}}h1,h2{{font-family:Georgia,serif}}</style>
</head><body><h1>Crownlands Phase 6C development-only repetition gallery</h1><p>Locked Phase 6A/6B art direction. No production maps or runtime objects are present.</p>{sections}</body></html>
"""
    (gallery / "index.html").write_text(index, encoding="utf-8")
    return {
        "path": "gallery/index.html",
        "files": gallery_files,
        "randomMapCount": 25,
        "mostSimilarPairCount": len(most_similar),
        "developmentOnly": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    package_index = json.loads((output / "packages-index.json").read_text(encoding="utf-8"))
    render_index = json.loads((output / "render-index.json").read_text(encoding="utf-8"))
    packages = package_index["records"]
    renders = {record["key"]: record for record in render_index["records"]}
    near_duplicates, most_similar = analyze_similarity(packages, renders)
    neighbor_cohesion, directional_transitions, transition_pairs = analyze_neighbors(packages, renders)
    gallery = generate_gallery(output, packages, most_similar, transition_pairs)
    analysis = {
        "schemaVersion": 1,
        "phase": "6C",
        "developmentOnly": True,
        "productionActivated": False,
        "nearDuplicates": near_duplicates,
        "mostSimilarPairs": most_similar,
        "neighborCohesion": neighbor_cohesion,
        "directionalTransitions": directional_transitions,
        "gallery": gallery,
    }
    (output / "visual-analysis.json").write_text(json.dumps(analysis, indent=2) + "\n", encoding="utf-8")
    print(
        f"Phase 6C similarity analysis: {near_duplicates['method']['sameThemePairsEvaluated']} pairs, "
        f"{near_duplicates['flaggedPairCount']} near-duplicate flags.",
        flush=True,
    )


if __name__ == "__main__":
    main()
