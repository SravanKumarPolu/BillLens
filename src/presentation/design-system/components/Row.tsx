/**
 * Row — horizontal flexbox container with consistent gap between children.
 *
 * Companion to `Stack`. Use for inline layouts (icon + label, action bars).
 */

import type { FlexAlignType, ViewProps } from 'react-native';
import { View } from 'react-native';

import { spacing, type SpacingKey } from '../tokens';

export interface RowProps extends ViewProps {
  /** Gap between children. Accepts a token key or a raw pixel number. */
  readonly gap?: SpacingKey | number;
  /** Cross-axis alignment of children. Maps to `alignItems`. */
  readonly align?: FlexAlignType;
}

function resolveSpace(value: SpacingKey | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number') return value;
  return spacing[value];
}

export function Row({ gap = 'md', align = 'center', style, ...rest }: RowProps): JSX.Element {
  const resolvedGap = resolveSpace(gap, spacing.md);
  return <View style={[{ flexDirection: 'row', gap: resolvedGap, alignItems: align }, style]} {...rest} />;
}
