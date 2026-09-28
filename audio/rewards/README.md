# Map Gold pickup sound

The owner supplied `RPG Sound Pack/inventory/money.wav` on September 27, 2026 for map Gold pickups. Original source rights apply to this recording; it is not covered by the procedural effects license.

- Source SHA-256: `4147e7fbe404d2cd97ba7b5af61e88ebe4f652626589c4ee9d570595262b8802`.
- Source: 1 second, stereo, 48 kHz, 24-bit PCM WAV.
- Runtime cue: `map_gold_pickup`, with recommended gain 0.58 before the player's Effects setting.
- `map_gold_pickup.wav` is resampled to 44.1 kHz, stereo, 16-bit PCM for the existing effects pipeline, with metadata removed. MP3 (128 kbps) and OGG Vorbis (quality 4) are encoded from that WAV. The full recording is retained without trimming, looping, or volume processing.

The cue plays on successful map Gold collection in both online and local play. Troop pickups and Gold from Camps, missions, achievements, and other rewards retain their existing cues. Playback uses the shared active-map, Effects mute, and volume controls.
