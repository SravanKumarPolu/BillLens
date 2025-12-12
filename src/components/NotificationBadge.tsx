import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

interface NotificationBadgeProps {
  count: number;
  onPress?: () => void;
}

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({ count, onPress }) => {
  const { colors } = useTheme();
  
  if (count === 0) return null;

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={styles.container}
      accessibilityLabel={`${count} notification${count > 1 ? 's' : ''}`}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View style={[styles.badge, { backgroundColor: colors.error }]}>
        <Text style={[styles.badgeText, { color: colors.white }]}>
          {count > 99 ? '99+' : count}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    minWidth: 24,
    minHeight: 24,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: -10,
    right: -10,
    zIndex: 10,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
});
