#!/bin/bash

if ! command -v blueutil >/dev/null 2>&1; then
    echo "Error: blueutil is not installed."
    echo ""
    echo "This script requires blueutil to manage Bluetooth on macOS."
    echo "Install it with Homebrew:"
    echo "  brew install blueutil"
    exit 1
fi

exec "$(dirname "$0")/bluetooth.sh" "$@"