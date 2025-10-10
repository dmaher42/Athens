const HotkeyCategoryId = {
  Movement: 'movement',
  Look: 'look',
  Flight: 'flight',
  Debug: 'debug',
  DevTools: 'devTools'
} as const;

type HotkeyCategory = (typeof HotkeyCategoryId)[keyof typeof HotkeyCategoryId];

type ContinuousAxisId = 'x' | 'z' | 'lookX' | 'lookY' | 'turn';

type HotkeyFallbackEntry = string | [string, string];

type HotkeyScope = 'gameplay' | 'dev';

type HotkeyActionInit = {
  id: string;
  title: string;
  default: string;
  aliasCodes?: string[];
  fallback?: HotkeyFallbackEntry[];
  scope?: HotkeyScope;
};

type HotkeyActionDefinition = {
  id: string;
  title: string;
  default: string;
  aliasCodes: string[];
  codes: string[];
  fallback: [string, string][];
  category: HotkeyCategory;
  scope: HotkeyScope;
};

type AxisBinding =
  | {
      type: 'paired';
      axis: ContinuousAxisId;
      positive: string;
      negative: string;
      normalizeWith?: ContinuousAxisId[];
    }
  | {
      type: 'binary';
      axis: 'running';
      actions: string[];
    };

const actionRegistry = new Map<string, HotkeyActionDefinition>();
const actionCodes = new Map<string, string[]>();
const actionsByScope = new Map<HotkeyScope, HotkeyActionDefinition[]>();

function createAction(
  category: HotkeyCategory,
  init: HotkeyActionInit
): HotkeyActionDefinition {
  const aliasCodes = Array.isArray(init.aliasCodes)
    ? init.aliasCodes.filter((code, index, array) => typeof code === 'string' && array.indexOf(code) === index)
    : [];
  const codes = [init.default, ...aliasCodes].filter(
    (code, index, array) => typeof code === 'string' && array.indexOf(code) === index
  );
  const fallbackEntries: [string, string][] = [];
  if (Array.isArray(init.fallback)) {
    for (const entry of init.fallback) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const key = String(entry[0]).toLowerCase();
        const mappedCode = typeof entry[1] === 'string' ? entry[1] : init.default;
        if (key) {
          fallbackEntries.push([key, mappedCode]);
        }
      } else if (typeof entry === 'string') {
        fallbackEntries.push([entry.toLowerCase(), init.default]);
      }
    }
  }

  const scope: HotkeyScope = init.scope ?? 'gameplay';

  const definition: HotkeyActionDefinition = {
    id: init.id,
    title: init.title,
    default: init.default,
    aliasCodes,
    codes,
    fallback: fallbackEntries,
    category,
    scope
  };

  actionRegistry.set(definition.id, definition);
  actionCodes.set(definition.id, definition.codes);

  const scoped = actionsByScope.get(scope);
  if (scoped) {
    scoped.push(definition);
  } else {
    actionsByScope.set(scope, [definition]);
  }

  return definition;
}

const movementActions = {
  moveForward: createAction(HotkeyCategoryId.Movement, {
    id: 'movement.moveForward',
    title: 'Move Forward',
    default: 'KeyW',
    fallback: ['z']
  }),
  moveBackward: createAction(HotkeyCategoryId.Movement, {
    id: 'movement.moveBackward',
    title: 'Move Backward',
    default: 'KeyS'
  }),
  moveLeft: createAction(HotkeyCategoryId.Movement, {
    id: 'movement.moveLeft',
    title: 'Move Left',
    default: 'KeyA',
    fallback: ['q']
  }),
  moveRight: createAction(HotkeyCategoryId.Movement, {
    id: 'movement.moveRight',
    title: 'Move Right',
    default: 'KeyD'
  }),
  run: createAction(HotkeyCategoryId.Movement, {
    id: 'movement.run',
    title: 'Run Modifier',
    default: 'ShiftLeft',
    aliasCodes: ['ShiftRight'],
    fallback: ['shift']
  })
} as const;

const lookActions = {
  lookLeft: createAction(HotkeyCategoryId.Look, {
    id: 'look.left',
    title: 'Look Left',
    default: 'ArrowLeft',
    fallback: ['arrowleft']
  }),
  lookRight: createAction(HotkeyCategoryId.Look, {
    id: 'look.right',
    title: 'Look Right',
    default: 'ArrowRight',
    fallback: ['arrowright']
  }),
  lookUp: createAction(HotkeyCategoryId.Look, {
    id: 'look.up',
    title: 'Look Up',
    default: 'ArrowUp',
    fallback: ['arrowup']
  }),
  lookDown: createAction(HotkeyCategoryId.Look, {
    id: 'look.down',
    title: 'Look Down',
    default: 'ArrowDown',
    fallback: ['arrowdown']
  })
} as const;

