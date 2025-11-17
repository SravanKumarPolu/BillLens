import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  elevated?: boolean;
}

const Card: React.FC<CardProps> = ({ children, onPress, style, elevated = false }) => {
  const cardStyle = [
    styles.base,
    elevated && styles.elevated,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
});

export default Card;

