import { KEY_FALLBACK_MAP } from '../config/hotkeys.ts';

export function resolveEventCode(event) {
  const code = typeof event?.code === 'string' && event.code !== 'Unidentified' ? event.code : '';
  if (code) {
    return code;
  }
  const key = typeof event?.key === 'string' ? event.key.toLowerCase() : '';
  if (!key) {
    return '';
  }
  return KEY_FALLBACK_MAP.get(key) || '';
}

export function shouldIgnoreKeyEvent(event) {
  const target = event?.target;
  if (!target || typeof target !== 'object') {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }
  return false;
}
