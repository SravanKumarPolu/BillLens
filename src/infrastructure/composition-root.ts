/**
 * Composition root — the ONE place where concrete implementations are
 * wired to interfaces (docs/architecture-boundaries.md §7).
 *
 * This module is the only file allowed to import application-layer use
 * cases AND instantiate infrastructure adapters, passing the latter into
 * the former through their constructor-injected ports. Everywhere else,
 * use cases receive their dependencies via injection and never see
 * concrete infrastructure classes.
 *
 * Design rules honoured here:
 *
 *   1. PURE WIRING — no React, no expo-native imports, no side effects.
 *      Every production adapter that touches a native module (expo-sqlite,
 *      expo-secure-store) is injected by the caller (see
 *      `src/store/services-registry.ts`, the app-start bootstrap). This
 *      keeps the root unit-testable with in-memory adapters.
 *
 *   2. ONLY EXISTING IMPLEMENTATIONS are wired. The write-side entity
 *      repositories (groups, members, expenses, drafts, settlements,
 *      audit) are exposed through the `repositories` bucket, and the
 *      settlement lifecycle / manual-expense / monitoring use cases ride
 *      on them through their dedicated buckets below. Ports still
 *      without a production implementation (GuestIdentityRepository,
 *      UserIdentityRepository, AccountDeletionRepository,
 *      AuthenticationProvider) remain intentionally absent — they are
 *      wired in the same additive manner once their adapters land
 *      (they require the provisioned Supabase project). Nothing is
 *      faked.
 *
 *   3. DEFAULT ADAPTERS that are pure JS (Supabase remote sync, Expo
 *      connectivity polling, UnavailableCaptureProcessor (fail-loud), SessionStorage over an
 *      injected SecureStorage) are constructed here when the caller does
 *      not supply overrides.
 */

import { ListRecentActivityUseCase } from '@application/activity/index';
import type {
  LocalNotificationPort,
  OutstandingReminderStore,
  RemotePushPort,
} from '@application/notifications/notification-capability.port';
import { RefreshOutstandingReminderUseCase } from '@application/notifications/refresh-outstanding-reminder.usecase';
import {
  GetBalanceBreakdownUseCase,
  GetGroupBalancesUseCase,
  GetGroupCurrencySummariesUseCase,
  GetMemberBalanceUseCase,
  GetUnsettledMembersUseCase,
  RecalculateGroupBalancesUseCase,
  ValidateBalanceInvariantsUseCase,
} from '@application/balances/index';
import {
  DiscardExpenseDraftUseCase,
  GetExpenseDraftUseCase,
  ProcessCaptureUseCase,
  SaveExpenseDraftReviewUseCase,
  type ImageDataReader,
  type ImageHasher,
} from '@application/capture/index';
import {
  CreateExpenseFromDraftUseCase,
  CreateExpenseManuallyUseCase,
  GetExpenseDetailUseCase,
  ListRecentExpensesForGroupUseCase,
} from '@application/expenses/index';
import { SearchExpensesUseCase } from '@application/expenses/search-expenses.usecase';
import {
  CreateRecurringExpenseFromExpenseUseCase,
  DeleteRecurringExpenseUseCase,
  ListRecurringExpensesUseCase,
  MaterializeRecurringExpensesUseCase,
  SetRecurringExpensePausedUseCase,
} from '@application/recurring/recurring-expenses.usecases';
import { UpdateExpenseUseCase } from '@application/expenses/update-expense.usecase';
import { VoidExpenseUseCase } from '@application/expenses/void-expense.usecase';
import { ExportLocalDataUseCase } from '@application/export/export-local-data.usecase';
import { AssessRetentionUseCase } from '@application/retention/assess-retention.usecase';
import { DeleteLocalGroupCopyUseCase } from '@application/retention/delete-local-group-copy.usecase';
import {
  CompareOriginalAndSimplifiedPlanUseCase,
  ExplainMemberCreditUseCase,
  ExplainMemberDebtUseCase,
  GenerateSettlementSuggestionsUseCase,
  GetSuggestedTransferExplanationUseCase,
  PreviewSettlementImpactUseCase,
} from '@application/explanations/index';
import {
  PromptAppStoreReviewUseCase,
  SubmitFeedbackUseCase,
  SubmitNpsSurveyUseCase,
} from '@application/feedback/index';
import { CreateGroupUseCase } from '@application/groups/create-group.usecase';
import { ListGroupMembersUseCase } from '@application/groups/list-group-members.usecase';
import {
  CancelAccountDeletionUseCase,
  GetAccountDeletionStatusUseCase,
  RequestAccountDeletionUseCase,
} from '@application/identity/account-deletion';
import type {
  AccountDeletionRepository,
  LocalDataWiper,
} from '@application/identity/account-deletion/account-deletion.port';
import { AuthService } from '@application/identity/auth-service';
import type { AuthStateWriter } from '@application/identity/auth-service';
import { CreateGuestIdentityUseCase } from '@application/identity/create-guest-identity.usecase';
import { LoadCurrentIdentityUseCase } from '@application/identity/load-current-identity.usecase';
import { UpdateGuestDisplayNameUseCase } from '@application/identity/update-guest-display-name.usecase';
import {
  GetMetricsDashboardUseCase,
  RecordMetricUseCase,
} from '@application/monitoring/index';
import {
  CancelSettlementUseCase,
  ConfirmSettlementUseCase,
  CreateSettlementDraftUseCase,
  DisputeSettlementUseCase,
  GetSettlementUseCase,
  ListDisputedSettlementsUseCase,
  ListPendingConfirmationsUseCase,
  ListSettlementsUseCase,
  RecordSettlementUseCase,
  RejectSettlementUseCase,
  RequestSettlementUseCase,
  ResolveDisputeUseCase,
  ReverseSettlementUseCase,
} from '@application/settlements/index';
import { DownloadCoordinator } from '@application/sync/download-coordinator';
import type { RemoteChangeApplier } from '@application/sync/remote-change-applier.port';
import { SyncCoordinator } from '@application/sync/sync-coordinator';
import type { ConnectivityPort, RemoteSyncPort } from '@application/sync/sync-coordinator-types';
import type { AuthenticationProvider } from '@domain/ports/authentication-provider.port';
import type { CaptureProcessor } from '@domain/ports/capture-processor.port';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { CaptureSourceRepository } from '@domain/repositories/capture-source.repository';
import type { ExpenseDraftRepository } from '@domain/repositories/expense-draft.repository';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { ExtractionResultRepository } from '@domain/repositories/extraction-result.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { SyncCursorRepository } from '@domain/repositories/sync-cursor.repository';
import type { SyncRepository } from '@domain/repositories/sync.repository';
import type { IncrementalDownloadPort } from '@domain/services/sync/incremental-download';

