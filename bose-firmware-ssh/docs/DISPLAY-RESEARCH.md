# Display research — Wave SoundTouch IV custom messages

Status: **in progress** (2026-06). There is no public HTTP API for arbitrary
front-panel text. This doc records what we know and the next RE steps.

## Architecture

The Wave SoundTouch IV is two units:

| Unit | Hardware | Software |
|------|----------|----------|
| **Pedestal** (SCM) | Network, WiFi, USB Setup B | Linux `lisa` / `sm2`, SSH, `:8090`, `:17000` |
| **Wave console** (SMSC) | VFD/LCD, buttons, radio | Firmware `04.04.08`, reached via **ABL** bus |

The pedestal never renders the front display itself. `ABLServer` bridges IPC
between `BoseApp` and the console over `/dev/abl0`–`/dev/abl2` (char 32:x).

```
BoseApp (:8090 REST) ──IPC──▶ ABLServer (:1200, :17006) ──ABL──▶ Wave console display
CLIServer (:17000 telnet) ──▶ internal services (no display text commands)
```

## What works today (no RE)

| Method | Effect on display | Interface |
|--------|-------------------|-----------|
| Now-playing metadata | Track / artist while playing | DLNA/UPnP, AirPlay, Spotify |
| `sys volume N updateDisplay` | Refreshes volume number | Telnet `:17000` |
| `/volume` POST | Sets level (may not redraw console) | REST `:8090` |
| `/key` POST | Emulates remote; changes UI state | REST `:8090` |
| Setup / update / error states | Fixed firmware strings | Internal only |

`dlna-sender/set-volume.py` wraps `:8090` volume + optional `updateDisplay`.

## Internal symbols (confirmed on FW 27.0.6)

From `strings` on a live Wave IV (`192.168.0.119`):

### ABLServer (console bridge)

- `DisplayLisaStatusMsg` — `ABLNelson::DisplayLisaStatusMsg(unsigned)` — likely
  a **status enum**, not free text (mangled name ends in `Ej` = `unsigned`).
- `BoseLinkServerMsgDefinitions.proto` — protobuf schema embedded in binary.
- `PASS_THROUGH_EVT_LISA_BUTTON_PnH` — console button events forwarded to pedestal.
- ABL repo messages: `ABLRepoRxFinalStatusMsg`, staging/download paths for console FW.

### BoseApp (UI state machine)

- `CDisplayNotificationState`, `DisplayNotificationMsg` — notification overlay path.
- `CDisplayOnPtsState`, `CDisplayOnSetupState`, `CDisplayOnUpdateState`, etc.
- `SoundTouchInterface::CustomError` — fields: `title`, `message`, `shortmessage`
  (error popups, not a general message API).
- `ChimesTO`, `AudioServerMsgPlayChime` — short audio + notification screen.

### Protobuf build paths (in binary strings)

Useful for Ghidra / descriptor extraction:

```
SoundTouch-SDK-proto/SoundTouchInterface/Status.pb.cc
SoundTouch-SDK-proto/SoundTouchInterface/Msg.pb.cc
SoundTouch-SDK-proto/SoundTouchInterface/ErrorUpdate.pb.cc
builds/Release/ti/proto/BoseLinkServerMsgDefinitions.pb.cc
builds/Release/ti/proto/CLIServerMsgDefinitions.pb.cc
Common/BoseLibs/IPC/Directory/IpcServices.pb.cc
```

No `.proto` files ship on device — only compiled descriptors inside ELF binaries
(`/opt/Bose/ABLServer`, `/opt/Bose/BoseApp`, `/opt/Bose/scmmond`).

## What does *not* work

- REST `:8090/display`, `/message`, `/scroll` → **404**
- `/select` with `source="NOTIFICATION"` → accepts POST but `nowPlaying` becomes
  `INVALID_SOURCE` on Wave IV (tested 2026-06).
- Telnet `:17000` `display …` / `lisa …` → `Command not found` / `Invalid Command Option`
- `/name` POST → changes `:8090/info` name only; not verified on front panel.

## Next research steps (ordered)

### Step 1 — Extract protobuf descriptors from pedestal ELFs

On a Linux host (or colima container from `stu-toolbox.sh`):

