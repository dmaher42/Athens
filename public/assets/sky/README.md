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
