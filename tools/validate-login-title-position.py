"""Validate the baked Crownlands login title's fixed production placement."""

import json
import hashlib
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "game-menu-background.jpg"
EXPECTED_SIZE = (1448, 1086)
EXPECTED_CENTER_X = EXPECTED_SIZE[0] / 2
EXPECTED_TITLE_BOUNDS = (248, 125, 1200, 400)
EXPECTED_SOURCE_SHA256 = "2ee59f7455eea48d070f84c83fbacfef1cd865d69a5a48caf714b5ef2670a75d"


def main() -> None:
    with Image.open(SOURCE) as source:
        source_size = source.size
    assert source_size == EXPECTED_SIZE, f"Unexpected login source size: {source_size}"
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED_SOURCE_SHA256, (
        "The approved centered login artwork changed without updating its placement baseline."
    )
    left, top, right, bottom = EXPECTED_TITLE_BOUNDS
    center_x = (left + right) / 2
    assert center_x == EXPECTED_CENTER_X
    assert top < 150

    manifest = json.loads((ROOT / "assets" / "optimized" / "manifest.json").read_text(encoding="utf-8"))
    login = next(asset for asset in manifest["assets"] if asset["id"] == "login-background")
    assert (login["width"], login["height"]) == EXPECTED_SIZE
    assert (ROOT / login["output"]).is_file()
    print(
        "Validated baked login title placement: "
        f"center={center_x:.1f}px, top={top}px, canvas={EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}."
    )


if __name__ == "__main__":
    main()
