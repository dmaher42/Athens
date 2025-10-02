# Audio Assets

This directory contains ambient and footstep audio clips that are served at runtime. Most
production builds source proprietary recordings outside of git; the repository omits those
footstep clips so downstream deployments can supply the correct assets without bloating
the history with large binaries.

The tracked files are:

- `ambience_day.mp3` – ambient backing track used as a default.

All other audio content is expected to be supplied by downstream deployments. When adding
footstep clips locally, prefer short, low-bitrate MP3 files to keep bundle sizes small and
avoid committing them to the repository.
