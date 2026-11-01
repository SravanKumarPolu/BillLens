/**
 * Barrel for the experiments application module.
 */

export {
  AssignVariantUseCase,
  type AssignVariantInput,
  type AssignVariantOutput,
} from './assign-variant.usecase';

export {
  GetExperimentResultsUseCase,
  type GetExperimentResultsInput,
  type GetExperimentResultsOutput,
} from './get-experiment-results.usecase';

export {
  type ExperimentAssignment,
  type ExperimentRepository,
  type VariantCount,
} from './experiment-repository.port';
