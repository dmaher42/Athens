# Keyboard Hotkeys

This project maps movement, camera, and interaction inputs through the hotkey system defined in `src/config/hotkeys.ts`. The table below lists the default bindings that ship with the repo.

| Action | Default key | Notes |
| --- | --- | --- |
| Move Forward | `W` | Fallback `Z` is available for AZERTY layouts. |
| Move Backward | `S` |  |
| Move Left | `A` | Fallback `Q` is available for AZERTY layouts. |
| Move Right | `D` |  |
| Run Modifier | `Shift` | Either left or right shift works. |
| Look Left | `←` | Keyboard only camera yaw. |
| Look Right | `→` | Keyboard only camera yaw. |
| Look Up | `↑` | Keyboard only camera pitch. |
| Look Down | `↓` | Keyboard only camera pitch. |

## Changing the bindings

1. Open [`src/config/hotkeys.ts`](../src/config/hotkeys.ts) in an editor.
2. Locate the action you want to change. Each action is created with `createAction` and declares a `default` property for the main key code.
3. Replace the `default` value with the [KeyboardEvent code](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values) you want to use (for example, change `ArrowLeft` to `KeyJ`).
4. If you want to support multiple keys, add them to `aliasCodes`, e.g. `aliasCodes: ['KeyJ', 'Numpad4']`.
5. Save the file and rebuild / reload the project. The new bindings are picked up the next time the app starts.

### Adding localized fallbacks

Use the optional `fallback` array to accept alternate layout-friendly keys. Entries can be strings (lowercase character) or `[key, code]` tuples when the browser reports unexpected codes. For example:

```ts
fallback: ['arrowleft', ['←', 'ArrowLeft']]
```

With this configuration, pressing either `←` or any key that reports the `ArrowLeft` code will invoke the action.

