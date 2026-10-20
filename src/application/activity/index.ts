/**
 * Activity application layer.
 *
 * Use cases that build the unified recent-activity timeline across
 * the user's groups.
 *
 *   ListRecentActivityUseCase — merge expenses + settlements across
 *     every group, ordered by timestamp DESC. Returns the unified
 *     timeline view model the Activity tab renders.
 */

export * from './list-recent-activity.usecase';
