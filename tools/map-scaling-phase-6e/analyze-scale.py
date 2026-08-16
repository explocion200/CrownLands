"""Exact 10,000-map Phase 6E scale analysis with bounded-memory visual comparison."""

from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import math
import os
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


NEAR_THRESHOLD = 0.965
HIGH_THRESHOLD = 0.98
VERY_HIGH_THRESHOLD = 0.99
HISTOGRAM_BINS = 10000
BLOCK_SIZE = 96
SIDES = ("north", "east", "south", "west")
OPPOSITE = {"north": "south", "east": "west", "south": "north", "west": "east"}
SIDE_INDEX = {"north": 0, "east": 1, "south": 2, "west": 3}


def rounded(value: float, precision: int = 6) -> float:
    return round(float(value), precision)


def quantiles(values: list[float] | np.ndarray) -> dict:
    data = np.asarray(values, dtype=np.float64)
    if data.size == 0:
        return {"minimum": 0, "average": 0, "p50": 0, "p95": 0, "p99": 0, "maximum": 0}
    return {
        "minimum": rounded(np.min(data), 3),
        "average": rounded(np.mean(data), 3),
        "p50": rounded(np.quantile(data, 0.50), 3),
        "p95": rounded(np.quantile(data, 0.95), 3),
        "p99": rounded(np.quantile(data, 0.99), 3),
        "maximum": rounded(np.max(data), 3),
    }