import { UnavailableCaptureProcessor } from './capture/unavailable-capture-processor';
import { ExpoConnectivityPort } from './connectivity/expo-connectivity-port';
import { UnavailableLocalNotificationPort } from './notifications/unavailable-local-notification-port';
import { SqliteOutstandingReminderStore } from './sqlite/sqlite-outstanding-reminder-store';
import { GuestAuthenticationProvider } from './remote/guest-authentication-provider';
import { SupabaseIncrementalDownloadPort } from './remote/supabase-incremental-download-port';
import { SupabaseRemoteSyncPort } from './remote/supabase-remote-sync-port';
import { SessionStorage } from './security/session-storage';
import type { DatabaseConnection } from './sqlite/database-connection';
import { SqliteAccountDeletionRepository } from './sqlite/sqlite-account-deletion-repository';
import { SqliteAuditRepository } from './sqlite/sqlite-audit-repository';
import { SqliteBalanceQueryPort } from './sqlite/sqlite-balance-query-port';
import { SqliteCaptureSourceRepository } from './sqlite/sqlite-capture-source-repository';
import { SqliteExpenseDraftRepository } from './sqlite/sqlite-expense-draft-repository';
import { SqliteExpenseRepository } from './sqlite/sqlite-expense-repository';
import { SqliteExpenseSearchRepository } from './sqlite/sqlite-expense-search-repository';
import { SqliteRecurringExpenseRepository } from './sqlite/sqlite-recurring-expense-repository';
import { SqliteReceiptRepository } from './sqlite/sqlite-receipt-repository';
import {
  CreateBackupUseCase,
  InspectBackupUseCase,
  RestoreBackupUseCase,
} from '@application/backup/backup.usecases';
import { SqliteBackupStore } from './sqlite/sqlite-backup-store';
import { ExpoBackupAttachmentStore } from './backup/expo-backup-attachment-store';
import { SqliteGroupManagementStore } from './sqlite/sqlite-group-management-store';
import {
  AddGroupMemberUseCase,
  ArchiveGroupUseCase,
  DeleteGroupUseCase,
  GetGroupDeletionSummaryUseCase,
  GetGroupUseCase,
  RemoveGroupMemberUseCase,
  RenameGroupMemberUseCase,
  RestoreGroupUseCase,
  UpdateGroupUseCase,
} from '@application/groups/group-management.usecases';
import { ProcessFileCleanupQueueUseCase } from '@application/backup/file-cleanup.usecases';
import { RetentionCleanupUseCase } from '@application/retention/retention-cleanup.usecase';
import { WipeAllLocalDataUseCase } from '@application/retention/wipe-local-data.usecase';
import {
  DeleteReceiptUseCase,
  ListReceiptHistoryUseCase,
} from '@application/receipts/receipt-history.usecases';
import { SqliteLocalDataWipe } from './sqlite/sqlite-local-data-wipe';
import { ExpoRetentionCleanupStore } from './retention/expo-retention-cleanup-store';
import { SqliteFileCleanupStore } from './sqlite/sqlite-file-cleanup-store';
import { removeLocalImage } from '@utils/local-image';
import { SqliteExtractionResultRepository } from './sqlite/sqlite-extraction-result-repository';
import { SqliteFeedbackRepository } from './sqlite/sqlite-feedback-repository';
import { SqliteGroupMemberRepository } from './sqlite/sqlite-group-member-repository';
import { SqliteGroupRepository } from './sqlite/sqlite-group-repository';
import { SqliteGuestIdentityRepository } from './sqlite/sqlite-guest-identity-repository';
import { SqliteMetricRepository } from './sqlite/sqlite-metric-repository';
import { SqliteSettlementRepository } from './sqlite/sqlite-settlement-repository';
import { SqliteUnitOfWork } from './sqlite/sqlite-unit-of-work';
import { SqliteRemoteChangeApplier } from './sync/sqlite-remote-change-applier';
import { SqliteSyncConflictRepository } from './sync/sqlite-sync-conflict-repository';
import { SqliteSyncCursorRepository } from './sync/sqlite-sync-cursor-repository';
import { SqliteLocalGroupPurge } from './sqlite/sqlite-local-group-purge';
import { SqliteSyncRepository } from './sync/sqlite-sync-repository';

// ---------------------------------------------------------------------------
// Public service surface
// ---------------------------------------------------------------------------

/**
 * Balance use cases wired to the local SQLite balance query port.
 * All seven Phase 6 balance use cases share one `GetGroupBalancesUseCase`
 * instance (the derived use cases compose it), so a single injected
 * query port serves the whole bucket.
 */
export interface BalanceServices {
  readonly getGroupBalances: GetGroupBalancesUseCase;
  readonly getMemberBalance: GetMemberBalanceUseCase;
  readonly getBalanceBreakdown: GetBalanceBreakdownUseCase;
  readonly getGroupCurrencySummaries: GetGroupCurrencySummariesUseCase;
  readonly getUnsettledMembers: GetUnsettledMembersUseCase;
  readonly recalculateGroupBalances: RecalculateGroupBalancesUseCase;
  readonly validateBalanceInvariants: ValidateBalanceInvariantsUseCase;
}

