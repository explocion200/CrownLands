from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "docs" / "visual-qa" / "pass-4a"
WORLD = ROOT / "assets" / "worlds" / "world_01"
EDGE_ROOT = QA / "edge-pairs"
OVERLAY_ROOT = QA / "runtime-overlays"
FONT = ImageFont.load_default()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def optimized_assets() -> dict[str, Path]:
    manifest = load_json(ROOT / "assets" / "optimized" / "manifest.json")
    return {entry["id"]: ROOT / entry["output"] for entry in manifest["assets"]}


def load_rgba(path: Path, size: int) -> Image.Image:
    with Image.open(path) as opened:
        image = opened.convert("RGBA")
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
    return image


def paste_centered(canvas: Image.Image, art: Image.Image, x: float, y: float) -> None:
    canvas.alpha_composite(art, (round(x - art.width / 2), round(y - art.height / 2)))


def label(draw: ImageDraw.ImageDraw, text: str, x: float, y: float) -> None:
    box = draw.textbbox((0, 0), text, font=FONT)
    width = box[2] - box[0] + 8
    height = box[3] - box[1] + 5
    left = round(x - width / 2)
    top = round(y - height / 2)
    draw.rounded_rectangle((left, top, left + width, top + height), radius=2, fill=(29, 20, 15, 218), outline=(166, 132, 75, 220))
    draw.text((left + 4, top + 2), text, fill=(239, 226, 197, 255), font=FONT)


def stronghold_asset(stronghold_type: str) -> tuple[str, int]:
    value = stronghold_type.lower()
    if "crown" in value:
        return "crown-citadel", 200
    if "speed" in value:
        return "stronghold-speed", 154
    if "training" in value:
        return "stronghold-training", 154
    if "defense" in value:
        return "stronghold-defense", 154
    return "stronghold-gold", 154


def camp_asset(camp_type: str) -> str:
    return {
        "gold": "camp-gold",
        "troops": "camp-troops",
        "items": "camp-items",
        "deed": "camp-deed",
    }[camp_type.lower()]


def make_runtime_overlay(region: dict, assets: dict[str, Path]) -> None:
    data = load_json(ROOT / region["regionPath"])
    with Image.open(ROOT / region["imagePath"]) as opened:
        canvas = opened.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    city_art = load_rgba(assets["castle-shack"], 66)
    for city in data.get("cities", []):
        x = float(city["xNorm"]) * canvas.width
        y = float(city["yNorm"]) * canvas.height
        paste_centered(canvas, city_art, x, y)
        label(draw, city["name"], x, y - 39)
    for camp in data.get("camps", []):
        x = float(camp["xNorm"]) * canvas.width
        y = float(camp["yNorm"]) * canvas.height
        paste_centered(canvas, load_rgba(assets[camp_asset(camp["campType"])], 132), x, y)
        label(draw, camp["name"], x, y - 78)
    for stronghold in data.get("strongholds", []):
        x = float(stronghold["xNorm"]) * canvas.width
        y = float(stronghold["yNorm"]) * canvas.height
        asset_id, size = stronghold_asset(stronghold["strongholdType"])
        paste_centered(canvas, load_rgba(assets[asset_id], size), x, y)
        label(draw, stronghold["name"], x, y - size / 2 - 14)
    output = OVERLAY_ROOT / f'{region["id"]}-runtime-overlay.jpg'
    canvas.convert("RGB").save(output, "JPEG", quality=90, optimize=True)


def make_edge_pair(first: dict, second: dict, direction: str, index: int) -> dict:
    with Image.open(ROOT / first["imagePath"]) as opened:
        a = opened.convert("RGB")
    with Image.open(ROOT / second["imagePath"]) as opened:
        b = opened.convert("RGB")
    strip = 250
    heading = 34
    if direction == "east":
        a_crop = a.crop((a.width - strip, 0, a.width, a.height))
        b_crop = b.crop((0, 0, strip, b.height))
        pair = Image.new("RGB", (strip * 2, a.height + heading), "#17110d")
        pair.paste(a_crop, (0, heading))
        pair.paste(b_crop, (strip, heading))
        seam = strip
    else:
        a_crop = a.crop((0, a.height - strip, a.width, a.height))
        b_crop = b.crop((0, 0, b.width, strip))
        pair = Image.new("RGB", (a.width, strip * 2 + heading), "#17110d")
        pair.paste(a_crop, (0, heading))
        pair.paste(b_crop, (0, strip + heading))
        seam = strip + heading
    draw = ImageDraw.Draw(pair)
    title = f'{first["name"]} -> {second["name"]} ({direction})'
    draw.text((8, 11), title, fill="#eadfc8", font=FONT)
    if direction == "east":
        draw.line((seam, heading, seam, pair.height), fill="#b58c50", width=2)
    else:
        draw.line((0, seam, pair.width, seam), fill="#b58c50", width=2)
    filename = f'{index:02d}-{first["id"]}-{second["id"]}.jpg'
    pair.save(EDGE_ROOT / filename, "JPEG", quality=90, optimize=True)
    return {"first": first["id"], "second": second["id"], "direction": direction, "file": f"edge-pairs/{filename}"}


