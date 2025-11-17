#!/bin/bash

# Lint script for all platforms
# This script helps developers run linting locally before pushing

set -e

echo "🔍 Running linters for all platforms..."
echo ""

# TypeScript/JavaScript linting
echo "📝 Linting TypeScript/JavaScript..."
npm run lint
echo "✅ TypeScript/JavaScript linting passed"
echo ""

# Kotlin linting (if ktlint is installed)
if command -v ktlint &> /dev/null; then
    echo "📱 Linting Kotlin (Android)..."
    cd android
    ktlint --android "app/src/**/*.kt" || echo "⚠️  Kotlin linting found issues"
    cd ..
    echo ""
else
    echo "⚠️  ktlint not installed, skipping Kotlin linting"
    echo "   Install with: brew install ktlint"
    echo ""
fi

# Swift linting (if swiftlint is installed)
if command -v swiftlint &> /dev/null; then
    echo "🍎 Linting Swift (iOS)..."
    cd ios
    swiftlint lint --quiet || echo "⚠️  Swift linting found issues"
    cd ..
    echo ""
else
    echo "⚠️  swiftlint not installed, skipping Swift linting"
    echo "   Install with: brew install swiftlint"
    echo ""
fi

echo "✨ Linting complete!"
