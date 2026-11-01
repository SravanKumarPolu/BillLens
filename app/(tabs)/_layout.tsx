/**
 * Tab bar layout.
 *
 * Four tabs: Home, Groups, Activity, Settings. Theme-aware tab bar
 * colours. A `CaptureFab` is overlaid on the tab bar so the user can
 * start a capture from anywhere in the main app.
 *
 * The CaptureFab is rendered as a sibling of the Tabs (inside the
 * wrapping `Stack`) and is absolutely positioned at the bottom centre.
 */

import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';

import { CaptureFab } from '@presentation/components/CaptureFab';
import { useOutstandingReminders } from '@presentation/notifications/use-outstanding-reminders';
import { Icon, Stack, useTheme } from '@presentation/design-system';

interface TabConfig {
  readonly name: string;
  readonly title: string;
  readonly icon: string;
  readonly accessibilityLabel: string;
}

const TABS: readonly TabConfig[] = [
  {
    name: 'index',
    title: 'Home',
    icon: 'home',
    accessibilityLabel: 'Home tab — dashboard and quick capture',
  },
  {
    name: 'groups',
    title: 'Groups',
    icon: 'people',
    accessibilityLabel: 'Groups tab — your expense groups',
  },
  {
    name: 'activity',
    title: 'Activity',
    icon: 'time',
    accessibilityLabel: 'Activity tab — recent activity across groups',
  },
  {
    name: 'settings',
    title: 'Settings',
    icon: 'settings',
    accessibilityLabel: 'Settings tab — preferences and account',
  },
];

interface TabIconProps {
  readonly name: string;
  // SDK 57 types the tab-bar tint as `ColorValue`; the tab bar always
  // passes the theme's string colour, so narrow it for the Icon prop.
  readonly color: ColorValue;
  readonly size: number;
}

function TabIcon({ name, color, size }: TabIconProps): JSX.Element {
  return <Icon name={name} size={size} color={String(color)} />;
}

function ThemedTabs(): ReactNode {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brandPrimary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.label.fontSize,
          fontWeight: theme.typography.label.fontWeight,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => (
              <TabIcon name={tab.icon} color={color} size={size} />
            ),
            tabBarAccessibilityLabel: tab.accessibilityLabel,
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabsLayout(): ReactNode {
  useOutstandingReminders();
  return (
    <Stack gap={0} style={{ flex: 1 }}>
      <ThemedTabs />
      <CaptureFab />
    </Stack>
  );
}
