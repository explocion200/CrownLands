from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
WORLD_ROOT = ROOT / "assets" / "worlds" / "world_01"
QA_ROOT = ROOT / "docs" / "visual-qa" / "pass-4a"
OLD_ROOT = QA_ROOT / "old-assets"
CANDIDATE_ROOT = QA_ROOT / "generated-candidates"
MAP_SIZE = (1448, 1086)
THUMB_SIZE = (320, 240)
LEGACY_MAPS = {
    "center": "center-island.webp",
    "east": "east-island.webp",
    "north": "north-island.webp",
    "south": "south-island.webp",
    "west": "west-island.webp",
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save_webp(image: Image.Image, path: Path, *, quality: int = 82) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "WEBP", quality=quality, method=6)


def map_records() -> list[dict]:
    layout = load_json(WORLD_ROOT / "world-layout.json")
    by_position = {(region["gridX"], region["gridY"]): region for region in layout["regions"]}
    records = []
    for region in layout["regions"]:
        data = load_json(ROOT / region["regionPath"])
        edges = data.get("edgeConnections", {})
        neighbors = {
            "north": by_position.get((region["gridX"], region["gridY"] - 1), {}).get("id"),
            "east": by_position.get((region["gridX"] + 1, region["gridY"]), {}).get("id"),
            "south": by_position.get((region["gridX"], region["gridY"] + 1), {}).get("id"),
            "west": by_position.get((region["gridX"] - 1, region["gridY"]), {}).get("id"),
        }
        records.append({
            "id": region["id"],
            "name": region["name"],
            "type": region["type"],
            "gridX": region["gridX"],
            "gridY": region["gridY"],
            "imagePath": region["imagePath"],
            "thumbnailPath": region["thumbnailPath"],
            "cities": len(data.get("cities", [])),
            "strongholds": len(data.get("strongholds", [])),
            "camps": len(data.get("camps", [])),
            "neighbors": neighbors,
            "edges": edges,
        })
    return records


def archive_old(records: list[dict]) -> None:
    OLD_ROOT.mkdir(parents=True, exist_ok=True)
    for record in records:
        source = ROOT / record["imagePath"]
        destination = OLD_ROOT / source.name
        if not destination.exists():
            shutil.copy2(source, destination)
    transition = ROOT / "assets" / "map-transition-clouds.png"
    destination = OLD_ROOT / transition.name
    if not destination.exists():
        shutil.copy2(transition, destination)
    legacy_root = OLD_ROOT / "legacy"
    legacy_root.mkdir(parents=True, exist_ok=True)
    for legacy_name in LEGACY_MAPS.values():
        source = ROOT / "assets" / legacy_name
        destination = legacy_root / legacy_name
        if source.exists() and not destination.exists():
            shutil.copy2(source, destination)


def make_world_sheet(records: list[dict], source_root: Path, output: Path, title: str) -> None:
    cell_width, cell_height = 360, 300
    margin, header = 30, 70
    sheet = Image.new("RGB", (cell_width * 5 + margin * 2, cell_height * 5 + header + margin), "#17110d")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((margin, 24), title, fill="#eadfca", font=font)
    for record in records:
        image_path = source_root / Path(record["imagePath"]).name
        with Image.open(image_path) as opened:
            preview = opened.convert("RGB")
            preview.thumbnail((cell_width - 16, cell_height - 52), Image.Resampling.LANCZOS)
        column = record["gridX"] + 2
        row = record["gridY"] + 1
        x = margin + column * cell_width + (cell_width - preview.width) // 2
        y = header + row * cell_height + 24
        sheet.paste(preview, (x, y))
        label = f'{record["name"]} ({record["id"]})'
        draw.text((margin + column * cell_width + 8, header + row * cell_height + 6), label, fill="#e8d6ad", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, "JPEG", quality=92, optimize=True)


def write_audit(records: list[dict]) -> None:
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    payload = {
        "mapSize": list(MAP_SIZE),
        "maps": records,
        "oldMapBytes": sum((ROOT / record["imagePath"]).stat().st_size for record in records),
        "oldThumbnailBytes": sum(
            path.stat().st_size
            for path in (WORLD_ROOT / "thumbnails").glob("*-thumb.webp")
        ),
    }
    (QA_ROOT / "map-audit.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def install_candidates() -> None:
    records = map_records()
    missing = [record["id"] for record in records if not (CANDIDATE_ROOT / f'{record["id"]}.png').exists()]
    if missing:
        raise SystemExit(f"Missing Pass 4A candidates: {', '.join(missing)}")
    for record in records:
        candidate = CANDIDATE_ROOT / f'{record["id"]}.png'
        with Image.open(candidate) as opened:
            if opened.size != MAP_SIZE:
                raise SystemExit(f"{candidate.name} is {opened.size}, expected the canonical {MAP_SIZE} canvas.")
            final = opened.convert("RGB")
        save_webp(final, ROOT / record["imagePath"], quality=82)
        save_webp(final.resize(THUMB_SIZE, Image.Resampling.LANCZOS), WORLD_ROOT / "thumbnails" / f'{record["id"]}-thumb.webp', quality=76)

    by_id = {record["id"]: record for record in records}
    for region_id, legacy_name in LEGACY_MAPS.items():
        shutil.copy2(ROOT / by_id[region_id]["imagePath"], ROOT / "assets" / legacy_name)

    transition_candidate = CANDIDATE_ROOT / "transition-mist.png"
    if not transition_candidate.exists():
        raise SystemExit("Missing Pass 4A transition-mist.png candidate.")
    with Image.open(transition_candidate) as opened:
        mist = opened.convert("RGBA")
        if mist.size != (1254, 1254):
            raise SystemExit(f"transition-mist.png is {mist.size}, expected (1254, 1254).")
        alpha = mist.getchannel("A")
        neutral = ImageOps.colorize(ImageOps.grayscale(mist.convert("RGB")), "#555953", "#f1eee5")
        neutral.putalpha(alpha)
        neutral.save(ROOT / "assets" / "map-transition-clouds.png", "PNG", optimize=True)


def main() -> None:
    records = map_records()
    archive_old(records)
    write_audit(records)
    make_world_sheet(records, OLD_ROOT, QA_ROOT / "old-world-overview.jpg", "Pass 4A - Old Regional World")
    if "--install" in __import__("sys").argv:
        install_candidates()
        make_world_sheet(records, WORLD_ROOT / "maps", QA_ROOT / "new-world-overview.jpg", "Pass 4A - New Regional World")
        digest = hashlib.sha256((QA_ROOT / "new-world-overview.jpg").read_bytes()).hexdigest()[:12]
        print(f"Installed 15 Pass 4A maps and source thumbnails; overview {digest}.")
    else:
        print("Archived and audited the 15 current regional maps.")


if __name__ == "__main__":
    main()
