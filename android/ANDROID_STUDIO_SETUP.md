# Android Studio Setup Guide

## Prerequisites

1. **Android Studio** installed (latest version recommended)
2. **Android SDK** installed via Android Studio SDK Manager
3. **Java/JDK** (Android Studio includes JDK)

## Step-by-Step Setup

### 1. Open Project in Android Studio

1. Open **Android Studio**
2. Click **File → Open**
3. Navigate to `/Users/sravanpolu/Projects/BillLens/android`
4. Select the `android` folder and click **OK**
5. Android Studio will detect it as a Gradle project

### 2. Configure SDK Location (if needed)

Android Studio should automatically create `local.properties` with your SDK path. If it doesn't:

1. Check if `android/local.properties` exists
2. If not, create it with:
   ```properties
   sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
   ```
   (Replace `YOUR_USERNAME` with your macOS username)

   Or let Android Studio create it automatically:
   - Go to **File → Project Structure → SDK Location**
   - Android Studio will create `local.properties` automatically

### 3. Sync Gradle

**Option A: Via Menu**
- Click **File → Sync Project with Gradle Files**
- Or use shortcut: `Cmd + Shift + O` (macOS)

**Option B: Via Toolbar**
- Click the **Sync Project** button (elephant icon with arrow) in the toolbar

**Option C: Via Gradle Panel**
- Open **View → Tool Windows → Gradle**
- Click the **Sync** button (refresh icon)

### 4. Wait for Sync to Complete

- First sync may take 5-10 minutes (downloading dependencies)
- Check the **Build** tab at the bottom for progress
- Wait for "BUILD SUCCESSFUL" message

### 5. Install Required SDK Components (if needed)

If sync fails, you may need to install SDK components:

1. Go to **Tools → SDK Manager**
2. Install:
   - **Android SDK Platform 34**
   - **Android SDK Build-Tools 34.0.0**
   - **Android SDK Platform-Tools**
   - **NDK 26.1.10909125** (if not already installed)

### 6. Set Up Emulator or Connect Device

**Option A: Create Emulator**
1. Go to **Tools → Device Manager**
2. Click **Create Device**
3. Select a device (e.g., Pixel 5)
4. Select a system image (API 34 recommended)
5. Click **Finish**

**Option B: Connect Physical Device**
1. Enable **Developer Options** on your Android device
2. Enable **USB Debugging**
3. Connect via USB
4. Accept the debugging prompt on your device

### 7. Start Metro Bundler (Required!)

**IMPORTANT:** Before running from Android Studio, start Metro bundler:

```bash
# In terminal, from project root
cd /Users/sravanpolu/Projects/BillLens
npm start
# or
pnpm start
```

Keep this terminal window open - Metro bundler must be running.

### 8. Run the App

**Option A: Via Toolbar**
- Select your device/emulator from the dropdown
- Click the **Run** button (green play icon)

**Option B: Via Menu**
- Go to **Run → Run 'app'**
- Or use shortcut: `Ctrl + R` (macOS: `Ctrl + R`)

**Option C: Via Gradle**
- Open **View → Tool Windows → Gradle**
- Navigate to **app → Tasks → install**
- Double-click **installDebug**

## Troubleshooting

### Sync Fails

**Error: SDK location not found**
- Create `android/local.properties` with:
  ```properties
  sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
  ```
- Or set it in **File → Project Structure → SDK Location**

**Error: Gradle sync failed**
- Check internet connection
- Try **File → Invalidate Caches → Invalidate and Restart**
- Check Gradle version compatibility

**Error: NDK not found**
- Install NDK via **Tools → SDK Manager → SDK Tools**
- Check `android/build.gradle` for correct NDK version

### Build Fails

**Error: Cannot resolve dependencies**
- Check internet connection
- Try **File → Sync Project with Gradle Files** again
- Clear Gradle cache: `./gradlew clean` in terminal

**Error: Metro bundler not running**
- Start Metro: `npm start` or `pnpm start` in project root
- Check if port 8081 is available

**Error: Module not found**
- Verify `settings.gradle` includes all manual links
- Check that `node_modules` are installed: `pnpm install`

### App Crashes on Launch

**Red Screen: "Unable to load script"**
- Ensure Metro bundler is running
- Check Metro bundler URL is accessible
- Try: `adb reverse tcp:8081 tcp:8081` (for physical device)

**App crashes immediately**
- Check Logcat for errors: **View → Tool Windows → Logcat**
- Verify all native modules are properly linked in `settings.gradle`

## Quick Reference

### Important Files
- `android/build.gradle` - Root build configuration
- `android/app/build.gradle` - App build configuration
- `android/settings.gradle` - Project/module settings
- `android/local.properties` - SDK location (auto-generated)
- `android/gradle.properties` - Gradle properties

### Common Commands

```bash
# Clean build
cd android && ./gradlew clean

# Build debug APK
cd android && ./gradlew assembleDebug

# Install on connected device
cd android && ./gradlew installDebug

# Start Metro bundler (required!)
cd /Users/sravanpolu/Projects/BillLens
npm start
```

### Keyboard Shortcuts (macOS)
- Sync Gradle: `Cmd + Shift + O`
- Run App: `Ctrl + R`
- Build: `Cmd + F9`
- Stop: `Cmd + F2`

## Notes

- **Metro bundler must be running** before launching the app
- First build may take 10-15 minutes (downloading dependencies)
- Use **Debug** build variant for development
- Check **Logcat** for runtime errors and logs

---

**Need Help?**
- Check React Native docs: https://reactnative.dev/docs/environment-setup
- Android Studio docs: https://developer.android.com/studio

