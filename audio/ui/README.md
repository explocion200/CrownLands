# UI opening and closing sound

The owner supplied `RPG Sound Pack/interface/interface2.wav` on September 27, 2026 for opening and closing UI panels. Original source rights apply to this recording.

- Source SHA-256: `b900ac84cd3d7fa6e07f8accd68fd96c2b9493ea5dea7b6d29fa6ec676f0cb3a`.
- Source: approximately 0.45 seconds, stereo, 44.1 kHz, 24-bit PCM WAV.
- The existing `menu_open`, `menu_close` and `parchment_open` cues all use this recording at gain 0.6 before the player's Effects setting.
- Each WAV retains the full recording, converted to stereo 44.1 kHz PCM16 with metadata removed. MP3 (128 kbps) and OGG Vorbis (quality 4) are encoded from that WAV. No trimming, looping or volume processing is applied.

Menu navigation and report/city-detail openings retain their existing cue IDs. Actual dialog and Profile visibility changes also trigger the recording, including keyboard or backdrop closes. Observation is limited to the existing dialog `open` attributes and Profile `class`, avoiding map or content-tree observation. Content refreshes and repeated open/close calls do not trigger another transition.

Opening, closing and report cues share a short cooldown so one transition does not stack multiple interface sounds. A confirmed contextual action sound takes precedence over the generic UI sound during the same action. Effects mute/volume, background pause and independent music playback continue to apply. Ordinary button clicks retain their existing recording.
