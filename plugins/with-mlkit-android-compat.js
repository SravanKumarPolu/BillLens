/**
 * ML Kit text-recognition Gradle compatibility shim.
 *
 * @react-native-ml-kit/text-recognition v2.0.0 still declares the legacy
 * `com.facebook.react:react-native:+` artifact, which React Native 0.86 no
 * longer publishes. Expo autolinking finds the module, but a native build
 * would fail dependency resolution. This prebuild plugin rewrites only that
 * dependency to the current `react-android` artifact.
 *
 * This is a build-time compatibility fix, not an Expo Doctor suppression.
 */
const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod } = require('@expo/config-plugins');

const MODULE_BUILD_GRADLE = path.join(
  'node_modules',
  '@react-native-ml-kit',
  'text-recognition',
  'android',
  'build.gradle',
);

module.exports = function withMlKitAndroidCompat(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const file = path.join(modConfig.modRequest.projectRoot, MODULE_BUILD_GRADLE);
      if (!fs.existsSync(file)) return modConfig;
      const current = fs.readFileSync(file, 'utf8');
      const next = current.replace(
        "implementation 'com.facebook.react:react-native:+'",
        "implementation 'com.facebook.react:react-android'",
      );
      if (next !== current) fs.writeFileSync(file, next);
      return modConfig;
    },
  ]);
};
