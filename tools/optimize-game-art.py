"""Build browser-sized WebP derivatives from Crownlands source artwork.

The original files remain the editable masters. Generated files are content
hashed so Netlify can cache them immutably without stale-art deployments.
Run with the bundled Codex Python runtime (Pillow is required).
"""

from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "assets" / "optimized"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"


ASSETS = (
    # id, source, maximum width, maximum height, quality, category
    ("login-background", "assets/game-menu-background.jpg", 1448, 1086, 82, "login"),
    ("loading-ring", "assets/loading-ring.png", 256, 256, 88, "loading"),
    ("loading-crown", "assets/loading-crown.png", 256, 256, 88, "loading"),
    ("map-transition-clouds", "assets/map-transition-clouds.png", 448, 448, 25, "transition"),
    ("hud-leaderboard", "assets/leaderboard-icon.png", 192, 192, 88, "hud"),
    ("hud-city-list", "assets/city-list-icon.png", 192, 192, 88, "hud"),
    ("hud-map", "assets/map-icon.png", 192, 192, 88, "hud"),
    ("hud-shop", "assets/shop-icon.png", 192, 192, 88, "hud"),
    ("hud-bag", "assets/bag-icon.png", 192, 192, 88, "hud"),
    ("hud-report", "assets/report-icon.png", 192, 192, 88, "hud"),
    ("hud-achievements", "assets/achievement-icon.png", 192, 192, 88, "hud"),
    ("hud-profile-frame", "assets/profile-hud-frame.png", 256, 200, 88, "hud"),
    ("hud-map-switch-arrow", "assets/map-switch-arrow.png", 192, 212, 88, "hud"),
    ("pickup-gold", "assets/gold-pickup.png", 192, 192, 88, "pickup"),
    ("pickup-troops", "assets/troop-pickup.png", 192, 192, 88, "pickup"),
    ("status-peace-shield-field", "assets/royal-peace-shield-field.png", 192, 192, 92, "status"),
    ("daily-reward", "assets/daily-reward-icon-cutout.webp", 160, 160, 92, "hud"),
    ("item-peace-shield", "assets/royal-peace-shield-icon.webp", 160, 160, 86, "item"),
    ("item-war-drums", "assets/war-drums-icon.webp", 160, 160, 86, "item"),
    ("item-royal-tax-decree", "assets/royal-tax-decree-icon.webp", 160, 160, 86, "item"),
    ("item-veil-of-silence", "assets/veil-of-silence-icon.webp", 160, 160, 86, "item"),
    ("item-swift-march", "assets/swift-march-order-icon.webp", 160, 160, 86, "item"),
    ("item-recall-horn", "assets/recall-horn-icon.webp", 160, 160, 86, "item"),
    ("stronghold-gold", "assets/gold-stronghold.png", 384, 384, 88, "objective"),
    ("stronghold-training", "assets/training-stronghold.png", 384, 384, 88, "objective"),
    ("stronghold-speed", "assets/speed-stronghold.png", 384, 384, 88, "objective"),
    ("stronghold-defense", "assets/defense-stronghold.png", 384, 384, 88, "objective"),
    ("crown-citadel", "assets/crown-citadel.png", 384, 384, 88, "objective"),
    ("camp-gold", "assets/camps/gold.png", 384, 384, 88, "camp"),
    ("camp-troops", "assets/camps/troops.png", 384, 384, 88, "camp"),
    ("camp-items", "assets/camps/items.png", 384, 384, 88, "camp"),
    ("camp-deed", "assets/camps/deed.png", 384, 384, 88, "camp"),
    ("castle-shack", "assets/castles/shack.png", 256, 256, 92, "city"),
    ("castle-fort", "assets/castles/fort.png", 256, 256, 92, "city"),
    ("castle-keep", "assets/castles/keep.png", 256, 256, 92, "city"),
    ("castle-castle", "assets/castles/castle.png", 256, 256, 92, "city"),
    ("castle-city", "assets/castles/city.png", 256, 256, 92, "city"),
    ("inner-castle-hub", "assets/inner-castle/inner-castle-hub.png", 1280, 960, 84, "inner-castle"),
    ("inner-castle-treasury", "assets/inner-castle/treasury.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-great-hall", "assets/inner-castle/great-hall.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-barracks", "assets/inner-castle/barracks.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-alehouse", "assets/inner-castle/alehouse.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-gatehouse", "assets/inner-castle/gatehouse.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-royal-stables", "assets/inner-castle/royal-stables.png", 512, 512, 84, "inner-castle"),
)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def build_asset(asset_id: str, source_name: str, max_width: int, max_height: int, quality: int, category: str) -> dict:
    source_path = ROOT / source_name
    with Image.open(source_path) as original:
        has_alpha = "A" in original.getbands() or "transparency" in original.info
        image = original.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS, reducing_gap=3.0)

        buffer = io.BytesIO()
        image.save(
            buffer,
            format="WEBP",
            quality=quality,
            method=6,
            exact=has_alpha,
        )

    payload = buffer.getvalue()
    digest = hashlib.sha256(payload).hexdigest()[:12]
    output_path = OUTPUT_DIR / f"{asset_id}-{image.width}x{image.height}-{digest}.webp"
    output_path.write_bytes(payload)
    return {
        "id": asset_id,
        "category": category,
        "source": source_name,
        "output": relative(output_path),
        "width": image.width,
        "height": image.height,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "hasAlpha": has_alpha,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    previous_outputs = set()
    if MANIFEST_PATH.exists():
        previous = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        previous_outputs = {ROOT / entry["output"] for entry in previous.get("assets", [])}

    entries = [build_asset(*spec) for spec in ASSETS]
    current_outputs = {ROOT / entry["output"] for entry in entries}
    for stale_path in previous_outputs - current_outputs:
        if stale_path.parent == OUTPUT_DIR and stale_path.exists():
            stale_path.unlink()

    manifest = {
        "schemaVersion": 1,
        "description": "Browser-sized derivatives; source files remain the editable masters.",
        "assets": entries,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    source_bytes = sum((ROOT / entry["source"]).stat().st_size for entry in entries)
    output_bytes = sum(entry["bytes"] for entry in entries)
    savings = 1 - (output_bytes / source_bytes)
    print(f"Generated {len(entries)} optimized assets: {source_bytes:,} -> {output_bytes:,} bytes ({savings:.1%} smaller).")


if __name__ == "__main__":
    main()
