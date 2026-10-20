/**
 * BillLens theme.
 *
 * A `Theme` bundles a resolved colour set (`light` or `dark`) with the full
 * token catalogue (typography, spacing, radius, shadows, motion, …). Themes
 * are immutable plain objects — components read them via `useTheme()`.
 *
 * `ThemeMode` is the *user preference* ('light' | 'dark' | 'system'). The
 * `ThemeProvider` (see `theme-provider.tsx`) resolves 'system' to a concrete
 * 'light' or 'dark' mode using `useColorScheme()` and supplies the matching
 * `Theme` through React context.
 */

import { createContext, useContext } from 'react';

import type { ColorTokens } from './tokens';
import {
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

/** User-selectable theme preference. 'system' follows the OS setting. */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * A fully resolved theme. `mode` is always concrete ('light' | 'dark') —
 * 'system' is resolved upstream by the provider.
 */
export interface Theme {
  readonly mode: 'light' | 'dark';
  readonly colors: ColorTokens;
  readonly typography: typeof typography;
  readonly spacing: typeof spacing;
  readonly borderRadius: typeof borderRadius;
  readonly shadows: typeof shadows;
  readonly motion: typeof motion;
  readonly opacity: typeof opacity;
  readonly iconSizes: typeof iconSizes;
  readonly touchTargets: typeof touchTargets;
  readonly layoutWidth: typeof layoutWidth;
  readonly breakpoints: typeof breakpoints;
  readonly zIndex: typeof zIndex;
}

export const lightTheme: Theme = {
  mode: 'light',
  colors: lightColors,
  typography,
  spacing,
  borderRadius,
  shadows,
  motion,
  opacity,
  iconSizes,
  touchTargets,
  layoutWidth,
  breakpoints,
  zIndex,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: darkColors,
  typography,
  spacing,
  borderRadius,
  shadows,
  motion,
  opacity,
  iconSizes,
  touchTargets,
  layoutWidth,
  breakpoints,
  zIndex,
};

/**
 * React context holding the active theme. Defaults to `lightTheme` so that
 * components rendered without a provider (e.g. in isolated tests) still
 * receive a valid theme rather than `undefined`.
 */
export const ThemeContext = createContext<Theme>(lightTheme);

/** Read the active theme. Must be called within a `ThemeProvider` tree. */
export const useTheme = (): Theme => useContext(ThemeContext);
