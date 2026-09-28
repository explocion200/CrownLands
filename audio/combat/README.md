# Battle impact sound

The owner supplied `504979_10868231-hq.mp3` on September 27, 2026 for battles. Original source rights apply to this recording.

- Source SHA-256: `b3016ddff468cf412aed44c9f30af221755e897686ee69e92afa76fef1910180`.
- Source: stereo, 48 kHz MP3, approximately 2.26 seconds of decoded audio (2.30-second container duration).
- The existing `sword_clash_01`, `sword_clash_02`, `sword_clash_03` and `siege_impact` cue IDs all use this recording. These IDs retain compatibility with ordinary battle and siege routing.
- Conversion retains the full clip, resamples to stereo 44.1 kHz PCM16, and removes metadata. A fixed 3 dB attenuation prevents clipping from the source MP3's decoded peak above 0 dBFS. MP3 (128 kbps) and OGG Vorbis (quality 4) are encoded from that WAV; all four cue files are identical within each codec.
- Recommended gain is 0.321 before the player's Effects setting. Validation mixes the clip with army arrival and the applicable city/camp/stronghold capture or defeat cue.

Playback uses the existing confirmed battle-impact path in online and local combat, delayed 150 ms after arrival. Active-map gating, batch deduplication, Effects mute/volume, background suspension and concurrency limits remain in place. Opening historical reports, scouting and friendly reinforcements do not trigger battle impacts. Victory/defeat sounds remain separate, and the shuffled background music continues without restarting. No combat rules, results or timing are changed.
