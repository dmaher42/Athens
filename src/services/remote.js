import { USE_REMOTE } from '../config/flags.ts';
import { logger } from '../utils/logger.ts';

/**
 * Initialize optional remote integrations without blocking rendering.
 * @param {unknown} context Optional context for remote hooks.
 * @returns {Promise<void> | void}
 */
export async function maybeRemoteInit(context) {
  if (!USE_REMOTE) return;

  try {
    void context;
    // Remote integrations are currently disabled. Add guarded logic here when needed.
  } catch (error) {
    logger.warn('[remote disabled]', error);
  }
}
