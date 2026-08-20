# Crownlands selected flag-symbol source map

This map records visual identification of the 22 supplied black-on-white PNGs. Filenames were treated only as locators; assignments were made from the visible artwork. SHA-256 hashes, source dimensions, normalized asset paths, and traced vector paths are stored in `assets/flag-symbols/selected/manifest.json`.

| # | Source file | Detected symbol | Assigned stable ID | Confidence | Status / notes |
|---:|---|---|---|---|---|
| 1 | `crownlands_cross_pattee.png` | Cross Pattée | `cross` | High | Selected; four equal flared arms. |
| 2 | `crownlands_sunburst.png` | Sunburst | `sunburst` | High | Selected; central disc with alternating straight and flame-like rays. |
| 3 | `crownlands_oak_tree.png` | Oak Tree | `oak-tree` | High | Selected; broad crown, lobed leaves, thick trunk, and roots. |
| 4 | `crownlands_fleur_de_lis.png` | Fleur-de-lis | `fleur-de-lis` | High | Selected; traditional three-petal charge. |
| 5 | `crownlands_castle_gate.png` | Castle Gate | `castle-gate` | High | Selected; twin towers and arched portcullis. |
| 6 | `ChatGPT Image Aug 19, 2026, 06_27_10 PM (5).png` | Tower | `tower` | High | Selected; one crenellated tower with arched openings. |
| 7 | `ChatGPT Image Aug 19, 2026, 06_27_09 PM (4).png` | Spearhead | `spearhead` | High | Selected; leaf-shaped head and socket. |
| 8 | `ChatGPT Image Aug 19, 2026, 06_27_09 PM (3).png` | Pole War Hammer | `war-hammer` | Medium-high | Selected with caveat: the head is a poleaxe/war-hammer hybrid, but its flared face, reinforced center, rear beak, and long haft fit this ID; file #9 separately covers the battle axe. |
| 9 | `ChatGPT Image Aug 19, 2026, 06_27_09 PM (2).png` | Battle Axe | `battle-axe` | High | Selected; single bearded blade, rear spike, and long haft. |
| 10 | `ChatGPT Image Aug 19, 2026, 06_27_09 PM (1).png` | Crossed Swords | `crossed-swords` | High | Selected; two matching straight swords with guards and pommels. |
| 11 | `ChatGPT Image Aug 19, 2026, 06_26_53 PM (5).png` | Serpent | `serpent` | High | Selected; thick coiled limbless body with raised head and forked tongue. |
| 12 | `ChatGPT Image Aug 19, 2026, 06_26_53 PM (3).png` | Eagle Displayed | `eagle` | High | Alternate; valid eagle candidate, but less balanced at city size than file #21. |
| 13 | `ChatGPT Image Aug 19, 2026, 06_26_53 PM (2).png` | Horse | `horse` | High | Selected; full rearing horse with flowing mane and tail. |
| 14 | `ChatGPT Image Aug 19, 2026, 06_26_52 PM (1).png` | Bear | `bear` | High | Selected; heavy upright bear with raised paws and no lion tail. |
| 15 | `ChatGPT Image Aug 19, 2026, 06_26_35 PM (5).png` | Boar | `boar` | High | Selected; full profile with tusk, blunt snout, bristles, and cloven feet. |
| 16 | `ChatGPT Image Aug 19, 2026, 06_26_35 PM (4).png` | Stag | `stag` | High | Selected; rampant stag with branching antlers and cloven feet. |
| 17 | `ChatGPT Image Aug 19, 2026, 06_26_35 PM (3).png` | Wolf Head | `wolf` | High | Selected; long canine muzzle, tall ears, open jaw, and shaggy neck. |
| 18 | `ChatGPT Image Aug 19, 2026, 06_26_35 PM (1).png` | Crown | `crown` | High | Selected; open royal crown with fleur-de-lis points and lower band. |
| 19 | `ChatGPT Image Aug 19, 2026, 06_25_56 PM (4).png` | Armored Fist / Gauntlet | `gauntlet` | High | Selected; clenched fist, segmented plates, rivets, and plate cuff. |
| 20 | `ChatGPT Image Aug 19, 2026, 06_25_56 PM (3).png` | Dragon / Wyvern | `dragon` | High | Selected; reptilian head, bat wing, claws, and curled tail. |
| 21 | `ChatGPT Image Aug 19, 2026, 06_25_55 PM (2).png` | Eagle Displayed | `eagle` | High | Selected over file #12 for cleaner symmetry, broader silhouette, and stronger city-size balance. |
| 22 | `ChatGPT Image Aug 19, 2026, 06_25_55 PM (1).png` | Lion Rampant | `lion` | High | Selected; mane, raised forepaws, rear legs, and tufted tail. |

## Selected uploaded set

The 21 selected stable IDs are: `crown`, `lion`, `eagle`, `wolf`, `stag`, `boar`, `bear`, `horse`, `dragon`, `serpent`, `crossed-swords`, `battle-axe`, `war-hammer`, `spearhead`, `gauntlet`, `tower`, `castle-gate`, `fleur-de-lis`, `oak-tree`, `sunburst`, and `cross`.

The second `eagle` source is retained as a normalized and traced alternate; it does not replace or add a runtime ID.

## Missing uploaded coverage

No supplied source image maps to these nine catalog IDs: `double-eagle`, `griffin`, `raven`, `falcon`, `moon`, `diamond`, `guardian`, `banner`, and `helm`. Their existing inline geometry remains in place so stored player flags retain their identities.

## Compatibility and runtime handling

- No player flag fields, pattern IDs, color values, symbol IDs, save functions, renderer calls, rules, or layout code are changed by this source integration.
- Approved sources are normalized to a transparent 512×512 monochrome source asset and traced to a 100×100 current-color SVG master.
- The selected vector paths are copied into the existing local inline SVG sprite. Production rendering does not load the source PNG or master SVG files.
- All flag surfaces continue to use the shared `FlagRenderer`; no raster image, external URL, icon library, or player-supplied markup is introduced.
