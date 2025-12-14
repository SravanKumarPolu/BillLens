#!/bin/bash
# Helper script to start Android emulator reliably

# Kill any existing emulator instances
echo "Cleaning up existing emulator processes..."
pkill -9 -f emulator 2>/dev/null || true
adb kill-server 2>/dev/null || true

# Wait a moment
sleep 2

# Restart ADB
echo "Starting ADB server..."
adb start-server

# Start emulator with optimized settings
echo "Starting emulator: Medium_Phone_API_36.1"
/Users/sravanpolu/Library/Android/sdk/emulator/emulator @Medium_Phone_API_36.1 \
  -gpu host \
  -no-snapshot-load \
  -no-audio \
  -no-boot-anim \
  -wipe-data \
  2>&1 &

EMULATOR_PID=$!
echo "Emulator started with PID: $EMULATOR_PID"
echo "Waiting for emulator to boot (this may take 30-60 seconds)..."

# Wait for emulator to be ready
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
  if adb devices | grep -q "emulator.*device"; then
    echo "✅ Emulator is ready!"
    adb devices
    exit 0
  fi
  sleep 2
  elapsed=$((elapsed + 2))
  echo "Waiting... ($elapsed/$timeout seconds)"
done

echo "⚠️  Emulator took too long to start. Check manually with: adb devices"
exit 1
