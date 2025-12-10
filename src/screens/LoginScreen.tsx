import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Sign in to sync</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Optional: Sign in to sync your data across devices. You can use the app without signing in.
      </Text>

      <TouchableOpacity
        style={[styles.googleButton, { backgroundColor: colors.primary }]}
        onPress={handleGoogleSignIn}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Text style={[styles.googleIcon, { color: colors.white }]}>G</Text>
            <Text style={[styles.googleButtonText, { color: colors.white }]}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: colors.borderSubtle }]} />
        <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.borderSubtle }]} />
      </View>

      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle, color: colors.textPrimary }]}
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle, color: colors.textPrimary }]}
        placeholder="Password"
        placeholderTextColor={colors.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.emailButton, { backgroundColor: colors.accent }]}
        onPress={handleEmailSignIn}
        disabled={isLoading}
      >
        <Text style={[styles.emailButtonText, { color: colors.white }]}>Sign in with email</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>Skip - use without account</Text>
      </TouchableOpacity>
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
  googleButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: recommendedSpacing.loose,
  },
  googleIcon: {
    fontSize: 20, // Icon/G logo, not typography
    fontWeight: '700',
    marginRight: recommendedSpacing.comfortable,
  },
  googleButtonText: {
    ...typography.button,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: recommendedSpacing.extraLoose,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...typography.bodySmall,
    marginHorizontal: 12,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: recommendedSpacing.loose,
    paddingVertical: recommendedSpacing.comfortable,
    ...typography.bodyLarge,
    marginBottom: recommendedSpacing.comfortable,
  },
  emailButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: recommendedSpacing.default,
  },
  emailButtonText: {
    ...typography.button,
  },
  skipButton: {
    marginTop: recommendedSpacing.extraLoose,
    paddingVertical: recommendedSpacing.comfortable,
    alignItems: 'center',
  },
  skipButtonText: {
    ...typography.body,
  },
});

export default LoginScreen;

