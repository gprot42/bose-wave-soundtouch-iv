#!/usr/bin/env bash
# enable-ssh-usb.sh -- enable SSH/telnet on a Bose SoundTouch the way the
# firmware itself is designed to: a USB stick carrying an empty marker file
# named "remote_services" at its root.
#
# WHY THIS INSTEAD OF OTA:
#   The remote OTA path (scripts/ota-deploy.sh) CANNOT enable SSH on this
#   firmware, for two independent, live-confirmed reasons:
#     1. The index URL that /swUpdateCheck uses ("https://worldwide.bose.com/...")
#        is NOT overridable.  `sys configuration swUpdateUrl` writes the
#        CurrentSystemConfiguration PDO, but swUpdateCheck reads a different one;
#        even after a reboot the device still reports the stock worldwide.bose.com
#        URL (and it is https://, so DNS spoofing fails on the TLS cert).
#     2. The patched .stu carries the SAME version string (27.0.6.46330.5043500),
#        so the updater treats it as "already up to date" and never downloads.
#
#   The SSH gate (`remote_services_enabled`) is purely a check for one of three
#   marker files OR'd together:
#       /etc/remote_services        (rootfs, read-only)
#       /mnt/nv/remote_services     (NV  -- persists across reboots & updates)
#       /tmp/remote_services        (volatile -- this boot only)
#   The device's own udev rule (etc/udev/scripts/mount.sh) does, on USB insert:
#       if [ -e "$mnt/remote_services" ]; then
#           touch /tmp/remote_services
#           /etc/init.d/sshd start
#           /etc/init.d/telnetd start
#       fi
#   So a USB stick with that marker brings up sshd (22) + telnetd (23)
#   immediately, with no firmware flash, no reboot, no version games.
#
# Usage:
#   ./scripts/enable-ssh-usb.sh                 # interactive: lists disks, asks
#   ./scripts/enable-ssh-usb.sh diskN           # format diskN and write marker
#   ./scripts/enable-ssh-usb.sh --marker-only /Volumes/NAME
#                                               # just drop the marker on an
#                                               # already-mounted FAT volume
#   ./scripts/enable-ssh-usb.sh --persist-cmds  # print on-speaker persist commands
#   ./scripts/persist-ssh.sh <device-ip>        # apply persistence over SSH
#
# After insertion:
#   ssh -o HostKeyAlgorithms=ssh-rsa -o PubkeyAcceptedAlgorithms=ssh-rsa -l root <device-ip>
#   ./scripts/persist-ssh.sh <device-ip>   # required — survives reboots
#
# macOS only (uses diskutil).  Formatting a disk is DESTRUCTIVE -- you will be
# asked to confirm and to type the disk identifier.

set -euo pipefail

MARKER="remote_services"
LABEL="BOSESSH"

note() { printf '[enable-ssh-usb] %s\n' "$*"; }
err()  { printf '[enable-ssh-usb] ERROR: %s\n' "$*" >&2; }

persist_cmds() {
  local here
  here="$(cd "$(dirname "$0")" && pwd)"
  note "Run after first SSH login (or from repo root: ./scripts/persist-ssh.sh <device-ip>):"
  "$here/persist-ssh.sh" --cmds 2>/dev/null || on_device_cmds_fallback
}

on_device_cmds_fallback() {
  cat <<'EOF'
touch /mnt/nv/remote_services
mount -n -o remount,rw /
touch /etc/remote_services
/etc/init.d/sshd restart
remote_services_enabled && echo "SSH gate: enabled" || echo "SSH gate: disabled"
EOF
}

marker_only() {
  local vol="$1"
  [ -d "$vol" ] || { err "volume not found: $vol"; exit 1; }
  : > "$vol/$MARKER"
  sync
  note "Wrote marker: $vol/$MARKER"
  note "Eject, insert into the speaker's USB port. sshd+telnetd start on insert."
  note "Then:  ssh root@<device-ip>   (or telnet <device-ip>)"
}

list_disks() {
  note "External / removable disks:"
  diskutil list external physical 2>/dev/null || diskutil list
  echo
  note "Pick the USB stick's identifier (e.g. disk4 -- NOT disk0, that's your Mac)."
}

format_disk() {
  local disk="$1"
  case "$disk" in
    /dev/*) disk="${disk#/dev/}" ;;
  esac
  [[ "$disk" =~ ^disk[0-9]+$ ]] || { err "expected a whole-disk id like 'disk4', got '$disk'"; exit 1; }

  note "About to ERASE /dev/$disk and format it FAT (MS-DOS), label $LABEL."
  diskutil info "/dev/$disk" 2>/dev/null | grep -E "Device / Media Name|Disk Size|Removable|Protocol|Mount Point" || true
  echo
  read -r -p "Type the disk id again to confirm ERASE ($disk): " confirm
  [ "$confirm" = "$disk" ] || { err "confirmation mismatch -- aborting, nothing changed."; exit 1; }

  note "Formatting /dev/$disk ..."
  diskutil eraseDisk MS-DOS "$LABEL" MBR "/dev/$disk"

  local mnt="/Volumes/$LABEL"
  for _ in 1 2 3 4 5; do [ -d "$mnt" ] && break; sleep 1; done
  [ -d "$mnt" ] || { err "formatted but could not find mount point $mnt"; exit 1; }

  marker_only "$mnt"
  echo
  note "Done. Ejecting ..."
  diskutil eject "/dev/$disk" || true
  echo
  persist_cmds
}

main() {
  if [ "${1:-}" = "--persist-cmds" ]; then persist_cmds; exit 0; fi
  if [ "${1:-}" = "--marker-only" ]; then
    [ -n "${2:-}" ] || { err "--marker-only needs a mounted volume path (e.g. /Volumes/USB)"; exit 1; }
    marker_only "$2"; exit 0
  fi
  if [ -n "${1:-}" ]; then format_disk "$1"; exit 0; fi

  list_disks
  read -r -p "Disk id to format (or Ctrl-C to cancel): " disk
  [ -n "$disk" ] || { err "no disk given"; exit 1; }
  format_disk "$disk"
}

main "$@"
