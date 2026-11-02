/**
 * Spacer — empty flexible space for layout.
 *
 * `<Spacer size="md" />` adds a gap whose size comes from the spacing tokens.
 * A raw number may also be passed for one-off values.
 *
 * The spacer renders a zero-content View with both `width` and `height` set
 * to the resolved size. Inside a vertical `Stack` (default `alignItems:
 * 'stretch'`) the width is stretched to the container so only the height
 * takes effect; inside a horizontal `Row` the height is stretched so only
 * the width takes effect. This makes the same component work in both
 * directions without an explicit `orientation` prop.
 */

import type { ViewProps } from 'react-native';
import { View } from 'react-native';

import { spacing, type SpacingKey } from '../tokens';

export interface SpacerProps extends ViewProps {
  readonly size?: SpacingKey | number;
}

function resolveSize(value: SpacingKey | number | undefined): number {
  if (value === undefined) return spacing.md;
  if (typeof value === 'number') return value;
  return spacing[value];
}

export function Spacer({ size = 'md', style, ...rest }: SpacerProps): JSX.Element {
  const resolved = resolveSize(size);
  return <View style={[{ width: resolved, height: resolved }, style]} {...rest} />;
}