const flightActions = {
  ascend: createAction(HotkeyCategoryId.Flight, {
    id: 'flight.ascend',
    title: 'Ascend',
    default: 'Space',
    aliasCodes: ['KeyE'],
    fallback: [' ', 'space', 'spacebar', ['e', 'KeyE']]
  }),
  descend: createAction(HotkeyCategoryId.Flight, {
    id: 'flight.descend',
    title: 'Descend',
    default: 'ShiftLeft',
    aliasCodes: ['ShiftRight', 'KeyQ', 'KeyC', 'ControlLeft', 'ControlRight'],
    fallback: ['shift', ['q', 'KeyQ'], ['c', 'KeyC'], 'control', 'ctrl']
  }),
  toggle: createAction(HotkeyCategoryId.Flight, {
    id: 'flight.toggle',
    title: 'Toggle Flight',
    default: 'KeyX',
    aliasCodes: ['KeyF'],
    fallback: ['x', ['f', 'KeyF']]
  }),
  nudgeUp: createAction(HotkeyCategoryId.Flight, {
    id: 'flight.nudgeUp',
    title: 'Flight Nudge Up',
    default: 'KeyZ',
    fallback: ['z']
  })
} as const;

const debugActions = {
  toggleInspector: createAction(HotkeyCategoryId.Debug, {
    id: 'debug.toggleInspector',
    title: 'Toggle Inspector',
    default: 'KeyT',
    fallback: ['t']
  }),
  toggleStats: createAction(HotkeyCategoryId.Debug, {
    id: 'debug.toggleStats',
    title: 'Toggle Stats Overlay',
    default: 'KeyP',
    fallback: ['p']
  }),
  toggleSound: createAction(HotkeyCategoryId.Debug, {
    id: 'debug.toggleSound',
    title: 'Toggle Ambience Audio',
    default: 'KeyM',
    fallback: ['m']
  }),
  toggleSky: createAction(HotkeyCategoryId.Debug, {
    id: 'debug.toggleSky',
    title: 'Toggle Sky',
    default: 'KeyK',
    fallback: ['k']
  }),
  toggleSanityGeometry: createAction(HotkeyCategoryId.Debug, {
    id: 'debug.toggleSanityGeometry',
    title: 'Toggle Sanity Geometry',
    default: 'KeyG',
    fallback: ['g']
  })
} as const;

const devToolActions = {
  captureScreenshot: createAction(HotkeyCategoryId.DevTools, {
    id: 'dev.captureScreenshot',
    title: 'Capture Screenshot',
    default: 'F10',
    fallback: [['f10', 'F10']]
  }),
  landmarkNext: createAction(HotkeyCategoryId.DevTools, {
    id: 'dev.landmark.next',
    title: 'Select Next Landmark',
    default: 'BracketRight',
    fallback: [']', 'bracketright'],
    scope: 'dev'
  }),
  landmarkPrev: createAction(HotkeyCategoryId.DevTools, {
    id: 'dev.landmark.prev',
    title: 'Select Previous Landmark',
    default: 'BracketLeft',
    fallback: ['[', 'bracketleft'],
    scope: 'dev'
  }),
  landmarkSave: createAction(HotkeyCategoryId.DevTools, {
    id: 'dev.landmark.save',
    title: 'Save Landmark Positions',
    default: 'F9',
    fallback: [['f9', 'F9']],
    scope: 'dev'
  }),
  landmarkExit: createAction(HotkeyCategoryId.DevTools, {
    id: 'dev.landmark.exit',
    title: 'Exit Landmark Placer',
    default: 'KeyL',
    aliasCodes: ['Escape'],
    fallback: ['l', 'escape'],
    scope: 'dev'
  }),
  flyBypassToggle: createAction(HotkeyCategoryId.DevTools, {
    id: 'dev.flyBypass.toggle',
    title: 'Toggle Fly Bypass',
    default: 'Backquote',
    fallback: ['`', 'backquote'],
    scope: 'dev'
  })
} as const;

export const HOTKEY_MANIFEST = {
  movement: movementActions,
  look: lookActions,
  flight: flightActions,
  debug: debugActions,
  devTools: devToolActions
} as const;

type HotkeyManifestEntry = {
  id: string;
  title: string;
  codes: string[];
  default: string;
  scope: HotkeyScope;
};

type HotkeyDisplayContext = 'hud' | 'docs';

type HotkeyDisplayConfig = {
  id: string;
  actions: string[];
  description: string;
  contexts: HotkeyDisplayContext[];
  order?: number;
  includeAliases?: boolean;
};

type HotkeyDisplayEntry = {
  id: string;
  description: string;
  label: string;
  codes: string[];
  actions: string[];
  order: number;
};

