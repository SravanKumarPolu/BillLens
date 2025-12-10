import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { extractBillInfo, parseAmount, normalizeMerchant } from '../utils/ocrService';
import { useGroups } from '../context/GroupsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OcrProcessing'>;

const OcrProcessingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { imageUri, groupId } = route.params || {};
  const { colors } = useTheme();
  const { addOcrHistory } = useGroups();
  const [isProcessing, setIsProcessing] = useState(true);

  // Validate required params
  useEffect(() => {
    if (!imageUri) {
      Alert.alert('Error', 'No image provided', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [imageUri, navigation]);

  useEffect(() => {
    if (!imageUri) return; // Don't process if no image
    const processImage = async () => {
      try {
        setIsProcessing(true);
        const result = await extractBillInfo(imageUri);

        // Track OCR attempt
        const success = !result.error && result.confidence >= 0.3;
        addOcrHistory({
          groupId: groupId || undefined,
          imageUri,
          success,
          extractedData: success ? {
            amount: result.amount,
            merchant: result.merchant,
            date: result.date,
          } : undefined,
          error: result.error || undefined,
        });

        // Handle low confidence or errors
        if (result.error && result.confidence < 0.3) {
          // Very low confidence - show error and allow manual entry
          Alert.alert(
            'Low Quality Image',
            result.error || 'Could not extract bill information automatically. You can still enter the details manually.',
            [
              {
                text: 'Enter Manually',
                onPress: () => {
                  navigation.replace('AddExpense', {
                    imageUri,
                    groupId: groupId || undefined,
                    parsedAmount: '',
                    parsedMerchant: '',
                    parsedDate: '',
                  });
                },
              },
            ],
            { cancelable: false }
          );
          return;
        }

        // For low confidence (0.3-0.5), still proceed but show a warning
        // User can verify and edit in AddExpense screen
        if (result.confidence < 0.5 && result.confidence >= 0.3) {
          Alert.alert(
            'Low Confidence',
            'Some information may not be accurate. Please verify the extracted details.',
            [
              {
                text: 'Review & Edit',
                onPress: () => {
                  navigation.replace('AddExpense', {
                    imageUri,
                    groupId: groupId || undefined,
                    parsedAmount: parseAmount(result.amount),
                    parsedMerchant: normalizeMerchant(result.merchant),
                    parsedDate: result.date || '',
                  });
                },
              },
            ],
            { cancelable: false }
          );
          return;
        }

        // Navigate to AddExpense with parsed data (confidence >= 0.5)
        navigation.replace('AddExpense', {
          imageUri,
          groupId: groupId || undefined,
          parsedAmount: parseAmount(result.amount),
          parsedMerchant: normalizeMerchant(result.merchant),
          parsedDate: result.date || '',
        });
      } catch (error) {
        // Handle unexpected errors
        Alert.alert(
          'Processing Error',
          'Something went wrong while processing your image. You can still enter the details manually.',
          [
            {
              text: 'Enter Manually',
              onPress: () => {
                navigation.replace('ReviewBill', {
                  imageUri,
                  groupId: groupId || undefined,
                  parsedAmount: '',
                  parsedMerchant: '',
                  parsedDate: '',
                });
              },
            },
          ],
          { cancelable: false }
        );
      } finally {
        setIsProcessing(false);
      }
    };

    processImage();
  }, [navigation, imageUri, groupId, addOcrHistory]);

  if (!imageUri) {
    return null; // Return null while showing alert
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Reading your bill…</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        BillLens is finding the amount, merchant and date. This stays private.
      </Text>

      <View style={[styles.imageWrapper, { backgroundColor: colors.surfaceCard }]}>
        <Image source={{ uri: imageUri }} style={styles.image} />
      </View>

      {isProcessing && <ActivityIndicator size="large" color={colors.accent} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  title: {
    ...typography.h2,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    marginBottom: recommendedSpacing.extraLoose,
  },
  imageWrapper: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  image: {
    flex: 1,
    resizeMode: 'cover',
  },
});

export default OcrProcessingScreen;
