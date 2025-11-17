import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'OcrProcessing'>;

const OcrProcessingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { imageUri, groupId } = route.params;

  useEffect(() => {
    // TODO: replace timeout with actual OCR call.
    const timeout = setTimeout(() => {
      navigation.replace('ReviewBill', { imageUri, groupId });
    }, 1200);

    return () => clearTimeout(timeout);
  }, [navigation, imageUri, groupId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reading your bill…</Text>
      <Text style={styles.subtitle}>
        BillLens is finding the amount, merchant and date. This stays private.
      </Text>

      <View style={styles.imageWrapper}>
        <Image source={{ uri: imageUri }} style={styles.image} />
      </View>

      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    backgroundColor: colors.surfaceLight,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  imageWrapper: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceCard,
    marginBottom: 24,
  },
  image: {
    flex: 1,
    resizeMode: 'cover',
  },
});

export default OcrProcessingScreen;
