/**
 * Icon — thin wrapper around Ionicons that accepts a plain string name.
 *
 * All other design-system components accept `icon?: string` so that callers
 * don't need to import the Ionicons glyph-map type. This helper centralises
 * the cast in one place.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactElement } from 'react';
import type { ColorValue } from 'react-native';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface IconProps {
  /** Ionicons glyph name, e.g. "checkmark-circle". */
  readonly name: string;
  /** Pixel size. Defaults to the theme `iconSizes.md` (20). */
  readonly size?: number;
  /** Icon colour. Accepts the same strings as RN `color`. */
  readonly color?: ColorValue;
}

export function Icon({ name, size = 20, color }: IconProps): ReactElement {
  return <Ionicons name={name as IoniconName} size={size} color={color} />;
}
