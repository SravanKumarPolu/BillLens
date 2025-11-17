import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { launchCamera, launchImageLibrary, ImagePickerResponse, MediaType } from 'react-native-image-picker';

type Props = NativeStackScreenProps<RootStackParamList, 'CaptureOptions'>;

const CaptureOptionsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params || {};
  const { colors } = useTheme();

  const handleImagePickerResult = (response: ImagePickerResponse) => {
    if (response.didCancel) {
      return;
    }

    if (response.errorCode) {
      Alert.alert(
        'Error',
        response.errorMessage || 'Failed to pick image. Please try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    const asset = response.assets?.[0];
    if (!asset?.uri) {
      Alert.alert('Error', 'No image selected. Please try again.', [{ text: 'OK' }]);
      return;
    }

    // Navigate to OCR processing screen
    navigation.navigate('OcrProcessing', { imageUri: asset.uri, groupId });
  };

  const handleCameraPress = () => {
    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.8,
      includeBase64: false,
      saveToPhotos: false,
    };

    launchCamera(options, handleImagePickerResult);
  };

  const handleGalleryPress = () => {
    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.8,
      includeBase64: false,
      selectionLimit: 1,
    };

    launchImageLibrary(options, handleImagePickerResult);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Add from screenshot</Text>
        <View style={styles.placeholder} />
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Choose how you'd like to add your bill screenshot
      </Text>

      <View style={styles.optionsContainer}>
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle }]}
          onPress={handleCameraPress}
          activeOpacity={0.7}
        >
          <Text style={styles.optionEmoji}>📷</Text>
          <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Take a photo</Text>
          <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
            Snap a picture of your bill or receipt
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle }]}
          onPress={handleGalleryPress}
          activeOpacity={0.7}
        >
          <Text style={styles.optionEmoji}>🖼️</Text>
          <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Choose from gallery</Text>
          <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
            Select a screenshot from your photos
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backButtonText: {
    fontSize: 28,
    fontWeight: '300',
  },
  title: {
    ...typography.h2,
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
  },
  placeholder: {
    width: 44,
  },
  subtitle: {
    ...typography.body,
    paddingHorizontal: 24,
    marginBottom: 40,
    lineHeight: 22,
  },
  optionsContainer: {
    paddingHorizontal: 24,
    gap: 20,
  },
  optionCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 160,
    justifyContent: 'center',
  },
  optionEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  optionTitle: {
    ...typography.h3,
    marginBottom: 8,
    fontWeight: '600',
  },
  optionDescription: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default CaptureOptionsScreen;

