# Defeated marauder artwork

Created with the built-in image generation tool using the current solo/boss sprites as edit targets and the user's medieval-atlas landscape as the style reference. These are draft artwork assets for review, not an implemented map state or a deployed change.

- Normal: the same three leather-clad marauders fallen with their axe, spear, sword and round shield nearby.
- Boss: the crowned armored warlord and two guards fallen with their heavy hammer, shield, weapons and collapsed burgundy sun banner.

Both retain the elevated southern map viewpoint, muted olive/ochre ground, burgundy cloth, warm-brown ink outlines and irregular flat ground patch. The PNG masters have genuine transparent backgrounds. The compact 384×384 WebP derivatives preserve the generated alpha and composition, using Lanczos3 resizing, quality 84, alpha quality 100 and effort 6. No existing artwork was overwritten.

Files: `solo-defeated-v1.png`, `boss-defeated-v1.png`, `solo-defeated-v1.webp`, `boss-defeated-v1.webp`. Full final prompts and input roles are in [prompts.json](prompts.json); mechanical validation and hashes are in [validation.json](validation.json).

These files stay under `docs/art-sources/`, outside the playable artifact. Defeated NPCs currently disappear from the active-target subscription. Showing these sprites after victory would need a separately defined display lifetime and integration with that existing encounter/respawn lifecycle; this artwork request does not change it.
