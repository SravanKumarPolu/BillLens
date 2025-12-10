const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const config = JSON.parse(execSync('pnpm exec react-native config --json', { encoding: 'utf-8' }));
  const androidDeps = [];
  
  Object.values(config.dependencies || {}).forEach(dep => {
    if (dep.platforms?.android?.sourceDir) {
      const sourceDir = path.relative(
        path.join(__dirname, '..', 'android'),
        dep.platforms.android.sourceDir
      ).replace(/\\/g, '/');
      androidDeps.push(`project(':${dep.name.replace(/[@\/]/g, '_')}')`);
    }
  });
  
  console.log(JSON.stringify({ dependencies: androidDeps }));
} catch (error) {
  console.error('Error generating autolink config:', error.message);
  process.exit(1);
}
