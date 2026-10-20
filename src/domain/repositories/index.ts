// Domain repository interfaces barrel.
//
// All repository interfaces are declared in the DOMAIN layer. The
// infrastructure layer (src/infrastructure/repositories/) provides
// concrete implementations. The application layer (src/application/)
// depends on these interfaces, never on concrete implementations.
//
// HARD RULE: domain repository interfaces must NOT import from React,
// React Native, Expo, Supabase, SQLite, or any storage-specific library.
// They may import from:
//   - @shared-types/* (branded ID types)
//   - ../value-objects/* (Money, CurrencyCode, DateTime, VersionNumber, etc.)
//   - ../entities/* (domain entities)
//   - ../errors/* (domain errors)

export * from './repository-contracts';
export * from './user.repository';
export * from './guest-identity.repository';
export * from './group.repository';
export * from './group-member.repository';
export * from './group-invite.repository';
export * from './expense.repository';
export * from './receipt.repository';
export * from './settlement.repository';
export * from './audit.repository';
export * from './sync.repository';
export * from './device-installation.repository';
export * from './linked-auth-identity.repository';
export * from './unit-of-work';
export * from './queries';

// Capture intelligence layer (Prompt 7)
export * from './expense-draft.repository';
export * from './capture-source.repository';
export * from './extraction-result.repository';
export * from './payment-evidence.repository';
export * from './privacy-preference.repository';
export * from './duplicate-candidate.repository';

// Phase 6 Track 4 — UPI-assisted settlement payment handles
export * from './payment-handle.repository';

// Phase 6 Track 6 — Settlement reminders
export * from './settlement-reminder.repository';
