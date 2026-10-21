/**
 * BillLens design-system barrel.
 *
 * Re-exports every token, theme, helper, hook and foundational component so
 * consumers can import from a single entry point:
 *
 *   import { Text, Card, Button, useTheme, lightTheme } from '@presentation/design-system';
 *
 * Note: importing this barrel pulls in `ThemeProvider`, which reads the
 * persisted theme preference from the Zustand store (backed by
 * AsyncStorage). Pure logic tests that only need tokens / formatting should
 * import the individual modules (`./tokens`, `./financial-format`,
 * `./theme`) to avoid the storage dependency.
 */

// Tokens
export type {
  BorderRadiusKey,
  ColorTokens,
  ShadowTokens,
  SpacingKey,
  TypographyTokens,
} from './tokens';
export {
  borderRadius,
  breakpoints,
  darkColors,
  iconSizes,
  layoutWidth,
  lightColors,
  motion,
  opacity,
  shadows,
  spacing,
  touchTargets,
  typography,
  zIndex,
} from './tokens';

// Theme + provider
export type { Theme, ThemeMode } from './theme';
export { darkTheme, lightTheme, ThemeContext, useTheme } from './theme';
export { resolveTheme, ThemeProvider, useThemePreference } from './theme-provider';
export type { ThemeProviderProps } from './theme-provider';

// Financial formatting
export type { FinancialSign, FormattedAmount } from './financial-format';
export { describeAmount, formatAmount, getCurrencyDecimals, getIcon, getLabel, getSymbol } from './financial-format';

// Components
export { AmountText } from './components/AmountText';
export type { AmountTextProps, AmountVariant } from './components/AmountText';
export { Avatar } from './components/Avatar';
export type { AvatarProps, AvatarSize } from './components/Avatar';
export { Badge } from './components/Badge';
export type { BadgeProps, BadgeVariant } from './components/Badge';
export { BentoGrid, BentoItem, computeBentoTileWidth } from './components/BentoGrid';
export type { BentoGridProps, BentoItemProps } from './components/BentoGrid';
export { Button } from './components/Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './components/Button';
export { Card } from './components/Card';
export type { CardElevation, CardProps } from './components/Card';
export { Divider } from './components/Divider';
export type { DividerProps } from './components/Divider';
export { Icon } from './components/Icon';
export type { IconProps } from './components/Icon';
export { IconButton } from './components/IconButton';
export type {
  IconButtonProps,
  IconButtonSize,
  IconButtonVariant,
} from './components/IconButton';
export { Row } from './components/Row';
export type { RowProps } from './components/Row';
export { Screen } from './components/Screen';
export type { ScreenProps } from './components/Screen';
export { Skeleton } from './components/Skeleton';
export type { SkeletonProps } from './components/Skeleton';
export { Spacer } from './components/Spacer';
export type { SpacerProps } from './components/Spacer';
export { Stack } from './components/Stack';
export type { StackProps } from './components/Stack';
export { StatusDot } from './components/StatusDot';
export type { StatusDotProps, StatusDotVariant } from './components/StatusDot';
export { Text } from './components/Text';
export type { TextColor, TextPropsExtended, TextVariant } from './components/Text';
