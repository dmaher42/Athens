# Night Sky Asset

Place the high-resolution night sky panorama provided by the design team at:

```
public/assets/sky/night_sky.jpg
```

This repository does not ship with the binary asset—drop it into the path above in your local working tree when you have the
file. The runtime will attempt to load this texture first. If it is not present, the bundled fallback texture (embedded as a
data URL) will be used so the scene still renders with a night sky.

## High Noon Photo Sky

Drop the high-noon panorama (JPG) into:

```
public/assets/sky/high_noon.jpg
```

During startup the experience now tries to load this asset for the photographic skydome. If the file is missing, the engine
falls back to the bundled `src/sky/sunset.jpg` texture so development builds still render.

## Golden Hour Photo Sky

Place the golden-hour panorama used for both sunrise and sunset moods at:

```
public/assets/sky/golden_hour.jpg
```

The loader reuses this texture for the "Golden Dawn" and "Golden Dusk" presets, with runtime fallbacks to the bundled
`src/sky/sunset.jpg` image when necessary.

## Blue Hour Photo Sky

Drop the blue-hour panorama into:

```
public/assets/sky/blue_hour.jpg
```

This file is prefetched during initialization so the skydome can swap immediately when entering the "Blue Hour" preset. If
it's absent the experience will fall back to the built-in dusk assets.
