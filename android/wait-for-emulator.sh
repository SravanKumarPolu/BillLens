#!/bin/bash
# Script to wait for Android emulator to be ready

echo "Waiting for Android emulator to be ready..."

# Wait for device to appear
echo "Checking for connected devices..."
for i in {1..30}; do
    if adb devices | grep -q "device$"; then
        echo "Device found!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "No device found after 60 seconds. Please start an emulator."
        exit 1
    fi
    sleep 2
done

# Wait for boot to complete
echo "Waiting for emulator to fully boot..."
for i in {1..60}; do
    BOOT_COMPLETED=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    if [ "$BOOT_COMPLETED" = "1" ]; then
        echo "Emulator is ready!"
        exit 0
    fi
    sleep 1
done

echo "Emulator did not become ready in time. Please check the emulator."
exit 1
