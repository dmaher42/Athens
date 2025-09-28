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

## Time-of-day Gradient Backdrops

For development builds the runtime can load lightweight gradient panoramas for the simplified `timeSky` system. Because this
pull request workflow cannot include binary assets, the JPG placeholders are not checked into source control. To enable them
locally, create four 2048×1024 JPGs named:

```
assets/sky/dawn.jpg
assets/sky/day.jpg
assets/sky/dusk.jpg
assets/sky/night.jpg
```

and mirror the same files under `public/assets/sky/`. Any image editor can be used to author the gradients. If you have
ImageMagick installed, the following commands generate quick stand-ins:

```
magick -size 2048x1024 gradient:"#3b2c57-#f8c36a" assets/sky/dawn.jpg
magick -size 2048x1024 gradient:"#6ea8ff-#e4f2ff" assets/sky/day.jpg
magick -size 2048x1024 gradient:"#733d6e-#f8a06c" assets/sky/dusk.jpg
magick -size 2048x1024 gradient:"#0b1630-#2f3a5d" assets/sky/night.jpg
```

Copy the generated files into `public/assets/sky/` so the engine can resolve them in development builds. Replace the gradients
with art-directed panoramas for production deployments.