const CODE_LABEL_OVERRIDES = new Map<string, string>([
  ['ArrowUp', '↑'],
  ['ArrowDown', '↓'],
  ['ArrowLeft', '←'],
  ['ArrowRight', '→'],
  ['ShiftLeft', 'Shift'],
  ['ShiftRight', 'Shift'],
  ['ControlLeft', 'Ctrl'],
  ['ControlRight', 'Ctrl'],
  ['AltLeft', 'Alt'],
  ['AltRight', 'Alt'],
  ['Space', 'Space'],
  ['Escape', 'Esc'],
  ['Backquote', '`']
]);

function formatKeyCode(code: string): string {
  if (typeof code !== 'string' || code === '') {
    return '';
  }
  const override = CODE_LABEL_OVERRIDES.get(code);
  if (override) {
    return override;
  }
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith('Digit') && code.length >= 6) {
    return code.slice(5);
  }
  if (code.endsWith('Arrow')) {
    return code.replace('Arrow', '');
  }
  if (code.endsWith('Left') || code.endsWith('Right')) {
    return code.replace(/Left|Right$/, '');
  }
  return code;
}

function uniquePreserveOrder<T>(values: T[]): T[] {
  const result: T[] = [];
  const seen = new Set<T>();
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

const HOTKEY_DISPLAY_CONFIG: HotkeyDisplayConfig[] = [
  {
    id: 'movement.move',
    actions: [
      movementActions.moveForward.id,
      movementActions.moveLeft.id,
      movementActions.moveBackward.id,
      movementActions.moveRight.id
    ],
    description: 'Move',
    contexts: ['hud', 'docs'],
    order: 10
  },
  {
    id: 'look.orbit',
    actions: [
      lookActions.lookLeft.id,
      lookActions.lookRight.id,
      lookActions.lookUp.id,
      lookActions.lookDown.id
    ],
    description: 'Orbit Camera',
    contexts: ['hud'],
    order: 20
  },
  {
    id: 'movement.run',
    actions: [movementActions.run.id],
    description: 'Hold to Run',
    contexts: ['hud'],
    order: 30
  },
  {
    id: 'flight.toggle',
    actions: [flightActions.toggle.id],
    description: 'Toggle Flight',
    contexts: ['hud', 'docs'],
    order: 40
  },
  {
    id: 'flight.vertical',
    actions: [flightActions.ascend.id, flightActions.descend.id],
    description: 'Fly Up / Down',
    contexts: ['hud', 'docs'],
    order: 50
  },
  {
    id: 'debug.toggleSound',
    actions: [debugActions.toggleSound.id],
    description: 'Toggle Sound',
    contexts: ['hud', 'docs'],
    order: 60
  },
  {
    id: 'debug.toggleStats',
    actions: [debugActions.toggleStats.id],
    description: 'Toggle FPS Panel',
    contexts: ['hud', 'docs'],
    order: 70
  },
  {
    id: 'debug.toggleSky',
    actions: [debugActions.toggleSky.id],
    description: 'Toggle Sky',
    contexts: ['hud', 'docs'],
    order: 80
  },
  {
    id: 'debug.toggleSanityGeometry',
    actions: [debugActions.toggleSanityGeometry.id],
    description: 'Toggle Sanity Geometry',
    contexts: ['docs'],
    order: 90
  }
];

function resolveManifestMap(manifest?: HotkeyManifestEntry[]): Map<string, HotkeyManifestEntry> {
  const map = new Map<string, HotkeyManifestEntry>();
  if (Array.isArray(manifest)) {
    for (const entry of manifest) {
      if (entry && typeof entry.id === 'string') {
        map.set(entry.id, entry);
      }
    }
  }
  return map;
}

function resolveCodesForAction(
  actionId: string,
  manifestMap: Map<string, HotkeyManifestEntry>,
  includeAliases = false
): string[] {
  const manifestEntry = manifestMap.get(actionId);
  if (manifestEntry) {
    if (includeAliases) {
      return manifestEntry.codes ?? [];
    }
    if (manifestEntry.default) {
      return [manifestEntry.default];
    }
  }
  const definition = getActionDefinition(actionId);
  if (!definition) {
    return [];
  }
  if (includeAliases) {
    return definition.codes;
  }
  return definition.default ? [definition.default] : definition.codes.slice(0, 1);
}

function buildDisplayEntry(
  config: HotkeyDisplayConfig,
  manifestMap: Map<string, HotkeyManifestEntry>
): HotkeyDisplayEntry | null {
  const codes: string[] = [];
  for (const actionId of config.actions) {
    const actionCodes = resolveCodesForAction(actionId, manifestMap, config.includeAliases);
    for (const code of actionCodes) {
      if (typeof code === 'string' && code) {
        codes.push(code);
      }
    }
  }
  if (!codes.length) {
    return null;
  }
  const formatted = uniquePreserveOrder(codes.map((code) => formatKeyCode(code)).filter(Boolean));
  if (!formatted.length) {
    return null;
  }
  return {
    id: config.id,
    description: config.description,
    label: formatted.join(' / '),
    codes: formatted,
    actions: [...config.actions],
    order: typeof config.order === 'number' ? config.order : 0
  };
}

export function getHotkeyDisplayEntries(
  context: HotkeyDisplayContext,
  manifest?: HotkeyManifestEntry[]
): HotkeyDisplayEntry[] {
  const normalizedContext = String(context) as HotkeyDisplayContext;
  const manifestMap = resolveManifestMap(manifest);
  const entries: HotkeyDisplayEntry[] = [];
  for (const config of HOTKEY_DISPLAY_CONFIG) {
    if (!config.contexts.includes(normalizedContext)) {
      continue;
    }
    const entry = buildDisplayEntry(config, manifestMap);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries.sort((a, b) => a.order - b.order);
}

const relevantKeys = new Set<string>();
for (const def of actionRegistry.values()) {
  for (const code of def.codes) {
    relevantKeys.add(code);
  }
}

const CORE_RELEVANT_CODES = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'ShiftLeft',
  'ShiftRight',
  'Space'
];

for (const code of CORE_RELEVANT_CODES) {
  relevantKeys.add(code);
}

export const RELEVANT_KEYS = relevantKeys;

const fallbackMap = new Map<string, string>();
for (const def of actionRegistry.values()) {
  for (const [key, code] of def.fallback) {
    if (!fallbackMap.has(key)) {
      fallbackMap.set(key, code);
    }
  }
}

export const KEY_FALLBACK_MAP = fallbackMap;

export const ACTION_CODES = actionCodes;
export const ACTION_REGISTRY = actionRegistry;

export const HOTKEY_AXIS_METADATA: AxisBinding[] = [
  {
    type: 'paired',
    axis: 'x',
    positive: movementActions.moveRight.id,
    negative: movementActions.moveLeft.id,
    normalizeWith: ['z']
  },
  {
    type: 'paired',
    axis: 'z',
    positive: movementActions.moveForward.id,
    negative: movementActions.moveBackward.id,
    normalizeWith: ['x']
  },
  {
    type: 'paired',
    axis: 'lookX',
    positive: lookActions.lookRight.id,
    negative: lookActions.lookLeft.id
  },
  {
    type: 'paired',
    axis: 'lookY',
    positive: lookActions.lookUp.id,
    negative: lookActions.lookDown.id
  },
  {
    type: 'binary',
    axis: 'running',
    actions: [movementActions.run.id]
  }
];

export const HOTKEY_IDS = Object.freeze({
  movement: {
    forward: movementActions.moveForward.id,
    backward: movementActions.moveBackward.id,
    left: movementActions.moveLeft.id,
    right: movementActions.moveRight.id,
    run: movementActions.run.id
  },
  look: {
    left: lookActions.lookLeft.id,
    right: lookActions.lookRight.id,
    up: lookActions.lookUp.id,
    down: lookActions.lookDown.id
  },
  flight: {
    ascend: flightActions.ascend.id,
    descend: flightActions.descend.id,
    toggle: flightActions.toggle.id,
    nudgeUp: flightActions.nudgeUp.id
  },
  debug: {
    toggleInspector: debugActions.toggleInspector.id,
    toggleStats: debugActions.toggleStats.id,
    toggleSound: debugActions.toggleSound.id,
    toggleSky: debugActions.toggleSky.id,
    toggleSanityGeometry: debugActions.toggleSanityGeometry.id
  },
  devTools: {
    captureScreenshot: devToolActions.captureScreenshot.id,
    landmark: {
      next: devToolActions.landmarkNext.id,
      prev: devToolActions.landmarkPrev.id,
      save: devToolActions.landmarkSave.id,
      exit: devToolActions.landmarkExit.id
    },
    flyBypass: {
      toggle: devToolActions.flyBypassToggle.id
    }
  }
});

export function getActionCodes(actionId: string): string[] {
  return actionCodes.get(actionId) ?? [];
}

export function getActionDefinition(actionId: string): HotkeyActionDefinition | undefined {
  return actionRegistry.get(actionId);
}

export function getActionsByScope(scope: HotkeyScope): HotkeyActionDefinition[] {
  return actionsByScope.get(scope) ?? [];
}

export type { HotkeyActionDefinition };
export type { HotkeyScope };
export type { HotkeyManifestEntry };
export type { HotkeyDisplayEntry };
