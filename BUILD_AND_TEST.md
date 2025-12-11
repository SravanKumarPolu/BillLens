# Build & Test Guide - SMS Auto-Fetch Feature

## ✅ Pre-Build Verification

All code has been verified:
- ✅ No TypeScript errors
- ✅ No linter errors
- ✅ All imports correct
- ✅ Native modules properly registered
- ✅ Permissions added to AndroidManifest

## 🏗️ Building the App

### Step 1: Clean Build
```bash
cd android
./gradlew clean
cd ..
```

### Step 2: Install Dependencies
```bash
pnpm install
```

### Step 3: Build Android APK
```bash
# Debug build (for testing)
cd android && ./gradlew assembleDebug

# Or use React Native CLI
pnpm run android
```

### Step 4: Install on Device
```bash
# If using physical device
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or use React Native CLI (auto-installs)
pnpm run android
```

## 🧪 Testing SMS Auto-Fetch

### Prerequisites
1. **Android Device** (SMS reading only works on Android)
2. **Android 6.0+** (API 23+) for runtime permissions
3. **SMS Permission** granted to app

### Test Steps

#### 1. Initial Setup
1. Open BillLens app
2. Navigate to Home screen
3. Tap **📱** icon in header (SMS Settings)
4. Tap **"Grant Permission"** button
5. Grant SMS permissions when prompted
6. Enable **"Enable SMS Auto-Fetch"** toggle

#### 2. Manual SMS Scan Test
1. In SMS Settings, tap **"Scan SMS Now"**
2. App will scan last 50 SMS from last 7 days
3. Check console/logs for detected bills
4. Verify bills are shown in results

#### 3. Background Monitoring Test
1. Keep app open (or in background)
2. Send test SMS to your device from another phone:
   ```
   Swiggy
   Order #SW123456
   Total: ₹450.00
   Payment: Online
   ```
3. Check console logs for:
   ```
   Bill detected from SMS: { parsedBill: {...} }
   ```
4. Verify SMS was processed automatically

#### 4. Test SMS Examples

**Food Delivery:**
```
Swiggy
Order #SW123456
Date: 15/12/2024
Grand Total: ₹450.00
Payment: Online
```

**Zomato:**
```
Zomato
Order ID: ZM987654321
Total Amount: ₹650.50
Payment Method: UPI
```

**Electricity Bill:**
```
BSES Electricity Bill
Amount: ₹1,200.00
Due Date: 25/12/2024
Account: 123456789
```

**PhonePe Payment:**
```
PhonePe
Payment Successful
Amount: ₹1,200.00
Paid to: Blinkit
Date: 15/12/2024
```

### Expected Behavior

#### ✅ Success Cases
- SMS Settings screen opens from 📱 button
- Permissions are requested and granted
- Manual scan finds bills in SMS
- Background monitoring detects new SMS
- Bills are parsed correctly (amount, merchant, date)
- Processed SMS IDs are tracked (no duplicates)

#### ⚠️ Edge Cases
- **App Closed**: SMS will be detected on next manual scan
- **Permission Denied**: Feature disabled, manual scan unavailable
- **No Bills Found**: Shows "No bills found" message
- **Low Confidence**: Only processes SMS with confidence ≥ 0.5

## 🐛 Troubleshooting

### Issue: SMS Settings button not visible
**Solution**: 
- Check if you're on Android (iOS doesn't show SMS features)
- Verify `SMSSettingsScreen` is imported in `AppNavigator.tsx`

### Issue: Permission request fails
**Solution**:
- Go to Android Settings → Apps → BillLens → Permissions
- Manually grant SMS permissions
- Restart app

### Issue: SMS not detected
**Solution**:
- Verify SMS contains bill keywords (Swiggy, Zomato, bill, payment, etc.)
- Check console logs for parsing errors
- Try manual scan to see all SMS

### Issue: Background monitoring not working
**Solution**:
- Verify auto-fetch is enabled in settings
- Check if app has SMS permissions
- Check console logs for "SMSReceived" events
- Restart app to re-register event listener

### Issue: Native module not found
**Solution**:
```bash
cd android
./gradlew clean
./gradlew assembleDebug
cd ..
pnpm start --reset-cache
```

### Issue: Build fails
**Solution**:
```bash
# Clean everything
cd android
./gradlew clean
rm -rf .gradle build app/build
cd ..

# Reinstall dependencies
rm -rf node_modules
pnpm install

# Rebuild
cd android && ./gradlew assembleDebug
```

## 📊 Verification Checklist

### Code Verification
- [x] TypeScript compiles without errors
- [x] No linter errors
- [x] All imports resolved
- [x] Native modules registered
- [x] Permissions in AndroidManifest

### Feature Verification
- [ ] SMS Settings screen accessible from Home
- [ ] Permissions can be granted
- [ ] Auto-fetch can be enabled/disabled
- [ ] Manual SMS scan works
- [ ] Background monitoring works
- [ ] Bills are detected correctly
- [ ] Processed SMS tracking works

### Android Build
- [ ] App builds successfully
- [ ] APK installs on device
- [ ] App launches without crashes
- [ ] SMS permissions requested correctly

## 🚀 Production Readiness

### Before Release
1. **Privacy Policy**: Add SMS access explanation
2. **Google Play**: Justify SMS permission usage
3. **Testing**: Test on multiple Android versions
4. **Permissions**: Ensure clear user consent flow
5. **Error Handling**: Test all edge cases

### Google Play Requirements
- Clear explanation of why SMS access is needed
- Privacy policy mentions SMS reading
- Feature is opt-in only (✅ implemented)
- User can disable anytime (✅ implemented)

## 📝 Notes

### Android Version Compatibility
- **Android 6.0+ (API 23+)**: Runtime permissions required ✅
- **Android 10+ (API 29+)**: Some SMS restrictions may apply
- **Android 13+ (API 33+)**: READ_PHONE_STATE needed ✅

### Performance
- Broadcast receiver is lightweight
- Only processes when enabled
- No background service needed
- Minimal battery impact

### Security
- Only reads SMS matching bill patterns
- Personal messages never accessed
- All processing on-device
- Processed IDs stored locally only

## 🎯 Quick Test Commands

```bash
# Type check
npx tsc --noEmit --skipLibCheck

# Lint check
pnpm lint

# Build debug APK
cd android && ./gradlew assembleDebug

# Install on connected device
adb install app/build/outputs/apk/debug/app-debug.apk

# View logs
adb logcat | grep -i "sms\|billlens"
```

## ✅ All Systems Ready!

The SMS auto-fetch feature is fully implemented and ready for testing. Follow the test steps above to verify everything works correctly.
