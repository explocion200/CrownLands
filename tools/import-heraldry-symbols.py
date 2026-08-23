#!/usr/bin/env python3
"""Manifest-driven black/white heraldry importer for independent runtime art sets."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]


def load_trace_engine():
    path = ROOT / "tools" / "import-selected-flag-symbols.py"
    spec = importlib.util.spec_from_file_location("crownlands_trace_engine", path)
    if spec is None or spec.loader is None:
        raise ValueError("Unable to load the established trace engine.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TRACE = load_trace_engine()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def source_mask(path: Path, threshold: int) -> np.ndarray:
    with Image.open(path) as source:
        rgba = np.asarray(source.convert("RGBA"))
    alpha = rgba[:, :, 3]
    if alpha.min() < 250:
        mask = alpha > 0
    else:
        rgb = rgba[:, :, :3].astype(np.float32)
        luminance = rgb.mean(axis=2)
        mask = luminance < threshold
    if not mask.any():
        raise ValueError(f"Empty artwork mask: {path}")
    return mask


def fit_mask(mask: np.ndarray, canvas_size: int, inner_size: int) -> np.ndarray:
    ys, xs = np.nonzero(mask)
    cropped = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    height, width = cropped.shape
    scale = min(inner_size / width, inner_size / height)
    resized = Image.fromarray(cropped.astype(np.uint8) * 255, mode="L").resize(
        (max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.LANCZOS
    )
    fitted = np.asarray(resized) >= 128
    canvas = np.zeros((canvas_size, canvas_size), dtype=bool)
    x = (canvas_size - fitted.shape[1]) // 2
    y = (canvas_size - fitted.shape[0]) // 2
    canvas[y:y + fitted.shape[0], x:x + fitted.shape[1]] = fitted
    return canvas


def micro_mask(full_mask: np.ndarray, simplify_size: int, thicken: bool, canvas_size: int, inner_size: int) -> np.ndarray:
    ys, xs = np.nonzero(full_mask)
    cropped = full_mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    source = Image.fromarray(cropped.astype(np.uint8) * 255, mode="L")
    source.thumbnail((simplify_size, simplify_size), Image.Resampling.LANCZOS)
    if thicken:
        source = source.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    simplified = np.asarray(source) >= 116
    return fit_mask(simplified, canvas_size, inner_size)


def bounds(mask: np.ndarray):
    ys, xs = np.nonzero(mask)
    return {"left": int(xs.min()), "top": int(ys.min()), "right": int(xs.max()), "bottom": int(ys.max())}


def transparent_png_bytes(mask: np.ndarray) -> bytes:
    from io import BytesIO
    image = Image.new("RGBA", (mask.shape[1], mask.shape[0]), (0, 0, 0, 0))
    image.putalpha(Image.fromarray(mask.astype(np.uint8) * 255, mode="L"))
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def svg_document(path_data: str) -> str:
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor">\n  <path fill-rule="evenodd" d="' + path_data + '"/>\n</svg>\n'


def sprite(symbols: list[tuple[str, str]], variant: str) -> str:
    body = "\n  ".join(
        f'<symbol id="clan-charge-v1-{variant}-{symbol_id}" viewBox="0 0 100 100"><path fill-rule="evenodd" d="{path_data}"/></symbol>'
        for symbol_id, path_data in symbols
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg">\n  {body}\n</svg>\n'


def write_or_check(path: Path, data: bytes | str, check: bool):
    expected = data.encode("utf-8") if isinstance(data, str) else data
    if check:
        if not path.is_file() or path.read_bytes() != expected:
            raise ValueError(f"Generated asset is stale: {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(expected)


def main():
    args = parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    art_root = manifest_path.parent
    pipeline = manifest["pipeline"]
    canvas_size = int(pipeline["canvasSize"])
    trace_data = {"full": [], "micro": []}
    generated_metadata = {"schemaVersion": 1, "artSetVersion": manifest["artSetVersion"], "entries": []}

    for entry in manifest["entries"]:
        if not entry.get("available") or entry["id"] == "none":
            continue
        source_path = ROOT / entry["sourcePath"]
        raw = source_path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != entry["sourceSha256"]:
            raise ValueError(f"SHA-256 mismatch for {entry['id']}: {digest}")
        with Image.open(source_path) as image:
            if list(image.size) != [entry["sourceWidth"], entry["sourceHeight"]]:
                raise ValueError(f"Source dimension mismatch for {entry['id']}: {image.size}")
        original = source_mask(source_path, int(pipeline["sourceThreshold"]))
        full = fit_mask(original, canvas_size, int(pipeline["fullInnerSize"]))
        if entry.get("microSourcePath"):
            micro_source_path = ROOT / entry["microSourcePath"]
            micro_raw = micro_source_path.read_bytes()
            micro_digest = hashlib.sha256(micro_raw).hexdigest()
            if micro_digest != entry.get("microSourceSha256"):
                raise ValueError(f"Micro SHA-256 mismatch for {entry['id']}: {micro_digest}")
            with Image.open(micro_source_path) as micro_image:
                expected_size = [entry.get("microSourceWidth"), entry.get("microSourceHeight")]
                if list(micro_image.size) != expected_size:
                    raise ValueError(f"Micro source dimension mismatch for {entry['id']}: {micro_image.size}")
            micro = fit_mask(source_mask(micro_source_path, int(pipeline["sourceThreshold"])), canvas_size, int(pipeline["microInnerSize"]))
        else:
            micro = micro_mask(full, int(entry.get("microSimplifySize", 96)), bool(entry.get("microThicken")), canvas_size, int(pipeline["microInnerSize"]))
        generated = {"id": entry["id"], "fullBounds": bounds(full), "microBounds": bounds(micro)}
        generated_metadata["entries"].append(generated)
        for variant, mask, epsilon in (("full", full, float(pipeline["fullTraceEpsilon"])), ("micro", micro, float(pipeline["microTraceEpsilon"]))):
            png_path = art_root / "normalized" / variant / f"{entry['id']}.png"
            svg_path = art_root / "svg" / variant / f"{entry['id']}.svg"
            path_data = TRACE.trace_path(mask, epsilon)
            write_or_check(png_path, transparent_png_bytes(mask), args.check)
            write_or_check(svg_path, svg_document(path_data), args.check)
            trace_data[variant].append((entry["id"], path_data))

    for variant in ("full", "micro"):
        write_or_check(art_root / f"charges-{variant}.svg", sprite(trace_data[variant], variant), args.check)
    metadata_text = json.dumps(generated_metadata, indent=2) + "\n"
    write_or_check(art_root / "generated-metadata.json", metadata_text, args.check)
    action = "Validated" if args.check else "Generated"
    print(f"{action} {len(trace_data['full'])} full and {len(trace_data['micro'])} micro heraldry symbols from {manifest_path.relative_to(ROOT)}.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
