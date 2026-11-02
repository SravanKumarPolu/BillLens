/**
 * Sync service layer — Phase 7.
 *
 * Pure modules for the offline sync, conflict resolution, attachment
 * sync, notifications, activity feed, and data export subsystems.
 *
 * Each module is framework-agnostic — no React Native, no SQLite, no
 * Supabase dependencies. The application layer wraps them with ports
 * and use cases.
 */

// Prompt 61
export * from './sync-error-classifier';
export * from './operation-compaction';
export * from './retry-policy';

// Prompt 63
export * from './incremental-download';

// Prompt 64
export * from './conflict-resolution';

// Prompt 65
export * from './attachment-sync';

// Prompt 66
export * from './notification-architecture';

// Prompt 67
export * from './activity-feed';

// Prompts 68-69
export * from './data-export';
