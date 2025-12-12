import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler, Platform, Alert, Linking, PermissionsAndroid } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Button, Card, BackButton } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Permissions'>;

const PermissionsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const [isRequesting, setIsRequesting] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'limited' | 'blocked' | 'unavailable'>('unavailable');
  const [mediaPermission, setMediaPermission] = useState<'granted' | 'denied' | 'limited' | 'blocked' | 'unavailable'>('unavailable');

  // Handle Android hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Go back to OnboardingWelcome screen
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('OnboardingWelcome');
      }
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [navigation]);

  // Check current permissions
  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        // Check camera permission
        const cameraStatus = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        setCameraPermission(cameraStatus ? 'granted' : 'denied');

        // Check media/storage permission based on Android version
        const mediaPermission = Platform.Version >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
        
        const mediaStatus = await PermissionsAndroid.check(mediaPermission);
        setMediaPermission(mediaStatus ? 'granted' : 'denied');
      } catch (error) {
        console.error('Error checking permissions:', error);
      }
    } else {
      // iOS - permissions are requested when needed (via react-native-image-picker)
      // For now, mark as unavailable (will be handled by image picker)
      setCameraPermission('unavailable');
      setMediaPermission('unavailable');
    }
  };

  const requestPermissions = async () => {
    setIsRequesting(true);
    try {
      if (Platform.OS === 'android') {
        // Request camera permission
        const cameraResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'BillLens needs access to your camera to take photos of bills',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        setCameraPermission(cameraResult === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : cameraResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied');

        // Request media/storage permission based on Android version
        const mediaPermission = Platform.Version >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
        
        const mediaResult = await PermissionsAndroid.request(
          mediaPermission,
          {
            title: 'Media Permission',
            message: Platform.Version >= 33
              ? 'BillLens needs access to your photos to read bill screenshots'
              : 'BillLens needs access to your storage to read bill screenshots',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        setMediaPermission(mediaResult === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : mediaResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied');

        // If permissions blocked, show explanation
        if (cameraResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN || mediaResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          Alert.alert(
            'Permission Required',
            'Camera and gallery permissions are required for BillLens to read bill screenshots. Please enable them in app settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Open Settings', 
                onPress: () => {
                  if (Platform.OS === 'android') {
                    Linking.openSettings();
                  }
                }
              },
            ]
          );
        }
      } else {
        // iOS - permissions are handled by react-native-image-picker when needed
        // No need to pre-request, just proceed
      }

      // Proceed to next screen (permissions will be requested when actually using camera/gallery)
      navigation.navigate('DefaultGroupSetup');
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request permissions. You can still use the app manually.');
      // Proceed anyway - permissions can be requested later
      navigation.navigate('DefaultGroupSetup');
    } finally {
      setIsRequesting(false);
    }
  };
  
  const handleContinue = () => {
    requestPermissions();
  };

  const handleSkip = () => {
    navigation.navigate('DefaultGroupSetup');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton 
          onPress={() => {
            // Go back to OnboardingWelcome screen (previous step in onboarding)
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('OnboardingWelcome');
            }
          }}
          style={styles.backButtonContainer}
        />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Let BillLens see your bills</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        We only use your camera and gallery to read bill amounts. You choose what to share.
      </Text>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Camera access</Text>
          {cameraPermission === 'granted' && <Text style={[styles.checkmark, { color: colors.accent }]}>✓</Text>}
        </View>
        <Text style={[styles.cardText, { color: colors.textSecondary }]}>Snap paper bills in one tap.</Text>
      </Card>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Photos & media</Text>
          {mediaPermission === 'granted' && <Text style={[styles.checkmark, { color: colors.accent }]}>✓</Text>}
        </View>
        <Text style={[styles.cardText, { color: colors.textSecondary }]}>Read screenshots from Swiggy, Blinkit, UPI and more.</Text>
      </Card>

      <Button
        title={isRequesting ? "Requesting permissions..." : "Continue"}
        onPress={handleContinue}
        variant="positive"
        style={styles.primaryButton}
        disabled={isRequesting}
        loading={isRequesting}
      />

      <Button
        title="Skip for now"
        onPress={handleSkip}
        variant="secondary"
        style={styles.secondaryButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  header: {
    marginBottom: 24,
  },
  backButtonContainer: {
    marginBottom: 8,
  },
  title: {
    ...typography.h1,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    marginBottom: recommendedSpacing.extraLoose,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: recommendedSpacing.tight,
  },
  cardTitle: {
    ...typography.h4,
  },
  checkmark: {
    fontSize: 20,
  },
  cardText: {
    ...typography.bodySmall,
  },
  primaryButton: {
    marginTop: 32,
    marginBottom: 12,
  },
  secondaryButton: {
    marginBottom: 12,
  },
});

export default PermissionsScreen;
