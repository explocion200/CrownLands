# Approved skill atlas emblems

The owner approved draft revision 4 on October 6, 2026 for every existing skill-emblem use in the game. The eight PNGs here are byte-for-byte copies of the approved built-in image-generation outputs. `manifest.json` records each source and runtime SHA-256, subject and final generation prompt.

Delivery uses 320×320 transparent WebP files under `assets/icons/skills/atlas-v1/`, exported with Pillow Lanczos downsampling, quality 85, method 6 and exact transparent RGB handling. All eight total 229,728 bytes. There is no new runtime dependency. The PNG masters and this manifest stay outside the production artifact.

Versioned paths bypass the prior immutable SVG cache. All current runtime references, including CSS backgrounds and dynamic skill/building paths, use the atlas set. The previous small SVG files remain available for older clients and historical previews. Future artwork revisions must use a new versioned directory.

The icons load on demand through the existing image cache, outside the login preload and service-worker installation cache. The release fingerprint includes all eight delivery images. Skills, progression, combat, production, costs and backend authority are unchanged. Preparation is not evidence of deployment.
