const fs = require('fs');
const path = require('path');

const filePath = path.join(
  'node_modules',
  'react-native-screens',
  'android',
  'src',
  'main',
  'java',
  'com',
  'swmansion',
  'rnscreens',
  'safearea',
  'SafeAreaView.kt'
);

if (fs.existsSync(filePath)) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix the Insets/EdgeInsets comparison issue
  const oldPattern = /val newSystemInsets =\s+insets\.getInsets\(WindowInsetsCompat\.Type\.systemBars\(\) or WindowInsetsCompat\.Type\.displayCutout\(\)\)\s+if \(newSystemInsets != currentSystemInsets\) \{\s+currentSystemInsets = EdgeInsets\.fromInsets\(newSystemInsets\)/;
  
  const newCode = `val newSystemInsets =
            insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())

        val newSystemInsetsEdge = EdgeInsets.fromInsets(newSystemInsets)
        if (newSystemInsetsEdge != currentSystemInsets) {
            currentSystemInsets = newSystemInsetsEdge`;
  
  if (content.includes('val newSystemInsetsEdge = EdgeInsets.fromInsets(newSystemInsets)')) {
    console.log('✓ react-native-screens patch already applied');
  } else if (oldPattern.test(content)) {
    content = content.replace(oldPattern, newCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✓ Applied react-native-screens patch');
  } else {
    console.log('⚠ Could not find pattern to patch in react-native-screens');
  }
} else {
  console.log('⚠ react-native-screens not found, skipping patch');
}