```sh
# Copy binaries off the speaker
scp -o HostKeyAlgorithms=ssh-rsa -o PubkeyAcceptedAlgorithms=ssh-rsa \
    root@192.168.0.119:/opt/Bose/ABLServer work/bin/
scp ...:/opt/Bose/BoseApp work/bin/

# Option A: protobuf-inspector on captured payloads (after step 2)
pip install protobuf-inspector

# Option B: Ghidra + protobuf descriptor recovery from .pb.cc symbols
# Search for FileDescriptorProto blobs in .rodata of ABLServer / BoseApp
```

**Goal:** Reconstruct `BoseLinkServerMsgDefinitions.proto` and find the message
type that carries display text (candidates: `DisplayNotificationMsg`,
`SoundTouchInterface.Status`, `CustomError`).

### Step 2 — Correlate display changes with IPC traffic

While SSH'd into the pedestal, trigger known display updates and log traffic:

| Trigger | Expected display change | Capture |
|---------|-------------------------|---------|
| `sys volume 30 updateDisplay` | Volume digits | `tcpdump -i lo port 17006` |
| Enter setup mode (Control button) | `SETUP SEE INSTRUCTIONS` | same + ABL |
| `curl -X POST :8090/key … PLAY` | Play indicator | BoseApp logs |
| DLNA play with long `itemName` | Scrolling title | nowPlaying + ABL |

```sh
# On speaker (if tcpdump available — may need busybox build)
tcpdump -i lo -w /tmp/abl-lo.pcap port 17006 or port 4140

# Alternative: strace ABLServer message path (heavy)
strace -p $(pidof ABLServer) -e trace=network,write -s 200 2>&1 | tee /tmp/abl.trace
```

**Goal:** Find which localhost port and protobuf message fires on each display update.

### Step 3 — Map `DisplayLisaStatusMsg(uint)` enum values

`DisplayLisaStatusMsg` takes an **unsigned integer**, not a string — likely maps
to predefined status screens (setup, update, idle, error codes).

1. Hold Control button → capture ABL traffic → note integer in payload.
2. Repeat for volume `updateDisplay`, preset change, Bluetooth pair chime.
3. Build enum table: `value → on-screen text`.

If all interesting states are enum-driven, **free text may be impossible** without
console firmware mod.

### Step 4 — Probe `DisplayNotificationMsg` / `CustomError` injection

`CustomError` has `title` + `message` string fields — most promising for custom
text if we can inject via BoseApp IPC.

Candidates to try (after descriptor recovery):

- `CLIServer` localhost `:4140` — `CLIServerMsgSendCommand` protobuf envelope.
- UDS socket paths referenced in `IpcServices.pb` / `UdsListenerSocket.cpp` strings.
- Write to `/dev/abl0` with correct ABL framing (needs protocol doc from step 2).

**Safety:** Test on a unit you own; wrong ABL frames could wedge the console link
(require power-cycle).

### Step 5 — Practical workaround until RE completes

For user-visible custom text without console RE:

1. **DLNA metadata** — `send-to-bose.py` with ID3 title/artist set to your message
   (scrolling marquee while “playing” a silent or short MP3).
2. **Volume overlay** — `set-volume.py --update-display` for numeric feedback.
3. **Telnet keys** — drive presets/modes that show known built-in strings.

## Tooling to add (future PRs)

| Script | Purpose |
|--------|---------|
| `scripts/capture-abl.sh` | SSH helper: tcpdump/strace during a user-triggered event |
| `scripts/decode-ipc.py` | Parse `IPCMessageEnvelope` once descriptors are recovered |
| `dlna-sender/send-message.py` | DLNA play wrapper with custom title/artist tags |

## References

- [gesellix TELNET-COMMAND-REFERENCE](https://github.com/gesellix/Bose-SoundTouch/blob/main/docs/content/docs/analysis/TELNET-COMMAND-REFERENCE.md) — `sys volume N updateDisplay`
- [Bose SoundTouch Web API](bosman-soundtouch-iv-controller/doc/Bose_SoundTouch_API_v1.1.0.md) — `/volume`, `/key`, `/nowPlaying`
- Live unit: `lisa` / `sm2`, FW `27.0.6.46330.5043500`, IP `192.168.0.119`