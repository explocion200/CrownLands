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


FIXED_LAYOUT_CATEGORIES = {
    "loading",
    "hud",
    "stronghold-object",
    "camp-object",
    "citadel-object",
    "gear-item",
    "item",
    "pickup",
    "status",
    "gear-box",
    "city-object",
}


ASSETS = (
    # id, source, maximum width, maximum height, quality, category
    ("login-background", "assets/game-menu-background.jpg", 1448, 1086, 81, "login"),
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
    ("status-peace-shield-field", "assets/royal-peace-shield-icon.webp", 192, 192, 92, "status"),
    ("daily-reward", "assets/daily-reward-icon-cutout.webp", 160, 160, 92, "hud"),
    ("item-peace-shield", "assets/royal-peace-shield-icon.webp", 160, 160, 86, "item"),
    ("item-war-drums", "assets/war-drums-icon.webp", 160, 160, 86, "item"),
    ("item-royal-tax-decree", "assets/royal-tax-decree-icon.webp", 160, 160, 86, "item"),
    ("item-veil-of-silence", "assets/veil-of-silence-icon.webp", 160, 160, 86, "item"),
    ("item-swift-march", "assets/swift-march-order-icon.webp", 160, 160, 86, "item"),
    ("item-recall-horn", "assets/recall-horn-icon.webp", 160, 160, 86, "item"),
    ("stronghold-gold", "assets/gold-stronghold.png", 384, 384, 88, "stronghold-object"),
    ("stronghold-training", "assets/training-stronghold.png", 384, 384, 88, "stronghold-object"),
    ("stronghold-speed", "assets/speed-stronghold.png", 384, 384, 88, "stronghold-object"),
    ("stronghold-defense", "assets/defense-stronghold.png", 384, 384, 88, "stronghold-object"),
    ("crown-citadel", "assets/crown-citadel.png", 384, 384, 88, "citadel-object"),
    ("camp-gold", "assets/camps/gold.png", 384, 384, 88, "camp-object"),
    ("camp-troops", "assets/camps/troops.png", 384, 384, 88, "camp-object"),
    ("camp-items", "assets/camps/items.png", 384, 384, 88, "camp-object"),
    ("camp-deed", "assets/camps/deed.png", 384, 384, 88, "camp-object"),
    ("castle-shack", "assets/castles/shack.png", 256, 256, 92, "city-object"),
    ("castle-fort", "assets/castles/fort.png", 256, 256, 92, "city-object"),
    ("castle-keep", "assets/castles/keep.png", 256, 256, 92, "city-object"),
    ("castle-castle", "assets/castles/castle.png", 256, 256, 92, "city-object"),
    ("castle-city", "assets/castles/city.png", 256, 256, 92, "city-object"),
    ("inner-castle-hub", "assets/inner-castle/inner-castle-hub.png", 1280, 960, 84, "inner-castle"),
    ("inner-castle-treasury", "assets/inner-castle/treasury.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-great-hall", "assets/inner-castle/great-hall.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-barracks", "assets/inner-castle/barracks.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-alehouse", "assets/inner-castle/alehouse.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-gatehouse", "assets/inner-castle/gatehouse.png", 512, 512, 84, "inner-castle"),
    ("inner-castle-royal-stables", "assets/inner-castle/royal-stables.png", 512, 512, 84, "inner-castle"),
    ("gear-war-captain", "assets/gear/war-captain.png", 768, 1024, 82, "gear"),
    ("gear-master-of-coin", "assets/gear/master-of-coin.png", 768, 1024, 82, "gear"),
    ("gear-cavalry-master", "assets/gear/cavalry-master.png", 768, 1024, 82, "gear"),
    ("gear-defensive-commander", "assets/gear/defensive-commander.png", 768, 1024, 76, "gear"),
    ("item-common-gear-box", "assets/gear/common-gear-box.png", 192, 192, 88, "gear-box"),
    ("item-common-gear-box-open", "assets/gear/common-gear-box-open.png", 256, 256, 88, "gear-box"),
    ("gear-barracks-head", "assets/gear/barracks/head.png", 192, 192, 84, "gear-item"),
    ("gear-barracks-chest", "assets/gear/barracks/chest.png", 192, 192, 84, "gear-item"),
    ("gear-barracks-pants", "assets/gear/barracks/pants.png", 192, 192, 84, "gear-item"),
    ("gear-barracks-boots", "assets/gear/barracks/boots.png", 192, 192, 84, "gear-item"),
    ("gear-barracks-gloves", "assets/gear/barracks/gloves.png", 192, 192, 84, "gear-item"),
    ("gear-barracks-belt", "assets/gear/barracks/belt.png", 192, 192, 84, "gear-item"),
    ("gear-barracks-weapon", "assets/gear/barracks/weapon.png", 192, 192, 84, "gear-item"),
    ("gear-barracks-necklace", "assets/gear/barracks/necklace.png", 192, 192, 84, "gear-item"),
    ("gear-treasury-head", "assets/gear/treasury/head.png", 192, 192, 84, "gear-item"),
    ("gear-treasury-chest", "assets/gear/treasury/chest.png", 192, 192, 84, "gear-item"),
    ("gear-treasury-pants", "assets/gear/treasury/pants.png", 192, 192, 84, "gear-item"),
    ("gear-treasury-boots", "assets/gear/treasury/boots.png", 192, 192, 84, "gear-item"),
    ("gear-treasury-gloves", "assets/gear/treasury/gloves.png", 192, 192, 84, "gear-item"),
    ("gear-treasury-belt", "assets/gear/treasury/belt.png", 192, 192, 84, "gear-item"),
    ("gear-treasury-weapon", "assets/gear/treasury/weapon.png", 192, 192, 84, "gear-item"),
    ("gear-treasury-necklace", "assets/gear/treasury/necklace.png", 192, 192, 84, "gear-item"),
    ("gear-royal-stables-head", "assets/gear/royal-stables/head.png", 192, 192, 84, "gear-item"),
    ("gear-royal-stables-chest", "assets/gear/royal-stables/chest.png", 192, 192, 84, "gear-item"),
    ("gear-royal-stables-pants", "assets/gear/royal-stables/pants.png", 192, 192, 84, "gear-item"),
    ("gear-royal-stables-boots", "assets/gear/royal-stables/boots.png", 192, 192, 84, "gear-item"),
    ("gear-royal-stables-gloves", "assets/gear/royal-stables/gloves.png", 192, 192, 84, "gear-item"),
    ("gear-royal-stables-belt", "assets/gear/royal-stables/belt.png", 192, 192, 84, "gear-item"),
    ("gear-royal-stables-weapon", "assets/gear/royal-stables/weapon.png", 192, 192, 84, "gear-item"),
    ("gear-royal-stables-necklace", "assets/gear/royal-stables/necklace.png", 192, 192, 84, "gear-item"),
    ("gear-gatehouse-head", "assets/gear/gatehouse/head.png", 192, 192, 84, "gear-item"),
    ("gear-gatehouse-chest", "assets/gear/gatehouse/chest.png", 192, 192, 84, "gear-item"),
    ("gear-gatehouse-pants", "assets/gear/gatehouse/pants.png", 192, 192, 84, "gear-item"),
    ("gear-gatehouse-boots", "assets/gear/gatehouse/boots.png", 192, 192, 84, "gear-item"),
    ("gear-gatehouse-gloves", "assets/gear/gatehouse/gloves.png", 192, 192, 84, "gear-item"),
    ("gear-gatehouse-belt", "assets/gear/gatehouse/belt.png", 192, 192, 84, "gear-item"),
    ("gear-gatehouse-weapon", "assets/gear/gatehouse/weapon.png", 192, 192, 84, "gear-item"),
    ("gear-gatehouse-necklace", "assets/gear/gatehouse/necklace.png", 192, 192, 84, "gear-item"),
)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def fit_image(image: Image.Image, max_width: int, max_height: int, category: str) -> Image.Image:
    image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS, reducing_gap=3.0)
    if category not in FIXED_LAYOUT_CATEGORIES:
        return image
    canvas = Image.new("RGBA", (max_width, max_height), (0, 0, 0, 0))
    left = (max_width - image.width) // 2
    top = (max_height - image.height) // 2
    canvas.alpha_composite(image.convert("RGBA"), (left, top))
    return canvas


def build_asset(asset_id: str, source_name: str, max_width: int, max_height: int, quality: int, category: str) -> dict:
    source_path = ROOT / source_name
    with Image.open(source_path) as original:
        has_alpha = "A" in original.getbands() or "transparency" in original.info
        image = original.convert("RGBA" if has_alpha else "RGB")
        image = fit_image(image, max_width, max_height, category)
        has_alpha = "A" in image.getbands() or "transparency" in image.info

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
