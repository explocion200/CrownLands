"""Compatibility entry point for the responsive HTML login title/art contract.

The title is no longer baked into a fixed 4:3 bitmap. Browser geometry and
account-state coverage live in validate-login-layout-browser.js.
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent

if __name__ == "__main__":
    subprocess.run(["node", str(ROOT / "tools" / "validate-login-assets.js")], check=True)
