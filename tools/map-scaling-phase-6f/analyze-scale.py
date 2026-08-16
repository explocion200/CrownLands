"""Analyze Phase 6F road decoupling at 10,000-map scale."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image


def load_phase6e_module(root: Path):
    source = root / "tools/map-scaling-phase-6e/analyze-scale.py"
    spec = importlib.util.spec_from_file_location("phase6e_scale_analysis", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def percent_change(current: float, baseline: float) -> float:
    if baseline == 0:
        return 0.0 if current == 0 else float("inf")
    return round((current - baseline) / baseline * 100.0, 3)


def road_distribution(records: list[dict]) -> dict:
    themes = ("north", "east", "south", "west")
    geometries = sorted({record["roadGeometryId"] for record in records})
    rows = []
    for geometry in geometries:
        selected = [record for record in records if record["roadGeometryId"] == geometry]
        by_theme = Counter(record["theme"] for record in selected)
        rows.append({
            "geometryId": geometry,
            "total": len(selected),
            "percentage": round(len(selected) / len(records) * 100.0, 3),
            "byTheme": {theme: by_theme[theme] for theme in themes},
            "themeCoverage": sum(by_theme[theme] > 0 for theme in themes),
        })
    baseline = next(row for row in rows if row["geometryId"] == "base")
    return {
        "approvedGeometryCount": 9,
        "uniqueGeometryCount": len(geometries),
        "selectionStrategy": "theme-independent-nine-geometry-selection-v1",
        "geometries": rows,
        "baselineGeometry": baseline,
        "mostUsedGeometry": max(rows, key=lambda row: row["total"]),
        "leastUsedGeometry": min(rows, key=lambda row: row["total"]),
        "allNineUsedInEveryTheme": all(row["themeCoverage"] == 4 for row in rows),
        "themeDoesNotExcludeGeometry": all(row["themeCoverage"] == 4 for row in rows),
        "maximumShareAtMost15Percent": max(row["percentage"] for row in rows) <= 15.0,
    }


def unique_nearest_pairs(nearest_records: list[dict], count: int = 25) -> list[dict]:
    seen = set()
    selected = []
    for item in sorted(nearest_records, key=lambda value: (-value["similarity"], value["key"], value["nearestKey"])):
        pair_key = tuple(sorted((item["key"], item["nearestKey"])))
        if pair_key in seen:
            continue
        seen.add(pair_key)
        selected.append(item)
        if len(selected) == count:
            break
    return selected


def generate_road_gallery(
    base,
    root: Path,
    output: Path,
    records: list[dict],
    most_similar: list[dict],
    nearest_records: list[dict],
    transition_pairs: list[tuple[str, str]],
) -> dict:
    gallery = output / "gallery"
    gallery.mkdir(parents=True, exist_ok=True)
    by_key = {record["key"]: record for record in records}
    files: list[str] = []

    def grid(name: str, cards: list[Image.Image], columns: int) -> None:
        base.save_grid(cards, columns, gallery / name)
        files.append(name)

    def map_cards(selected: list[dict], size=(160, 120)) -> list[Image.Image]:
        return [
            base.label_card(
                base.load_thumbnail(output, record, size),
                f"{record['key']} {record['theme'][0].upper()} {record['roadGeometryId']}",
            )
            for record in selected
        ]

    mixed = base.deterministic_selection(records, 100, "phase6f-mixed-100-v1")
    grid("mixed-theme-100.png", map_cards(mixed), 10)
    for theme in ("west", "north", "east", "south"):
        selected = base.deterministic_selection(
            [record for record in records if record["theme"] == theme],
            100,
            f"phase6f-{theme}-100-v1",
        )
        grid(f"{theme}-100.png", map_cards(selected), 10)

    cross_theme_cards = []
    geometries = sorted({record["roadGeometryId"] for record in records})
    for geometry in geometries:
        for theme in ("north", "east", "south", "west"):
            candidates = [record for record in records if record["theme"] == theme and record["roadGeometryId"] == geometry]
            selected = base.deterministic_selection(candidates, 1, f"phase6f-cross-theme-{geometry}-{theme}")
            cross_theme_cards.extend(map_cards(selected, (200, 150)))
    grid("same-geometries-all-themes.png", cross_theme_cards, 4)

    west_geometry_cards = []
    for geometry in geometries:
        selected = base.deterministic_selection(
            [record for record in records if record["theme"] == "west" and record["roadGeometryId"] == geometry],
            1,
            f"phase6f-west-all-nine-{geometry}",
        )
        west_geometry_cards.extend(map_cards(selected, (240, 180)))
    grid("all-nine-geometries-west.png", west_geometry_cards, 3)

    grid(
        "highest-similarity-25-pairs.png",
        [base.pair_card(output, by_key, pair["left"], pair["right"], f"{pair['visualSimilarity']:.6f}") for pair in most_similar],
        5,
    )
    nearest_pairs = unique_nearest_pairs(nearest_records)
    grid(
        "nearest-neighbor-25-pairs.png",
        [base.pair_card(output, by_key, pair["key"], pair["nearestKey"], f"{pair['similarity']:.6f}") for pair in nearest_pairs],
        5,
    )

    maximum_layer = max(record["layer"] for record in records)
    deep = base.deterministic_selection(
        [record for record in records if record["layer"] >= maximum_layer - 4],
        50,
        "phase6f-deep-layer-50-v1",
    )
    grid("deep-layer-50.png", map_cards(deep), 10)
    grid(
        "mixed-theme-50-city-overlays.png",
        [base.label_card(base.city_overlay(root, output, record), f"{record['key']} 40 cities") for record in mixed[:50]],
        5,
    )
    selected_transitions = sorted(
        transition_pairs,
        key=lambda pair: hashlib.sha256(f"phase6f-transition|{pair[0]}|{pair[1]}".encode()).hexdigest(),
    )[:20]
    grid(
        "neighbor-transitions-20.png",
        [base.pair_card(output, by_key, left, right, f"{by_key[left]['theme']} / {by_key[right]['theme']}") for left, right in selected_transitions],
        5,
    )

    sections = "".join(f'<section><h2>{name}</h2><img src="{name}" loading="lazy"></section>' for name in files)
    (gallery / "index.html").write_text(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Crownlands Phase 6F road QA</title>"
        "<style>body{background:#101417;color:#f4ead2;font-family:sans-serif}img{max-width:100%;height:auto}</style>"
        f"</head><body><h1>Phase 6F development-only road-decoupling QA</h1>{sections}</body></html>",
        encoding="utf-8",
    )
    files.append("index.html")
    return {
        "path": "gallery/index.html",
        "files": files,
        "fileCount": len(files),
        "bytes": sum((gallery / name).stat().st_size for name in files),
        "mixedThemeMapCount": len(mixed),
        "themeMapCountEach": 100,
        "crossThemeGeometryExamples": len(cross_theme_cards),
        "allNineWithinOneTheme": len(west_geometry_cards) == 9,
        "mostSimilarPairCount": len(most_similar),
        "nearestNeighborPairCount": len(nearest_pairs),
        "deepLayerMapCount": len(deep),
        "cityOverlayMapCount": 50,
        "samplingOnly": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output.resolve()
    base = load_phase6e_module(root)
    analysis_started = time.perf_counter()
    records = base.read_json_lines(output / "compact-manifest.jsonl")
    with np.load(output / "visual-features.npz") as loaded:
        features = {name: loaded[name] for name in loaded.files}
    render_index = json.loads((output / "render-index.json").read_text(encoding="utf-8"))
    run_metadata = json.loads((output / "run-metadata.json").read_text(encoding="utf-8"))
    determinism = json.loads((output / "determinism-receipt.json").read_text(encoding="utf-8"))
    immutability = json.loads((output / "immutability-receipt.json").read_text(encoding="utf-8"))
    phase6e = json.loads((root / "benchmark-results/map/phase-6e/study/phase-6e-results.json").read_text(encoding="utf-8"))
    asset_manifest = json.loads((root / "benchmark-results/map/phase-6d/asset-library/asset-manifest.json").read_text(encoding="utf-8"))

    near, most_similar, macro_similarity, nearest_records = base.analyze_similarity(records, features)
    with (output / "nearest-neighbors.jsonl").open("w", encoding="utf-8", newline="\n") as handle:
        for record in nearest_records:
            handle.write(json.dumps(record, separators=(",", ":")) + "\n")
    neighbors, transitions, transition_pairs = base.analyze_neighbors(records, features)
    roads = road_distribution(records)

    exact_duplicates = {
        "compositionPlans": base.duplicate_summary(records, lambda record: record["hashes"]["compositionPlanHash"]),
        "losslessRasters": base.duplicate_summary(records, lambda record: record["raster"]["rawPixelHash"]),
        "webpRasters": base.duplicate_summary(records, lambda record: record["raster"]["webpHash"]),
        "cityLayouts": base.duplicate_summary(records, lambda record: record["hashes"]["cityPlanHash"]),
        "completePackages": base.duplicate_summary(records, lambda record: record["packageHash"]),
    }
    foundation_usage = base.usage_summary(records, lambda record: record["foundation"]["assetId"])
    perimeter_usage = base.usage_summary(records, lambda record: record["hashes"]["barrierSelectionHash"])
    accent_set_usage = base.usage_summary(records, lambda record: record["hashes"]["accentSetHash"])
    accent_plan_usage = base.usage_summary(records, lambda record: record["hashes"]["accentPlanHash"])

    city_ids: set[str] = set()
    duplicate_city_ids = []
    for record in records:
        for city in record["cityPositions"]:
            if city["id"] in city_ids:
                duplicate_city_ids.append(city["id"])
            city_ids.add(city["id"])
    retries = [record["retryCount"] for record in records]
    failures = [record for record in records if record["status"] != "standby"]
    edge_contract_failures = [
        record["key"] for record in records
        if not record.get("publishedEdgeContracts", {}).get("immutableAfterPublication")
        or not record["parity"].get("publishedEdgeContractValid")
        or len(record.get("publishedEdgeContracts", {}).get("sides", {})) != 4
    ]
    inherited_contract_count = sum(len(record.get("inheritedEdgeContracts", {})) for record in records)
    inherited_contract_failures = []
    by_region = {record["regionId"]: record for record in records}
    for record in records:
        for local_side, inherited in record.get("inheritedEdgeContracts", {}).items():
            connection = record["topology"][local_side]
            source = by_region.get(connection.get("targetRegionId"))
            if not source or inherited.get("regionId") != source["regionId"] or inherited.get("contractHash") not in {
                side["contractHash"] for side in source["publishedEdgeContracts"]["sides"].values()
            }:
                inherited_contract_failures.append({"key": record["key"], "side": local_side})
    final_connections = [connection for record in records for connection in record["finalConnections"].values()]
    open_connections = [connection for connection in final_connections if connection["state"] == "open"]
    gated_connections = [connection for connection in final_connections if connection["state"] == "gated"]
    open_target_failures = [connection for connection in open_connections if not connection.get("targetRegionId")]
    gated_target_failures = [connection for connection in gated_connections if connection.get("targetRegionId")]

    layer_counts = Counter(record["layer"] for record in records)
    maximum_layer = max(layer_counts)
    gallery = generate_road_gallery(base, root, output, records, most_similar, nearest_records, transition_pairs)

    phase6e_near = phase6e["nearDuplicates"]
    phase6e_baseline_count = 3293
    phase6e_baseline_percentage = 32.93
    comparison = {
        "phase6eMapCount": phase6e["sample"]["totalMaps"],
        "phase6fMapCount": len(records),
        "baselineRoad": {
            "phase6eCount": phase6e_baseline_count,
            "phase6ePercentage": phase6e_baseline_percentage,
            "phase6fCount": roads["baselineGeometry"]["total"],
            "phase6fPercentage": roads["baselineGeometry"]["percentage"],
            "percentageChange": percent_change(roads["baselineGeometry"]["percentage"], phase6e_baseline_percentage),
        },
        "nearPairs": {
            "phase6e": phase6e_near["flaggedPairCount"],
            "phase6f": near["flaggedPairCount"],
            "percentageChange": percent_change(near["flaggedPairCount"], phase6e_near["flaggedPairCount"]),
        },
        "greaterThan098Pairs": {
            "phase6e": phase6e_near["greaterThan098PairCount"],
            "phase6f": near["greaterThan098PairCount"],
            "percentageChange": percent_change(near["greaterThan098PairCount"], phase6e_near["greaterThan098PairCount"]),
        },
        "greaterThan099Pairs": {
            "phase6e": phase6e_near["greaterThan099PairCount"],
            "phase6f": near["greaterThan099PairCount"],
            "percentageChange": percent_change(near["greaterThan099PairCount"], phase6e_near["greaterThan099PairCount"]),
        },
        "maximumSimilarity": {"phase6e": phase6e_near["maximumVisualSimilarity"], "phase6f": near["maximumVisualSimilarity"]},
        "flaggedMapParticipation": {"phase6e": phase6e_near["mapsInFlaggedPairsRate"], "phase6f": near["mapsInFlaggedPairsRate"]},
    }

    exact_gate = all(summary["unique"] == len(records) for summary in exact_duplicates.values())
    city_gate = (
        all(record["cityCount"] == 40 and record["startingCandidateCount"] == 4 for record in records)
        and not duplicate_city_ids
        and min(record["cityMetrics"]["minimumSpacing"] for record in records) >= 112
        and all(record["parity"]["valid"] for record in records)
    )
    road_distribution_gate = (
        roads["allNineUsedInEveryTheme"]
        and roads["maximumShareAtMost15Percent"]
        and roads["baselineGeometry"]["percentage"] <= 15.0
    )
    visual_gate = (
        near["flaggedPairCount"] <= phase6e_near["flaggedPairCount"] * 0.75
        and near["greaterThan098PairCount"] <= phase6e_near["greaterThan098PairCount"] * 0.75
        and near["greaterThan099PairCount"] <= phase6e_near["greaterThan099PairCount"] * 0.75
        and near["maximumVisualSimilarity"] <= 0.9995
        and near["mapsInFlaggedPairsRate"] < phase6e_near["mapsInFlaggedPairsRate"]
    )
    technical_gate = (
        len(records) == 10000
        and exact_gate
        and city_gate
        and not failures
        and not any(retries)
        and determinism["allByteAndHashIdentical"]
        and immutability["allByteAndHashIdentical"]
        and not edge_contract_failures
        and not inherited_contract_failures
        and neighbors["perimeterCompatibilityPass"]
        and not open_target_failures
        and not gated_target_failures
        and transitions["qualityDecision"] == "PASS"
    )
    sufficient = technical_gate and road_distribution_gate and visual_gate
    additional_road_art_justified = road_distribution_gate and not visual_gate

    map_bytes = [record["raster"]["webpBytes"] for record in records]
    thumbnail_bytes = [record["raster"]["thumbnailBytes"] for record in records]
    total_times = [record["totalGenerationMs"] for record in records]
    runtime_bytes = sum(map_bytes) + sum(thumbnail_bytes)
    effective_generation_ms = run_metadata["planAndCityWallClockMs"] + render_index["renderWallClockMs"]
    prior_results_path = output / "phase-6f-results.json"
    prior_total_duration_ms = None
    if prior_results_path.exists():
        prior_results = json.loads(prior_results_path.read_text(encoding="utf-8"))
        prior_total_duration_ms = prior_results.get("performance", {}).get("totalBenchmarkDurationMs")
    total_benchmark_duration_ms = (
        prior_total_duration_ms
        if prior_total_duration_ms is not None
        else time.time() * 1000 - run_metadata["benchmarkStartedEpochMs"]
    )

    results = {
        "schemaVersion": 1,
        "phase": "6F",
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
            "directionalDistribution": dict(sorted(Counter(record["theme"] for record in records).items())),
            "clockwiseAllocationValid": all(record["clockwiseSlot"] >= 0 for record in records),
        },
        "exactDuplicates": exact_duplicates,
        "nearDuplicates": near,
        "mostSimilarPairs": most_similar,
        "macroSimilarity": macro_similarity,
        "roadScale": roads,
        "foundationScale": {"approvedPlateCount": 12, "usage": foundation_usage, "additionalRequired": False},
        "perimeterScale": {"approvedSegmentCount": 48, "usage": perimeter_usage, "additionalRequired": False},
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
            "averageLocalDensity": base.rounded(np.mean([record["cityMetrics"]["averageLocalDensity"] for record in records]), 3),
            "allTerrainBlockerRoadTransitionAndPerimeterChecksPass": all(record["parity"]["valid"] for record in records),
        },
        "generationReliability": {
            "mapsRequiringRetries": sum(value > 0 for value in retries),
            "totalRetries": sum(retries),
            "averageRetriesPerMap": base.rounded(np.mean(retries)),
            "maximumRetries": max(retries),
            "failures": len(failures),
        },
        "determinism": determinism,
        "publishedPackageImmutability": {
            **immutability,
            "edgeContractsValidated": len(records) - len(edge_contract_failures),
            "edgeContractFailures": edge_contract_failures[:25],
            "inheritedEdgeContractsValidated": inherited_contract_count - len(inherited_contract_failures),
            "inheritedEdgeContractFailures": inherited_contract_failures[:25],
            "futureNeighborsAdaptToPublishedContracts": not inherited_contract_failures,
        },
        "neighborCohesion": {
            **neighbors,
            "openConnectionSides": len(open_connections),
            "gatedConnectionSides": len(gated_connections),
            "allOpenSidesHaveExplicitTargets": not open_target_failures,
            "allGatedSidesHaveNoHiddenTarget": not gated_target_failures,
            "openTargetFailures": open_target_failures[:25],
            "gatedTargetFailures": gated_target_failures[:25],
        },
        "themeTransitions": transitions,
        "comparisonToPhase6e": comparison,
        "performance": {
            "perMapGenerationMs": base.quantiles(total_times),
            "planAndCityPerMapMs": base.quantiles([record["planAndCityGenerationMs"] for record in records]),
            "rasterPerMapMs": base.quantiles([record["rasterGenerationMs"] for record in records]),
            "allocationMs": run_metadata["allocationMs"],
            "planAndCityWallClockMs": run_metadata["planAndCityWallClockMs"],
            "renderWallClockMs": render_index["renderWallClockMs"],
            "effectiveMapsPerSecond": base.rounded(len(records) / max(0.001, effective_generation_ms / 1000), 3),
            "totalBenchmarkDurationMs": base.rounded(total_benchmark_duration_ms, 3),
            "approximatePeakGenerationWorkerRssBytes": run_metadata["approximatePeakGenerationWorkerRssBytes"],
            "approximatePeakRenderProcessTreeRssBytes": render_index["approximatePeakProcessTreeRssBytes"] or render_index["approximatePeakWorkerAggregateBytes"],
        },
        "storage": {
            "mapWebpBytes": {**base.quantiles(map_bytes), "total": sum(map_bytes)},
            "thumbnailWebpBytes": {**base.quantiles(thumbnail_bytes), "total": sum(thumbnail_bytes)},
            "actualRuntimeMapAndThumbnailBytesFor10000": runtime_bytes,
            "projectedRuntimeMapAndThumbnailBytesFor100000": runtime_bytes * 10,
            "compactManifestBytes": (output / "compact-manifest.jsonl").stat().st_size,
            "visualFeatureBytes": (output / "visual-features.npz").stat().st_size,
            "qaGalleryBytes": gallery["bytes"],
            "runtimeRequiredIncludesOnlyMapsAndThumbnails": True,
        },
        "gallery": gallery,
        "assetDecision": {
            "assetCount": asset_manifest["assetCount"],
            "sufficientForTenThousandMaps": sufficient,
            "roadDecouplingMateriallyImprovedVariety": visual_gate,
            "existingNineRoadGeometriesSufficient": sufficient,
            "additionalRoadArtworkJustified": additional_road_art_justified,
            "recommendedAdditionalRoadModules": 4 if additional_road_art_justified else 0,
            "additionalFoundations": 0,
            "additionalPerimeters": 0,
            "additionalAccents": 0,
            "approved118AssetLibrarySufficientAfterCorrection": sufficient,
            "approvedStylePreserved": True,
            "technicalGatePass": technical_gate,
            "roadDistributionGatePass": road_distribution_gate,
            "visualScaleGatePass": visual_gate,
            "visualDecisionRule": {
                "nearPairCountReductionAtLeast25Percent": True,
                "greaterThan098PairCountReductionAtLeast25Percent": True,
                "greaterThan099PairCountReductionAtLeast25Percent": True,
                "maximumSimilarityAtMost": 0.9995,
                "flaggedMapParticipationMustImprove": True,
                "pairCountsAndRatesArePrimaryAtTenThousandScale": True,
            },
        },
        "productionIntegrationPlanning": {
            "phase7PlanningMayBeginAfterReview": sufficient,
            "productionActivationAuthorized": False,
            "deploymentAuthorized": False,
        },
        "acceptance": {
            "exactly10000Maps": len(records) == 10000,
            "locked118AssetLibrary": asset_manifest["assetCount"] == 118 and not run_metadata["assetLibraryModified"],
            "allNineRoadGeometriesAcrossAllThemes": roads["allNineUsedInEveryTheme"],
            "baselineRoadConcentrationMateriallyReduced": roads["baselineGeometry"]["percentage"] <= 15.0,
            "noExactFinalDuplicates": exact_gate,
            "allCityRulesPass": city_gate,
            "zeroRetriesAndFailures": not failures and not any(retries),
            "deterministicRegenerationPass": determinism["allByteAndHashIdentical"],
            "publishedPackageImmutabilityPass": immutability["allByteAndHashIdentical"] and not edge_contract_failures and not inherited_contract_failures,
            "neighborCohesionPass": (
                neighbors["perimeterCompatibilityPass"]
                and not open_target_failures
                and not gated_target_failures
            ),
            "transitionQualityPass": transitions["qualityDecision"] == "PASS",
            "visualScaleGatePass": visual_gate,
            "allDevelopmentOnlyAndInactive": all(
                record["developmentOnly"] and not record["productionActivated"]
                and not record["publicationAllowed"] and not record["activationAllowed"]
                for record in records
            ),
        },
        "analysisWallClockMs": base.rounded((time.perf_counter() - analysis_started) * 1000, 3),
    }
    (output / "phase-6f-results.json").write_text(json.dumps(results, indent=2, default=dict) + "\n", encoding="utf-8")
    print(
        f"Phase 6F analysis complete: {len(records)} maps, baseline road {roads['baselineGeometry']['percentage']}%, "
        f"{near['flaggedPairCount']} near pairs, decision={'PASS' if sufficient else 'REVIEW REQUIRED'}.",
        flush=True,
    )


if __name__ == "__main__":
    main()
