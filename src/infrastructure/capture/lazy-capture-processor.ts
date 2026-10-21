/**
 * LazyCaptureProcessor — defers OCR provider construction until it is
 * actually needed.
 *
 * Boot only needs SQLite and the first screen. Resolving the OCR provider
 * (mock/remote selection, image reader, remote client) is optional work;
 * this proxy lets the composition root inject a processor without paying
 * that cost at launch.
 *
 * `warmUp()` is called after the first interactions so the first real
 * capture usually finds the provider ready, without blocking startup.
 */

import type {
  CaptureProcessOptions,
  CaptureProcessor,
  CaptureProcessorInput,
} from '@domain/ports/capture-processor.port';
import type { ExtractionResult } from '@domain/entities/extraction-result';

export interface ResolvedCaptureProcessor {
  readonly processor: CaptureProcessor;
  readonly mode: 'mock' | 'remote' | 'unavailable';
  readonly reason: string;
}

export class LazyCaptureProcessor implements CaptureProcessor {
  private resolved: ResolvedCaptureProcessor | null = null;
  private pending: Promise<ResolvedCaptureProcessor> | null = null;

  constructor(private readonly loader: () => Promise<ResolvedCaptureProcessor>) {}

  /** Resolve once; concurrent calls share one load. */
  async resolve(): Promise<ResolvedCaptureProcessor> {
    if (this.resolved !== null) return this.resolved;
    if (this.pending === null) {
      this.pending = this.loader()
        .then((value) => {
          this.resolved = value;
          return value;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }

  async process(
    input: CaptureProcessorInput,
    options?: CaptureProcessOptions,
  ): Promise<ExtractionResult> {
    const resolved = await this.resolve();
    return resolved.processor.process(input, options);
  }

  /** True once the provider is constructed (diagnostics/tests). */
  isResolved(): boolean {
    return this.resolved !== null;
  }
}
