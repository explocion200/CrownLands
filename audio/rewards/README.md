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

The cue plays once per confirmed paid action or settled purchase/upgrade batch. It covers Shop and Gear Box purchases, city and gear upgrades, personal Gold donations, Clan Tower Shop purchases and Treasury spending, clan creation and renaming, paid skill presets, nearby scouting, Regroup and local recruitment. It never infers spending from a balance update. Rejected, duplicate, replayed, free and stale-session responses stay silent. Free clan gifts and skill resets do not spend Gold. Effects volume/mute and the existing short anti-overlap cooldown apply; music continues independently.
