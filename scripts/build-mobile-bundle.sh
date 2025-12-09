#!/bin/bash
# Build core library for mobile platforms (Android/iOS)
# Creates a bundle that can be loaded by embedded JS engines

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
CORE_DIR="$ROOT_DIR/core"
OUTPUT_DIR="$ROOT_DIR/mobile-bundle"

echo "Building core for mobile..."

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Navigate to core directory
cd "$CORE_DIR"

# Ensure dependencies are installed
npm install --silent

# Build TypeScript to JavaScript
npm run build

echo "Bundling for mobile platforms..."

# Note: The @noble/* crypto libraries used in core don't rely on Node.js crypto module.
# They use pure JavaScript implementations or browser's crypto.getRandomValues().
# On Android/iOS, we need to ensure crypto.getRandomValues is available:
# - iOS: JavaScriptCore doesn't have crypto API; inject a polyfill before loading bundle
# - Android: Rhino doesn't have crypto API; inject a polyfill before loading bundle
#
# SECURITY: The crypto.getRandomValues polyfill MUST use platform-specific
# cryptographically secure random number generators:
# - Android: Use java.security.SecureRandom via native bridge callback
# - iOS: Use SecRandomCopyBytes via JSExport native bridge
#
# See CoreBridge.kt and CoreBridge.swift for production-ready implementations
# that expose native secure random to JavaScript.

# Bundle the mobile-safe exports for mobile (no DOM, pure JS)
# Use browser platform to get browser-compatible polyfills
npx esbuild \
    "$CORE_DIR/dist/mobile.js" \
    --bundle \
    --format=iife \
    --global-name=SCCore \
    --platform=browser \
    --target=es2020 \
    --outfile="$OUTPUT_DIR/sc-core.bundle.js" \
    --minify \
    --sourcemap \
    --external:crypto \
    --define:global=globalThis

# Also create an ESM version for newer JS engines
npx esbuild \
    "$CORE_DIR/dist/mobile.js" \
    --bundle \
    --format=esm \
    --platform=browser \
    --target=es2020 \
    --outfile="$OUTPUT_DIR/sc-core.esm.js" \
    --minify \
    --sourcemap \
    --external:crypto \
    --define:global=globalThis

echo "Mobile bundles created in $OUTPUT_DIR:"
ls -la "$OUTPUT_DIR"

# Copy to Android assets if the directory exists
ANDROID_ASSETS="$ROOT_DIR/android/app/src/main/assets"
if [ -d "$ROOT_DIR/android/app/src/main" ]; then
    mkdir -p "$ANDROID_ASSETS"
    cp "$OUTPUT_DIR/sc-core.bundle.js" "$ANDROID_ASSETS/"
    cp "$OUTPUT_DIR/sc-core.bundle.js.map" "$ANDROID_ASSETS/"
    echo "Copied bundle to Android assets: $ANDROID_ASSETS"
fi

# Copy to iOS Resources if the directory exists
IOS_RESOURCES="$ROOT_DIR/ios/SovereignCommunications/Resources"
if [ -d "$ROOT_DIR/ios/SovereignCommunications" ]; then
    mkdir -p "$IOS_RESOURCES"
    cp "$OUTPUT_DIR/sc-core.bundle.js" "$IOS_RESOURCES/"
    cp "$OUTPUT_DIR/sc-core.bundle.js.map" "$IOS_RESOURCES/"
    echo "Copied bundle to iOS Resources: $IOS_RESOURCES"
fi

echo "Build complete!"
