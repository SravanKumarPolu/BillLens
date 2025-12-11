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
    <TouchableOpacity onPress={onPress} style={styles.container}>
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
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 10,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },
});
