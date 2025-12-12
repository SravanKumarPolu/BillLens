import React, { useEffect, useRef } from 'react';
import { Modal as RNModal, View, Text, StyleSheet, TouchableOpacity, ViewStyle, ScrollView, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { createGlassStyle } from '../theme/glassmorphism';
import { typography, recommendedSpacing } from '../theme/typography';
import { transitions } from '../theme/transitions';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: 'default' | 'glass';
  showCloseButton?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
}

/**
 * Modal Component with Glassmorphism Support
 * 
 * Reusable modal component matching BillLens brand identity.
 * Supports glassmorphism variant for modern, elegant overlays.
 * Enhanced with smooth animations and better interactions.
 */
const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  variant = 'default',
  showCloseButton = true,
  animationType = 'fade',
}) => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const styles = createStyles(colors, variant, isDark);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: transitions.modal.duration,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: transitions.fast.duration,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: transitions.fast.duration,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 50,
          duration: transitions.fast.duration,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const modalContentStyle = variant === 'glass' 
    ? [styles.modalContent, createGlassStyle(isDark)]
    : styles.modalContent;

  const animatedContentStyle = {
    opacity: fadeAnim,
    transform: [
      { scale: scaleAnim },
      { translateY: slideAnim },
    ],
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View style={animatedContentStyle}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={modalContentStyle}>
              {(title || subtitle || showCloseButton) && (
                <View style={styles.header}>
                  <View style={styles.headerText}>
                    {title && (
                      <Text style={[styles.title, { color: colors.textPrimary }]}>
                        {title}
                      </Text>
                    )}
                    {subtitle && (
                      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {subtitle}
                      </Text>
                    )}
                  </View>
                  {showCloseButton && (
                    <TouchableOpacity
                      style={[styles.closeButton, { backgroundColor: colors.surfaceLight }]}
                      onPress={onClose}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>
                        ×
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </RNModal>
  );
};

const createStyles = (colors: any, variant: string, isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: variant === 'glass' 
      ? 'rgba(0, 0, 0, 0.5)'
      : 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    backgroundColor: variant === 'glass'
      ? (isDark ? 'rgba(27, 27, 34, 0.95)' : 'rgba(255, 255, 255, 0.95)')
      : colors.surfaceCard,
    borderRadius: variant === 'glass' ? 24 : 20,
    padding: 24,
    ...(variant === 'glass' ? {} : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
      elevation: 8,
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    ...typography.h2,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.body,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '300',
  },
  content: {
    flex: 1,
  },
});

export default Modal;
