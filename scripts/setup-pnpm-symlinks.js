const fs = require('fs');
const path = require('path');

// Create gradle-plugin symlink
const gradlePlugin = path.join('node_modules', '@react-native', 'gradle-plugin');
if (!fs.existsSync(gradlePlugin)) {
  const pnpmDir = path.join('node_modules', '.pnpm');
  const pnpmPath = fs.readdirSync(pnpmDir).find(d => d.startsWith('@react-native+gradle-plugin'));
  if (pnpmPath) {
    fs.mkdirSync(path.dirname(gradlePlugin), { recursive: true });
    fs.symlinkSync(
      path.join('..', '.pnpm', pnpmPath, 'node_modules', '@react-native', 'gradle-plugin'),
      gradlePlugin,
      'dir'
    );
    console.log('✓ Created @react-native/gradle-plugin symlink');
  }
}

// Create npx wrapper for React Native CLI
const binDir = path.join('node_modules', '.bin');
fs.mkdirSync(binDir, { recursive: true });

// Create react-native CLI symlink
const reactNativeCli = path.join(binDir, 'react-native');
if (!fs.existsSync(reactNativeCli)) {
  const pnpmCliPath = fs.readdirSync('node_modules/.pnpm')
    .find(d => d.startsWith('@react-native+community-cli-plugin'));
  if (pnpmCliPath) {
    const cliPath = path.join('node_modules', '.pnpm', pnpmCliPath, 'node_modules', '@react-native', 'community-cli-plugin', 'build', 'bin.js');
    if (fs.existsSync(cliPath)) {
      fs.symlinkSync(path.join('..', '.pnpm', pnpmCliPath, 'node_modules', '@react-native', 'community-cli-plugin', 'build', 'bin.js'), reactNativeCli, 'file');
      console.log('✓ Created react-native CLI symlink');
    }
  }
}

// Create npx wrapper for React Native CLI
const npxWrapper = path.join(binDir, 'npx');
if (!fs.existsSync(npxWrapper)) {
  const wrapperContent = `#!/bin/sh
# npx wrapper for pnpm compatibility with React Native
if [ "$1" = "@react-native-community/cli" ]; then
  exec pnpm exec "@react-native-community/cli" "$@"
else
  exec command npx "$@"
fi
`;
  fs.writeFileSync(npxWrapper, wrapperContent);
  fs.chmodSync(npxWrapper, '755');
  console.log('✓ Created npx wrapper');
}

// Create @babel/runtime symlink for Metro compatibility
const babelRuntime = path.join('node_modules', '@babel', 'runtime');
if (!fs.existsSync(babelRuntime)) {
  const pnpmDir = path.join('node_modules', '.pnpm');
  const pnpmPath = fs.readdirSync(pnpmDir).find(d => d.startsWith('@babel+runtime'));
  if (pnpmPath) {
    fs.mkdirSync(path.dirname(babelRuntime), { recursive: true });
    fs.symlinkSync(
      path.join('..', '.pnpm', pnpmPath, 'node_modules', '@babel', 'runtime'),
      babelRuntime,
      'dir'
    );
    console.log('✓ Created @babel/runtime symlink');
  }
}

// Apply react-native-screens patch
require('./patch-react-native-screens.js');

console.log('✓ pnpm symlinks setup complete');
