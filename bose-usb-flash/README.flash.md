# Offline USB Firmware Reflash — Bose Wave SoundTouch IV Pedestal

Use this guide when the pedestal is in the **stuck-firmware** state: the
`Bose Wave ST (…)` WiFi AP broadcasts, DHCP hands out leases, and the
speaker is ARP-reachable — but **every TCP port refuses instantly** and no
app (including the official Bose app) can connect. This is not a phone or
app problem. The setup web server inside the pedestal never launched. The
fix is a forced offline firmware reflash via a USB stick.

See [README.SoundTouchIV-wifi.md](README.SoundTouchIV-wifi.md) for the
full diagnosis and root-cause explanation.

---

## Why the Bose Updater website no longer works

Bose shut down the SoundTouch cloud servers, including the online
firmware-update servers, on **6 May 2026**. `btu.bose.com` returns 404.
OTA updates are gone. The only remaining path is the **offline USB method**
documented here.

---

## Overview

```
1. Get firmware   →  2. Prepare USB   →  3. Flash pedestal   →  4. Setup WiFi   →  5. Replace cloud (SoundCork)
```

---

## Step 1 — Identify your firmware

The Wave SoundTouch IV pedestal uses the **Bluetooth/SM2 platform** — do
not use the "Non-Bluetooth (2013-2015)" folder. Every firmware file for
your unit is named `Bluetooth_WST4_*.zip`.

### Community firmware archive (Internet Archive)

The full release history is preserved here — this is the only working
source since Bose's own servers are down:

