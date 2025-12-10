import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
// Note: For production, install react-native-svg: npm install react-native-svg
// For now, using a text-based fallback

export interface LogoProps {
  size?: number;
  variant?: 'primary' | 'minimal';
  color?: string;
}

/**
 * BillLens Logo Component
 * 
 * Primary Logo: Lens frame with split crosshair
 * Minimal Icon: Lens with center dot
 * 
 * Note: For full SVG support, install: npm install react-native-svg
 * This component provides a text-based fallback that works without SVG
 */
const Logo: React.FC<LogoProps> = ({
  size = 120,
  variant = 'primary',
  color = '#4F46E5',
}) => {
  // Text-based logo fallback (works without react-native-svg)
  // For production, replace with SVG implementation after installing react-native-svg
  const fontSize = size * 0.4;
  
  if (variant === 'minimal') {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <View style={[styles.minimalLens, { 
          width: size * 0.67, 
          height: size * 0.67, 
          borderRadius: size * 0.335,
          borderWidth: size * 0.067,
          borderColor: color,
        }]}>
          <View style={[styles.minimalDot, {
            width: size * 0.133,
            height: size * 0.133,
            borderRadius: size * 0.067,
            backgroundColor: color,
          }]} />
        </View>
      </View>
    );
  }

  // Primary Logo: Lens frame with split crosshair
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer lens frame (subtle) */}
      <View style={[styles.outerLens, {
        width: size * 0.767,
        height: size * 0.767,
        borderRadius: size * 0.383,
        borderWidth: size * 0.083,
        borderColor: color,
        opacity: 0.25,
      }]} />
      {/* Inner lens frame */}
      <View style={[styles.innerLens, {
        width: size * 0.5,
        height: size * 0.5,
        borderRadius: size * 0.25,
        borderWidth: size * 0.05,
        borderColor: color,
      }]} />
      {/* Vertical split line */}
      <View style={[styles.splitLine, {
        width: size * 0.05,
        height: size * 0.7,
        backgroundColor: color,
        position: 'absolute',
        left: size * 0.475,
        top: size * 0.15,
      }]} />
      {/* Horizontal split line */}
      <View style={[styles.splitLine, {
        width: size * 0.7,
        height: size * 0.05,
        backgroundColor: color,
        position: 'absolute',
        left: size * 0.15,
        top: size * 0.475,
      }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  outerLens: {
    position: 'absolute',
    borderStyle: 'solid',
  },
  innerLens: {
    position: 'absolute',
    borderStyle: 'solid',
  },
  splitLine: {
    borderRadius: 2,
  },
  minimalLens: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'solid',
  },
  minimalDot: {
    // Center dot
  },
});

export default Logo;
