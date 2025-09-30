# Athens Ambient Audio Placeholders

The ambient audio clips referenced by the application are not tracked in git so pull
requests remain lightweight and binary-free. To run the experience locally, drop the
following MP3 files into this directory:

- `ambience_dawn.mp3`
- `ambience_day.mp3`
- `ambience_dusk.mp3`
- `ambience_night.mp3`
- `forest-day.mp3`
- `footstep_dirt.mp3`
- `footstep_stone.mp3`
- `market_chatter.mp3`
- `night-crickets.mp3`
- `wind-coast.mp3`

These filenames must match exactly because the ambient registry references them
verbatim. Footstep clips in particular must use the singular `footstep_` prefix to
line up with the runtime loader. The build will gracefully log a warning if a track
is missing at runtime.
