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
    fallback: ['w', 'z']
  }),
  moveBackward: createAction(HotkeyCategoryId.Movement, {
    id: 'movement.moveBackward',
    title: 'Move Backward',
    default: 'KeyS',
    fallback: ['s']
  }),
  moveLeft: createAction(HotkeyCategoryId.Movement, {
    id: 'movement.moveLeft',
    title: 'Move Left',
    default: 'KeyA',
    fallback: ['a', 'q']
  }),
  moveRight: createAction(HotkeyCategoryId.Movement, {
    id: 'movement.moveRight',
    title: 'Move Right',
    default: 'KeyD',
    fallback: ['d']
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
    default: 'KeyQ',
    aliasCodes: ['KeyC', 'ControlLeft', 'ControlRight'],
    fallback: ['q', ['c', 'KeyC'], 'control', 'ctrl']
  }),
  toggle: createAction(HotkeyCategoryId.Flight, {
    id: 'flight.toggle',
    title: 'Toggle Flight',
    default: 'KeyF',
    aliasCodes: ['KeyX'],
    fallback: ['f', ['x', 'KeyX']]
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
    default: 'KeyY',
    fallback: ['y']
  })
} as const;

const devToolActions = {
  captureScreenshot: createAction(HotkeyCategoryId.DevTools, {
    id: 'dev.captureScreenshot',
    title: 'Capture Screenshot',
    default: 'KeyP',
    fallback: ['p']
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

const relevantKeys = new Set<string>();
for (const def of actionRegistry.values()) {
  for (const code of def.codes) {
    relevantKeys.add(code);
  }
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
    positive: movementActions.moveBackward.id,
    negative: movementActions.moveForward.id,
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
    toggleStats: debugActions.toggleStats.id
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
