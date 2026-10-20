const {getDefaultConfig} = require('expo/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
