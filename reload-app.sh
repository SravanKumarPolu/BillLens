#!/bin/bash
# Script to reload React Native app on Android

echo "🔄 Reloading React Native app..."

# Check if device is connected
DEVICE=$(adb devices | grep -v "List of devices" | grep "device" | head -1)

if [ -z "$DEVICE" ]; then
    echo "❌ No Android device/emulator connected."
    echo "   Please connect a device or start an emulator, then run this script again."
    exit 1
fi

echo "✅ Device found: $DEVICE"

# Method 1: Send reload command via ADB
echo "📱 Sending reload command..."
adb shell input text "RR" 2>/dev/null || {
    # Method 2: Open dev menu and reload
    echo "   Trying alternative method..."
    adb shell input keyevent 82  # Menu key
    sleep 0.5
    adb shell input keyevent 46  # R key
    adb shell input keyevent 46  # R key again
}

echo "✅ Reload command sent!"
echo ""
echo "If the app doesn't reload automatically:"
echo "  1. Shake your device/emulator"
echo "  2. Tap 'Reload' in the developer menu"
echo "  3. Or press 'R' twice in the Metro bundler terminal"
