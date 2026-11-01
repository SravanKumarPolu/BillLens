import type { MemberId } from '@shared-types/index';

import type { SplitType } from '../../entities/expense';
import { InvalidSplitError } from '../../errors/index';
import { type Money } from '../../value-objects/money';

import { EqualSplitStrategy, type EqualSplitInput, calculateEqualSplit } from './equal-split-strategy';
import {
  ExactSplitStrategy,
  type ExactSplitInput,
  calculateExactSplit,
} from './exact-split-strategy';
import {
  ItemSplitStrategy,
  type ItemSplitCharge,
  type ItemSplitInput,
  type ItemSplitLineItem,
  calculateItemSplit,
} from './item-split-strategy';
import {
  PercentageSplitStrategy,
  type PercentageSplitInput,
  calculatePercentageSplit,
} from './percentage-split-strategy';
import {
  ShareSplitStrategy,
  type ShareSplitInput,
  calculateShareSplit,
} from './share-split-strategy';
import type { SplitResult } from './split-strategy';

/**
 * Unified split engine. Dispatches to the correct strategy based on
 * `splitType` and the configuration provided.
 *
 * Each method is a thin wrapper around the corresponding strategy class,
 * provided for ergonomic use from application use cases.
 */
export const SplitEngine = {
  equal(input: EqualSplitInput): SplitResult {
    return new EqualSplitStrategy().calculate(input);
  },

  exact(input: ExactSplitInput): SplitResult {
    return new ExactSplitStrategy().calculate(input);
  },

  percentage(input: PercentageSplitInput): SplitResult {
    return new PercentageSplitStrategy().calculate(input);
  },

  shares(input: ShareSplitInput): SplitResult {
    return new ShareSplitStrategy().calculate(input);
  },

  items(input: ItemSplitInput): SplitResult {
    return new ItemSplitStrategy().calculate(input);
  },
} as const;

/**
 * Convenience function: dispatch to the correct strategy based on split type.
 * Useful when the caller has a discriminated input shape (e.g. from a form).
 */
export interface SplitEngineDispatchInput {
  readonly totalAmount: Money;
  readonly participantIds: readonly MemberId[];
  readonly splitType: SplitType;
  readonly exactAmounts?: readonly Money[];
  readonly basisPoints?: readonly number[];
  readonly shareUnits?: readonly number[];
  readonly lineItems?: readonly ItemSplitLineItem[];
  readonly charges?: readonly ItemSplitCharge[];
}

export function calculateSplit(input: SplitEngineDispatchInput): SplitResult {
  switch (input.splitType) {
    case 'equal':
      return calculateEqualSplit(input.totalAmount, input.participantIds);
    case 'exact':
      if (!input.exactAmounts) {
        throw new InvalidSplitError('Exact split requires `exactAmounts`');
      }
      return calculateExactSplit(input.totalAmount, input.participantIds, input.exactAmounts);
    case 'percentage':
      if (!input.basisPoints) {
        throw new InvalidSplitError('Percentage split requires `basisPoints`');
      }
      return calculatePercentageSplit(input.totalAmount, input.participantIds, input.basisPoints);
    case 'shares':
      if (!input.shareUnits) {
        throw new InvalidSplitError('Share split requires `shareUnits`');
      }
      return calculateShareSplit(input.totalAmount, input.participantIds, input.shareUnits);
    case 'items':
      if (!input.lineItems) {
        throw new InvalidSplitError('Item split requires `lineItems`');
      }
      return calculateItemSplit(
        input.totalAmount,
        input.participantIds,
        input.lineItems,
        input.charges,
      );
    default:
      throw new InvalidSplitError(`Unknown split type: ${input.splitType}`);
  }
}

// Re-export everything for ergonomic imports.
export * from './split-strategy';
export * from './equal-split-strategy';
export * from './exact-split-strategy';
export * from './percentage-split-strategy';
export * from './share-split-strategy';
export * from './item-split-strategy';
