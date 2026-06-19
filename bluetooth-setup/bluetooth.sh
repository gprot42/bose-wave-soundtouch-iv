#!/bin/bash

# Bose Bluetooth helper — scan, pair, connect via blueutil

require_blueutil() {
    BLUEUTIL=$(command -v blueutil 2>/dev/null)
    if [ -z "$BLUEUTIL" ]; then
        echo "Error: blueutil is not installed."
        echo ""
        echo "This script requires blueutil to manage Bluetooth on macOS."
        echo "Install it with Homebrew:"
        echo "  brew install blueutil"
        exit 1
    fi
}

require_blueutil

SCAN_DURATION=10
SCAN_RETRIES=2
SCAN_RETRY_DELAY=2
PAIR_SCAN_DURATION=10
PAIR_SCAN_RETRIES=3
PAIR_ATTEMPTS=3
PAIR_RETRY_DELAY=2
CACHE_FILE="$(dirname "$0")/.bluetooth-scan-cache"

usage() {
    echo "Usage: $0 <command> [device]"
    echo ""
    echo "Commands:"
    echo "  scan                    Scan for nearby Bluetooth devices"
    echo "  paired                  List all paired devices"
    echo "  connected               List connected devices"
    echo "  pair <name|address>     Pair with a device (by name or MAC)"
    echo "  unpair <name|address>   Unpair a device"
    echo "  connect <name|address>  Connect to a paired device"
    echo "  disconnect <name|address> Disconnect from a device"
    echo ""
    echo "Examples:"
    echo "  $0 scan"
    echo "  $0 pair Bose              # matches SoundTouch speakers"
    echo "  $0 pair SoundTouch"
    echo "  $0 pair 00-09-a7-ae-19-3e"
    echo "  $0 connect Bose"
}

run_blueutil() {
    $BLUEUTIL "$@"
    exit $?
}

pairing_failure_help() {
    echo ""
    echo "Pairing failed: the speaker must be in Bluetooth pairing mode."
    echo "On SoundTouch: press and hold the Bluetooth button until the light blinks."
    echo "Then run '$0 scan' to confirm it appears, and retry '$0 pair Bose' immediately."
}

check_bluetooth_power() {
    if [ "$($BLUEUTIL -p 2>/dev/null)" != "1" ]; then
        echo "Error: Bluetooth is turned off. Enable it in System Settings."
        exit 1
    fi
}

# Run device inquiry with retries (discovery is intermittent on macOS)
inquiry_devices() {
    local attempt duration output retries

    retries="${1:-$SCAN_RETRIES}"
    duration="${2:-$SCAN_DURATION}"

    for attempt in $(seq 1 "$retries"); do
        output=$($BLUEUTIL --inquiry "$duration" 2>/dev/null)
        if [ -n "$output" ]; then
            cache_inquiry_output "$output"
            echo "$output"
            return 0
        fi
        if [ "$attempt" -lt "$retries" ]; then
            sleep "$SCAN_RETRY_DELAY"
        fi
    done
    return 1
}

device_line_for_mac() {
    local mac="$1"
    local output="$2"
    echo "$output" | grep -i "$mac" | head -1
}

is_device_paired() {
    local mac="$1"
    $BLUEUTIL --paired 2>/dev/null | grep -i "$mac" | grep -qi 'paired'
}

is_mac_address() {
    local query="$1"
    [[ "$query" =~ ^([0-9A-Fa-f]{2}[-:]){5}[0-9A-Fa-f]{2}$ ]] || [[ "$query" =~ ^[0-9A-Fa-f]{12}$ ]]
}

parse_address() {
    awk -F', ' '{print $1}' | cut -d' ' -f2
}

# Match a device line against a name/address query (supports "bose" as SoundTouch alias)
find_device_in_output() {
    local query="$1"
    local output="$2"
    local result

    if [ -z "$output" ]; then
        echo ""
        return 1
    fi

    result=$(echo "$output" | grep -i "$query" | head -1 | parse_address)
    if [ -n "$result" ]; then
        echo "$result"
        return 0
    fi

    # "bose" shorthand matches Bose SoundTouch speakers that omit "Bose" in the name
    if echo "$query" | grep -qiE '^bose$'; then
        result=$(echo "$output" | grep -iE 'soundtouch|\bbose\b' | head -1 | parse_address)
        if [ -n "$result" ]; then
            echo "$result"
            return 0
        fi
    fi

    echo ""
    return 1
}