/** Explanation use cases (Prompt 56) wired to the same balance query port. */
export interface ExplanationServices {
  readonly generateSettlementSuggestions: GenerateSettlementSuggestionsUseCase;
  readonly previewSettlementImpact: PreviewSettlementImpactUseCase;
  readonly explainMemberDebt: ExplainMemberDebtUseCase;
  readonly explainMemberCredit: ExplainMemberCreditUseCase;
  readonly getSuggestedTransferExplanation: GetSuggestedTransferExplanationUseCase;
  readonly compareOriginalAndSimplifiedPlan: CompareOriginalAndSimplifiedPlanUseCase;
}

/**
 * Offline-sync services (Phase 7). The coordinator is constructed but
 * NOT started — starting it subscribes to connectivity events and recovers
 * stuck operations, which is the bootstrap's explicit decision (see
 * `startSyncCoordinator()` on the registry).
 */
export interface SyncServices {
  readonly coordinator: SyncCoordinator;
  /**
   * The queue repository — v2.5.0: exposed so the app-state store can
   * poll the REAL pending / needs-review counts for the sync status UI
   * (previously the counters were written by nothing and the UI showed
   * "All synced" regardless of queue state).
   */
  readonly repository: SyncRepository;
  /**
   * v2.6.0 — the CLOUD→DEVICE half of the bidirectional sync:
   * incremental, cursor-based, conflict-aware. Exposed so the app can
   * trigger a manual full re-sync (`resetCursors`) and diagnostics can
   * inspect per-collection checkpoints.
   */
  readonly downloadCoordinator: DownloadCoordinator;
  /**
   * v2.6.0 — unresolved sync conflicts (both upload- and download-
   * detected). Backs the conflict-review surface in the sync settings.
   */
  readonly conflicts: SqliteSyncConflictRepository;
  /**
   * v2.6.0 — the remote-change applier behind the download engine.
   * Exposed so the conflict-resolution use case executes on the SAME
   * instance the engine uses (one graph, no divergent state).
   */
  readonly resolveApplier: RemoteChangeApplier;
}

/** Capture pipeline services. */
export interface CaptureServices {
  /**
   * The selected `CaptureProcessor` (mock offline / remote OCR proxy).
   * Chosen by `resolveOcrProvider` in the services registry — the
   * composition root accepts it as an override for testability.
   */
  readonly processor: CaptureProcessor;
  /** Orchestrates capture → OCR → persisted draft (v2.4.0). */
  readonly processCapture: ProcessCaptureUseCase;
  /** Persists review-screen edits (optimistic-concurrency guarded). */
  readonly saveDraftReview: SaveExpenseDraftReviewUseCase;
  /** Loads a persisted draft for review (deep-link / focus hydration). */
  readonly getDraft: GetExpenseDraftUseCase;
  /** Persists a draft discard (v2.26.0: durable, not store-only). */
  readonly discardDraft: DiscardExpenseDraftUseCase;
  /** Atomic draft → Expense confirmation (version-guarded + idempotent). */
  readonly createExpenseFromDraft: CreateExpenseFromDraftUseCase;
  /** Technical pre-flight image quality checks (size/format). */
  readonly repositories: CaptureRepositories;
}

/** Capture-layer persistence ports (local-only by design). */
export interface CaptureRepositories {
  readonly captureSources: CaptureSourceRepository;
  readonly extractionResults: ExtractionResultRepository;
}

/** Session persistence services (auth token storage). */
export interface SessionServices {
  readonly sessionStorage: SessionStoragePort;
}

/**
 * Identity services (v2.4.0): the durable LOCAL guest identity, the
 * auth service (when a provider is configured), and the full account
 * deletion flow. All local-first — cloud adapters attach when the
 * Supabase project is configured.
 */
export interface IdentityServices {
  /** Local guest identity persistence. */
  readonly guestIdentities: GuestIdentityRepository;
  /** Create the durable guest identity at onboarding (idempotent guard). */
  readonly createGuestIdentity: CreateGuestIdentityUseCase;
  /** Load cloud → guest → none identity precedence. */
  readonly loadCurrentIdentity: LoadCurrentIdentityUseCase;
  /** Rename the local guest identity. */
  readonly updateGuestDisplayName: UpdateGuestDisplayNameUseCase;
  /**
   * Cloud auth service — NULL when no AuthenticationProvider is wired
   * (guest mode). Never faked.
   */
  readonly authService: AuthService | null;
  /** Account-deletion flow (guest wipe / scheduled cloud deletion). */
  readonly accountDeletion: AccountDeletionServices;
}

export interface AccountDeletionServices {
  readonly requestDeletion: RequestAccountDeletionUseCase;
  readonly cancelDeletion: CancelAccountDeletionUseCase;
  readonly getStatus: GetAccountDeletionStatusUseCase;
  /** Destructive local wipe (images + SQLite + SecureStore + stores). */
  readonly localWiper: LocalDataWiper;
  readonly repository: AccountDeletionRepository;
}

/**
 * Write-side entity repositories. Each is the production SQLite adapter
 * for its domain contract; every entity mutation is atomic and
 * co-enqueues its offline-sync operation (see `sync-op-writer.ts`).
 *
 * Presentation does NOT consume these directly — screens reach use
 * cases through the services registry; the repositories back the
 * application use cases that consume them.
 */
export interface RepositoryServices {
  readonly groups: GroupRepository;
  readonly members: GroupMemberRepository;
  readonly expenses: ExpenseRepository;
  readonly drafts: ExpenseDraftRepository;
  readonly receipts: SqliteReceiptRepository;
  /** Settlement write-side adapter (state machine + reversal + history). */
  readonly settlements: SettlementRepository;
  /** Append-only audit trail (backs every financial use case). */
  readonly audit: AuditRepository;
}

