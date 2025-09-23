# Night Sky Asset

Place the high-resolution night sky panorama provided by the design team at:

```
public/assets/sky/night_sky.jpg
```

The runtime will attempt to load this file first. If it is not present, the bundled fallback texture (embedded as a data URL)
will be used so the scene still renders with a night sky.

## High Noon Photo Sky

Drop the high-noon panorama (JPG) into:

```
public/assets/sky/high_noon.jpg
```

During startup the experience now tries to load this asset for the photographic skydome. If the file is missing, the engine
falls back to the bundled `src/sky/sunset.jpg` texture so development builds still render.

## Golden Hour Photo Sky

Drop the golden-hour panorama (JPG) into:

```
public/assets/sky/golden_hour.jpg
```

This texture is blended in for both the Golden Dawn and Golden Dusk lighting presets. When the file is absent, the runtime
reuses the bundled sunset texture so the scene still has a warm fallback.

## Blue Hour Photo Sky

Place the blue-hour panorama (JPG) provided by the art team at:

```
public/assets/sky/blue_hour.jpg
```

It will be applied automatically whenever the experience switches to the Blue Hour ambience. Missing files fall back to the
bundled sunset texture, ensuring development builds continue to render even without the photographic asset.
