"""Prepare accepted Pass 3E officer and Common Gear source masters.

This development helper copies accepted ImageGen portrait candidates, archives the
pre-pass masters for visual QA, and splits each approved 4x2 gear sheet into the
canonical transparent 1254x1254 source canvases. It is not shipped to players.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
QA_ROOT = ROOT / "docs" / "visual-qa" / "pass-3e"
GEAR_ROOT = ROOT / "assets" / "gear"
OFFICERS = ("war-captain", "master-of-coin", "cavalry-master", "defensive-commander")
BUILDINGS = ("barracks", "treasury", "royal-stables", "gatehouse")
SLOTS = ("head", "chest", "pants", "boots", "gloves", "belt", "weapon", "necklace")
CHROMA_HELPER = Path.home() / ".codex" / "skills" / ".system" / "imagegen" / "scripts" / "remove_chroma_key.py"


def archive_old_assets() -> None:
    old = QA_ROOT / "old-assets"
    for officer in OFFICERS:
        target = old / "officers" / f"{officer}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copy2(GEAR_ROOT / f"{officer}.png", target)
    for building in BUILDINGS:
        for slot in SLOTS:
            target = old / "gear" / building / f"{slot}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(GEAR_ROOT / building / f"{slot}.png", target)


def install_portrait(officer: str, candidate: Path) -> None:
    if officer not in OFFICERS:
        raise ValueError(f"Unknown officer: {officer}")
    image = Image.open(candidate).convert("RGB")
    target_ratio = 1086 / 1448
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif source_ratio < target_ratio:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    image = image.resize((1086, 1448), Image.Resampling.LANCZOS)
    image.save(GEAR_ROOT / f"{officer}.png", optimize=True)
    accepted = QA_ROOT / "generated-candidates" / f"accepted-{officer}.png"
    accepted.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(candidate, accepted)


def crop_sheet(building: str, sheet_path: Path) -> None:
    if building not in BUILDINGS:
        raise ValueError(f"Unknown building: {building}")
    sheet = Image.open(sheet_path).convert("RGB")
    accepted = QA_ROOT / "generated-candidates" / f"accepted-{building}-gear-sheet.png"
    accepted.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(sheet_path, accepted)
    cell_width = sheet.width / 4
    cell_height = sheet.height / 2
    chroma_root = QA_ROOT / "chroma-cells" / building
    chroma_root.mkdir(parents=True, exist_ok=True)
    for index, slot in enumerate(SLOTS):
        column = index % 4
        row = index // 4
        left = round(column * cell_width)
        top = round(row * cell_height)
        right = round((column + 1) * cell_width)
        bottom = round((row + 1) * cell_height)
        cell = sheet.crop((left, top, right, bottom))
        scale = min(1120 / cell.width, 1120 / cell.height)
        fitted = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (1254, 1254), (255, 0, 255))
        canvas.paste(fitted, ((1254 - fitted.width) // 2, (1254 - fitted.height) // 2))
        chroma = chroma_root / f"{slot}.png"
        canvas.save(chroma, optimize=True)
        target = GEAR_ROOT / building / f"{slot}.png"
        subprocess.run([
            sys.executable,
            str(CHROMA_HELPER),
            "--input", str(chroma),
            "--out", str(target),
            "--auto-key", "border",
            "--soft-matte",
            "--transparent-threshold", "12",
            "--opaque-threshold", "220",
            "--despill",
            "--edge-contract", "1",
            "--force",
        ], check=True)
        output = Image.open(target).convert("RGBA")
        prune_small_islands(output, building, slot)
        output.save(target, optimize=True)
        if output.size != (1254, 1254) or "A" not in output.getbands() or output.getpixel((0, 0))[3] != 0:
            raise RuntimeError(f"Invalid alpha output for {building}/{slot}")


def prune_small_islands(image: Image.Image, building: str, slot: str) -> None:
    """Remove disconnected grid-neighbor fragments without harming paired gear."""
    size = 314
    alpha = image.getchannel("A").resize((size, size), Image.Resampling.NEAREST)
    pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(size):
        for x in range(size):
            if (x, y) in seen or pixels[x, y] <= 32:
                continue
            component = [(x, y)]
            seen.add((x, y))
            queue = [(x, y)]
            while queue:
                current_x, current_y = queue.pop()
                for next_x, next_y in ((current_x + 1, current_y), (current_x - 1, current_y), (current_x, current_y + 1), (current_x, current_y - 1)):
                    if not (0 <= next_x < size and 0 <= next_y < size) or (next_x, next_y) in seen:
                        continue
                    if pixels[next_x, next_y] <= 32:
                        continue
                    seen.add((next_x, next_y))
                    queue.append((next_x, next_y))
                    component.append((next_x, next_y))
            components.append(component)
    if not components:
        return
    largest = max(len(component) for component in components)
    full_alpha = image.getchannel("A")
    full_pixels = full_alpha.load()
    scale = image.width / size
    for component in components:
        if len(component) >= largest * 0.1:
            continue
        xs = [point[0] for point in component]
        ys = [point[1] for point in component]
        left = max(0, int(min(xs) * scale) - 5)
        top = max(0, int(min(ys) * scale) - 5)
        right = min(image.width, int((max(xs) + 1) * scale) + 5)
        bottom = min(image.height, int((max(ys) + 1) * scale) + 5)
        for pixel_y in range(top, bottom):
            for pixel_x in range(left, right):
                full_pixels[pixel_x, pixel_y] = 0
    image.putalpha(full_alpha)
    primary_bounds = {
        ("barracks", "pants"): (340, 0, 950, 1254),
        ("barracks", "weapon"): (320, 0, 1000, 1254),
        ("treasury", "pants"): (340, 0, 850, 1254),
        ("royal-stables", "pants"): (420, 0, 930, 1254),
    }.get((building, slot))
    if primary_bounds:
        left, top, right, bottom = primary_bounds
        alpha = image.getchannel("A")
        alpha.paste(0, (0, 0, left, image.height))
        alpha.paste(0, (right, 0, image.width, image.height))
        alpha.paste(0, (0, 0, image.width, top))
        alpha.paste(0, (0, bottom, image.width, image.height))
        image.putalpha(alpha)


def make_contact_sheets() -> None:
    contacts = QA_ROOT / "contacts"
    contacts.mkdir(parents=True, exist_ok=True)
    background = (45, 39, 31, 255)
    for building in BUILDINGS:
        sheet = Image.new("RGBA", (1024, 512), background)
        for index, slot in enumerate(SLOTS):
            item = Image.open(GEAR_ROOT / building / f"{slot}.png").convert("RGBA")
            item.thumbnail((220, 220), Image.Resampling.LANCZOS)
            x = (index % 4) * 256 + (256 - item.width) // 2
            y = (index // 4) * 256 + (256 - item.height) // 2
            sheet.alpha_composite(item, (x, y))
        sheet.convert("RGB").save(contacts / f"{building}-gear-contact.jpg", quality=92)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", action="store_true")
    parser.add_argument("--portrait", nargs=2, metavar=("OFFICER", "CANDIDATE"))
    parser.add_argument("--sheet", nargs=2, metavar=("BUILDING", "CANDIDATE"))
    parser.add_argument("--contacts", action="store_true")
    args = parser.parse_args()
    if args.archive:
        archive_old_assets()
    if args.portrait:
        install_portrait(args.portrait[0], Path(args.portrait[1]))
    if args.sheet:
        crop_sheet(args.sheet[0], Path(args.sheet[1]))
    if args.contacts:
        make_contact_sheets()


if __name__ == "__main__":
    main()
