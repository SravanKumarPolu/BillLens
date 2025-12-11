# How to Reload React Native App to See Changes

## Quick Reload (Fast Refresh)

Since we only modified JavaScript/TypeScript files, you can reload without rebuilding:

### Method 1: Shake Device/Emulator
1. Shake your Android device/emulator (or press `Cmd + M` on emulator)
2. Tap **"Reload"** in the developer menu

### Method 2: Keyboard Shortcut
- Press `R` twice quickly in the Metro bundler terminal
- Or press `R + R` on the emulator

### Method 3: ADB Command (if device is connected)
```bash
adb shell input keyevent 82  # Opens dev menu
# Then select "Reload"
```

Or directly reload:
```bash
adb shell input text "RR"
```

## If Changes Still Don't Appear

### 1. Restart Metro Bundler
```bash
# Stop Metro (Ctrl+C in the terminal running it)
# Then restart:
cd /Users/sravanpolu/Projects/BillLens
pnpm start --reset-cache
```

### 2. Clear Metro Cache and Restart
```bash
# Stop Metro first, then:
cd /Users/sravanpolu/Projects/BillLens
rm -rf node_modules/.cache
pnpm start --reset-cache
```

### 3. Full Rebuild (if above doesn't work)
```bash
# Clean Android build
cd /Users/sravanpolu/Projects/BillLens/android
./gradlew clean

# Rebuild and run
cd ..
pnpm android
```

## Verify Changes

The changes made were:
- **HomeScreen.tsx**: Back button now resets to OnboardingWelcome instead of navigating to DefaultGroupSetup
- **DefaultGroupSetup.tsx**: Back button logic remains the same (navigates to Permissions)

To test:
1. Complete the DefaultGroupSetup flow
2. On the Home screen, click the "← Back" button
3. It should now navigate to OnboardingWelcome instead of creating a loop

## Troubleshooting

If the app still shows old behavior:
1. **Check Metro bundler is running** - You should see "Metro waiting on..." in terminal
2. **Check for errors** - Look at Metro bundler output for any errors
3. **Verify file changes** - Check that `src/screens/HomeScreen.tsx` has the updated code
4. **Force close app** - Close the app completely and reopen it
