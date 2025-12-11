# React Native Troubleshooting Guide

## ✅ Current Status

Your project is **properly configured** and should be working:
- ✅ Metro bundler: Running
- ✅ TypeScript: No errors
- ✅ Android build: Successful
- ✅ Dependencies: Installed

## 🚀 How to Run the App

### Step 1: Start Metro Bundler
```bash
cd /Users/sravanpolu/Projects/BillLens
pnpm start
```
Keep this terminal open - Metro must be running!

### Step 2: Run on Android

**Option A: Using React Native CLI**
```bash
# In a new terminal (Metro should be running in another terminal)
pnpm android
```

**Option B: Using Android Studio**
1. Open Android Studio
2. File → Open → Select `android` folder
3. Wait for Gradle sync
4. Connect device/start emulator
5. Click Run button (green play icon)

**Option C: Using Gradle directly**
```bash
cd android
./gradlew installDebug
```

## 🔍 Common Issues & Solutions

### Issue 1: "Metro bundler not running"
**Symptoms:**
- App shows "Unable to connect to Metro"
- Red screen with network error

**Solution:**
```bash
# Kill any existing Metro processes
killall node

# Start Metro with cache reset
pnpm start --reset-cache
```

### Issue 2: "No devices/emulators found"
**Symptoms:**
- `adb devices` shows no devices
- Build succeeds but app doesn't install

**Solution:**
```bash
# Check connected devices
adb devices

# If no devices:
# 1. Start Android emulator from Android Studio
# 2. Or connect physical device with USB debugging enabled
```

### Issue 3: "Build failed"
**Symptoms:**
- Gradle build errors
- Missing dependencies

**Solution:**
```bash
# Clean and rebuild
cd android
./gradlew clean
./gradlew assembleDebug

# If still failing, check:
# - Internet connection (for downloading dependencies)
# - Android SDK installed
# - Java/JDK installed
```

### Issue 4: "Module not found"
**Symptoms:**
- Red screen: "Unable to resolve module"
- Import errors

**Solution:**
```bash
# Reinstall dependencies
pnpm install

# Clear Metro cache
pnpm start --reset-cache

# Clear watchman (if installed)
watchman watch-del-all
```

### Issue 5: "TypeScript errors"
**Symptoms:**
- Type errors in IDE
- Build warnings

**Solution:**
```bash
# Check TypeScript errors
pnpm type-check

# Fix any type errors shown
```

### Issue 6: "App crashes on startup"
**Symptoms:**
- App installs but crashes immediately
- Red error screen

**Solution:**
1. Check Metro bundler is running
2. Check device logs:
   ```bash
   adb logcat | grep -i "react\|error"
   ```
3. Verify `MainActivity.kt` component name matches `index.tsx`:
   - MainActivity: `"BillLens"`
   - index.tsx: `AppRegistry.registerComponent('BillLens', ...)`

## 🛠️ Diagnostic Commands

### Check Project Health
```bash
# 1. Verify dependencies
pnpm list react react-native

# 2. Check TypeScript
pnpm type-check

# 3. Check linting
pnpm lint

# 4. Verify Android build
cd android && ./gradlew projects

# 5. Check Metro status
curl http://localhost:8081/status
```

### Clean Everything
```bash
# Clean React Native
rm -rf node_modules
pnpm install

# Clean Android
cd android
./gradlew clean
rm -rf .gradle app/build

# Clean Metro cache
pnpm start --reset-cache
```

## 📱 Running on Device/Emulator

### Physical Device
1. Enable Developer Options on Android device
2. Enable USB Debugging
3. Connect via USB
4. Accept debugging prompt on device
5. Run: `pnpm android`

### Emulator
1. Open Android Studio
2. Tools → Device Manager
3. Create/Start emulator
4. Run: `pnpm android`

## 🔧 Configuration Files

Key files to check if issues persist:
- `index.tsx` - Entry point (must register 'BillLens')
- `android/app/src/main/java/com/billlens/MainActivity.kt` - Native entry (must return 'BillLens')
- `android/app/build.gradle` - Build configuration
- `metro.config.js` - Metro bundler config
- `package.json` - Dependencies

## 📞 Still Having Issues?

If the app still doesn't run:
1. Share the exact error message
2. Check device/emulator logs: `adb logcat`
3. Check Metro bundler output for errors
4. Verify all prerequisites are installed

## ✅ Verification Checklist

Before running, ensure:
- [ ] Node.js installed (v18+)
- [ ] pnpm installed
- [ ] Android Studio installed
- [ ] Android SDK installed
- [ ] Java/JDK installed
- [ ] Device/emulator connected
- [ ] Metro bundler running
- [ ] Dependencies installed (`pnpm install`)
