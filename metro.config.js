// Metro configuration.
//
// `expo-sqlite`'s web implementation loads a wa-sqlite WASM binary, which
// Metro only bundles when `wasm` is registered as an asset extension.
// Without this the web export fails while resolving
// `expo-sqlite/web/wa-sqlite/wa-sqlite.wasm` — it is not a JS module.
//
// Serving note: the wa-sqlite build uses SharedArrayBuffer, so the host
// must send `Cross-Origin-Opener-Policy: same-origin` and
// `Cross-Origin-Embedder-Policy: require-corp` for the web build to run
// (static hosts let you set these headers).

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [...new Set([...config.resolver.assetExts, 'wasm'])];

module.exports = config;
