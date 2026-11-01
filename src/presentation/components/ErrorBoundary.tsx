/**
 * ErrorBoundary — global React error boundary.
 *
 * Catches render-time errors anywhere in its child subtree and shows a
 * user-safe fallback screen instead of a red box / crash.
 *
 * Behaviour:
 *   - In development (`isDevEnv()` truthy), the fallback shows the error
 *     message and stack so engineers can diagnose quickly.
 *   - In production, the fallback shows a generic "Something went
 *     wrong" message — technical details are NEVER exposed to end
 *     users (they would leak internals and confuse non-engineers).
 *
 * Actions:
 *   - "Retry" — clears the error state and re-renders the children.
 *   - "Go Home" — navigates to the home tab via expo-router's
 *     imperative API.
 *
 * This component is intentionally a class component — React still
 * requires `componentDidCatch` / `getDerivedStateFromError` on a class
 * to function as an error boundary; there is no hooks-based
 * equivalent yet.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Component } from 'react';

import { isDevEnv } from '@config/env';

import { Button } from '../design-system/components/Button';
import { Card } from '../design-system/components/Card';
import { Screen } from '../design-system/components/Screen';
import { Stack } from '../design-system/components/Stack';
import { Text } from '../design-system/components/Text';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info.componentStack);
  }

  private readonly handleRetry = (): void => {
    this.setState({ error: null });
  };

  private readonly handleGoHome = (): void => {
    this.setState({ error: null });
    router.replace('/(tabs)');
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const showStack = isDevEnv();

    return (
      <Screen safeArea>
        <Stack gap="xl" align="stretch" style={{ flex: 1, justifyContent: 'center' }}>
          <Card elevation="md" padding="xxl">
            <Stack gap="md" align="stretch">
              <Text variant="sectionTitle" color="negative">
                {showStack ? 'Render Error' : 'Something went wrong'}
              </Text>
              <Text variant="body" color="secondary">
                {showStack
                  ? error.message
                  : 'An unexpected error occurred. You can retry or return to the home screen.'}
              </Text>
              {showStack && error.stack ? (
                <Text variant="caption" color="muted" style={{ fontFamily: 'monospace' }}>
                  {error.stack}
                </Text>
              ) : null}
            </Stack>
          </Card>
          <Stack gap="sm" align="stretch">
            <Button
              label="Retry"
              variant="primary"
              onPress={this.handleRetry}
              accessibilityLabel="Retry loading the screen"
            />
            <Button
              label="Go Home"
              variant="secondary"
              onPress={this.handleGoHome}
              accessibilityLabel="Return to the home screen"
            />
          </Stack>
        </Stack>
      </Screen>
    );
  }
}
