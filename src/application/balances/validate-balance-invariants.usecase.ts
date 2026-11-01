import {
  validateBalanceInvariants,
  type BalanceInvariantFailure,
} from '@domain/services/balances/balance-engine';
import type { GroupId } from '@shared-types/index';


import { type GetGroupBalancesUseCase } from './get-group-balances.usecase';

/**
 * Use case: Validate the per-currency zero-sum invariant for a group.
 *
 * Phase 6 Prompt 51 — required use case `ValidateBalanceInvariantsUseCase`.
 *
 * Loads the group's balances and runs `validateBalanceInvariants`
 * from the balance engine. Returns an array of failures (one per
 * currency that does not balance). Empty array = every currency
 * honours the zero-sum invariant.
 *
 * Spec rule (Prompt 51): "For every group and currency: sum of all
 * member net balances = 0. Fail loudly in development and record a
 * safe integrity event in production if the invariant breaks. Do
 * not silently insert a balancing adjustment."
 *
 * In development, callers should assert the failure list is empty
 * after every financial mutation. In production, a non-empty failure
 * list should be recorded as a safe integrity event (no payment
 * data, no PII) and surfaced to the UI as a "balance integrity
 * warning" — never silently fixed.
 */
export class ValidateBalanceInvariantsUseCase {
  constructor(private readonly getGroupBalances: GetGroupBalancesUseCase) {}

  async execute(
    input: ValidateBalanceInvariantsInput,
  ): Promise<ValidateBalanceInvariantsOutput> {
    const groupResult = await this.getGroupBalances.execute({
      groupId: input.groupId,
    });
    if (groupResult.notFound) {
      return { notFound: true, failures: [] };
    }
    const failures = validateBalanceInvariants(groupResult.results);
    return { notFound: false, failures };
  }
}

export interface ValidateBalanceInvariantsInput {
  readonly groupId: GroupId;
}

export interface ValidateBalanceInvariantsOutput {
  /** True if the group does not exist or the caller lacks access. */
  readonly notFound: boolean;
  /** Empty if every currency balances; non-empty if any currency is corrupted. */
  readonly failures: readonly BalanceInvariantFailure[];
}