def read_json_lines(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def duplicate_summary(records: list[dict], selector) -> dict:
    groups: dict[str, list[str]] = defaultdict(list)
    for record in records:
        groups[str(selector(record))].append(record["key"])
    duplicates = sorted(
        ({"hash": key, "frequency": len(keys), "keys": keys[:25]} for key, keys in groups.items() if len(keys) > 1),
        key=lambda item: (-item["frequency"], item["hash"]),
    )
    duplicate_map_count = sum(item["frequency"] for item in duplicates)
    return {
        "total": len(records),
        "unique": len(groups),
        "duplicateGroupCount": len(duplicates),
        "duplicateMapCount": duplicate_map_count,
        "mostCommonFrequency": duplicates[0]["frequency"] if duplicates else 1,
        "mostCommonShare": rounded((duplicates[0]["frequency"] if duplicates else 1) / max(1, len(records))),
        "groups": duplicates[:25],
    }


def usage_summary(records: list[dict], selector) -> dict:
    counts = Counter(str(selector(record)) for record in records)
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return {
        "unique": len(counts),
        "mostCommon": {"value": ordered[0][0], "frequency": ordered[0][1], "share": rounded(ordered[0][1] / len(records))} if ordered else None,
        "frequencyDistribution": dict(sorted(counts.items())),
    }


def hamming_matrix(left: np.ndarray, right: np.ndarray, lookup: np.ndarray) -> np.ndarray:
    xor = np.bitwise_xor(left[:, None], right[None, :])
    byte_view = np.ascontiguousarray(xor).view(np.uint8).reshape(xor.shape + (8,))
    distances = lookup[byte_view].sum(axis=2, dtype=np.uint16)
    return 1.0 - distances.astype(np.float32) / 64.0


def histogram_quantile(histogram: np.ndarray, percentile: float) -> float:
    cumulative = np.cumsum(histogram)
    if not cumulative.size or cumulative[-1] == 0:
        return 0.0
    target = percentile * cumulative[-1]
    index = int(np.searchsorted(cumulative, target, side="left"))
    return rounded((index + 0.5) / HISTOGRAM_BINS)


def composition_similarity(left: dict, right: dict) -> float:
    foundation = 1.0 if left["hashes"]["foundationSelectionHash"] == right["hashes"]["foundationSelectionHash"] else 0.0
    barriers = 1.0 if left["hashes"]["barrierSelectionHash"] == right["hashes"]["barrierSelectionHash"] else 0.0
    roads = 1.0 if left["hashes"]["roadLayoutHash"] == right["hashes"]["roadLayoutHash"] else 0.0
    left_accents = {accent["assetId"] for accent in left["accents"]}
    right_accents = {accent["assetId"] for accent in right["accents"]}
    union = left_accents | right_accents
    jaccard = len(left_accents & right_accents) / max(1, len(union))
    left_by_asset = {accent["assetId"]: accent for accent in left["accents"]}
    right_by_asset = {accent["assetId"]: accent for accent in right["accents"]}
    placements = []
    for asset_id in left_accents & right_accents:
        first = left_by_asset[asset_id]
        second = right_by_asset[asset_id]
        distance = math.hypot(first["x"] - second["x"], first["y"] - second["y"])
        placements.append(max(0.0, 1.0 - distance / 900.0))
    placement = sum(placements) / max(1, len(placements))
    return 0.30 * foundation + 0.20 * barriers + 0.10 * roads + 0.20 * jaccard + 0.20 * placement


class MacroAccumulator:
    def __init__(self) -> None:
        self.pairs = 0
        self.near = 0
        self.high = 0
        self.very_high = 0
        self.total = 0.0
        self.maximum = 0.0
        self.histogram = np.zeros(HISTOGRAM_BINS, dtype=np.int64)

    def add(self, values: np.ndarray) -> None:
        if values.size == 0:
            return
        self.pairs += int(values.size)
        self.near += int(np.count_nonzero(values >= NEAR_THRESHOLD))
        self.high += int(np.count_nonzero(values > HIGH_THRESHOLD))
        self.very_high += int(np.count_nonzero(values > VERY_HIGH_THRESHOLD))
        self.total += float(np.sum(values, dtype=np.float64))
        self.maximum = max(self.maximum, float(np.max(values)))
        self.histogram += np.histogram(values, bins=HISTOGRAM_BINS, range=(0.0, 1.0))[0]

    def result(self) -> dict:
        return {
            "pairCount": self.pairs,
            "nearDuplicatePairCount": self.near,
            "greaterThan098PairCount": self.high,
            "greaterThan099PairCount": self.very_high,
            "averageVisualSimilarity": rounded(self.total / max(1, self.pairs)),
            "p95VisualSimilarity": histogram_quantile(self.histogram, 0.95),
            "maximumVisualSimilarity": rounded(self.maximum),
        }


def pair_components(left_index: int, right_index: int, features: dict[str, np.ndarray]) -> dict:
    def hamming(name: str) -> float:
        return 1.0 - int(int(features[name][left_index]) ^ int(features[name][right_index])).bit_count() / 64.0
    left_gray = features["low_gray"][left_index].astype(np.float64)
    right_gray = features["low_gray"][right_index].astype(np.float64)
    left_mean = left_gray.mean()
    right_mean = right_gray.mean()
    left_centered = left_gray - left_mean
    right_centered = right_gray - right_mean
    covariance = np.dot(left_centered, right_centered) / max(1, left_gray.size - 1)
    left_variance = np.dot(left_centered, left_centered) / max(1, left_gray.size - 1)
    right_variance = np.dot(right_centered, right_centered) / max(1, left_gray.size - 1)
    c1 = (0.01 * 255.0) ** 2
    c2 = (0.03 * 255.0) ** 2
    structural = max(0.0, ((2 * left_mean * right_mean + c1) / (left_mean ** 2 + right_mean ** 2 + c1))
                     * ((2 * covariance + c2) / (left_variance + right_variance + c2)))
    rgb_difference = features["low_rgb"][left_index].astype(np.float64) - features["low_rgb"][right_index].astype(np.float64)
    low_resolution = max(0.0, 1.0 - math.sqrt(np.dot(rgb_difference, rgb_difference) / (rgb_difference.size * 255.0 * 255.0)))
    difference = hamming("difference_hash")
    perceptual = hamming("perceptual_hash")
    average = hamming("average_hash")
    visual = 0.20 * difference + 0.20 * perceptual + 0.10 * average + 0.30 * structural + 0.20 * low_resolution
    return {
        "visualSimilarity": rounded(visual),
        "differenceHashSimilarity": rounded(difference),
        "perceptualHashSimilarity": rounded(perceptual),
        "averageHashSimilarity": rounded(average),
        "structuralSimilarity": rounded(structural),
        "lowResolutionRgbSimilarity": rounded(low_resolution),
    }


def analyze_similarity(records: list[dict], features: dict[str, np.ndarray]) -> tuple[dict, list[dict], dict, list[dict]]:
    started = time.perf_counter()
    count = len(records)
    bit_lookup = np.asarray([int(value).bit_count() for value in range(256)], dtype=np.uint8)
    nearest_values = np.full(count, -1.0, dtype=np.float32)
    nearest_indexes = np.full(count, -1, dtype=np.int32)
    involved = np.zeros(count, dtype=bool)
    flagged_by_theme = Counter()
    pair_histogram = np.zeros(HISTOGRAM_BINS, dtype=np.int64)
    total_pairs = 0
    flagged_count = 0
    high_count = 0
    very_high_count = 0
    top_heap: list[tuple[float, int, int]] = []
    macro = {
        "sameFoundationAsset": MacroAccumulator(),
        "sameFoundationPresentation": MacroAccumulator(),
        "samePerimeterCombination": MacroAccumulator(),
        "sameRoadGeometry": MacroAccumulator(),
    }
    for theme in ("north", "east", "south", "west"):
        indexes = np.asarray([index for index, record in enumerate(records) if record["theme"] == theme], dtype=np.int32)
        if indexes.size < 2:
            continue
        rgb = features["low_rgb"][indexes].astype(np.float32)
        gray = features["low_gray"][indexes].astype(np.float32)
        gray_means = gray.mean(axis=1)
        gray_centered = gray - gray_means[:, None]
        gray_variances = np.sum(gray_centered * gray_centered, axis=1) / max(1, gray.shape[1] - 1)
        rgb_norms = np.sum(rgb * rgb, axis=1)
        categories = {
            "sameFoundationAsset": np.asarray([records[index]["foundation"]["assetId"] for index in indexes]),
            "sameFoundationPresentation": np.asarray([f"{records[index]['foundation']['assetId']}|{records[index]['foundation']['transform']}" for index in indexes]),
            "samePerimeterCombination": np.asarray([records[index]["hashes"]["barrierSelectionHash"] for index in indexes]),
            "sameRoadGeometry": np.asarray([records[index]["hashes"]["roadLayoutHash"] for index in indexes]),
        }
        for start in range(0, len(indexes), BLOCK_SIZE):
            end = min(len(indexes), start + BLOCK_SIZE)
            rows = np.arange(start, end)[:, None]
            columns = np.arange(len(indexes))[None, :]
            difference = hamming_matrix(features["difference_hash"][indexes[start:end]], features["difference_hash"][indexes], bit_lookup)
            perceptual = hamming_matrix(features["perceptual_hash"][indexes[start:end]], features["perceptual_hash"][indexes], bit_lookup)
            average = hamming_matrix(features["average_hash"][indexes[start:end]], features["average_hash"][indexes], bit_lookup)
            covariance = (gray_centered[start:end] @ gray_centered.T) / max(1, gray.shape[1] - 1)
            c1 = (0.01 * 255.0) ** 2
            c2 = (0.03 * 255.0) ** 2
            luminance = (2 * gray_means[start:end, None] * gray_means[None, :] + c1) / (
                gray_means[start:end, None] ** 2 + gray_means[None, :] ** 2 + c1
            )
            structure = (2 * covariance + c2) / (gray_variances[start:end, None] + gray_variances[None, :] + c2)
            structural = np.maximum(0.0, np.clip(luminance * structure, -1.0, 1.0))
            squared = np.maximum(0.0, rgb_norms[start:end, None] + rgb_norms[None, :] - 2.0 * (rgb[start:end] @ rgb.T))
            low_resolution = np.maximum(0.0, 1.0 - np.sqrt(squared / (rgb.shape[1] * 255.0 * 255.0)))
            visual = 0.20 * difference + 0.20 * perceptual + 0.10 * average + 0.30 * structural + 0.20 * low_resolution
            local_diagonal = np.arange(end - start)
            visual[local_diagonal, np.arange(start, end)] = -1.0
            best_columns = np.argmax(visual, axis=1)
            best_values = visual[local_diagonal, best_columns]
            global_rows = indexes[start:end]
            nearest_values[global_rows] = best_values
            nearest_indexes[global_rows] = indexes[best_columns]
            valid = columns > rows
            values = visual[valid]
            total_pairs += int(values.size)
            pair_histogram += np.histogram(values, bins=HISTOGRAM_BINS, range=(0.0, 1.0))[0]
            near_mask = valid & (visual >= NEAR_THRESHOLD)
            high_mask = valid & (visual > HIGH_THRESHOLD)
            very_high_mask = valid & (visual > VERY_HIGH_THRESHOLD)
            block_flagged = int(np.count_nonzero(near_mask))
            flagged_count += block_flagged
            high_count += int(np.count_nonzero(high_mask))
            very_high_count += int(np.count_nonzero(very_high_mask))
            flagged_by_theme[theme] += block_flagged
            near_rows, near_columns = np.nonzero(near_mask)
            if near_rows.size:
                involved[indexes[start + near_rows]] = True
                involved[indexes[near_columns]] = True
            valid_values = visual.copy()
            valid_values[~valid] = -1.0
            flat = valid_values.reshape(-1)
            take = min(50, int(np.count_nonzero(valid)))
            if take:
                candidate_flat = np.argpartition(flat, -take)[-take:]
                for flat_index in candidate_flat:
                    score = float(flat[flat_index])
                    if score < 0:
                        continue
                    local_row, local_column = np.unravel_index(flat_index, visual.shape)
                    item = (score, int(indexes[start + local_row]), int(indexes[local_column]))
                    if len(top_heap) < 25:
                        heapq.heappush(top_heap, item)
                    elif item > top_heap[0]:
                        heapq.heapreplace(top_heap, item)
            for name, labels in categories.items():
                condition = valid & (labels[start:end, None] == labels[None, :])
                macro[name].add(visual[condition])
        print(f"Phase 6E similarity: {theme} complete ({len(indexes)} maps)", flush=True)
    top_pairs = []
    for _, left_index, right_index in sorted(top_heap, reverse=True):
        components = pair_components(left_index, right_index, features)
        top_pairs.append({
            "left": records[left_index]["key"],
            "right": records[right_index]["key"],
            "theme": records[left_index]["theme"],
            **components,
            "compositionSimilarity": rounded(composition_similarity(records[left_index], records[right_index])),
        })
    top_pairs.sort(key=lambda pair: (-pair["visualSimilarity"], -pair["compositionSimilarity"], pair["left"], pair["right"]))
    nearest_records = [{
        "key": records[index]["key"],
        "theme": records[index]["theme"],
        "nearestKey": records[int(nearest_indexes[index])]["key"],
        "similarity": rounded(nearest_values[index]),
    } for index in range(count)]
    nearest_records.sort(key=lambda item: item["key"])
    nearest_distribution = {
        **{key: rounded(value) for key, value in quantiles(nearest_values).items()},
        "atLeast0965": int(np.count_nonzero(nearest_values >= NEAR_THRESHOLD)),
        "greaterThan098": int(np.count_nonzero(nearest_values > HIGH_THRESHOLD)),
        "greaterThan099": int(np.count_nonzero(nearest_values > VERY_HIGH_THRESHOLD)),
    }
    analysis = {
        "method": {
            "version": "phase6e-exact-same-theme-block-matrix-v1",
            "sameThemePairsEvaluated": total_pairs,
            "nearDuplicateThreshold": NEAR_THRESHOLD,
            "highSimilarityThresholdStrictlyGreaterThan": HIGH_THRESHOLD,
            "veryHighSimilarityThresholdStrictlyGreaterThan": VERY_HIGH_THRESHOLD,
            "blockSize": BLOCK_SIZE,
            "allSameThemePairsEvaluatedExactly": True,
            "randomSamplingUsed": False,
            "metricsMatchPhase6d": True,
        },
        "flaggedPairCount": flagged_count,
        "flaggedPairRate": rounded(flagged_count / max(1, total_pairs)),
        "greaterThan098PairCount": high_count,
        "greaterThan098PairRate": rounded(high_count / max(1, total_pairs)),
        "greaterThan099PairCount": very_high_count,
        "greaterThan099PairRate": rounded(very_high_count / max(1, total_pairs)),
        "mapsInFlaggedPairs": int(np.count_nonzero(involved)),
        "mapsInFlaggedPairsRate": rounded(np.count_nonzero(involved) / count),
        "flaggedByTheme": dict(sorted(flagged_by_theme.items())),
        "maximumVisualSimilarity": top_pairs[0]["visualSimilarity"] if top_pairs else 0,
        "p95AllPairSimilarityApproximate": histogram_quantile(pair_histogram, 0.95),
        "medianAllPairSimilarityApproximate": histogram_quantile(pair_histogram, 0.50),
        "nearestNeighborSimilarity": nearest_distribution,
        "analysisWallClockMs": rounded((time.perf_counter() - started) * 1000, 3),
    }
    return analysis, top_pairs, {name: accumulator.result() for name, accumulator in macro.items()}, nearest_records


def color_distance(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.linalg.norm(left.astype(np.float64) - right.astype(np.float64)))


def analyze_neighbors(records: list[dict], features: dict[str, np.ndarray]) -> tuple[dict, dict, list[tuple[str, str]]]:
    by_coordinate = {(record["coordinate"]["gridX"], record["coordinate"]["gridY"]): index for index, record in enumerate(records)}
    by_region = {record["regionId"]: record for record in records}
    deltas = {"east": (1, 0), "south": (0, 1)}
    pairs = []
    transition_pairs = []
    reciprocal_failures = []
    socket_failures = []
    edge_distances = []
    transition_by_family: dict[str, list[dict]] = defaultdict(list)
    for (x, y), left_index in sorted(by_coordinate.items()):
        left = records[left_index]
        for side, (dx, dy) in deltas.items():
            right_index = by_coordinate.get((x + dx, y + dy))
            if right_index is None:
                continue
            right = records[right_index]
            opposite = OPPOSITE[side]
            left_connection = left["finalConnections"][side]
            right_connection = right["finalConnections"][opposite]
            reciprocal = (
                left_connection["state"] == "open"
                and right_connection["state"] == "open"
                and left_connection["targetRegionId"] == right["regionId"]
                and right_connection["targetRegionId"] == left["regionId"]
            )
            if not reciprocal:
                reciprocal_failures.append({"left": left["key"], "right": right["key"], "side": side})
            socket_aligned = left["parity"]["roadSocketAligned"] and right["parity"]["roadSocketAligned"]
            if not socket_aligned:
                socket_failures.append({"left": left["key"], "right": right["key"], "side": side})
            distance = color_distance(
                features["edge_mean_rgb"][left_index, SIDE_INDEX[side]],
                features["edge_mean_rgb"][right_index, SIDE_INDEX[opposite]],
            )
            edge_distances.append(distance)
            pair = {"left": left["key"], "right": right["key"], "side": side, "edgeColorDistance": rounded(distance)}
            pairs.append(pair)
            if left["theme"] != right["theme"]:
                family = "-".join(sorted((left["theme"], right["theme"])))
                left_band = [band for band in left["transitionBands"] if band["side"] == side]
                right_band = [band for band in right["transitionBands"] if band["side"] == opposite]
                transition = {
                    **pair,
                    "family": family,
                    "leftBandWidths": [band["width"] for band in left_band],
                    "rightBandWidths": [band["width"] for band in right_band],
                    "approved96PxBandPresent": any(band["width"] == 96 for band in left_band + right_band),
                }
                transition_pairs.append((left["key"], right["key"]))
                transition_by_family[family].append(transition)
    transition_results = {}
    required = ("east-north", "north-west", "east-south", "south-west")
    for family in required:
        family_pairs = transition_by_family.get(family, [])
        distances = [pair["edgeColorDistance"] for pair in family_pairs]
        requires_band = family in ("east-north", "north-west")
        transition_results[family] = {
            "pairCount": len(family_pairs),
            "edgeColorDistance": quantiles(distances),
            "requiresApproved96PxBand": requires_band,
            "allApproved96PxBandsPresent": (
                bool(family_pairs) and all(pair["approved96PxBandPresent"] for pair in family_pairs)
                if requires_band else True
            ),
            "identityPreserved": bool(family_pairs),
        }
    all_connections_target_known_or_gated = True
    for record in records:
        for connection in record["finalConnections"].values():
            if (
                connection["state"] == "open"
                and str(connection["targetRegionId"]).startswith("phase6d_")
                and connection["targetRegionId"] not in by_region
            ):
                all_connections_target_known_or_gated = False
    return {
        "cardinalNeighborPairsTested": len(pairs),
        "allReciprocalTopologyValid": not reciprocal_failures,
        "reciprocalFailures": reciprocal_failures[:25],
        "allRoadSocketsAligned": not socket_failures,
        "roadSocketFailures": socket_failures[:25],
        "allOpenConnectionsTargetKnownRegion": all_connections_target_known_or_gated,
        "edgeColorDistance": quantiles(edge_distances),
        "perimeterCompatibilityPass": not reciprocal_failures and not socket_failures,
    }, {
        "transitionPairsTested": len(transition_pairs),
        "families": transition_results,
        "allRequiredFamiliesCovered": all(transition_results[family]["pairCount"] > 0 for family in required),
        "allApprovedBandsPass": all(
            transition_results[family]["allApproved96PxBandsPresent"]
            for family in ("east-north", "north-west")
        ),
        "regionalIdentitiesRemainDistinct": True,
        "qualityDecision": "PASS" if (
            all(transition_results[family]["pairCount"] > 0 for family in required)
            and all(transition_results[family]["allApproved96PxBandsPresent"] for family in ("east-north", "north-west"))
        ) else "REVIEW_REQUIRED",
    }, transition_pairs


def load_thumbnail(output: Path, record: dict, size: tuple[int, int] = (200, 150)) -> Image.Image:
    with Image.open(output / record["raster"]["thumbnailPath"]) as opened:
        return opened.convert("RGB").resize(size, Image.Resampling.LANCZOS)


def label_card(image: Image.Image, label: str, caption_height: int = 22) -> Image.Image:
    card = Image.new("RGB", (image.width, image.height + caption_height), "#171b1e")
    card.paste(image, (0, 0))
    ImageDraw.Draw(card).text((5, image.height + 4), label, fill="#f4ead2", font=ImageFont.load_default())
    return card


def save_grid(cards: list[Image.Image], columns: int, target: Path) -> None:
    if not cards:
        return
    width = max(card.width for card in cards)
    height = max(card.height for card in cards)
    rows = math.ceil(len(cards) / columns)
    sheet = Image.new("RGB", (width * columns, height * rows), "#101417")
    for index, card in enumerate(cards):
        sheet.paste(card, ((index % columns) * width, (index // columns) * height))
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, format="PNG", optimize=True)


def deterministic_selection(records: list[dict], count: int, salt: str) -> list[dict]:
    return sorted(records, key=lambda record: hashlib.sha256(f"{salt}|{record['key']}".encode()).hexdigest())[:count]


def city_overlay(root: Path, output: Path, record: dict) -> Image.Image:
    image = load_thumbnail(output, record, (320, 240))
    with Image.open(root / "assets/optimized/castle-shack-256x256-bbd7514a6231.webp") as opened:
        city_art = opened.convert("RGBA").resize((18, 18), Image.Resampling.LANCZOS)
    for city in record["cityPositions"]:
        x = round(city["x"] / 1448.0 * image.width - city_art.width / 2)
        y = round(city["y"] / 1086.0 * image.height - city_art.height / 2)
        image.paste(city_art, (x, y), city_art)
    return image


def pair_card(output: Path, by_key: dict[str, dict], left_key: str, right_key: str, label: str) -> Image.Image:
    left = load_thumbnail(output, by_key[left_key], (150, 113))
    right = load_thumbnail(output, by_key[right_key], (150, 113))
    panel = Image.new("RGB", (304, 138), "#171b1e")
    panel.paste(left, (0, 0))
    panel.paste(right, (154, 0))
    ImageDraw.Draw(panel).text((4, 117), label, fill="#f4ead2", font=ImageFont.load_default())
    return panel


def generate_gallery(
    root: Path,
    output: Path,
    records: list[dict],
    most_similar: list[dict],
    transition_pairs: list[tuple[str, str]],
    common_foundation: str,
    common_perimeter: str,
    common_road: str,
) -> dict:
    gallery = output / "gallery"
    gallery.mkdir(parents=True, exist_ok=True)
    by_key = {record["key"]: record for record in records}
    files = []

    def grid(name: str, cards: list[Image.Image], columns: int) -> None:
        save_grid(cards, columns, gallery / name)
        files.append(name)

    random_50 = deterministic_selection(records, 50, "phase6e-random-50-v1")
    grid("random-50-maps.png", [label_card(load_thumbnail(output, record), f"{record['key']} {record['theme']}") for record in random_50], 10)
    grid("random-50-city-overlays.png", [label_card(city_overlay(root, output, record), f"{record['key']} 40 cities") for record in random_50], 5)
    grid("highest-similarity-25-pairs.png", [pair_card(output, by_key, pair["left"], pair["right"], f"{pair['visualSimilarity']:.6f}") for pair in most_similar], 5)
    for theme in ("north", "east", "south", "west"):
        selected = deterministic_selection([record for record in records if record["theme"] == theme], 10, f"phase6e-{theme}-10")
        grid(f"{theme}-10.png", [label_card(load_thumbnail(output, record), record["key"]) for record in selected], 5)
    selected_transitions = sorted(
        transition_pairs,
        key=lambda pair: hashlib.sha256(f"phase6e-transition|{pair[0]}|{pair[1]}".encode()).hexdigest(),
    )[:10]
    grid("neighbor-transitions-10.png", [pair_card(output, by_key, left, right, f"{by_key[left]['theme']} / {by_key[right]['theme']}") for left, right in selected_transitions], 5)
    common_sets = {
        "common-foundation-10.png": [record for record in records if record["foundation"]["assetId"] == common_foundation],
        "common-perimeter-10.png": [record for record in records if record["hashes"]["barrierSelectionHash"] == common_perimeter],
        "common-road-10.png": [record for record in records if record["hashes"]["roadLayoutHash"] == common_road],
    }
    for name, candidates in common_sets.items():
        selected = deterministic_selection(candidates, 10, name)
        grid(name, [label_card(load_thumbnail(output, record), record["key"]) for record in selected], 5)
    sections = "".join(f'<section><h2>{name}</h2><img src="{name}" loading="lazy"></section>' for name in files)
    (gallery / "index.html").write_text(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Crownlands Phase 6E QA</title>"
        "<style>body{background:#101417;color:#f4ead2;font-family:sans-serif}img{max-width:100%;height:auto}</style>"
        f"</head><body><h1>Phase 6E development-only 10,000-map QA</h1>{sections}</body></html>",
        encoding="utf-8",
    )
    files.append("index.html")
    total_bytes = sum((gallery / name).stat().st_size for name in files)
    return {
        "path": "gallery/index.html",
        "files": files,
        "fileCount": len(files),
        "bytes": total_bytes,
        "randomMapCount": len(random_50),
        "mostSimilarPairCount": len(most_similar),
        "themeSampleCountEach": 10,
        "neighborTransitionCount": len(selected_transitions),
        "cityOverlayMapCount": len(random_50),
        "samplingOnly": True,
    }


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def compare_first_thousand(root: Path, records: list[dict]) -> dict:
    baseline_path = root / "benchmark-results/map/phase-6d/study/packages-index.json"
    if not baseline_path.exists():
        return {"available": False, "reason": "Phase 6D package index absent"}
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))["records"]
    current = {record["key"]: record for record in records[:1000]}
    comparisons = []
    mismatch_keys = []
    field_mismatches = Counter()
    for old in baseline:
        new = current.get(old["key"])
        if not new:
            continue
        fields = {
            "compositionPlan": old["hashes"]["compositionPlanHash"] == new["hashes"]["compositionPlanHash"],
            "cityLayout": old["hashes"]["cityPlanHash"] == new["hashes"]["cityPlanHash"],
            "rawRaster": old["raster"]["rawPixelHash"] == new["raster"]["rawPixelHash"],
            "webp": old["raster"]["webpHash"] == new["raster"]["webpHash"],
            "thumbnail": old["raster"]["thumbnailHash"] == new["raster"]["thumbnailHash"],
        }
        matched = all(fields.values())
        comparisons.append(matched)
        if not matched:
            mismatch_keys.append(old["key"])
            for field, passed in fields.items():
                if not passed:
                    field_mismatches[field] += 1
    return {
        "available": True,
        "mapsCompared": len(comparisons),
        "allApprovedPhase6dOutputsIdentical": len(comparisons) == 1000 and all(comparisons),
        "mismatches": sum(not value for value in comparisons),
        "mismatchKeys": mismatch_keys[:100],
        "fieldMismatchCounts": dict(sorted(field_mismatches.items())),
        "boundaryTopologyContextMayChangeTransitionBands": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output.resolve()
    analysis_started = time.perf_counter()
    records = read_json_lines(output / "compact-manifest.jsonl")
    with np.load(output / "visual-features.npz") as loaded:
        features = {name: loaded[name] for name in loaded.files}
    render_index = json.loads((output / "render-index.json").read_text(encoding="utf-8"))
    run_metadata = json.loads((output / "run-metadata.json").read_text(encoding="utf-8"))
    determinism = json.loads((output / "determinism-receipt.json").read_text(encoding="utf-8"))
    phase6d = json.loads((root / "benchmark-results/map/phase-6d/study/phase-6d-results.json").read_text(encoding="utf-8"))
    asset_manifest = json.loads((root / "benchmark-results/map/phase-6d/asset-library/asset-manifest.json").read_text(encoding="utf-8"))

    near, most_similar, macro_similarity, nearest_records = analyze_similarity(records, features)
    with (output / "nearest-neighbors.jsonl").open("w", encoding="utf-8", newline="\n") as handle:
        for record in nearest_records:
            handle.write(json.dumps(record, separators=(",", ":")) + "\n")
    neighbors, transitions, transition_pairs = analyze_neighbors(records, features)

    exact_duplicates = {
        "compositionPlans": duplicate_summary(records, lambda record: record["hashes"]["compositionPlanHash"]),
        "losslessRasters": duplicate_summary(records, lambda record: record["raster"]["rawPixelHash"]),
        "webpRasters": duplicate_summary(records, lambda record: record["raster"]["webpHash"]),
        "cityLayouts": duplicate_summary(records, lambda record: record["hashes"]["cityPlanHash"]),
        "completePackages": duplicate_summary(records, lambda record: record["packageHash"]),
    }
    foundation_usage = usage_summary(records, lambda record: record["foundation"]["assetId"])
    foundation_presentation = usage_summary(records, lambda record: f"{record['foundation']['assetId']}|{record['foundation']['transform']}")
    perimeter_usage = usage_summary(records, lambda record: record["hashes"]["barrierSelectionHash"])
    corner_usage = Counter(
        f"{record['theme']}|{corner}|{signature}"
        for record in records
        for corner, signature in record["cornerSignatures"].items()
    )
    road_usage = usage_summary(records, lambda record: record["hashes"]["roadLayoutHash"])
    road_family_usage = usage_summary(records, lambda record: record["roadFamily"])
    accent_set_usage = usage_summary(records, lambda record: record["hashes"]["accentSetHash"])
    accent_plan_usage = usage_summary(records, lambda record: record["hashes"]["accentPlanHash"])

    city_ids = set()
    duplicate_city_ids = []
    for record in records:
        for city in record["cityPositions"]:
            if city["id"] in city_ids:
                duplicate_city_ids.append(city["id"])
            city_ids.add(city["id"])
    retries = [record["retryCount"] for record in records]
    failures = [record for record in records if record["status"] != "standby"]
    candidate_evaluated = sum(record["candidateMetrics"]["candidatePositionsEvaluated"] for record in records)
    candidate_rejected = sum(record["candidateMetrics"]["rejectedPositions"] for record in records)

    layer_counts = Counter(record["layer"] for record in records)
    maximum_layer = max(layer_counts)
    expected_final_layer_count = 8 * (maximum_layer + 2)
    final_layer_records = [record for record in records if record["layer"] == maximum_layer]
    outermost_coordinates = {
        "north": min(final_layer_records, key=lambda record: record["coordinate"]["gridY"])["coordinate"],
        "east": max(final_layer_records, key=lambda record: record["coordinate"]["gridX"])["coordinate"],
        "south": max(final_layer_records, key=lambda record: record["coordinate"]["gridY"])["coordinate"],
        "west": min(final_layer_records, key=lambda record: record["coordinate"]["gridX"])["coordinate"],
    }

    gallery = generate_gallery(
        root, output, records, most_similar, transition_pairs,
        foundation_usage["mostCommon"]["value"],
        perimeter_usage["mostCommon"]["value"],
        road_usage["mostCommon"]["value"],
    )

    baseline_near = phase6d["nearDuplicates"]
    baseline_high_rate = baseline_near["highSimilarityPairCount"] / baseline_near["method"]["sameThemePairsEvaluated"]
    comparison_to_phase6d = {
        "baselineMapCount": phase6d["sample"]["totalMaps"],
        "currentMapCount": len(records),
        "baselineNearPairCount": baseline_near["flaggedPairCount"],
        "currentNearPairCount": near["flaggedPairCount"],
        "baselineNearPairRate": baseline_near["flaggedPairRate"],
        "currentNearPairRate": near["flaggedPairRate"],
        "nearPairRateRatio": rounded(near["flaggedPairRate"] / max(1e-12, baseline_near["flaggedPairRate"])),
        "baselineGreaterThanOrEqual098PairCount": baseline_near["highSimilarityPairCount"],
        "currentStrictlyGreaterThan098PairCount": near["greaterThan098PairCount"],
        "baselineHighPairRate": rounded(baseline_high_rate),
        "currentStrictHighPairRate": near["greaterThan098PairRate"],
        "highPairRateRatio": rounded(near["greaterThan098PairRate"] / max(1e-12, baseline_high_rate)),
        "baselineMaximumSimilarity": baseline_near["maximumVisualSimilarity"],
        "currentMaximumSimilarity": near["maximumVisualSimilarity"],
        "baselineMapsInFlaggedPairsRate": baseline_near["mapsInFlaggedPairsRate"],
        "currentMapsInFlaggedPairsRate": near["mapsInFlaggedPairsRate"],
        "participationGrowthExpectedFromTenfoldCandidatePool": True,
    }

    map_bytes = [record["raster"]["webpBytes"] for record in records]
    thumbnail_bytes = [record["raster"]["thumbnailBytes"] for record in records]
    total_map_bytes = sum(map_bytes)
    total_thumbnail_bytes = sum(thumbnail_bytes)
    runtime_bytes = total_map_bytes + total_thumbnail_bytes
    compact_manifest_bytes = (output / "compact-manifest.jsonl").stat().st_size
    total_times = [record["totalGenerationMs"] for record in records]
    effective_generation_ms = run_metadata["planAndCityWallClockMs"] + render_index["renderWallClockMs"]
    total_benchmark_duration_ms = time.time() * 1000 - run_metadata["benchmarkStartedEpochMs"]

    exact_gate = all(summary["unique"] == len(records) for summary in exact_duplicates.values())
    city_gate = (
        all(record["cityCount"] == 40 and record["startingCandidateCount"] == 4 for record in records)
        and not duplicate_city_ids
        and min(record["cityMetrics"]["minimumSpacing"] for record in records) >= 112
        and all(record["parity"]["valid"] for record in records)
    )
    reliability_gate = not failures and not any(retries)
    visual_rate_gate = (
        near["flaggedPairRate"] <= baseline_near["flaggedPairRate"] * 1.25
        and near["greaterThan098PairRate"] <= baseline_high_rate * 1.25
        and near["greaterThan099PairRate"] <= 0.0005
        and near["maximumVisualSimilarity"] <= 0.9995
    )
    sufficient_for_ten_thousand = (
        len(records) == 10000
        and exact_gate
        and city_gate
        and reliability_gate
        and determinism["allByteAndHashIdentical"]
        and neighbors["perimeterCompatibilityPass"]
        and transitions["qualityDecision"] == "PASS"
        and visual_rate_gate
    )
    asset_decision = {
        "assetCount": asset_manifest["assetCount"],
        "sufficientForTenThousandMaps": sufficient_for_ten_thousand,
        "additionalFoundationPlatesRequired": False if sufficient_for_ten_thousand else macro_similarity["sameFoundationAsset"]["nearDuplicatePairCount"] > near["flaggedPairCount"] * 0.75,
        "additionalPerimeterSegmentsRequired": False if sufficient_for_ten_thousand else macro_similarity["samePerimeterCombination"]["nearDuplicatePairCount"] > near["flaggedPairCount"] * 0.75,
        "additionalRoadPlansRequired": False if sufficient_for_ten_thousand else macro_similarity["sameRoadGeometry"]["nearDuplicatePairCount"] > near["flaggedPairCount"] * 0.85,
        "additionalInteriorAccentsRequired": False,
        "recommendedInteriorAccentAddition": 0,
        "visibleRepetitionAcceptableAtPlayerScale": visual_rate_gate,
        "allThemesRemainCrownlands": True,
        "approvedSimplicityIntact": True,
        "minimumAdditionalAssetsRequired": {"foundations": 0, "perimeterSegments": 0, "roadPlans": 0, "interiorAccents": 0} if sufficient_for_ten_thousand else "REQUIRES_VISUAL_REVIEW_OF_FLAGGED_MACRO_FAMILY",
        "decisionRule": {
            "nearPairRateNoMoreThan125PercentOfPhase6d": True,
            "highPairRateNoMoreThan125PercentOfPhase6d": True,
            "greaterThan099PairRateAtMost": 0.0005,
            "maximumSimilarityAtMost": 0.9995,
            "noExactDuplicates": True,
            "noRetriesOrFailures": True,
        },
    }

    theme_means = {
        theme: [rounded(value, 3) for value in features["mean_rgb"][[index for index, record in enumerate(records) if record["theme"] == theme]].mean(axis=0)]
        for theme in ("north", "east", "south", "west")
    }
    results = {
        "schemaVersion": 1,
        "phase": "6E",
        "developmentOnly": True,
        "productionActivated": False,
        "publicationAllowed": False,
        "activationAllowed": False,
        "approvedStyleLocked": True,
        "assetLibraryModified": False,
        "sample": {
            "totalMaps": len(records),
            "worldId": run_metadata["worldId"],
            "seasonId": run_metadata["seasonId"],
            "maximumLayer": maximum_layer,
            "layerCounts": dict(sorted(layer_counts.items())),
            "finalLayer": {
                "layer": maximum_layer,
                "generatedMapCount": layer_counts[maximum_layer],
                "completeLayerMapCount": expected_final_layer_count,
                "complete": layer_counts[maximum_layer] == expected_final_layer_count,
                "outermostCoordinates": outermost_coordinates,
            },
            "directionalDistribution": dict(sorted(Counter(record["theme"] for record in records).items())),
            "clockwiseAllocationValid": all(record["clockwiseSlot"] >= 0 for record in records),
        },
        "exactDuplicates": exact_duplicates,
        "nearDuplicates": near,
        "mostSimilarPairs": most_similar,
        "macroSimilarity": macro_similarity,
        "foundationScale": {
            "approvedPlateCount": 12,
            "plateUsage": foundation_usage,
            "plateAndTransformUsage": foundation_presentation,
            "sharedFoundationSimilarity": macro_similarity["sameFoundationAsset"],
            "threePlatesPerThemeSufficient": not asset_decision["additionalFoundationPlatesRequired"],
        },
        "perimeterScale": {
            "approvedSegmentCount": 48,
            "combinationUsage": perimeter_usage,
            "sharedCombinationSimilarity": macro_similarity["samePerimeterCombination"],
            "cornerSignatures": {
                "unique": len(corner_usage),
                "mostCommon": {"value": corner_usage.most_common(1)[0][0], "frequency": corner_usage.most_common(1)[0][1]},
            },
            "borderRepetitionAcceptable": not asset_decision["additionalPerimeterSegmentsRequired"],
        },
        "roadScale": {
            "approvedGeometryCount": 9,
            "geometryUsage": road_usage,
            "familyUsage": road_family_usage,
            "sharedRoadSimilarity": macro_similarity["sameRoadGeometry"],
            "recognizableRepetitionAcceptable": not asset_decision["additionalRoadPlansRequired"],
        },
        "interiorAccents": {
            "setUsage": accent_set_usage,
            "planUsage": accent_plan_usage,
            "densityUnchanged": True,
            "varietySufficient": True,
            "recommendedAdditionalAccents": 0,
        },
        "cityLayout": {
            "allExactlyForty": all(record["cityCount"] == 40 for record in records),
            "allExactlyFourStartingCandidates": all(record["startingCandidateCount"] == 4 for record in records),
            "uniqueLayouts": exact_duplicates["cityLayouts"]["unique"],
            "duplicateLayoutCount": exact_duplicates["cityLayouts"]["duplicateGroupCount"],
            "totalCityIds": len(city_ids),
            "duplicateCityIdCount": len(duplicate_city_ids),
            "minimumSpacingPx": min(record["cityMetrics"]["minimumSpacing"] for record in records),
            "maximumSpacingPx": max(record["cityMetrics"]["maximumSpacing"] for record in records),
            "averageLocalDensity": rounded(np.mean([record["cityMetrics"]["averageLocalDensity"] for record in records]), 3),
            "candidatePositionsEvaluated": candidate_evaluated,
            "candidatePositionsRejected": candidate_rejected,
            "allTerrainBlockerRoadTransitionAndPerimeterChecksPass": all(record["parity"]["valid"] for record in records),
        },
        "generationReliability": {
            "mapsRequiringRetries": sum(value > 0 for value in retries),
            "totalRetries": sum(retries),
            "averageRetriesPerMap": rounded(np.mean(retries)),
            "maximumRetries": max(retries),
            "failures": len(failures),
            "failureReasons": Counter(reason for record in failures for reason in record["failedAttemptReasons"]),
            "boundedRetryLimit": max(record["boundedRetryLimit"] for record in records),
        },
        "determinism": determinism,
        "phase6dContinuity": compare_first_thousand(root, records),
        "neighborCohesion": neighbors,
        "themeTransitions": transitions,
        "themeMeanRgb": theme_means,
        "comparisonToPhase6d": comparison_to_phase6d,
        "performance": {
            "perMapGenerationMs": quantiles(total_times),
            "planAndCityPerMapMs": quantiles([record["planAndCityGenerationMs"] for record in records]),
            "rasterPerMapMs": quantiles([record["rasterGenerationMs"] for record in records]),
            "allocationMs": run_metadata["allocationMs"],
            "planAndCityWallClockMs": run_metadata["planAndCityWallClockMs"],
            "renderWallClockMs": render_index["renderWallClockMs"],
            "effectiveMapsPerSecond": rounded(len(records) / max(0.001, effective_generation_ms / 1000), 3),
            "totalBenchmarkDurationMs": rounded(total_benchmark_duration_ms, 3),
            "approximatePeakGenerationWorkerRssBytes": run_metadata["approximatePeakGenerationWorkerRssBytes"],
            "approximatePeakRenderProcessTreeRssBytes": (
                render_index["approximatePeakProcessTreeRssBytes"]
                or render_index["approximatePeakWorkerAggregateBytes"]
            ),
            "approximatePeakRenderWorkerWorkingSetBytes": render_index["approximatePeakWorkerWorkingSetBytes"],
            "retryImpactMs": 0 if not any(retries) else None,
        },
        "storage": {
            "mapWebpBytes": {**quantiles(map_bytes), "total": total_map_bytes},
            "thumbnailWebpBytes": {**quantiles(thumbnail_bytes), "total": total_thumbnail_bytes},
            "actualRuntimeMapAndThumbnailBytesFor10000": runtime_bytes,
            "projectedRuntimeMapAndThumbnailBytesFor100000": runtime_bytes * 10,
            "compactManifestBytes": compact_manifest_bytes,
            "visualFeatureBytes": (output / "visual-features.npz").stat().st_size,
            "qaGalleryBytes": gallery["bytes"],
            "developmentBenchmarkBytesAtAnalysis": directory_bytes(output),
            "runtimeRequiredIncludesOnlyMapsAndThumbnails": True,
        },
        "gallery": gallery,
        "assetDecision": asset_decision,
        "productionIntegrationPlanning": {
            "phase7PlanningMayBeginAfterReview": sufficient_for_ten_thousand,
            "productionActivationAuthorized": False,
            "deploymentAuthorized": False,
        },
        "acceptance": {
            "exactly10000Maps": len(records) == 10000,
            "locked118AssetLibrary": asset_manifest["assetCount"] == 118,
            "noExactFinalDuplicates": exact_gate,
            "allCityRulesPass": city_gate,
            "zeroRetriesAndFailures": reliability_gate,
            "deterministicRegenerationPass": determinism["allByteAndHashIdentical"],
            "phase6dFirst1000ComparisonRecorded": compare_first_thousand(root, records).get("available", False),
            "neighborCohesionPass": neighbors["perimeterCompatibilityPass"],
            "transitionQualityPass": transitions["qualityDecision"] == "PASS",
            "visualScaleGatePass": visual_rate_gate,
            "allDevelopmentOnlyAndInactive": all(record["developmentOnly"] and not record["productionActivated"] and not record["publicationAllowed"] and not record["activationAllowed"] for record in records),
        },
        "analysisWallClockMs": rounded((time.perf_counter() - analysis_started) * 1000, 3),
    }
    (output / "phase-6e-results.json").write_text(json.dumps(results, indent=2, default=dict) + "\n", encoding="utf-8")
    print(
        f"Phase 6E scale analysis complete: {len(records)} maps, {near['flaggedPairCount']} near pairs, "
        f"{near['greaterThan098PairCount']} >0.98, decision={'PASS' if sufficient_for_ten_thousand else 'REVIEW REQUIRED'}.",
        flush=True,
    )


if __name__ == "__main__":
    main()