/**
 * Manual expense-form services (the `/expenses/new` write path) plus the
 * group home screen's recent-expenses read path and the expense-detail
 * read path (`/expenses/[expenseId]`).
 */
export interface RecurringServices {
  readonly createFromExpense: CreateRecurringExpenseFromExpenseUseCase;
  readonly materializeDue: MaterializeRecurringExpensesUseCase;
  readonly list: ListRecurringExpensesUseCase;
  readonly setPaused: SetRecurringExpensePausedUseCase;
  readonly remove: DeleteRecurringExpenseUseCase;
}

export interface BackupServices {
  readonly create: CreateBackupUseCase;
  readonly inspect: InspectBackupUseCase;
  readonly restore: RestoreBackupUseCase;
}

export interface ExpenseServices {
  readonly createExpenseManually: CreateExpenseManuallyUseCase;
  readonly searchExpenses: SearchExpensesUseCase;
  readonly listRecentExpenses: ListRecentExpensesForGroupUseCase;
  readonly getExpenseDetail: GetExpenseDetailUseCase;
  readonly voidExpense: VoidExpenseUseCase;
  readonly updateExpense: UpdateExpenseUseCase;
}

/** Group read + write services (member picker, group header, create-group write path). */
export interface GroupServices {
  readonly listGroupMembers: ListGroupMembersUseCase;
  readonly createGroup: CreateGroupUseCase;
  readonly get: GetGroupUseCase;
  readonly update: UpdateGroupUseCase;
  readonly archive: ArchiveGroupUseCase;
  readonly restore: RestoreGroupUseCase;
  readonly deletionSummary: GetGroupDeletionSummaryUseCase;
  readonly deleteGroup: DeleteGroupUseCase;
  readonly addMember: AddGroupMemberUseCase;
  readonly renameMember: RenameGroupMemberUseCase;
  readonly removeMember: RemoveGroupMemberUseCase;
  readonly cleanup: ProcessFileCleanupQueueUseCase;
}

/**
 * Settlement lifecycle use cases (Phase 6 Track 1 state machine + Track 5
 * confirmation/dispute flows) wired to the SQLite write-side adapters.
 */
export interface SettlementServices {
  readonly createSettlementDraft: CreateSettlementDraftUseCase;
  readonly requestSettlement: RequestSettlementUseCase;
  readonly recordSettlement: RecordSettlementUseCase;
  readonly confirmSettlement: ConfirmSettlementUseCase;
  readonly rejectSettlement: RejectSettlementUseCase;
  readonly cancelSettlement: CancelSettlementUseCase;
  readonly disputeSettlement: DisputeSettlementUseCase;
  readonly resolveDispute: ResolveDisputeUseCase;
  readonly reverseSettlement: ReverseSettlementUseCase;
  readonly getSettlement: GetSettlementUseCase;
  readonly listSettlements: ListSettlementsUseCase;
  readonly listPendingConfirmations: ListPendingConfirmationsUseCase;
  readonly listDisputedSettlements: ListDisputedSettlementsUseCase;
}

/**
 * Production-monitoring services (Prompt 81) over the local, redacted
 * metric-sample cache. The cloud aggregation backend is deferred until
 * the Supabase project is provisioned.
 */
export interface MonitoringServices {
  readonly recordMetric: RecordMetricUseCase;
  readonly getMetricsDashboard: GetMetricsDashboardUseCase;
}

/**
 * User-feedback services (Prompt 82) over the local, redacted feedback
 * store. The manual feedback surface (general / feature request / bug
 * report) is reachable from Settings → "Send feedback"; NPS and the App
 * Store review prompt are driven by their eligibility guards. The cloud
 * feedback backend (support ticket creation, cross-user aggregation) is
 * deferred until the Supabase project is provisioned.
 */
export interface FeedbackServices {
  readonly submitFeedback: SubmitFeedbackUseCase;
  readonly submitNpsSurvey: SubmitNpsSurveyUseCase;
  readonly promptAppStoreReview: PromptAppStoreReviewUseCase;
}

/**
 * Activity-feed services. The unified recent-activity timeline across
 * all of the user's groups (expenses + settlements merged by timestamp
 * DESC). Backs the Activity tab.
 */
export interface ActivityServices {
  readonly listRecentActivity: ListRecentActivityUseCase;
}

/**
 * The fully-wired application service surface exposed to the app.
 *
 * Presentation reaches this object ONLY through the services registry
 * (`src/store/services-registry.ts`) — never by importing this module
 * directly (the presentation → infrastructure boundary stays closed).
 */
/** Local data portability and retention. */
export interface ReceiptServices {
  readonly listHistory: ListReceiptHistoryUseCase;
  readonly deleteReceipt: DeleteReceiptUseCase;
}

export interface DataServices {
  readonly exportLocalData: ExportLocalDataUseCase;
  readonly assessRetention: AssessRetentionUseCase;
  readonly deleteLocalGroupCopy: DeleteLocalGroupCopyUseCase;
  readonly retentionCleanup: RetentionCleanupUseCase;
  readonly wipeAll: WipeAllLocalDataUseCase;
}

export interface AppServices {
  readonly database: DatabaseConnection;
  readonly balances: BalanceServices;
  readonly explanations: ExplanationServices;
  readonly sync: SyncServices;
  readonly capture: CaptureServices;
  readonly session: SessionServices | null;
  /**
   * Identity services — null when the caller did not provide secure
   * storage (pure test harnesses). Like `session`, nothing else breaks;
   * identity-dependent screens null-check.
   */
  readonly identity: IdentityServices | null;
  readonly repositories: RepositoryServices;
  readonly expenses: ExpenseServices;
  readonly recurring: RecurringServices;
  readonly backup: BackupServices;
  readonly groups: GroupServices;
  readonly settlements: SettlementServices;
  readonly monitoring: MonitoringServices;
  readonly feedback: FeedbackServices;
  readonly activity: ActivityServices;
  readonly notifications: NotificationServices;
  readonly data: DataServices;
  readonly receipts: ReceiptServices;
}

