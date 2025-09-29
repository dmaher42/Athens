import { USE_REMOTE } from '../config/flags.js';

/**
 * Optional remote initialization hook. Disabled in production builds.
 * Wrap any Google Apps Script or other external service calls here when needed.
 */
export async function maybeRemoteInit() {
  if (!USE_REMOTE) {
    return false;
  }

  try {
    // Remote integrations are disabled by default. Add opt-in logic here when USE_REMOTE is true.
    return true;
  } catch (error) {
    console.warn('[remote] disabled or failing:', error);
    return false;
  }
}
