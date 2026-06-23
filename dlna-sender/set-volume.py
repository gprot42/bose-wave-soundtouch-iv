#!/usr/bin/env python3
"""
set-volume.py — set or read volume on a Bose SoundTouch via the REST API (:8090).

Faster than UPnP for everyday control; optionally refreshes the front-panel
volume readout via the diagnostic telnet shell (:17000).

Usage
-----
  python3 set-volume.py 40
  python3 set-volume.py --get
  python3 set-volume.py 40 --update-display
  python3 set-volume.py --ip 192.168.0.119 --mute on
  BOSE_IP=192.168.0.119 python3 set-volume.py 25

Requirements: Python 3.8+ (stdlib only)
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

DEFAULT_IP = os.environ.get("BOSE_IP", "192.168.0.119")
API_PORT = 8090
TELNET_PORT = 17000


def api_url(ip: str, path: str) -> str:
    return f"http://{ip}:{API_PORT}{path}"


def http_get(url: str, timeout: float = 5.0) -> str:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def http_post(url: str, body: str, timeout: float = 5.0) -> str:
    data = body.encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/xml"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_volume_xml(xml_text: str) -> dict:
    root = ET.fromstring(xml_text)
    vol = root.find("targetvolume")
    if vol is None:
        vol = root.find("actualvolume")
    mute = root.find("muteenabled")
    level = int(vol.text) if vol is not None and vol.text else None
    muted = (mute.text or "").lower() == "true" if mute is not None else False
    return {"level": level, "mute": muted}


def get_volume(ip: str) -> dict:
    xml_text = http_get(api_url(ip, "/volume"))
    return parse_volume_xml(xml_text)


def set_volume(ip: str, level: int) -> None:
    level = max(0, min(100, level))
    http_post(api_url(ip, "/volume"), f"<volume>{level}</volume>")


def set_mute(ip: str, enabled: bool) -> None:
    current = get_volume(ip)
    level = current["level"] if current["level"] is not None else 30
    flag = "true" if enabled else "false"
    http_post(api_url(ip, "/volume"), f"<volume>{level}<muteenabled>{flag}</muteenabled></volume>")


def telnet_cmd(ip: str, command: str, timeout: float = 3.0) -> str:
    """Send one line to :17000 and collect the response."""
    with socket.create_connection((ip, TELNET_PORT), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall((command.strip() + "\n").encode())
        chunks: list[str] = []
        try:
            while True:
                data = sock.recv(4096)
                if not data:
                    break
                chunks.append(data.decode("utf-8", errors="replace"))
                if "OK" in chunks[-1] or "not found" in chunks[-1].lower():
                    break
        except socket.timeout:
            pass
    return "".join(chunks)


def update_display(ip: str, level: int) -> None:
    """Ask firmware to redraw the volume on the Wave console display."""
    level = max(0, min(100, level))
    response = telnet_cmd(ip, f"sys volume {level} updateDisplay")
    if "OK" not in response:
        print(f"Warning: telnet updateDisplay response unclear: {response!r}", file=sys.stderr)


def main() -> None:
    p = argparse.ArgumentParser(
        description="Get or set Bose SoundTouch volume via REST :8090.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("level", nargs="?", type=int, metavar="0-100",
                   help="Target volume (0-100)")
    p.add_argument("--get", action="store_true", help="Print current volume and exit")
    p.add_argument("--ip", default=DEFAULT_IP, metavar="IP",
                   help=f"Speaker IP (default: {DEFAULT_IP} or $BOSE_IP)")
    p.add_argument("--mute", choices=("on", "off"),
                   help="Enable or disable mute without changing level")
    p.add_argument("--update-display", action="store_true",
                   help="Also run telnet 'sys volume N updateDisplay' (Wave front panel)")
    args = p.parse_args()

    if args.get and args.level is not None:
        p.error("use either --get or a volume level, not both")
    if args.mute and args.level is not None:
        p.error("use either --mute or a volume level, not both")
    if not args.get and args.level is None and not args.mute:
        p.print_help()
        sys.exit(0)

    ip = args.ip
    try:
        if args.get:
            info = get_volume(ip)
            mute = "muted" if info["mute"] else "unmuted"
            print(f"{info['level']} ({mute})")
            return

        if args.mute:
            set_mute(ip, args.mute == "on")
            print(f"Mute {'enabled' if args.mute == 'on' else 'disabled'}.")
            if args.update_display:
                info = get_volume(ip)
                if info["level"] is not None:
                    update_display(ip, info["level"])
            return

        assert args.level is not None
        set_volume(ip, args.level)
        print(f"Volume set to {max(0, min(100, args.level))}.")
        if args.update_display:
            update_display(ip, args.level)

    except urllib.error.URLError as e:
        sys.exit(f"HTTP error talking to {ip}:{API_PORT}: {e}")
    except ET.ParseError as e:
        sys.exit(f"Could not parse /volume response: {e}")
    except OSError as e:
        sys.exit(f"Network error ({ip}): {e}")


if __name__ == "__main__":
    main()