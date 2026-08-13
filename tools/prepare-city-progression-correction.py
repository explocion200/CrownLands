"""Prepare, install, and validate the five corrected Crownlands city stages."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
QA_ROOT = ROOT / "docs" / "visual-qa" / "city-progression-correction"
CANDIDATE = QA_ROOT / "generated-candidates" / "candidate-01-alpha.png"
OLD_ROOT = QA_ROOT / "old-assets"
PREPARED_ROOT = QA_ROOT / "prepared"
CITY_ROOT = ROOT / "assets" / "castles"
STAGES = ("shack", "fort", "keep", "castle", "city")
SOURCE_CANVAS = (768, 768)
STAGE_VISIBLE_HEIGHT = (500, 555, 610, 645, 750)
RUNTIME_BOX_SIZE = (66, 69, 72, 75, 78)


def alpha_bounds(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value >= threshold else 0)
    bounds = alpha.getbbox()
    if not bounds:
        raise RuntimeError("City candidate contains no visible pixels")
    return bounds


def visible_area(image: Image.Image, threshold: int = 24) -> int:
    histogram = image.getchannel("A").histogram()
    return sum(histogram[threshold:])


def sheet_component_ranges(sheet: Image.Image, threshold: int = 8) -> list[tuple[int, int]]:
    alpha = sheet.getchannel("A")
    ranges = []
    start = None
    for x in range(sheet.width):
        occupied = alpha.crop((x, 0, x + 1, sheet.height)).getextrema()[1] >= threshold
        if occupied and start is None:
            start = x
        elif not occupied and start is not None:
            ranges.append((start, x))
            start = None
    if start is not None:
        ranges.append((start, sheet.width))
    if len(ranges) != len(STAGES):
        raise RuntimeError(f"Expected five isolated city components, found {ranges}")
    return ranges


def remove_tiny_alpha_components(image: Image.Image, threshold: int = 32, minimum_area: int = 16) -> Image.Image:
    cleaned = image.copy()
    alpha = cleaned.getchannel("A")
    pixels = alpha.load()
    visited = set()
    discard = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if pixels[x, y] < threshold or (x, y) in visited:
                continue
            component = []
            pending = [(x, y)]
            visited.add((x, y))
            while pending:
                px, py = pending.pop()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < alpha.width and 0 <= ny < alpha.height and pixels[nx, ny] >= threshold and (nx, ny) not in visited:
                        visited.add((nx, ny))
                        pending.append((nx, ny))
            if len(component) < minimum_area:
                discard.extend(component)
    for x, y in discard:
        pixels[x, y] = 0
    cleaned.putalpha(alpha)
    return cleaned


def fit_on_canvas(subject: Image.Image, target_height: int, canvas_size: tuple[int, int]) -> Image.Image:
    scale = target_height / subject.height
    width = max(1, round(subject.width * scale))
    resized = subject.resize((width, target_height), Image.Resampling.LANCZOS)
    if resized.width > canvas_size[0] - 20:
        resized.thumbnail((canvas_size[0] - 20, canvas_size[1] - 20), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    left = (canvas.width - resized.width) // 2
    top = canvas.height - resized.height - 12
    canvas.alpha_composite(resized, (left, top))
    return canvas


def crop_candidates() -> list[dict]:
    PREPARED_ROOT.mkdir(parents=True, exist_ok=True)
    with Image.open(CANDIDATE) as opened:
        sheet = opened.convert("RGBA")
    component_ranges = sheet_component_ranges(sheet)
    records = []
    for name, (left, right), target_height in zip(STAGES, component_ranges, STAGE_VISIBLE_HEIGHT):
        cell = sheet.crop((left, 0, right, sheet.height))
        bounds = alpha_bounds(cell)
        subject = remove_tiny_alpha_components(cell.crop(bounds))
        prepared = remove_tiny_alpha_components(fit_on_canvas(subject, target_height, SOURCE_CANVAS))
        output = PREPARED_ROOT / f"{name}.png"
        prepared.save(output, "PNG", optimize=True)
        final_bounds = alpha_bounds(prepared)
        records.append({
            "name": name,
            "source": str(output.relative_to(ROOT)).replace("\\", "/"),
            "visibleBounds": list(final_bounds),
            "visibleWidth": final_bounds[2] - final_bounds[0],
            "visibleHeight": final_bounds[3] - final_bounds[1],
            "visibleArea": visible_area(prepared),
        })
    (QA_ROOT / "progression-metrics.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    return records


def archive_and_install() -> None:
    OLD_ROOT.mkdir(parents=True, exist_ok=True)
    for name in STAGES:
        source = CITY_ROOT / f"{name}.png"
        archived = OLD_ROOT / f"{name}.png"
        if not archived.exists():
            shutil.copy2(source, archived)
        shutil.copy2(PREPARED_ROOT / f"{name}.png", source)


def checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, "#d5c79e")
    draw = ImageDraw.Draw(image)
    cell = 24
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#a9976d")
    return image


def make_contact(records: list[dict], source_root: Path, output: Path, title: str) -> None:
    width, height = 1280, 330
    sheet = Image.new("RGB", (width, height), "#17110d")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((20, 16), title, fill="#f1e6cc", font=font)
    cell_width = 248
    for index, record in enumerate(records):
        x = 20 + index * cell_width
        panel = checkerboard((220, 250))
        with Image.open(source_root / f'{record["name"]}.png') as opened:
            art = opened.convert("RGBA")
            source_bounds = alpha_bounds(art)
            source_width = source_bounds[2] - source_bounds[0]
            source_height = source_bounds[3] - source_bounds[1]
            art.thumbnail((210, 220), Image.Resampling.LANCZOS)
        panel.paste(art, ((220 - art.width) // 2, 250 - art.height - 8), art)
        sheet.paste(panel, (x, 42))
        label = f'Stage {index + 1}  {source_width}x{source_height}'
        draw.text((x + 5, 300), label, fill="#d8c7a1", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, "PNG", optimize=True)


def make_runtime_contact(records: list[dict]) -> None:
    sheet = Image.new("RGB", (680, 150), "#2a2319")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((16, 14), "Corrected cities at staged gameplay-readable heights", fill="#f1e6cc", font=font)
    x = 18
    for index, (record, box_size) in enumerate(zip(records, RUNTIME_BOX_SIZE)):
        with Image.open(PREPARED_ROOT / f'{record["name"]}.png') as opened:
            canvas = opened.convert("RGBA").resize((box_size, box_size), Image.Resampling.LANCZOS)
        sheet.paste(canvas, (x, 58), canvas)
        draw.text((x + 22, 130), f"S{index + 1}", fill="#d8c7a1", font=font)
        x += 128
    sheet.save(QA_ROOT / "runtime-size-progression.png", "PNG", optimize=True)


def validate(records: list[dict]) -> None:
    heights = [record["visibleHeight"] for record in records]
    areas = [record["visibleArea"] for record in records]
    if heights != sorted(heights) or len(set(heights)) != len(heights):
        raise RuntimeError(f"Visible heights do not strictly increase: {heights}")
    if areas != sorted(areas) or len(set(areas)) != len(areas):
        raise RuntimeError(f"Visible areas do not strictly increase: {areas}")
    if heights[-1] < heights[-2] * 1.15:
        raise RuntimeError("Stage 5 is not at least 15% taller than Stage 4")
    for record in records:
        with Image.open(ROOT / record["source"]) as opened:
            if opened.size != SOURCE_CANVAS or opened.mode != "RGBA":
                raise RuntimeError(f'{record["name"]} violates the 768x768 RGBA source contract')
            if any(opened.getpixel(point)[3] for point in ((0, 0), (767, 0), (0, 767), (767, 767))):
                raise RuntimeError(f'{record["name"]} does not have transparent corners')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()
    records = crop_candidates()
    validate(records)
    make_contact(records, PREPARED_ROOT, QA_ROOT / "new-city-progression.png", "Corrected Crownlands city progression")
    old_source = OLD_ROOT if all((OLD_ROOT / f"{name}.png").exists() for name in STAGES) else CITY_ROOT
    make_contact(records, old_source, QA_ROOT / "old-city-progression.png", "Previous Crownlands city progression")
    make_runtime_contact(records)
    if args.install:
        archive_and_install()
    print("Prepared five city stages: " + ", ".join(f'{r["name"]} {r["visibleWidth"]}x{r["visibleHeight"]}' for r in records))


if __name__ == "__main__":
    main()
