/**
 * Divider — thin separator line.
 *
 * Horizontal by default (for stacking sections vertically); set
 * `orientation="vertical"` to separate items in a Row. Colour and thickness
 * come from the theme so dividers stay subtle in both light/dark modes.
 */

import type { DimensionValue, ViewProps } from 'react-native';
import { View } from 'react-native';

import { useTheme } from '../theme';

export interface DividerProps extends ViewProps {
  readonly orientation?: 'horizontal' | 'vertical';
  /** Line thickness in pixels. Default 1. */
  readonly thickness?: number;
  /** Length of the line. Defaults to '100%'. */
  readonly length?: DimensionValue;
}

export function Divider({
  orientation = 'horizontal',
  thickness = 1,
  length = '100%',
  style,
  ...rest
}: DividerProps): JSX.Element {
  const theme = useTheme();

  const baseStyle: { width: DimensionValue; height: DimensionValue } =
    orientation === 'horizontal'
      ? { width: length, height: thickness }
      : { width: thickness, height: length };

  return <View style={[baseStyle, { backgroundColor: theme.colors.border }, style]} {...rest} />;
}
