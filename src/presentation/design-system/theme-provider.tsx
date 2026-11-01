/**
 * ThemeProvider — resolves the user's theme preference into a concrete
 * `Theme` and supplies it through React context.
 *
 * Resolution order:
 *   1. If a `mode` prop is passed to `ThemeProvider`, it wins (useful for
 *      storybook-style isolation or forced-theming tests).
 *   2. Otherwise the persisted preference from `useThemeStore` is used.
 *   3. If the effective mode is 'system', `useColorScheme()` resolves it to
 *      'light' or 'dark' (defaulting to 'light' when the OS value is null).
 */

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useThemeStore } from '@store/theme-store';

import { darkTheme, lightTheme, ThemeContext, type Theme, type ThemeMode } from './theme';

export interface ThemeProviderProps {
  /** Optional override. Defaults to the persisted preference. */
  readonly mode?: ThemeMode;
  readonly children: ReactNode;
}

/**
 * Resolve a `ThemeMode` plus the OS colour scheme into a concrete theme.
 *
 * Pure function — extracted so it can be unit-tested without rendering.
 */
export function resolveTheme(
  mode: ThemeMode,
  systemScheme: 'light' | 'dark' | null | undefined,
): Theme {
  const resolvedMode: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  return resolvedMode === 'dark' ? darkTheme : lightTheme;
}

export function ThemeProvider({ mode, children }: ThemeProviderProps): ReactNode {
  const storeMode = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme();

  const theme = useMemo(
    () => resolveTheme(mode ?? storeMode, systemScheme),
    [mode, storeMode, systemScheme],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * Read and update the persisted theme preference.
 *
 * Returns the raw preference ('light' | 'dark' | 'system') and a setter.
 * To read the *resolved* theme (concrete colours), use `useTheme()` instead.
 */
export function useThemePreference(): { mode: ThemeMode; setMode: (mode: ThemeMode) => void } {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return { mode, setMode };
}