/**
 * Notification services. Local reminders are always available (the
 * decision + persistence path is runtime-independent); `push` is null
 * unless the bootstrap explicitly wires it, because remote push is
 * optional and must never block local use.
 */
export interface NotificationServices {
  readonly outstandingReminder: RefreshOutstandingReminderUseCase;
  readonly localNotifications: LocalNotificationPort;
  readonly push: RemotePushPort | null;
}

// ---------------------------------------------------------------------------
// Input / overrides
// ---------------------------------------------------------------------------

export interface CompositionRootInput {
  /**
   * The local database connection. REQUIRED — the caller decides whether
   * this is the production expo-sqlite adapter or an in-memory database
   * (tests). The root never opens a database itself.
   */
  readonly database: DatabaseConnection;
  /** Override the connectivity port (default: ExpoConnectivityPort). */
  readonly connectivity?: ConnectivityPort;
  /** Override the remote sync port (default: SupabaseRemoteSyncPort). */
  readonly remoteSync?: RemoteSyncPort;
  /**
   * Override the remote download feed (v2.6.0, bidirectional sync;
   * default: SupabaseIncrementalDownloadPort). Tests inject an
   * in-memory feed here.
   */
  readonly remoteDownload?: IncrementalDownloadPort;
  /**
   * Override the sync cursor store (v2.6.0; default: SQLite
   * sync_cursors). Tests inject an in-memory store here.
   */
  readonly syncCursors?: SyncCursorRepository;
  /**
   * Override the remote change applier (v2.6.0; default: the SQLite
   * reconcileChange-driven applier).
   */
  readonly remoteChangeApplier?: RemoteChangeApplier;
  /**
   * Override the capture processor. Default: `UnavailableCaptureProcessor`
   * (v2.5.0) — a missing processor FAILS LOUDLY with a typed
   * NOT_CONFIGURED error instead of silently serving mock OCR data.
   * The production bootstrap always injects the resolved provider.
   */
  readonly captureProcessor?: CaptureProcessor;
  /**
   * Image ports for the capture pipeline. REQUIRED for the pipeline —
   * the production bootstrap injects the expo-file-system/crypto
   * adapters; tests inject fakes. (v2.4.0)
   */
  readonly imageReader?: ImageDataReader;
  readonly imageHasher?: ImageHasher;
  /**
   * Cloud auth provider (Supabase when configured). When omitted the
   * identity bucket runs in guest mode with the honest
   * GuestAuthenticationProvider null-object. (v2.4.0)
   */
  readonly authProvider?: AuthenticationProvider;
  /**
   * Zustand auth-store writer (wired by the services registry — the
   * root itself stays store-agnostic). Required for AuthService.
   */
  readonly authStateWriter?: AuthStateWriter;
  /**
   * Destructive local wipe for account deletion. Defaults to
   * ExpoLocalDataWiper when the root was built with a database + secure
   * storage. (v2.4.0)
   */
  readonly localWiper?: LocalDataWiper;
  /**
   * SHA-256 of the guest device secret (expo-crypto in production).
   * The default is a NON-cryptographic fallback for pure-JS harnesses —
   * the production bootstrap MUST inject the expo-crypto hash.
   */
  readonly hashDeviceSecret?: (input: string) => Promise<string>;
  /** App version recorded in exported backups. Defaults to '0.0.0'. */
  readonly appVersion?: string;
  /**
   * Provide the device secure storage to wire the session bucket. When
   * omitted (tests / unauthenticated harnesses), `session` is null and
   * auth-token persistence is simply not wired — nothing breaks.
   */
  readonly secureStorage?: SecureStorage;
  /** Supabase project URL (default: read from SUPABASE_URL env). */
  readonly supabaseUrl?: string;
  /** Supabase anon key (default: read from SUPABASE_ANON_KEY env). */
  readonly supabaseAnonKey?: string;
  /**
   * Notification adapters. The composition root never imports Expo
   * native modules (see the header rules), so the defaults are a
   * hermetic "unsupported" capability plus the SQLite reminder store;
   * the production bootstrap injects `ExpoLocalNotificationPort`.
   */
  readonly notifications?: {
    readonly capability?: LocalNotificationPort;
    readonly store?: OutstandingReminderStore;
    readonly push?: RemotePushPort | null;
  };
}

// ---------------------------------------------------------------------------
// The root
// ---------------------------------------------------------------------------

/**
 * Build the complete `AppServices` graph.
 *
 * Pure factory — safe to call from tests with in-memory adapters, safe to
 * call twice (each call produces an independent graph; share one instance
 * via the services registry).
 */