def make_thumbnail_contact(regions: list[dict]) -> None:
    cell_w, cell_h = 336, 286
    sheet = Image.new("RGB", (cell_w * 5, cell_h * 3), "#17110d")
    draw = ImageDraw.Draw(sheet)
    for index, region in enumerate(regions):
        path = WORLD / "thumbnails" / f'{region["id"]}-thumb.webp'
        with Image.open(path) as opened:
            thumb = opened.convert("RGB")
        x = (index % 5) * cell_w + 8
        y = (index // 5) * cell_h + 8
        sheet.paste(thumb, (x, y))
        draw.text((x, y + 246), region["name"], fill="#eadfc8", font=FONT)
    sheet.save(QA / "thumbnail-contact.jpg", "JPEG", quality=91, optimize=True)


def make_transition_preview(assets: dict[str, Path], center: dict) -> None:
    with Image.open(ROOT / center["imagePath"]) as opened:
        background = opened.convert("RGBA").resize((896, 672), Image.Resampling.LANCZOS)
    with Image.open(assets["map-transition-clouds"]) as opened:
        mist = opened.convert("RGBA").resize((672, 672), Image.Resampling.LANCZOS)
    background.alpha_composite(mist, (112, 0))
    background.convert("RGB").save(QA / "transition-mist-preview.jpg", "JPEG", quality=90, optimize=True)


def make_overlay_contact(regions: list[dict]) -> None:
    cell_width, cell_height = 344, 284
    sheet = Image.new("RGB", (cell_width * 5, cell_height * 3), "#17110d")
    draw = ImageDraw.Draw(sheet)
    for index, region in enumerate(regions):
        with Image.open(OVERLAY_ROOT / f'{region["id"]}-runtime-overlay.jpg') as opened:
            preview = opened.convert("RGB")
            preview.thumbnail((320, 240), Image.Resampling.LANCZOS)
        x = (index % 5) * cell_width + 12
        y = (index // 5) * cell_height + 8
        sheet.paste(preview, (x, y))
        draw.text((x, y + 246), region["name"], fill="#eadfc8", font=FONT)
    sheet.save(QA / "runtime-overlay-contact.jpg", "JPEG", quality=91, optimize=True)


def main() -> None:
    EDGE_ROOT.mkdir(parents=True, exist_ok=True)
    OVERLAY_ROOT.mkdir(parents=True, exist_ok=True)
    layout = load_json(WORLD / "world-layout.json")
    regions = layout["regions"]
    by_grid = {(region["gridX"], region["gridY"]): region for region in regions}
    assets = optimized_assets()
    pairs = []
    index = 1
    for region in regions:
        for direction, delta in (("east", (1, 0)), ("south", (0, 1))):
            neighbor = by_grid.get((region["gridX"] + delta[0], region["gridY"] + delta[1]))
            if not neighbor:
                continue
            pairs.append(make_edge_pair(region, neighbor, direction, index))
            index += 1
    for region in regions:
        make_runtime_overlay(region, assets)
    make_thumbnail_contact(regions)
    make_overlay_contact(regions)
    make_transition_preview(assets, next(region for region in regions if region["id"] == "center"))
    old_maps = sum((QA / "old-assets" / Path(region["imagePath"]).name).stat().st_size for region in regions)
    new_maps = sum((ROOT / region["imagePath"]).stat().st_size for region in regions)
    old_thumbs = load_json(QA / "map-audit.json")["oldThumbnailBytes"]
    new_thumbs = sum((WORLD / "thumbnails" / f'{region["id"]}-thumb.webp').stat().st_size for region in regions)
    payload = {
        "edgePairs": pairs,
        "oldMapBytes": old_maps,
        "newMapBytes": new_maps,
        "oldThumbnailBytes": old_thumbs,
        "newThumbnailBytes": new_thumbs,
    }
    (QA / "qa-data.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Built Pass 4A QA: {len(pairs)} edge pairs, 15 runtime overlays, thumbnails, and mist preview.")


if __name__ == "__main__":
    main()