**Browse:**
[https://archive.org/download/bose-soundtouch-software-and-firmware/Firmware/2015-2020_Bluetooth/Bluetooth_Wave_SoundTouch_IV/](https://archive.org/download/bose-soundtouch-software-and-firmware/Firmware/2015-2020_Bluetooth/Bluetooth_Wave_SoundTouch_IV/)

### Available versions (newest first)

| Version | Zip filename | Size |
|---------|-------------|------|
| **27.00.06** ← recommended | `Bluetooth_WST4_Update_ti_27.00.06.46330.5043500.nelson.sm2.zip` | 73.4 MB |
| 27.00.03 | `Bluetooth_WST4_Update_ti_27.00.03.46298.4608935.nelson.sm2.zip` | 73.4 MB |
| 27.00.02 | `Bluetooth_WST4_Update_ti_27.00.02.46286.4536626.nelson.sm2.zip` | 73.4 MB |
| 27.00.01 | `Bluetooth_WST4_Update_ti_27.00.01.46282.4378406.nelson.sm2.zip` | 73.4 MB |
| 26.00.01 | `Bluetooth_WST4_Update_ti_26.00.01.46256.3990103.nelson.sm2.zip` | 73.3 MB |
| 25.00.00 | `Bluetooth_WST4_Update_ti_25.00.00.46176.3844119.nelson.sm2.zip` | 73.0 MB |
| 14.00.33 | `Bluetooth_WST4_14.00.33.zip` | 58.5 MB |
| 09.00.41 | `Bluetooth_WST4_09.00.41.zip` | 55.4 MB |

**Use 27.00.06** (the newest in the archive). If that fails to flash,
try the previous 27.x release, then work backwards.

> **Why not downgrade?** Downgrading is only needed if a specific version
> caused the problem (e.g. an interrupted mid-version update). Start with
> the newest and only go backwards if reflashing the newest fails.

### Direct download link for 27.00.06

```
https://archive.org/download/bose-soundtouch-software-and-firmware/Firmware/2015-2020_Bluetooth/Bluetooth_Wave_SoundTouch_IV/Bluetooth_WST4_Update_ti_27.00.06.46330.5043500.nelson.sm2.zip
```

---

## Step 2 — Prepare the USB stick

### Requirements

- USB-A stick, **32 GB or smaller**
- Formatted **FAT32** — not exFAT, not NTFS

### Format the USB stick

**macOS:**
```sh
# Find the disk identifier (look for your USB under "external")
diskutil list

# Format as FAT32 — replace disk2 with your actual identifier
diskutil eraseDisk FAT32 BOSEFLASH MBRFormat /dev/disk2
```

**Windows:**
Use the [HP USB Disk Storage Format Tool](https://www.bleepingcomputer.com/download/hp-usb-disk-storage-format-tool/) —
choose FAT32, leave all other options unchecked.

**Linux:**
```sh
# Replace sdX1 with your partition
mkfs.vfat -F 32 /dev/sdX1
```

### macOS junk files — CRITICAL

macOS silently creates hidden files on every USB volume that **prevent the
pedestal from detecting the firmware file**. Remove them:

```sh
# Run after formatting, with the USB still mounted
mdutil -i off /Volumes/BOSEFLASH
rm -rf /Volumes/BOSEFLASH/.fseventsd
rm -rf /Volumes/BOSEFLASH/.Spotlight-V100
rm -f  /Volumes/BOSEFLASH/._*
```

(Tip from the [SoundCork speaker-setup guide](https://github.com/timvw/soundcork/blob/main/docs/speaker-setup.md) — confirmed to matter.)

### Extract and copy the firmware file

1. Download the zip (e.g. `Bluetooth_WST4_Update_ti_27.00.06…zip`)
2. Unzip it — you will find a file called **`Update.stu`** inside
3. Copy **only `Update.stu`** to the **root of the USB stick** — do not
   put it inside any folder
4. Eject the USB stick safely

Your USB stick should look like this:

```
BOSEFLASH/
└── Update.stu        ← the only file on the drive
```

---

## Step 3 — Flash the pedestal

The Wave SoundTouch IV pedestal has a **USB-A port on the back** (labelled
`SETUP` on some units, next to the Control button and the Bose Link
connector).

> **Which port?** The pedestal has two USB connections: the Micro-USB port
> (for the old computer-updater method, now broken since servers are down)
> and a **USB-A port** for a USB drive. Use the **USB-A port**.

### Procedure

1. **Make sure the pedestal is powered on** (Wave system on, light glowing).
2. **Insert the USB stick** into the **USB-A port** on the back of the
   pedestal.
3. The pedestal detects `Update.stu` automatically at boot. If it does not
   start updating within ~30 seconds:
   - **Pull the AC cord** (full power-off, not standby)
   - With the USB stick already inserted, **plug the AC cord back in**
   - The pedestal boots, finds `Update.stu`, and starts flashing
4. **Do not touch anything** while the update runs. The display may show
   a progress indicator, a "do not disconnect" symbol, or go blank. This
   takes 2–5 minutes.
5. The pedestal **reboots automatically** when complete.

### Signs the flash is working

- Display shows a progress bar or "UPDATE" / "PLEASE WAIT"
- WiFi light blinks during the process
- Pedestal reboots on its own at the end

### Signs something went wrong

- Nothing happens after 60 seconds with USB inserted → try the
  power-cycle boot method above
- Display shows an error code → the `Update.stu` file may be corrupted;
  re-download and retry
- Pedestal reboots into the same stuck state → try the previous firmware
  version (27.00.03, then 26.00.01)

---

## Step 4 — Verify and enter setup mode

After the reflash reboot:

1. Remove the USB stick.
2. Wait 60 seconds for the system to fully boot.
3. **Hold the Control button** on the back of the pedestal for ~3 seconds.
4. The WiFi light should go **solid amber** and the display should show
   **`SETUP SEE INSTRUCTIONS`**.
5. On your phone, join the `Bose Wave ST (…)` WiFi network and tap
   **Stay connected** when Android warns about no internet.
6. Open **BosMan** — the WiFi Setup panel should now be able to reach the
   speaker at `192.0.2.1` (or `192.168.1.1`) on port 80.
7. Pick your home WiFi, enter the password, submit. The pedestal reboots
   onto your home network. The `Bose Wave ST` AP disappears.

If setup mode still produces no port-80 response after reflashing, see
the [Field diagnostics section of README.SoundTouchIV-wifi.md](README.SoundTouchIV-wifi.md#field-diagnostics-hard-won-read-this-before-debugging)
for how to probe directly through the app.

---

## Step 5 — Replace the dead Bose cloud with SoundCork

Once the pedestal is on your home WiFi and reachable on port 8090, the
speaker works locally (BosMan can control it). However the **Bose cloud is
permanently gone** (shut down 6 May 2026), so:

- TuneIn presets no longer resolve
- The official Bose SoundTouch app loses most functionality
- You cannot configure new presets via the cloud

**SoundCork** is a self-hosted drop-in replacement for all four Bose cloud
servers. You run it on a Raspberry Pi, NAS, Docker host, or any always-on
machine, and redirect the speaker's cloud traffic to your server.

### Resources

- Project: <https://github.com/timvw/soundcork>
- Speaker setup guide: <https://github.com/timvw/soundcork/blob/main/docs/speaker-setup.md>
- Companion CLI: <https://github.com/timvw/bose>
- Write-up: [Keep your Bose SoundTouch alive after the shutdown](https://timvw.be/2026/02/17/keep-your-bose-soundtouch-speaker-alive-after-the-shutdown/)

### SoundCork setup in brief

The full procedure is in the [speaker-setup guide](https://github.com/timvw/soundcork/blob/main/docs/speaker-setup.md).
Summary:

#### 1. Enable SSH on the pedestal (USB method)

Create a **blank file called `remote_services`** (no extension) at the
root of a clean FAT32 USB stick. On macOS, remove junk files first (same
commands as Step 2 above). Then:

```
BOSEFLASH/
└── remote_services       ← empty file, no extension
```

- Power off the pedestal (pull AC cord)
- Insert the USB stick
- Power back on and wait ~60 seconds
- SSH in — no password required:

```sh
ssh root@<speaker-ip>
```

Find the speaker's IP from your router's DHCP list or:

```sh
# Once BosMan found it on port 8090, the IP is shown in the app
# Or check your router, or:
curl -s http://<speaker-ip>:8090/info | grep -o 'ip>[^<]*' | head -1
```

#### 2. Extract speaker data

```sh
curl http://<speaker-ip>:8090/presets    > Presets.xml
curl http://<speaker-ip>:8090/recents    > Recents.xml
curl http://<speaker-ip>:8090/info       > DeviceInfo.xml

# Sources.xml (Spotify tokens) — requires SSH:
ssh root@<speaker-ip> cat /mnt/nv/BoseApp-Persistence/1/Sources.xml > Sources.xml
```

Get your account UUID from `DeviceInfo.xml` — look for `margeAccountUUID`.

#### 3. Run SoundCork and redirect the speaker

Follow the [SoundCork README](https://github.com/timvw/soundcork) to
start the server, then on the pedestal:

```sh
ssh root@<speaker-ip>
rw    # make filesystem read-write
vi /opt/Bose/etc/SoundTouchSdkPrivateCfg.xml
```

Change all four server URLs to your SoundCork instance:

| Server | Original | Replace with |
|--------|---------|--------------|
| marge | `https://streaming.bose.com` | `https://your-soundcork-server` |
| bmx | `https://content.api.bose.io` | `https://your-soundcork-server` |
| updates | `https://worldwide.bose.com` | `https://your-soundcork-server` |
| stats | `https://events.api.bosecm.com` | `https://your-soundcork-server` |

Reboot the speaker. TuneIn presets and streaming resume through your
SoundCork server.

#### 4. Make SSH persistent (optional but recommended)

```sh
ssh root@<speaker-ip>
touch /mnt/nv/remote_services
```

This keeps SSH accessible across reboots so you can manage SoundCork
config without re-inserting the USB each time.

---

## Quick reference

| Stage | What to see | What to do next |
|-------|------------|-----------------|
| Before flash | AP broadcasts, DHCP works, port 80 refused | Flash `Update.stu` via USB-A |
| Flash in progress | Display shows update / WiFi light blinks | Wait, do not unplug |
| Flash complete | Pedestal reboots | Remove USB, hold Control ~3s for setup mode |
| Setup mode OK | Solid amber + `SETUP SEE INSTRUCTIONS` | Join Bose AP, open BosMan, enter home WiFi |
| On home WiFi | AP disappears, join home WiFi | Open BosMan, search devices |
| Cloud dead | Presets / TuneIn broken | Set up SoundCork |
| SoundCork running | Presets resolve, streaming works | Enjoy |

---

## References

- Firmware archive: <https://archive.org/download/bose-soundtouch-software-and-firmware/Firmware/2015-2020_Bluetooth/Bluetooth_Wave_SoundTouch_IV/>
- Community reflash guide: <https://www.reddit.com/r/bose/comments/1lb1uav/solved_bose_soundtouch_firmware_downgrade_guide/>
- Bose Wikia reflash guide: <https://bose.fandom.com/wiki/SoundTouch_Firmware_Downgrade_Guide>
- SoundCork project: <https://github.com/timvw/soundcork>
- SoundCork speaker setup: <https://github.com/timvw/soundcork/blob/main/docs/speaker-setup.md>
- Bose cloud EOL notice: <https://www.bose.com/soundtouch-end-of-life>
- WiFi setup guide: [README.SoundTouchIV-wifi.md](README.SoundTouchIV-wifi.md)
