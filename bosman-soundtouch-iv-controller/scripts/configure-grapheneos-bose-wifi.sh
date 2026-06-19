#!/usr/bin/env bash
# Configure GrapheneOS/Android for Bose SoundTouch local WiFi (no internet).
# Requires: adb, USB debugging enabled, phone connected.
set -euo pipefail

BOSE_SSID="${BOSE_SSID:-Bose Wave ST (90E9CA)}"
BOSE_BSSID="${BOSE_BSSID:-}"

if ! adb get-state >/dev/null 2>&1; then
  echo "No adb device found. Connect the phone with USB debugging enabled."
  exit 1
fi

echo "Device: $(adb shell getprop ro.product.model | tr -d '\r')"
echo "Configuring GrapheneOS for Bose WiFi..."

# Reduce aggressive disconnect on networks without internet
adb shell settings put global captive_portal_mode 0
adb shell settings put global captive_portal_detection_enabled 0
adb shell settings put global captive_portal_use_https 0
adb shell settings put global captive_portal_http_url http://127.0.0.1/generate_204
adb shell settings put global captive_portal_https_url https://127.0.0.1/generate_204
adb shell settings put global wifi_avoid_bad_wifi 0
adb shell settings put global network_avoid_bad_wifi 0
adb shell settings put global wifi_sleep_policy 2
adb shell settings put global wifi_wakeup_enabled 0
adb shell settings put global wifi_always_requested 1

# Prefer WiFi over mobile data while controlling the speaker
adb shell settings put global mobile_data 0
adb shell settings put global mobile_data_always_on 0
adb shell svc data disable 2>/dev/null || true

# WiFi framework tweaks (shell-accessible on many builds)
adb shell cmd wifi set-ipreach-disconnect disabled 2>/dev/null || true
adb shell cmd wifi set-network-selection-config disabled disabled -a 1 2>/dev/null || true
adb shell cmd wifi set-wifi-enabled enabled

# Resolve BSSID from scan if not provided
if [[ -z "$BOSE_BSSID" ]]; then
  adb shell cmd wifi start-scan >/dev/null 2>&1 || true
  sleep 3
  BOSE_BSSID="$(adb shell "cmd wifi list-scan-results" 2>/dev/null | grep -i bose | awk '{print $1}' | head -1 | tr -d '\r' || true)"
fi

echo "Connecting to \"$BOSE_SSID\"${BOSE_BSSID:+ (BSSID $BOSE_BSSID)} with device MAC..."
if [[ -n "$BOSE_BSSID" ]]; then
  adb shell "cmd wifi connect-network \"$BOSE_SSID\" open -r none -b $BOSE_BSSID"
else
  adb shell "cmd wifi connect-network \"$BOSE_SSID\" open -r none"
fi

sleep 3
adb shell cmd wifi status | grep -E 'connected|SSID|IP:|MAC:' || true

echo ""
echo ">>> IMPORTANT: On the phone, tap \"Stay connected\" / \"Use this network\" if Android warns about no internet."
echo ">>> Also set Bose network Privacy → MAC address → Use device MAC (not randomized)."
echo ">>> Opening WiFi settings..."
adb shell am start -a android.settings.WIFI_SETTINGS >/dev/null

echo ""
echo "When connected, verify:"
echo "  adb shell ip -4 addr show wlan0"
echo "  adb shell cmd wifi status"
echo ""
echo "Then open BosMan. If prompted, allow BosMan to use the Bose WiFi network."