export function createCompositionRoot(input: CompositionRootInput): AppServices {
  const { database } = input;

  const generateId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  };

  // --- Infrastructure adapters (one per port) -------------------------------
  const balanceQuery = new SqliteBalanceQueryPort(database);
  const syncRepository = new SqliteSyncRepository(database);
  const connectivity = input.connectivity ?? new ExpoConnectivityPort();
  const remoteSync =
    input.remoteSync ?? new SupabaseRemoteSyncPort(input.supabaseUrl, input.supabaseAnonKey);
  // v2.6.0 — bidirectional sync: the download feed (Supabase), the
  // cursor store (SQLite, migration 0007) and the remote change
  // applier (reconcileChange-driven writes that never echo back to
  // the upload queue). When no remote sync port override was given,
  // the download port shares the Supabase env configuration; tests
  // can inject both through the same overrides.
  const conflictRepository = new SqliteSyncConflictRepository(database);
  const remoteDownload =
    input.remoteDownload ?? new SupabaseIncrementalDownloadPort(input.supabaseUrl, input.supabaseAnonKey);
  const cursorRepository = input.syncCursors ?? new SqliteSyncCursorRepository(database);
  const remoteChangeApplier =
    input.remoteChangeApplier ?? new SqliteRemoteChangeApplier(database, conflictRepository);
  const downloadCoordinator = new DownloadCoordinator(
    remoteDownload,
    remoteChangeApplier,
    cursorRepository,
  );
  // v2.5.0: the default capture processor is the UNAVAILABLE adapter —
  // never the mock. Sample OCR data must not be able to reach the review
  // UI through a forgotten injection; an unconfigured provider surfaces
  // as an explicit "Receipt scanning unavailable" state instead.
  const captureProcessor = input.captureProcessor ?? new UnavailableCaptureProcessor();

  // --- Capture-layer persistence adapters (v2.4.0) --------------------------
  const captureSourcesRepo = new SqliteCaptureSourceRepository(database);
  const extractionResultsRepo = new SqliteExtractionResultRepository(database);

  // --- Application use cases (constructor injection only) -------------------
  const getGroupBalances = new GetGroupBalancesUseCase(balanceQuery);

  const balances: BalanceServices = {
    getGroupBalances,
    getMemberBalance: new GetMemberBalanceUseCase(getGroupBalances),
    getBalanceBreakdown: new GetBalanceBreakdownUseCase(getGroupBalances),
    getGroupCurrencySummaries: new GetGroupCurrencySummariesUseCase(getGroupBalances),
    getUnsettledMembers: new GetUnsettledMembersUseCase(getGroupBalances),
    recalculateGroupBalances: new RecalculateGroupBalancesUseCase(getGroupBalances),
    validateBalanceInvariants: new ValidateBalanceInvariantsUseCase(getGroupBalances),
  };

  const explanations: ExplanationServices = {
    generateSettlementSuggestions: new GenerateSettlementSuggestionsUseCase(balanceQuery),
    previewSettlementImpact: new PreviewSettlementImpactUseCase(balanceQuery),
    explainMemberDebt: new ExplainMemberDebtUseCase(balanceQuery),
    explainMemberCredit: new ExplainMemberCreditUseCase(balanceQuery),
    getSuggestedTransferExplanation: new GetSuggestedTransferExplanationUseCase(balanceQuery),
    compareOriginalAndSimplifiedPlan: new CompareOriginalAndSimplifiedPlanUseCase(balanceQuery),
  };

  const sync: SyncServices = {
    coordinator: new SyncCoordinator(syncRepository, connectivity, remoteSync, undefined, downloadCoordinator),
    repository: syncRepository,
    /** v2.6.0 — the download half of the bidirectional sync. */
    downloadCoordinator,
    /** v2.6.0 — pull-conflict records (user review surface). */
    conflicts: conflictRepository,
    /** v2.6.0 — the applier instance behind the download engine. */
    resolveApplier: remoteChangeApplier,
  };

  const session: SessionServices | null = input.secureStorage
    ? { sessionStorage: new SessionStorage(input.secureStorage) }
    : null;

  const repositories: RepositoryServices = {
    groups: new SqliteGroupRepository(database),
    members: new SqliteGroupMemberRepository(database),
    expenses: new SqliteExpenseRepository(database),
    drafts: new SqliteExpenseDraftRepository(database),
    receipts: new SqliteReceiptRepository(database),
    settlements: new SqliteSettlementRepository(database),
    audit: new SqliteAuditRepository(database),
  };

  // --- Notifications -------------------------------------------------------
  // The reminder decision is persisted in SQLite regardless of whether this
  // runtime can present it (migration 0013). The capability is injected:
  // the production bootstrap passes the Expo adapter, unit harnesses keep
  // the hermetic default and never import expo-notifications.
  const localNotifications =
    input.notifications?.capability ?? new UnavailableLocalNotificationPort();
  const notifications: NotificationServices = {
    outstandingReminder: new RefreshOutstandingReminderUseCase({
      capability: localNotifications,
      store: input.notifications?.store ?? new SqliteOutstandingReminderStore(database),
    }),
    localNotifications,
    push: input.notifications?.push ?? null,
  };

  // --- Capture pipeline (v2.4.0) -------------------------------------------
  // The OCR processor is chosen by the services registry via
  // `resolveOcrProvider` (mock offline / remote Edge-Function proxy) and
  // injected through `captureProcessor`. The image ports come from the
  // bootstrap (expo-file-system / expo-crypto adapters). When either is
  // missing (pure unit harnesses), the pipeline use case is not wired —
  // fail-loud beats a silently broken pipeline.
  const unitOfWork = new SqliteUnitOfWork(database);
  const capture: CaptureServices =
    input.imageReader !== undefined && input.imageHasher !== undefined
      ? {
          processor: captureProcessor,
          processCapture: new ProcessCaptureUseCase(
            captureSourcesRepo,
            extractionResultsRepo,
            repositories.drafts,
            captureProcessor,
            input.imageReader,
            input.imageHasher,
          ),
          saveDraftReview: new SaveExpenseDraftReviewUseCase(repositories.drafts),
          getDraft: new GetExpenseDraftUseCase(repositories.drafts),
          discardDraft: new DiscardExpenseDraftUseCase(repositories.drafts),
          createExpenseFromDraft: new CreateExpenseFromDraftUseCase(unitOfWork),
          repositories: {
            captureSources: captureSourcesRepo,
            extractionResults: extractionResultsRepo,
          },
        }
      : {
          processor: captureProcessor,
          processCapture: unavailablePipeline(),
          saveDraftReview: new SaveExpenseDraftReviewUseCase(repositories.drafts),
          getDraft: new GetExpenseDraftUseCase(repositories.drafts),
          discardDraft: new DiscardExpenseDraftUseCase(repositories.drafts),
          createExpenseFromDraft: new CreateExpenseFromDraftUseCase(unitOfWork),
          repositories: {
            captureSources: captureSourcesRepo,
            extractionResults: extractionResultsRepo,
          },
        };

  // Settlement lifecycle use cases share the settlement + audit adapters.
  const settlements: SettlementServices = {
    createSettlementDraft: new CreateSettlementDraftUseCase(
      repositories.settlements,
      repositories.audit,
      repositories.members,
      repositories.groups,
    ),
    requestSettlement: new RequestSettlementUseCase(
      repositories.settlements,
      repositories.audit,
    ),
    recordSettlement: new RecordSettlementUseCase(
      repositories.settlements,
      repositories.audit,
    ),
    confirmSettlement: new ConfirmSettlementUseCase(
      repositories.settlements,
      repositories.audit,
    ),
    rejectSettlement: new RejectSettlementUseCase(
      repositories.settlements,
      repositories.audit,
    ),
    cancelSettlement: new CancelSettlementUseCase(
      repositories.settlements,
      repositories.audit,
    ),
    disputeSettlement: new DisputeSettlementUseCase(
      repositories.settlements,
      repositories.audit,
    ),
    resolveDispute: new ResolveDisputeUseCase(
      repositories.settlements,
      repositories.audit,
    ),
    reverseSettlement: new ReverseSettlementUseCase(
      repositories.settlements,
      repositories.audit,
      // v2.5.0: the reversal pair (reversal record + original
      // transition) commits in ONE transaction — a crash between the
      // two writes previously left balances double-counted.
      unitOfWork,
    ),
    getSettlement: new GetSettlementUseCase(repositories.settlements),
    listSettlements: new ListSettlementsUseCase(repositories.settlements),
    listPendingConfirmations: new ListPendingConfirmationsUseCase(
      repositories.settlements,
    ),
    listDisputedSettlements: new ListDisputedSettlementsUseCase(
      repositories.settlements,
    ),
  };

  // Manual expense form + group home reads + expense detail.
  const expenseSearchRepository = new SqliteExpenseSearchRepository(database);

  const expenses: ExpenseServices = {
    searchExpenses: new SearchExpensesUseCase(expenseSearchRepository),
    createExpenseManually: new CreateExpenseManuallyUseCase(
      repositories.groups,
      repositories.members,
      repositories.expenses,
      repositories.audit,
    ),
    listRecentExpenses: new ListRecentExpensesForGroupUseCase(
      repositories.groups,
      repositories.members,
      repositories.expenses,
    ),
    updateExpense: new UpdateExpenseUseCase(
      repositories.groups,
      repositories.members,
      repositories.expenses,
      repositories.audit,
      generateId,
    ),
    voidExpense: new VoidExpenseUseCase(
      repositories.groups,
      repositories.members,
      repositories.expenses,
      repositories.audit,
      generateId,
    ),
    getExpenseDetail: new GetExpenseDetailUseCase(
      repositories.expenses,
      repositories.members,
    ),
  };

  const recurringRepository = new SqliteRecurringExpenseRepository(database);
  const recurring: RecurringServices = {
    createFromExpense: new CreateRecurringExpenseFromExpenseUseCase(
      repositories.expenses,
      recurringRepository,
      generateId,
    ),
    materializeDue: new MaterializeRecurringExpensesUseCase(
      recurringRepository,
      expenses.createExpenseManually,
    ),
    list: new ListRecurringExpensesUseCase(recurringRepository),
    setPaused: new SetRecurringExpensePausedUseCase(recurringRepository),
    remove: new DeleteRecurringExpenseUseCase(recurringRepository),
  };

  const backupStore = new SqliteBackupStore(database);
  const backupAttachments = new ExpoBackupAttachmentStore();
  const backup: BackupServices = {
    create: new CreateBackupUseCase(backupStore, backupAttachments, input.appVersion ?? '0.0.0'),
    inspect: new InspectBackupUseCase(backupStore),
    restore: new RestoreBackupUseCase(backupStore, backupAttachments),
  };

  const groupManagementStore = new SqliteGroupManagementStore(database);
  const groups: GroupServices = {
    get: new GetGroupUseCase(repositories.groups),
    update: new UpdateGroupUseCase(repositories.groups, groupManagementStore),
    archive: new ArchiveGroupUseCase(repositories.groups),
    restore: new RestoreGroupUseCase(repositories.groups),
    deletionSummary: new GetGroupDeletionSummaryUseCase(
      repositories.groups,
      repositories.members,
      groupManagementStore,
    ),
    deleteGroup: new DeleteGroupUseCase(repositories.groups, groupManagementStore),
    addMember: new AddGroupMemberUseCase(repositories.groups, repositories.members, generateId),
    renameMember: new RenameGroupMemberUseCase(repositories.members, repositories.groups),
    removeMember: new RemoveGroupMemberUseCase(
      repositories.members,
      groupManagementStore,
      repositories.groups,
    ),
    cleanup: new ProcessFileCleanupQueueUseCase(
      new SqliteFileCleanupStore(database),
      removeLocalImage,
    ),
    listGroupMembers: new ListGroupMembersUseCase(
      repositories.groups,
      repositories.members,
    ),
    createGroup: new CreateGroupUseCase(
      repositories.groups,
      repositories.members,
      repositories.audit,
    ),
  };

  // Prompt 81 monitoring over the local redacted metric cache.
  const metricRepository = new SqliteMetricRepository(database);
  const monitoring: MonitoringServices = {
    recordMetric: new RecordMetricUseCase(metricRepository),
    getMetricsDashboard: new GetMetricsDashboardUseCase(metricRepository),
  };

  // Prompt 82 feedback over the local redacted feedback store. The same
  // adapter backs both ports (feedback persistence + review-prompt ledger).
  const feedbackRepository = new SqliteFeedbackRepository(database);
  const feedback: FeedbackServices = {
    submitFeedback: new SubmitFeedbackUseCase(feedbackRepository),
    submitNpsSurvey: new SubmitNpsSurveyUseCase(feedbackRepository),
    promptAppStoreReview: new PromptAppStoreReviewUseCase(feedbackRepository),
  };

  // Activity feed — the unified recent-activity timeline across all
  // groups. Shares the existing member + expense + settlement
  // repositories (no new write-side adapter needed).
  const activity: ActivityServices = {
    listRecentActivity: new ListRecentActivityUseCase(
      repositories.members,
      repositories.expenses,
      repositories.settlements,
    ),
  };

  // --- Identity services (v2.4.0) -----------------------------------------
  // Local guest identity + account deletion work offline; cloud auth
  // attaches only when a provider was injected. Nothing is faked — the
  // guest-mode provider fails loudly on cloud-only operations. Without
  // secure storage the whole bucket is null (pure test harnesses).
  const guestIdentities = new SqliteGuestIdentityRepository(database);
  const authProvider =
    input.authProvider ??
    new GuestAuthenticationProvider();
  const sessionStorage = session?.sessionStorage ?? null;


  const identity: IdentityServices | null =
    input.secureStorage === undefined
      ? null
      : {
      guestIdentities,
      createGuestIdentity: new CreateGuestIdentityUseCase(
        guestIdentities,
        input.secureStorage,
        repositories.audit,
        input.hashDeviceSecret ??
        // Fallback digest for pure-JS harnesses ONLY — the production
        // bootstrap injects expo-crypto SHA-256 (see services-registry).
        (async (input: string) => `fnv:${simpleDigest(input)}`),
        generateSecret,
        generateId,
      ),
      loadCurrentIdentity: new LoadCurrentIdentityUseCase(
        guestIdentities,
        input.secureStorage,
      ),
      updateGuestDisplayName: new UpdateGuestDisplayNameUseCase(
        guestIdentities,
        repositories.audit,
        generateId,
      ),
      authService:
        sessionStorage !== null && input.authStateWriter !== undefined
        ? new AuthService(
            authProvider,
            sessionStorage,
            input.authStateWriter,
            repositories.audit,
            guestIdentities,
            generateId,
          )
        : null,
      accountDeletion: {
        requestDeletion: new RequestAccountDeletionUseCase(
        authProvider,
        sessionStorage ?? notAvailableSessionStorage(),
        new SqliteAccountDeletionRepository(database),
        input.localWiper ?? notAvailableLocalWiper(),
        guestIdentities,
        input.secureStorage,
        repositories.audit,
        generateId,
        ),
        cancelDeletion: new CancelAccountDeletionUseCase(
        new SqliteAccountDeletionRepository(database),
        repositories.audit,
        generateId,
        ),
        getStatus: new GetAccountDeletionStatusUseCase(
        new SqliteAccountDeletionRepository(database),
        ),
        localWiper: input.localWiper ?? notAvailableLocalWiper(),
        repository: new SqliteAccountDeletionRepository(database),
      },
        };

  return {
    database,
    balances,
    explanations,
    sync,
    capture,
    session,
    identity,
    repositories,
    expenses,
    recurring,
    backup,
    groups,
    settlements,
    monitoring,
    feedback,
    activity,
    notifications,
    receipts: {
      listHistory: new ListReceiptHistoryUseCase(
        repositories.receipts,
        repositories.groups,
      ),
      deleteReceipt: new DeleteReceiptUseCase(
        repositories.receipts,
        new ExpoRetentionCleanupStore(database),
      ),
    },
    data: {
      exportLocalData: new ExportLocalDataUseCase(
        repositories.groups,
        repositories.members,
        repositories.expenses,
        repositories.settlements,
        input.appVersion ?? '0.0.0',
      ),
      assessRetention: new AssessRetentionUseCase(
        repositories.groups,
        repositories.expenses,
        repositories.settlements,
        balances.getGroupBalances,
        settlements.listPendingConfirmations,
        sync.repository,
      ),
      deleteLocalGroupCopy: new DeleteLocalGroupCopyUseCase(
        repositories.groups,
        balances.getGroupBalances,
        settlements.listPendingConfirmations,
        new SqliteLocalGroupPurge(database),
        repositories.audit,
        generateId,
      ),
      retentionCleanup: new RetentionCleanupUseCase(
        new ExpoRetentionCleanupStore(database),
      ),
      wipeAll: new WipeAllLocalDataUseCase(new SqliteLocalDataWipe(database)),
    },
  };
}

