"""Prepare and validate Pass 3F high-frequency item artwork.

This development-only helper archives pre-pass masters, installs accepted
ImageGen chroma-key candidates on canonical transparent canvases, and creates
contact sheets used by the Pass 3F QA gallery. It is not shipped to players.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
QA_ROOT = ROOT / "docs" / "visual-qa" / "pass-3f"
CHROMA_HELPER = Path.home() / ".codex" / "skills" / ".system" / "imagegen" / "scripts" / "remove_chroma_key.py"

ASSETS = {
    "common-gear-box": ROOT / "assets" / "gear" / "common-gear-box.png",
    "royal-peace-shield": ROOT / "assets" / "royal-peace-shield-icon.webp",
    "war-drums": ROOT / "assets" / "war-drums-icon.webp",
    "royal-tax-decree": ROOT / "assets" / "royal-tax-decree-icon.webp",
    "veil-of-silence": ROOT / "assets" / "veil-of-silence-icon.webp",
    "swift-march-order": ROOT / "assets" / "swift-march-order-icon.webp",
    "recall-horn": ROOT / "assets" / "recall-horn-icon.webp",
    "gold-pickup": ROOT / "assets" / "gold-pickup.png",
    "troop-pickup": ROOT / "assets" / "troop-pickup.png",
    "peace-shield-field": ROOT / "assets" / "royal-peace-shield-field.png",
}
OPEN_BOX_SOURCE = ROOT / "assets" / "gear" / "common-gear-box-open.png"

SOURCE_CANVAS = {
    "common-gear-box": (1254, 1254),
    "royal-peace-shield": (1254, 1254),
    "war-drums": (1254, 1254),
    "royal-tax-decree": (1254, 1254),
    "veil-of-silence": (1254, 1254),
    "swift-march-order": (1254, 1254),
    "recall-horn": (1254, 1254),
    "gold-pickup": (1254, 1254),
    "troop-pickup": (1254, 1254),
    "peace-shield-field": (1254, 1254),
}


def image_metadata(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        return {
            "path": path.relative_to(ROOT).as_posix(),
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "bytes": path.stat().st_size,
        }


def archive_old_assets() -> None:
    old_root = QA_ROOT / "old-assets"
    old_root.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, source in ASSETS.items():
        target = old_root / source.name
        if not target.exists():
            shutil.copy2(source, target)
        report[name] = image_metadata(source)
    (QA_ROOT / "before-sizes.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    make_contact(old_root, QA_ROOT / "old-item-contact.jpg", "Pass 3F legacy sources")


def make_contact(asset_root: Path, output: Path, title: str) -> None:
    names = list(ASSETS)
    tile = 280
    sheet = Image.new("RGB", (tile * 5, tile * 2 + 46), (47, 38, 28))
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 12), title, fill=(231, 218, 183))
    for index, name in enumerate(names):
        original = ASSETS[name]
        candidate = original if asset_root == ROOT / "assets" else asset_root / original.name
        with Image.open(candidate) as source:
            item = source.convert("RGBA")
        item.thumbnail((210, 210), Image.Resampling.LANCZOS)
        x0 = (index % 5) * tile
        y0 = 46 + (index // 5) * tile
        checker = Image.new("RGBA", (tile, tile), (200, 187, 156, 255))
        for y in range(0, tile, 20):
            for x in range(0, tile, 20):
                if (x // 20 + y // 20) % 2:
                    ImageDraw.Draw(checker).rectangle((x, y, x + 19, y + 19), fill=(171, 151, 113, 255))
        sheet.paste(checker.convert("RGB"), (x0, y0))
        composed = Image.new("RGBA", (tile, tile), (0, 0, 0, 0))
        composed.alpha_composite(item, ((tile - item.width) // 2, 12 + (220 - item.height) // 2))
        sheet.paste(composed.convert("RGB"), (x0, y0), composed)
        draw.text((x0 + 10, y0 + 242), name.replace("-", " ").title(), fill=(39, 27, 18))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92)


def install_asset(name: str, candidate: Path) -> None:
    if name not in ASSETS:
        raise ValueError(f"Unknown Pass 3F asset: {name}")
    target = ASSETS[name]
    target_size = SOURCE_CANVAS[name]
    chroma_root = QA_ROOT / "chroma-candidates"
    accepted_root = QA_ROOT / "generated-candidates"
    chroma_root.mkdir(parents=True, exist_ok=True)
    accepted_root.mkdir(parents=True, exist_ok=True)
    shutil.copy2(candidate, accepted_root / f"accepted-{name}.png")
    with Image.open(candidate) as source:
        source = source.convert("RGB")
        source.thumbnail(target_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", target_size, (255, 0, 255))
        canvas.paste(source, ((target_size[0] - source.width) // 2, (target_size[1] - source.height) // 2))
    chroma = chroma_root / f"{name}.png"
    canvas.save(chroma, optimize=True)
    alpha_png = chroma_root / f"{name}-alpha.png"
    subprocess.run([
        sys.executable,
        str(CHROMA_HELPER),
        "--input", str(chroma),
        "--out", str(alpha_png),
        "--auto-key", "border",
        "--soft-matte",
        "--transparent-threshold", "12",
        "--opaque-threshold", "220",
        "--despill",
        "--edge-contract", "1",
        "--force",
    ], check=True)
    with Image.open(alpha_png) as prepared:
        prepared = prepared.convert("RGBA")
    bounds = prepared.getchannel("A").getbbox()
    if not bounds:
        raise RuntimeError(f"Chroma removal produced no visible subject for {name}")
    subject = prepared.crop(bounds)
    safe_edge = 1120 if name == "peace-shield-field" else 980
    subject.thumbnail((safe_edge, safe_edge), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", target_size, (0, 0, 0, 0))
    output.alpha_composite(subject, ((target_size[0] - subject.width) // 2, (target_size[1] - subject.height) // 2))
    if target.suffix.lower() == ".webp":
        output.save(target, "WEBP", lossless=True, quality=100, method=6)
    else:
        output.save(target, "PNG", optimize=True)
    with Image.open(target) as final:
        if final.size != target_size or "A" not in final.getbands() or final.getpixel((0, 0))[3] != 0:
            raise RuntimeError(f"Invalid fixed-layout alpha output for {name}: {final.size} {final.mode}")


def install_open_box(candidate: Path) -> None:
    name = "common-gear-box-open"
    target_size = (1254, 1254)
    chroma_root = QA_ROOT / "chroma-candidates"
    accepted_root = QA_ROOT / "generated-candidates"
    chroma_root.mkdir(parents=True, exist_ok=True)
    accepted_root.mkdir(parents=True, exist_ok=True)
    shutil.copy2(candidate, accepted_root / f"accepted-{name}.png")
    with Image.open(candidate) as source:
        source = source.convert("RGB")
        source.thumbnail(target_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", target_size, (255, 0, 255))
        canvas.paste(source, ((target_size[0] - source.width) // 2, (target_size[1] - source.height) // 2))
    chroma = chroma_root / f"{name}.png"
    alpha_png = chroma_root / f"{name}-alpha.png"
    canvas.save(chroma, optimize=True)
    subprocess.run([
        sys.executable,
        str(CHROMA_HELPER),
        "--input", str(chroma),
        "--out", str(alpha_png),
        "--auto-key", "border",
        "--soft-matte",
        "--transparent-threshold", "12",
        "--opaque-threshold", "220",
        "--despill",
        "--edge-contract", "1",
        "--force",
    ], check=True)
    with Image.open(alpha_png) as prepared:
        prepared = prepared.convert("RGBA")
    bounds = prepared.getchannel("A").getbbox()
    if not bounds:
        raise RuntimeError("Open Gear Box chroma removal produced no visible subject")
    subject = prepared.crop(bounds)
    subject.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", target_size, (0, 0, 0, 0))
    output.alpha_composite(subject, ((target_size[0] - subject.width) // 2, (target_size[1] - subject.height) // 2))
    output.save(OPEN_BOX_SOURCE, "PNG", optimize=True)
    if OPEN_BOX_SOURCE.stat().st_size <= 0 or output.getpixel((0, 0))[3] != 0:
        raise RuntimeError("Invalid open Gear Box source master")


def finish() -> None:
    report = {name: image_metadata(path) for name, path in ASSETS.items()}
    (QA_ROOT / "after-sizes.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    make_contact(ROOT / "assets", QA_ROOT / "new-item-contact.jpg", "Pass 3F accepted sources")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", action="store_true")
    parser.add_argument("--install", nargs=2, metavar=("NAME", "CANDIDATE"))
    parser.add_argument("--open-box", metavar="CANDIDATE")
    parser.add_argument("--finish", action="store_true")
    args = parser.parse_args()
    if args.archive:
        archive_old_assets()
    if args.install:
        install_asset(args.install[0], Path(args.install[1]))
    if args.open_box:
        install_open_box(Path(args.open_box))
    if args.finish:
        finish()


if __name__ == "__main__":
    main()
