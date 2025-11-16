#!/bin/bash

# Build script for all platforms
# This script helps developers build all platforms locally

set -e

echo "🔨 Building all platforms..."
echo ""

# Build core library
echo "📦 Building core library..."
npm run build -w core
echo "✅ Core library built"
echo ""

# Build web application
echo "🌐 Building web application..."
npm run build -w web
echo "✅ Web application built"
echo ""

# Build Android (if gradlew exists)
if [ -f android/gradlew ]; then
    echo "📱 Building Android application..."
    cd android
    ./gradlew assembleDebug
    echo "✅ Android application built"
    cd ..
    echo ""
else
    echo "⚠️  Android gradlew not found, skipping Android build"
    echo ""
fi

# Build iOS (if on macOS with Xcode)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v swift &> /dev/null; then
        echo "🍎 Building iOS application..."
        cd ios
        swift build || echo "⚠️  iOS build requires Xcode project setup"
        cd ..
        echo ""
    else
        echo "⚠️  Swift not installed, skipping iOS build"
        echo ""
    fi
else
    echo "⚠️  iOS build requires macOS, skipping"
    echo ""
fi

echo "✨ Build complete!"
echo ""
echo "Artifacts:"
echo "  - Core: core/dist/"
echo "  - Web: web/dist/"
echo "  - Android: android/app/build/outputs/apk/debug/"
