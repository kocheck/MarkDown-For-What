/**
 * messages.ts
 *
 * Shared message type constants for communication between the plugin sandbox
 * (code.ts) and the UI iframe (ui.ts). Both bundles import from here so
 * message types are defined in a single place — a typo becomes a compile
 * error instead of a silent mismatch.
 */

// ── UI → Sandbox (requests) ──────────────────────────────────────────────────

export const MSG_GET_SETTINGS         = 'get-settings';
export const MSG_SAVE_SETTINGS        = 'save-settings';
export const MSG_RESET_SETTINGS       = 'reset-settings';
export const MSG_GET_LOCAL_STYLES     = 'get-local-styles';
export const MSG_GET_LOCAL_COMPONENTS = 'get-local-components';
export const MSG_GET_HISTORY          = 'get-history';
export const MSG_CLEAR_HISTORY        = 'clear-history';
export const MSG_IMPORT_BATCH         = 'import-markdown-batch';

// ── Sandbox → UI (responses) ─────────────────────────────────────────────────

export const MSG_STATUS           = 'status';
export const MSG_SETTINGS         = 'settings';
export const MSG_LOCAL_STYLES     = 'local-styles';
export const MSG_LOCAL_COMPONENTS = 'local-components';
export const MSG_HISTORY          = 'history';
