"""Resize/encode generated Guild originals without repainting or compositing them.

Run with the bundled Python/Pillow runtime. All source images and their original
generation prompts live in docs/art-sources/guild-master. The game does not fetch
the originals or this manifest. No external network or image API is used here.
"""
import hashlib
import json
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "docs/art-sources/guild-master/manifest.json"


def within_repo(relative):
    result = (ROOT / relative).resolve()
    if ROOT not in result.parents:
        raise ValueError("Guild artwork path must stay inside the repository")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only-prefix", default="", help="Encode only matching asset IDs; keep other derivatives unchanged")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    total = 0
    for item in manifest["assets"]:
        if not item["id"].startswith(args.only_prefix):
            total += item["bytes"]
            continue
        source, destination = within_repo(item["source"]), within_repo(item["runtime"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as original:
            image = original.convert("RGB")
            image.thumbnail((item["maxWidth"], item["maxHeight"]), Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=item.get("quality", manifest["encoding"]["quality"]),
                       method=manifest["encoding"]["method"])
            item["width"], item["height"] = image.size
        item["sourceSha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
        item["runtimeSha256"] = hashlib.sha256(destination.read_bytes()).hexdigest()
        item["bytes"] = destination.stat().st_size
        if item["bytes"] > item["maxKiB"] * 1024:
            raise ValueError(f'{item["id"]} exceeds its {item["maxKiB"]} KiB review budget')
        total += item["bytes"]
        print(f'{item["id"]}: {item["width"]} x {item["height"]}, {item["bytes"]:,} bytes')
    if total > manifest["encoding"]["totalBudgetKiB"] * 1024:
        raise ValueError("Guild artwork exceeds its combined review budget")
    manifest["encoding"]["totalBytes"] = total
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f'Total: {total:,} bytes; all {len(manifest["assets"])} active asset budgets passed')


if __name__ == "__main__":
    main()
