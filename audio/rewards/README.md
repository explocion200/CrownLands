# Map Gold pickup sound

The owner supplied `RPG Sound Pack/inventory/money.wav` on September 27, 2026 for map Gold pickups. Original source rights apply to this recording; it is not covered by the procedural effects license.

- Source SHA-256: `4147e7fbe404d2cd97ba7b5af61e88ebe4f652626589c4ee9d570595262b8802`.
- Source: 1 second, stereo, 48 kHz, 24-bit PCM WAV.
- Runtime cue: `map_gold_pickup`, with recommended gain 0.58 before the player's Effects setting.
- `map_gold_pickup.wav` is resampled to 44.1 kHz, stereo, 16-bit PCM for the existing effects pipeline, with metadata removed. MP3 (128 kbps) and OGG Vorbis (quality 4) are encoded from that WAV. The full recording is retained without trimming, looping, or volume processing.

The cue plays on successful map Gold collection in both online and local play. Troop pickups and Gold from Camps, missions, achievements, and other rewards retain their existing cues. Playback uses the shared active-map, Effects mute, and volume controls.

## Gold spending sound

The owner also supplied `RPG Sound Pack/inventory/coin.wav` on September 27, 2026 for purchases, spending and donations. Original source rights apply to this recording.

- Source SHA-256: `ee72adacc8630cb590f22130a9c7c855f6eeb698d9fce6461667255ec45ed184`.
- Source: 0.6 seconds, stereo, 48 kHz, 24-bit PCM WAV.
- Runtime cue: `gold_spend`, with recommended gain 0.42 before the player's Effects setting. Its level is checked alongside city upgrade and troop dispatch sounds.
- `gold_spend.wav`, `.mp3` and `.ogg` use the same conversion settings described above, retaining the full recording without volume processing.

The cue plays once per confirmed paid action or settled purchase/upgrade batch. It covers Shop and Gear Box purchases, city and gear upgrades, personal Gold donations, Clan Tower Shop purchases and Treasury spending, clan creation and renaming, paid skill presets, nearby scouting, Regroup and local recruitment. Successful outgoing Gold Gifts also use the donation sound when recipients receive production minutes, without deducting personal Gold. It never infers spending from a balance update. Rejected, duplicate, replayed and stale-session responses stay silent, as do free equipment changes, skill resets and zero-cost purchases. Effects volume/mute and the existing short anti-overlap cooldown apply; music continues independently.

## Treasury armor upgrade sound

The owner supplied `RPG Sound Pack/inventory/cloth-heavy.wav` on September 27, 2026 for armor upgrades belonging to the Treasury's Master of Coin. Original source rights apply to this recording.

- Source SHA-256: `73bbbd383b5bbc8b8313f6fee84040aecc1de09714afbe51ba4e5162cbac3528`.
- Source: approximately 0.41 seconds, stereo, 44.1 kHz, 24-bit PCM WAV.
- Runtime cue: `treasury_armor_upgrade`, with recommended gain 0.55 before the player's Effects setting.
- The full recording is converted to 16-bit PCM WAV plus MP3 (128 kbps) and OGG Vorbis (quality 4), without trimming or volume processing. Metadata is removed.

Play the cloth cue 150 ms after a confirmed Treasury armor upgrade, alongside the existing Gold payment cue. It applies to head, chest, pants, boots, gloves and belt items at every rarity, including rarity promotions. It does not play for tools, necklaces, other officers, Equip/Unequip, rejected requests, duplicate/replayed receipts or stale sessions. Playback respects Effects mute/volume, leaves music running, and cannot reject an accepted upgrade if audio fails.

## Other officers' armor upgrade sound

The owner supplied `RPG Sound Pack/inventory/chainmail1.wav` on September 27, 2026 for armor upgrades on every character other than the Treasury's Master of Coin. Original source rights apply to this recording.

- Source SHA-256: `44d4d6b0cda8138c9d5545ba4f434f53b7817ba32d98ddfdf5bff6ae7acdefdf`.
- Source: approximately 0.58 seconds, stereo, 44.1 kHz, 24-bit PCM WAV.
- Runtime cue: `chainmail_armor_upgrade`, with recommended gain 0.55 before the player's Effects setting.
- The full recording uses the same PCM16 WAV, MP3 and OGG conversions described above, without trimming or volume processing. Metadata is removed.

The War Captain, Cavalry Master and Defensive Commander use this cue for all six armor slots at every rarity, including rarity promotions. It follows the Gold payment cue by 150 ms and uses the same confirmation, session, duplicate/replay, Effects and audio-failure safeguards as the Treasury cloth cue. Weapons, tools, necklaces and Equip/Unequip do not trigger armor sounds. The gear item's officer determines the sound; switching panels while a request is pending cannot select the wrong cue.
