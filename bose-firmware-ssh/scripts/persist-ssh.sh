#!/usr/bin/env bash
# persist-ssh.sh -- make sshd/telnetd start on every boot (live, no reflash).
#
# The stock gate (remote_services_enabled) checks for marker files:
#   /mnt/nv/remote_services   NV storage — survives reboots (primary)
#   /etc/remote_services      rootfs marker — belt-and-suspenders
#   /tmp/remote_services      volatile (USB insert only)
#
# USB remote_services enables SSH for the current boot only. Run this after your
# first successful SSH login (or after flashing patched firmware) so port 22 stays
# open across reboots — including if you ever reflash stock firmware.
#
# Usage:
#   ./scripts/persist-ssh.sh <device-ip>     # apply over SSH from your Mac
#   ./scripts/persist-ssh.sh --cmds          # print commands to run on-speaker
#   ./scripts/persist-ssh.sh --cmds | ssh ... # pipe into an existing session
#
# Example:
#   ./scripts/persist-ssh.sh 192.168.0.119

set -euo pipefail

SSH_OPTS=(
  -o HostKeyAlgorithms=ssh-rsa
  -o PubkeyAcceptedAlgorithms=ssh-rsa
  -o StrictHostKeyChecking=accept-new
)

note() { printf '[persist-ssh] %s\n' "$*"; }
err()  { printf '[persist-ssh] ERROR: %s\n' "$*" >&2; }

on_device_cmds() {
  cat <<'EOF'
touch /mnt/nv/remote_services
mount -n -o remount,rw /
touch /etc/remote_services
/etc/init.d/sshd restart
remote_services_enabled && echo "SSH gate: enabled" || echo "SSH gate: disabled"
netstat -tlnp 2>/dev/null | grep ':22 ' || echo "WARN: sshd not listening on port 22"
EOF
}

apply_remote() {
  local host="$1"
  note "Applying persistent SSH markers on $host ..."
  ssh "${SSH_OPTS[@]}" -l root "$host" "$(on_device_cmds)"
  note "Done. Remove any remote_services USB stick from Setup B, then reboot to verify."
}

main() {
  if [[ "${1:-}" == "--cmds" ]]; then
    on_device_cmds
    exit 0
  fi
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -z "${1:-}" ]]; then
    sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
  fi
  apply_remote "$1"
}

main "$@"