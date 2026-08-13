"""Install and QA the accepted Pass 3G HUD and identity artwork.

This development helper preserves the generated candidates, normalizes each
asset onto its canonical source canvas, derives PWA sizes from one master, and
creates contact sheets for the development-only Pass 3G gallery.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
QA_ROOT = ROOT / "docs" / "visual-qa" / "pass-3g"
GENERATED_ROOT = Path.home() / ".codex" / "generated_images" / "019eecca-e952-7ac2-8bc6-756689df1abf"

CANDIDATES = {
    "leaderboard": GENERATED_ROOT / "exec-4a0fb4e0-ddfa-4c79-b552-881dc19653bc.png",
    "city-list": GENERATED_ROOT / "exec-4d9f81b0-bd6e-4fb8-b69f-1b6754af36fc.png",
    "map": GENERATED_ROOT / "exec-286ff48b-3992-46ab-be8d-2c160ddbe904.png",
    "shop": GENERATED_ROOT / "exec-3cb564bd-c63a-4507-9497-d0f56569e03a.png",
    "bag": GENERATED_ROOT / "exec-cbeb2241-4c06-4810-a2ab-b0dd0f4f24fc.png",
    "reports": GENERATED_ROOT / "exec-4546b134-73a0-412d-88b3-a17479c618ad.png",
    "achievements": GENERATED_ROOT / "exec-f0f96af6-222c-4f96-bd5f-e8ea1946eedb.png",
    "daily-rewards": GENERATED_ROOT / "exec-713a1185-61c4-4a11-a27c-f2e872113e7f.png",
    "profile-frame": GENERATED_ROOT / "exec-9f44a78d-0707-4e0a-9d52-6cbeb82543b5.png",
    "map-arrow": GENERATED_ROOT / "exec-d7184467-e5e1-4071-a926-40c9b6ada897.png",
    "loading-ring": GENERATED_ROOT / "exec-70e59612-286f-4232-bda3-7cbce45db084.png",
    "loading-crown": GENERATED_ROOT / "exec-8bf13c4d-5156-4da1-9476-bb9dade91b7d.png",
    "pwa-master": GENERATED_ROOT / "exec-5e8454a6-af91-42c1-b4a7-3149d7699cf8.png",
}

TARGETS = {
    "leaderboard": (ROOT / "assets" / "leaderboard-icon.png", (1254, 1254), (980, 980)),
    "city-list": (ROOT / "assets" / "city-list-icon.png", (1254, 1254), (980, 980)),
    "map": (ROOT / "assets" / "map-icon.png", (1254, 1254), (1000, 1000)),
    "shop": (ROOT / "assets" / "shop-icon.png", (1254, 1254), (980, 980)),
    "bag": (ROOT / "assets" / "bag-icon.png", (1254, 1254), (1000, 1000)),
    "reports": (ROOT / "assets" / "report-icon.png", (1254, 1254), (1000, 1000)),
    "achievements": (ROOT / "assets" / "achievement-icon.png", (1254, 1254), (1040, 1040)),
    "daily-rewards": (ROOT / "assets" / "daily-reward-icon-cutout.webp", (1254, 1254), (1040, 1040)),
    "map-arrow": (ROOT / "assets" / "map-switch-arrow.png", (654, 720), (590, 480)),
    "loading-ring": (ROOT / "assets" / "loading-ring.png", (1254, 1254), (1160, 1160)),
    "loading-crown": (ROOT / "assets" / "loading-crown.png", (1254, 1254), (700, 700)),
}


def visible_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    threshold = alpha.point(lambda value: 255 if value > 12 else 0)
    bounds = threshold.getbbox()
    if not bounds:
        raise RuntimeError("Candidate contains no visible subject")
    return bounds


def fit_subject(candidate: Path, canvas_size: tuple[int, int], safe_size: tuple[int, int]) -> Image.Image:
    with Image.open(candidate) as opened:
        image = opened.convert("RGBA")
    subject = image.crop(visible_bounds(image))
    subject.thumbnail(safe_size, Image.Resampling.LANCZOS, reducing_gap=3.0)
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((canvas.width - subject.width) // 2, (canvas.height - subject.height) // 2))
    return canvas


def install_standard_assets() -> None:
    accepted_root = QA_ROOT / "generated-candidates"
    accepted_root.mkdir(parents=True, exist_ok=True)
    for name, candidate in CANDIDATES.items():
        shutil.copy2(candidate, accepted_root / f"accepted-{name}.png")

    for name, (target, canvas_size, safe_size) in TARGETS.items():
        output = fit_subject(CANDIDATES[name], canvas_size, safe_size)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.suffix.lower() == ".webp":
            output.save(target, "WEBP", lossless=True, quality=100, method=6, exact=True)
        else:
            output.save(target, "PNG", optimize=True)

    with Image.open(CANDIDATES["profile-frame"]) as opened:
        frame = opened.convert("RGBA").crop(visible_bounds(opened.convert("RGBA")))
    frame = frame.resize((1360, 1036), Image.Resampling.LANCZOS)
    profile = Image.new("RGBA", (1419, 1108), (0, 0, 0, 0))
    profile.alpha_composite(frame, ((1419 - frame.width) // 2, (1108 - frame.height) // 2))
    profile.save(ROOT / "assets" / "profile-hud-frame.png", "PNG", optimize=True)


def install_pwa_identity() -> None:
    icon_root = ROOT / "assets" / "icons"
    icon_root.mkdir(parents=True, exist_ok=True)
    with Image.open(CANDIDATES["pwa-master"]) as opened:
        master = opened.convert("RGB").resize((1254, 1254), Image.Resampling.LANCZOS)
    master.save(icon_root / "crownlands-icon-master.png", "PNG", optimize=True)
    for size in (192, 512):
        derived = master.resize((size, size), Image.Resampling.LANCZOS)
        indexed = derived.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
        indexed.save(icon_root / f"crownlands-icon-{size}.png", "PNG", optimize=True)
        indexed.save(icon_root / f"crownlands-maskable-{size}.png", "PNG", optimize=True)
    favicon = master.resize((32, 32), Image.Resampling.LANCZOS).quantize(colors=96)
    favicon.save(icon_root / "crownlands-favicon-32.png", "PNG", optimize=True)


def metadata(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        return {
            "path": path.relative_to(ROOT).as_posix(),
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "bytes": path.stat().st_size,
        }


def validate() -> None:
    rows = []
    for target, expected_size, _ in TARGETS.values():
        with Image.open(target) as image:
            if image.size != expected_size or "A" not in image.getbands():
                raise RuntimeError(f"Invalid canonical asset: {target} {image.size} {image.mode}")
            if image.convert("RGBA").getpixel((0, 0))[3] != 0:
                raise RuntimeError(f"Transparent asset has an opaque corner: {target}")
        rows.append(metadata(target))
    profile_path = ROOT / "assets" / "profile-hud-frame.png"
    with Image.open(profile_path) as profile:
        if profile.size != (1419, 1108) or profile.convert("RGBA").getpixel((709, 554))[3] != 0:
            raise RuntimeError("Profile frame dimensions or center transparency are invalid")
    ring_path = ROOT / "assets" / "loading-ring.png"
    with Image.open(ring_path) as ring:
        if ring.convert("RGBA").getpixel((627, 627))[3] != 0:
            raise RuntimeError("Loading ring center must remain transparent")
    rows.append(metadata(profile_path))
    for filename in (
        "crownlands-icon-master.png", "crownlands-icon-192.png", "crownlands-icon-512.png",
        "crownlands-maskable-192.png", "crownlands-maskable-512.png", "crownlands-favicon-32.png",
    ):
        rows.append(metadata(ROOT / "assets" / "icons" / filename))
    (QA_ROOT / "after-sizes.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")


def checker(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, (207, 193, 158))
    draw = ImageDraw.Draw(image)
    step = 18
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2:
                draw.rectangle((x, y, x + step - 1, y + step - 1), fill=(176, 155, 116))
    return image


def make_contact() -> None:
    names = list(TARGETS) + ["profile-frame", "pwa-master"]
    new_paths = {name: target for name, (target, _, _) in TARGETS.items()}
    new_paths["profile-frame"] = ROOT / "assets" / "profile-hud-frame.png"
    new_paths["pwa-master"] = ROOT / "assets" / "icons" / "crownlands-icon-master.png"
    old_names = {
        "leaderboard": "leaderboard-icon.png", "city-list": "city-list-icon.png", "map": "map-icon.png",
        "shop": "shop-icon.png", "bag": "bag-icon.png", "reports": "report-icon.png",
        "achievements": "achievement-icon.png", "daily-rewards": "daily-reward-icon-cutout.webp",
        "profile-frame": "profile-hud-frame.png", "map-arrow": "map-switch-arrow.png",
        "loading-ring": "loading-ring.png", "loading-crown": "loading-crown.png",
        "pwa-master": "crownlands-icon-512.png",
    }
    tile_w, tile_h = 230, 250
    for state, source_for in (
        ("old", lambda name: QA_ROOT / "old-assets" / old_names[name]),
        ("new", lambda name: new_paths[name]),
    ):
        sheet = Image.new("RGB", (tile_w * 5, 42 + tile_h * 3), (43, 31, 22))
        draw = ImageDraw.Draw(sheet)
        draw.text((16, 13), f"Pass 3G {state} assets", fill=(231, 218, 183))
        for index, name in enumerate(names):
            x = index % 5 * tile_w
            y = 42 + index // 5 * tile_h
            base = checker((tile_w, tile_h)).convert("RGBA")
            with Image.open(source_for(name)) as opened:
                item = opened.convert("RGBA")
            item.thumbnail((190, 190), Image.Resampling.LANCZOS)
            base.alpha_composite(item, ((tile_w - item.width) // 2, 12 + (190 - item.height) // 2))
            sheet.paste(base.convert("RGB"), (x, y))
            draw.text((x + 10, y + 216), name.replace("-", " ").title(), fill=(39, 27, 18))
        sheet.save(QA_ROOT / f"{state}-asset-contact.jpg", quality=92)


def main() -> None:
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    install_standard_assets()
    install_pwa_identity()
    validate()
    make_contact()
    print("Installed and validated 13 Pass 3G source masters plus PWA derivatives.")


if __name__ == "__main__":
    main()