function notAvailableSessionStorage(): SessionStoragePort {
  return {
    saveSession: async () => {
      throw new Error('Session storage is not wired (no secure storage was provided).');
    },
    loadSession: async () => null,
    clearSession: async () => {},
  };
}

function notAvailableLocalWiper(): LocalDataWiper {
  return {
    wipeAllLocalData: async () => {
      throw new Error(
        'Local data wipe is not wired — inject ExpoLocalDataWiper (production).',
      );
    },
  };
}

/** Deterministic non-cryptographic fallback digest (tests only paths). */
function simpleDigest(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    h1 = (h1 ^ input.charCodeAt(i)) >>> 0;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 = (h2 + input.charCodeAt(i) * (i + 1)) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

/** 32+ char device secret from Web Crypto when available. */
function generateSecret(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${crypto.randomUUID()}${crypto.randomUUID()}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random()
    .toString(36)
    .slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * Fail-loud stub for harnesses that did not inject the image ports —
 * calling the pipeline explains exactly what is missing instead of
 * throwing an opaque undefined-adapter error.
 */
function unavailablePipeline(): ProcessCaptureUseCase {
  const message =
    'ProcessCaptureUseCase is not wired: the composition root was built ' +
    'without imageReader/imageHasher (test harness). Inject ExpoImageDataReader ' +
    '/ ExpoImageHasher (production) or fakes (tests).';
  return {
    execute: async () => {
      throw new Error(message);
    },
  } as unknown as ProcessCaptureUseCase;
}
