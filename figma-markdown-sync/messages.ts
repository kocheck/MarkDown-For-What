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

// ── Export (UI → Sandbox) ────────────────────────────────────────────────────

export const MSG_EXPORT_REQUEST  = 'export-request';   // UI sends selected frame IDs
export const MSG_EXPORT_DOWNLOAD = 'export-download';  // UI sends frame ID + block selections
export const MSG_GET_SELECTION   = 'get-selection';    // UI asks sandbox for current selection

// ── Export (Sandbox → UI) ────────────────────────────────────────────────────

export const MSG_EXPORT_RESULT      = 'export-result';      // Sandbox returns diff result per frame
export const MSG_EXPORT_MARKDOWN    = 'export-markdown';    // Sandbox returns assembled Markdown string
export const MSG_SELECTION_CHANGED  = 'selection-changed';  // Sandbox notifies UI of frame selection change

// ── Status message domain tags ───────────────────────────────────────────────

export const STATUS_DOMAIN_EXPORT = 'export';  // MSG_STATUS messages from the export pipeline