cache_inquiry_output() {
    local output="$1"
    if [ -n "$output" ]; then
        echo "$output" > "$CACHE_FILE"
    fi
}

read_cached_devices() {
    if [ -f "$CACHE_FILE" ]; then
        cat "$CACHE_FILE"
    fi
}

# Resolve device name or address to MAC address
resolve_device() {
    local query="$1"
    local require_live="${2:-0}"
    local result output

    if is_mac_address "$query"; then
        echo "$query"
        return 0
    fi

    if [ "$require_live" -eq 0 ]; then
        result=$(find_device_in_output "$query" "$($BLUEUTIL --paired 2>/dev/null)")
        if [ -n "$result" ]; then
            echo "$result"
            return 0
        fi

        result=$(find_device_in_output "$query" "$(read_cached_devices)")
        if [ -n "$result" ]; then
            echo "$result"
            return 0
        fi
    fi

    output=$(inquiry_devices "$PAIR_SCAN_RETRIES" "$PAIR_SCAN_DURATION")
    result=$(find_device_in_output "$query" "$output")
    if [ -n "$result" ]; then
        echo "$result"
        return 0
    fi

    echo ""
    return 1
}

attempt_pair() {
    local mac="$1"
    local attempt output

    for attempt in $(seq 1 "$PAIR_ATTEMPTS"); do
        if [ "$attempt" -gt 1 ]; then
            echo "Retrying pairing (attempt $attempt/$PAIR_ATTEMPTS)..."
            sleep "$PAIR_RETRY_DELAY"
            output=$(inquiry_devices 1 "$PAIR_SCAN_DURATION")
            if ! device_line_for_mac "$mac" "$output" | grep -q .; then
                echo "Device $mac not visible during scan."
                continue
            fi
        fi

        if $BLUEUTIL --pair "$mac" 2>&1; then
            return 0
        fi
    done

    return 1
}

require_device() {
    if [ -z "$1" ]; then
        echo "Error: Please specify a device name or address"
        usage
        exit 1
    fi
}

case "$1" in
    scan)
        check_bluetooth_power
        echo "🔍 Scanning for nearby Bluetooth devices..."
        if ! inquiry_devices; then
            echo "No Bluetooth devices found nearby."
            echo "Tip: Make sure your Bose speaker is powered on and in pairing mode (Bluetooth light blinking)."
        fi
        ;;

    paired)
        echo "📱 Paired Bluetooth devices:"
        $BLUEUTIL --paired
        ;;

    connected)
        echo "🔌 Connected Bluetooth devices:"
        $BLUEUTIL --connected
        ;;

    pair)
        check_bluetooth_power
        require_device "$2"
        echo "🔍 Looking for $2 nearby (speaker must be in pairing mode)..."
        mac=$(resolve_device "$2" 1)
        if [ -z "$mac" ]; then
            echo "❌ Device not found: $2"
            echo "Put the speaker in Bluetooth pairing mode, run '$0 scan', then retry immediately."
            exit 1
        fi
        if is_device_paired "$mac"; then
            echo "✅ Already paired with $2 ($mac)"
            echo "Run '$0 connect $2' to connect."
            exit 0
        fi
        echo "🔗 Pairing with $2 ($mac)..."
        if attempt_pair "$mac"; then
            echo "✅ Paired with $2 ($mac)"
            echo "Run '$0 connect $2' to connect."
            exit 0
        fi
        pairing_failure_help
        exit 1
        ;;

    unpair)
        require_device "$2"
        mac=$(resolve_device "$2")
        if [ -z "$mac" ]; then
            echo "❌ Device not found: $2"
            exit 1
        fi
        echo "🗑️  Unpairing $2 ($mac)..."
        run_blueutil --unpair "$mac"
        ;;

    connect)
        require_device "$2"
        mac=$(resolve_device "$2")
        if [ -z "$mac" ]; then
            echo "❌ Device not found: $2"
            exit 1
        fi
        echo "🔌 Connecting to $2 ($mac)..."
        run_blueutil --connect "$mac"
        ;;

    disconnect)
        require_device "$2"
        mac=$(resolve_device "$2")
        if [ -z "$mac" ]; then
            echo "❌ Device not found: $2"
            exit 1
        fi
        echo "🔌 Disconnecting from $2 ($mac)..."
        run_blueutil --disconnect "$mac"
        ;;

    *)
        usage
        exit 1
        ;;
esac