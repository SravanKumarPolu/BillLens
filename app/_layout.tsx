/**
 * Root layout.
 *
 * Wires up the global providers that wrap every screen:
 *   1. SafeAreaProvider — required by react-native-safe-area-context.
 *   2. ThemeProvider    — resolves the persisted theme preference and
 *                         exposes it via `useTheme()`.
 *   3. QueryProvider    — wraps the app in a TanStack QueryClient context
 *                         so screens can use `useQuery` / `useMutation`
 *                         against the application-layer query functions.
 *   4. ErrorBoundary    — catches render errors anywhere downstream
 *                         and shows a user-safe fallback.
 *   5. ServicesGate     — boots the composition-root service graph once
 *                         (SQLite open + migrations + DI wiring) and arms
 *                         the offline-sync coordinator (see
 *                         `src/store/services-registry.ts`).
 *   6. OfflineBanner    — slim banner shown when the device is offline.
 *   7. StatusBar        — theme-aware status bar (light text on dark
 *                         theme, dark text on light theme).
 *   8. Stack            — expo-router root navigator.
 *
 * The Stack's `screenOptions` are derived from the theme so the header
 * and content backgrounds adapt to light/dark automatically. Individual
 * screens can override via their own `Stack.Screen` options.
 */

import { Stack as RouterStack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryProvider } from '@application/providers/query-provider';
import { ErrorBoundary } from '@presentation/components/ErrorBoundary';
import { OfflineBanner } from '@presentation/components/OfflineBanner';
import { ServicesGate } from '@presentation/components/ServicesGate';
import { Stack, ThemeProvider, useTheme } from '@presentation/design-system';
import type { Theme } from '@presentation/design-system';
import { PageHead } from '@presentation/web/PageHead';

function themedScreenOptions(theme: Theme) {
  return {
    headerStyle: { backgroundColor: theme.colors.surface },
    headerTintColor: theme.colors.textPrimary,
    headerTitleStyle: { fontWeight: '600' as const },
    contentStyle: { backgroundColor: theme.colors.background },
  };
}

function ThemedRootStack(): ReactNode {
  const theme = useTheme();
  return (
    <RouterStack screenOptions={themedScreenOptions(theme)}>
      <RouterStack.Screen name="index" options={{ headerShown: false }} />
      <RouterStack.Screen name="onboarding" options={{ headerShown: false }} />
      <RouterStack.Screen name="(tabs)" options={{ headerShown: false }} />
      <RouterStack.Screen
        name="groups/new"
        options={{ title: 'New group', presentation: 'modal' }}
      />
      <RouterStack.Screen
        name="groups/join"
        options={{ title: 'Join group', presentation: 'modal' }}
      />
      <RouterStack.Screen name="groups/[groupId]" options={{ headerShown: false }} />
      <RouterStack.Screen
        name="capture"
        // The nested capture Stack owns its headers; showing one here too
        // produced the duplicated Capture/Camera bars reported on device.
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <RouterStack.Screen
        name="expenses/new"
        options={{ title: 'New expense', presentation: 'modal' }}
      />
      <RouterStack.Screen name="expenses/[expenseId]" options={{ title: 'Expense' }} />
      <RouterStack.Screen name="search" options={{ title: 'Search expenses' }} />
      <RouterStack.Screen name="recurring/index" options={{ title: 'Recurring expenses' }} />
      <RouterStack.Screen name="recurring/new" options={{ title: 'Repeat expense', presentation: 'modal' }} />
      <RouterStack.Screen name="settings/backup" options={{ title: 'Backup and restore' }} />
      <RouterStack.Screen
        name="expenses/edit/[expenseId]"
        options={{ title: 'Edit expense', presentation: 'modal' }}
      />
      <RouterStack.Screen name="drafts/index" options={{ title: 'Drafts' }} />
      <RouterStack.Screen name="drafts/[draftId]" options={{ title: 'Review draft' }} />
      <RouterStack.Screen
        name="settlements/new"
        options={{ title: 'Settle up', presentation: 'modal' }}
      />
      <RouterStack.Screen
        name="settlements/preview"
        options={{ title: 'Settlement preview', presentation: 'modal' }}
      />
      <RouterStack.Screen
        name="modal/explanation"
        options={{ title: 'Explanation', presentation: 'modal' }}
      />
      <RouterStack.Screen
        name="settings/delete-account"
        options={{ title: 'Delete account' }}
      />
      <RouterStack.Screen
        name="settings/sync"
        options={{ title: 'Sync status' }}
      />
      <RouterStack.Screen
        name="settings/data"
        options={{ title: 'Data & storage' }}
      />
    </RouterStack>
  );
}

function ThemedStatusBar(): ReactNode {
  const theme = useTheme();
  return <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout(): ReactNode {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryProvider>
          {/* Default document title for the web build. Routes that mount
              their own `PageHead` override it; without this fallback a
              route with no metadata renders an empty <title>. */}
          <PageHead
            title="BillLens"
            description="BillLens splits shared expenses from the receipt itself: scan a bill, review the extracted values, and settle up offline-first."
          />
          <ErrorBoundary>
            <ServicesGate>
              <Stack gap={0} style={{ flex: 1 }}>
                <ThemedStatusBar />
                <OfflineBanner />
                <ThemedRootStack />
              </Stack>
            </ServicesGate>
          </ErrorBoundary>
        </QueryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
