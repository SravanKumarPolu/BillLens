import React from 'react';
import { Modal as RNModal, View, Text, StyleSheet, TouchableOpacity, ViewStyle, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { createGlassStyle } from '../theme/glassmorphism';
import { typography, recommendedSpacing } from '../theme/typography';

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
 */
const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  variant = 'default',
  showCloseButton = true,
  animationType = 'slide',
}) => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const styles = createStyles(colors, variant, isDark);

  const modalContentStyle = variant === 'glass' 
    ? [styles.modalContent, createGlassStyle(isDark)]
    : styles.modalContent;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
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
      </TouchableOpacity>
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
