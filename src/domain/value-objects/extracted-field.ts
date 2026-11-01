import type { ExtractionConfidence } from './extraction-confidence';

/**
 * A bounding box on the source image, in normalized [0, 1] coordinates
 * (or pixel coordinates — the caller decides the convention). Used to
 * draw highlight rectangles in the review UI.
 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A single extracted field with confidence, source text, and optional
 * bounding box.
 *
 * Used for every field in an ExtractionResult. The `value` may be
 * undefined if the extractor failed to detect the field at all; in that
 * case `confidence` is typically 0 and `needsReview` is true.
 *
 * The `needsReview` flag is computed at construction time from the
 * confidence — it is NOT user-editable. Once the user edits a field,
 * the caller should construct a new ExtractedField with confidence = 1
 * (or use a different type that represents user-confirmed values).
 *
 * @template T — the JS type of the value (string, number, etc.)
 */
export interface ExtractedField<T> {
  readonly value?: T;
  readonly confidence: ExtractionConfidence;
  readonly sourceText?: string;
  readonly boundingBox?: BoundingBox;
  readonly needsReview: boolean;
}

/**
 * Options for constructing an ExtractedField.
 */
export interface ExtractedFieldOptions {
  readonly sourceText?: string;
  readonly boundingBox?: BoundingBox;
}

/**
 * Construct an ExtractedField.
 *
 * The `needsReview` flag is auto-computed: true iff confidence is below
 * the high-confidence threshold (0.85).
 *
 * If `value` is undefined, the resulting field is still valid — it
 * represents a field the extractor failed to detect. Callers should
 * still treat it as `needsReview`.
 */
export function createExtractedField<T>(
  value: T | undefined,
  confidence: ExtractionConfidence,
  options?: ExtractedFieldOptions,
): ExtractedField<T> {
  const c = confidence as number;
  // HIGH_CONFIDENCE_THRESHOLD is 0.85; duplicated locally to avoid an
  // import cycle (extracted-field ← extraction-confidence).
  const review = c < 0.85;
  return {
    ...(value !== undefined ? { value } : {}),
    confidence,
    ...(options?.sourceText !== undefined ? { sourceText: options.sourceText } : {}),
    ...(options?.boundingBox !== undefined ? { boundingBox: options.boundingBox } : {}),
    needsReview: review,
  };
}

/**
 * Type guard — does the extracted field have a non-undefined value?
 *
 * Narrows `ExtractedField<T>` to `ExtractedField<T> & { readonly value: T }`.
 */
export function hasValue<T>(
  field: ExtractedField<T>,
): field is ExtractedField<T> & { readonly value: T } {
  return field.value !== undefined;
}
