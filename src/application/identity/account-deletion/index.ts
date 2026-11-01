/**
 * Account deletion — Phase 8 Prompt 77 (store readiness).
 *
 * Public surface for the in-app account deletion flow:
 *   - RequestAccountDeletionUseCase  (schedule cloud deletion / guest wipe)
 *   - CancelAccountDeletionUseCase   (recovery-window reversal)
 *   - GetAccountDeletionStatusUseCase (read model for screens)
 *   - AccountDeletionRepository, LocalDataWiper (ports)
 */

export type {
  AccountDeletionRepository,
  LocalDataWiper,
} from './account-deletion.port';

export {
  RequestAccountDeletionUseCase,
  type RequestAccountDeletionInput,
  type RequestAccountDeletionOutput,
} from './request-account-deletion.usecase';

export {
  CancelAccountDeletionUseCase,
  GetAccountDeletionStatusUseCase,
  type CancelAccountDeletionInput,
  type CancelAccountDeletionOutput,
  type GetAccountDeletionStatusInput,
  type GetAccountDeletionStatusOutput,
} from './cancel-account-deletion.usecase';
