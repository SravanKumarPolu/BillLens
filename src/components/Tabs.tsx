import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';

export interface Tab {
  id: string;
  label: string;
  badge?: number;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: 'default' | 'glass';
}

/**
 * Tabs Component
 * 
 * Overview / Expenses / Insights / History tabs
 * Supports glassmorphism variant
 */
const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  variant = 'default',
}) => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const styles = createStyles(colors, variant, isDark);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              isActive && styles.tabActive,
            ]}
            onPress={() => onTabChange(tab.id)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabLabel,
              isActive && styles.tabLabelActive,
              { color: isActive ? colors.primary : colors.textSecondary }
            ]}>
              {tab.label}
            </Text>
            {tab.badge !== undefined && tab.badge > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.badgeText, { color: colors.white }]}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const createStyles = (colors: any, variant: string, isDark: boolean) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: variant === 'glass' ? 18 : 999,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: variant === 'glass' 
      ? (isDark ? 'rgba(27, 27, 34, 0.6)' : 'rgba(255, 255, 255, 0.15)')
      : 'transparent',
    borderWidth: variant === 'glass' ? 1 : 0,
    borderColor: variant === 'glass' 
      ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)')
      : 'transparent',
  },
  tabActive: {
    backgroundColor: variant === 'glass' 
      ? (isDark ? 'rgba(79, 70, 229, 0.3)' : 'rgba(79, 70, 229, 0.1)')
      : colors.primaryLight,
    borderColor: variant === 'glass' ? colors.primary : 'transparent',
  },
  tabLabel: {
    ...typography.body,
    ...typography.emphasis.medium,
  },
  tabLabelActive: {
    ...typography.emphasis.semibold,
  },
  badge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...typography.captionSmall,
    ...typography.emphasis.semibold,
  },
});

export default Tabs;
