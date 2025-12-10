#!/bin/bash

# BillLens Android Quick Start Script
# This script helps you get started with Android Studio

echo "🚀 BillLens Android Setup"
echo "========================="
echo ""

# Check if we're in the android directory
if [ ! -f "build.gradle" ]; then
    echo "❌ Error: Please run this script from the android/ directory"
    echo "   cd android && ./quick-start.sh"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "../node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd ..
    pnpm install
    cd android
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Check if local.properties exists
if [ ! -f "local.properties" ]; then
    echo "📝 Creating local.properties..."
    SDK_PATH="$HOME/Library/Android/sdk"
    if [ -d "$SDK_PATH" ]; then
        echo "sdk.dir=$SDK_PATH" > local.properties
        echo "✅ Created local.properties with SDK path: $SDK_PATH"
    else
        echo "⚠️  Android SDK not found at default location"
        echo "   Android Studio will create local.properties automatically"
        echo "   Expected location: $SDK_PATH"
    fi
else
    echo "✅ local.properties already exists"
fi

# Check native modules
echo ""
echo "🔍 Checking native modules..."
MODULES_OK=true

check_module() {
    if [ -d "../node_modules/$1/android" ]; then
        echo "  ✅ $2"
    else
        echo "  ❌ $2 - Missing!"
        MODULES_OK=false
    fi
}

check_module "@react-native-async-storage/async-storage" "async-storage"
check_module "react-native-image-picker" "image-picker"
check_module "react-native-safe-area-context" "safe-area-context"
check_module "react-native-screens" "screens"

if [ "$MODULES_OK" = false ]; then
    echo ""
    echo "❌ Some native modules are missing. Run: pnpm install"
    exit 1
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Open Android Studio"
echo "   2. File → Open → Select this android/ folder"
echo "   3. File → Sync Project with Gradle Files"
echo "   4. Start Metro bundler: cd .. && pnpm start"
echo "   5. Run the app from Android Studio"
echo ""
echo "📚 For detailed instructions, see:"
echo "   - android/README.md"
echo "   - android/ANDROID_STUDIO_SETUP.md"
echo ""

