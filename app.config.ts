import type { ExpoConfig, ConfigContext } from 'expo/config';

const APP_ENVS = ['development', 'staging', 'production'] as const;
type AppEnv = (typeof APP_ENVS)[number];

/**
 * Read an env var with an optional fallback. Never throws for optional
 * cloud configuration — the app is offline-first and must build/boot
 * without Supabase configured (sync simply stays deferred until values
 * are provided).
 */
function readEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

function resolveAppEnv(): AppEnv {
  const raw = readEnv('EXPO_PUBLIC_APP_ENV', 'development');
  if (raw !== undefined && !APP_ENVS.includes(raw as AppEnv)) {
    throw new Error(
      `Invalid EXPO_PUBLIC_APP_ENV="${raw}". Must be one of: ${APP_ENVS.join(', ')}`,
    );
  }
  return (raw as AppEnv) ?? 'development';
}

const appEnv = resolveAppEnv();
const isDev = appEnv === 'development';
const isStaging = appEnv === 'staging';
const isProd = appEnv === 'production';

const bundleIdentifiers: Record<AppEnv, { ios: string; android: string }> = {
  development: { ios: 'com.billlens.dev', android: 'com.billlens.dev' },
  staging: { ios: 'com.billlens.staging', android: 'com.billlens.staging' },
  production: { ios: 'com.billlens.app', android: 'com.billlens.app' },
};

const appNames: Record<AppEnv, string> = {
  development: 'BillLens (Dev)',
  staging: 'BillLens (Staging)',
  production: 'BillLens',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appNames[appEnv],
  slug: 'billlens',
  version: '2.25.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Deep link scheme. All expo-router routes are addressable as
  // `billlens://<route>`. The CFBundleURLTypes (iOS) and intentFilters
  // (Android) below register the OS-level handlers; the actual route
  // mapping is handled by expo-router's Linking configuration.
  //
  // Documented deep link routes (Phase 2 shell):
  //   billlens://                                       → root redirect (onboarding or /(tabs))
  //   billlens://onboarding/welcome                     → onboarding step 1
  //   billlens://onboarding/guest-name                  → onboarding step 2
  //   billlens://onboarding/permissions                 → onboarding step 3
  //   billlens://onboarding/complete                    → onboarding step 4
  //   billlens://groups                                 → groups list tab
  //   billlens://groups/new                             → create group modal
  //   billlens://groups/join                            → join group modal
  //   billlens://groups/<groupId>                       → group home
  //   billlens://groups/<groupId>/balances              → group balances
  //   billlens://groups/<groupId>/settings              → group settings
  //   billlens://capture                                → capture (camera)
  //   billlens://capture?source=gallery                 → capture (gallery picker)
  //   billlens://capture?source=payment                 → capture (payment screenshot)
  //   billlens://expenses/new                           → new expense (manual)
  //   billlens://expenses/<expenseId>                   → expense detail
  //   billlens://drafts/<draftId>                       → draft review
  //   billlens://settlements/new                        → new settlement
  //   billlens://settlements/new?groupId=<groupId>      → new settlement (group-scoped)
  //   billlens://modal/explanation?balanceId=<balanceId> → balance explanation modal
  scheme: 'billlens',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleIdentifiers[appEnv].ios,
    // TestFlight build number — bumped per upload (EAS autoIncrement also
    // manages it; this is the floor).
    buildNumber: '2.25.0',
    infoPlist: {
      NSCameraUsageDescription: 'BillLens uses the camera to scan receipts and payment screenshots for expense tracking.',
      NSPhotoLibraryUsageDescription: 'BillLens needs access to your photo library to import receipt images and payment screenshots.',
      NSPhotoLibraryAddUsageDescription: 'BillLens may save processed receipt images to your photo library.',
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: ['billlens'],
          CFBundleURLName: 'com.billlens.app',
        },
      ],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#15161D',
    },
    package: bundleIdentifiers[appEnv].android,
    // Play internal-testing version code (2.6.0 → 20600). EAS
    // autoIncrement raises it per build; this is the floor.
    versionCode: 22500,
    // v2.5.0: only CAMERA is declared explicitly — the expo-image-picker
    // config plugin injects the CORRECT media permission per target SDK
    // (READ_MEDIA_IMAGES on API 33+, READ_EXTERNAL_STORAGE below), which
    // the previous hardcoded legacy pair forced onto every device and
    // which Play review flags for API 33+ targets.
    permissions: [
      'android.permission.CAMERA',
    ],
    // Android share intent — allows users to share images directly into BillLens
    // from other apps (Gallery, WhatsApp, UPI apps). The `mimeType` property is
    // valid in Expo's intent filter schema but not in the TypeScript type.
    intentFilters: ([
      {
        action: 'android.intent.action.SEND',
        mimeType: 'image/*',
        data: { scheme: 'content' },
      },
      {
        action: 'android.intent.action.SEND_MULTIPLE',
        mimeType: 'image/*',
        data: { scheme: 'content' },
      },
    ] as never) as never,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-notifications',
    './plugins/with-mlkit-android-compat',
    // SDK 57 removed the top-level `splash` field; the splash screen is
    // configured through its plugin now.
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#15161D',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermissionText: 'BillLens uses the camera to scan receipts and payment screenshots.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'BillLens needs access to your photo library to import receipt images.',
      },
    ],
  ],
  experiments: {
    tsconfigPaths: true,
  },
  extra: {
    appEnv,
    isDev,
    isStaging,
    isProd,
    // Optional cloud configuration — validated shape when present. The app
    // is offline-first: without these values the local database, OCR
    // pipeline, and manual entry all work; cloud sync stays deferred and
    // the sync status screen reports "not configured".
    supabaseUrl: readEnv('EXPO_PUBLIC_SUPABASE_URL') ?? '',
    supabaseAnonKey: readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY') ?? '',
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
