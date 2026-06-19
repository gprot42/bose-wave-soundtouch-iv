# Bose SoundTouch Webservices API
**Bose Corporation**  
**Version 1.1.0**

---

## Contents
1. Document Version History  
2. Acronyms and Definitions  
3. Contact Info / Legal  
4. Overview  
   - 4.1 Special types used by the SoundTouch WSAPI  
5. General Status and Errors  
6. API Methods / URLs  
   - /key  
   - /select  
   - /sources  
   - /bassCapabilities  
   - /bass  
   - /getZone  
   - /setZone  
   - /addZoneSlave  
   - /removeZoneSlave  
   - /nowPlaying  
   - /trackInfo  
   - /volume  
   - /presets  
   - /info  
   - /name  
7. WebSockets  
   - 7.1 WebSocket Asynchronous Notifications  

---

## 1. Document Version History
| Version | Release Date | Description of Changes |
|----------|---------------|------------------------|
| 1.0.0 | December 5, 2014 | Initial Release |
| 1.0.1 | December 17, 2014 | Section 3 updated with a link to the License Agreement; corrected variable names, WebSocket port to 8080, and typos. |
| 1.1.0 | February 5, 2016 | Clarified `/select`, added WebSocket setup instructions, and reorganized sections. |
| 1.1.1 | December 16, 2025 | Project note: Added examples and confirmed usage for `/setMusicServiceAccount`, `/browse` with `source=STORED_MUSIC`, and `/select` to play DLNA Media Server items. |

---

## 2. Acronyms and Definitions
| Acronym | Expanded Term | Definition |
|----------|----------------|------------|
| API | Application Programming Interface | How to interact with and use a software component |
| REST | Representational State Transfer | Common web service API model |
| WS API | Webservices API | API made available by a web server |
| SSDP | Simple Services Discovery Protocol | Discovery protocol using UDP |
| MDNS | Multicast Domain Name System | Zero-configuration discovery protocol |
| Bonjour | — | Apple’s implementation of MDNS |

---

## 3. Contact Info / Legal
For questions or suggestions, email: **SoundTouchAPI@bose.com**  
License: [developers.bose.com/SoundTouchAPI-License](https://developers.bose.com/SoundTouchAPI-License)

---

## 4. Overview
Commands are sent over **HTTP (port 8090)** using GET and POST to communicate with a SoundTouch device.

### 4.1 Special Types Used by the SoundTouch WSAPI

```xml
ART_STATUS { INVALID, SHOW_DEFAULT_IMAGE, DOWNLOADING, IMAGE_PRESENT }
BOOL: "true" or "false"
INT: 32-bit integer
IPADDR: string
KEY_VALUE { PLAY, PAUSE, STOP, PREV_TRACK, NEXT_TRACK, THUMBS_UP, THUMBS_DOWN, BOOKMARK, POWER, MUTE, VOLUME_UP, VOLUME_DOWN, PRESET_1, PRESET_2, PRESET_3, PRESET_4, PRESET_5, PRESET_6, AUX_INPUT, SHUFFLE_OFF, SHUFFLE_ON, REPEAT_OFF, REPEAT_ONE, REPEAT_ALL, PLAY_PAUSE, ADD_FAVORITE, REMOVE_FAVORITE, INVALID_KEY }
KEY_STATE { press, release }
MACADDR: uppercase string
PLAY_STATUS { PLAY_STATE, PAUSE_STATE, STOP_STATE, BUFFERING_STATE, INVALID_PLAY_STATUS }
PRESET_ID: integer 1–6
SOURCE_STATUS { UNAVAILABLE, READY }
STRING: XML-escaped string
UINT: 32-bit unsigned integer
UINT64: 64-bit unsigned integer
URL: encoded string
```

---

## 5. General Status and Errors
Default Response:
```xml
<status>$STRING</status>
```
Error Response:
```xml
<errors deviceID="$STRING">
  <error value="$INT" name="$STRING" severity="$STRING">$STRING</error>
</errors>
```
Malformed Request Example:
```xml
<error>XML parse error (1:116): Error reading Attributes.</error>
```

---

## 6. API Methods / URLs

### 6.1 `/key`
**Description:** Send a remote button press to the device.  
Example:
```xml
<key state="press" sender="Gabbo">$KEY_VALUE</key>
<key state="release" sender="Gabbo">$KEY_VALUE</key>
```

---

### 6.2 `/select`
**Description:** Select AUX or Bluetooth source.  
Example:
```xml
<ContentItem source="AUX" sourceAccount="AUX"></ContentItem>
<ContentItem source="BLUETOOTH"></ContentItem>
```

---

### 6.3 `/sources`
List all available content sources.
```xml
<sources deviceID="$MACADDR">
  <sourceItem source="$SOURCE" sourceAccount="$STRING" status="$SOURCE_STATUS">$STRING</sourceItem>
</sources>
```

---

### 6.4 `/bassCapabilities`
Determine whether bass customization is supported.
```xml
<bassCapabilities deviceID="$MACADDR">
  <bassAvailable>$BOOL</bassAvailable>
  <bassMin>$INT</bassMin>
  <bassMax>$INT</bassMax>
  <bassDefault>$INT</bassDefault>
</bassCapabilities>
```

---

### 6.5 `/bass`
Set or get current bass setting.
```xml
<bass deviceID="$MACADDR">
  <targetbass>$INT</targetbass>
  <actualbass>$INT</actualbass>
</bass>
```
**POST:**
```xml
<bass>$INT</bass>
```

---

### 6.6 `/getZone`
Get current multi-room zone state.
```xml
<zone master="$MACADDR">
  <member ipaddress="$MASTER_IPADDR">$MASTER_MACADDR</member>
</zone>
```

---

### 6.7 `/setZone`
Create a multi-room zone.
```xml
<zone master="$MACADDR" senderIPAddress="$IPADDR">
  <member ipaddress="$IPADDR">$MACADDR</member>
</zone>
```

---

### 6.8 `/addZoneSlave`
Add a slave to a zone.
```xml
<zone master="$MACADDR">
  <member ipaddress="$IPADDR">$MACADDR</member>
</zone>
```

---

### 6.9 `/removeZoneSlave`
Remove a slave from a zone.
```xml
<zone master="$MACADDR">
  <member ipaddress="$IPADDR">$MACADDR</member>
</zone>
```

---

### 6.10 `/nowPlaying`
Get info about currently playing media.
```xml
<nowPlaying deviceID="$MACADDR" source="$SOURCE">
  <ContentItem source="$SOURCE" location="$STRING" sourceAccount="$STRING" isPresetable="$BOOL">
    <itemName>$STRING</itemName>
  </ContentItem>
  <track>$STRING</track>
  <artist>$STRING</artist>
  <album>$STRING</album>
  <stationName>$STRING</stationName>
  <art artImageStatus="$ART_STATUS">$URL</art>
  <playStatus>$PLAY_STATUS</playStatus>
  <description>$STRING</description>
</nowPlaying>
```

---

### 6.11 `/trackInfo`
Retrieve detailed track info (same format as `/nowPlaying`).

---

### 6.12 `/volume`
Get or set volume and mute status.
```xml
<volume deviceID="$MACADDR">
  <targetvolume>$INT</targetvolume>
  <actualvolume>$INT</actualvolume>
  <muteenabled>$BOOL</muteenabled>
</volume>
```
**POST:**
```xml
<volume>$INT</volume>
```

---

### 6.13 `/presets`
List of current presets.
```xml
<presets>
  <preset id="$PRESET_ID">
    <ContentItem source="$SOURCE" location="$STRING" sourceAccount="$STRING" isPresetable="$BOOL">
      <itemName>$STRING</itemName>
    </ContentItem>
  </preset>
</presets>
```

---

### 6.14 `/info`
Get device info (device ID, software version, serial number, etc.).
```xml
<info deviceID="$MACADDR">
  <name>$STRING</name>
  <type>$STRING</type>
  <components>
    <component>
      <componentCategory>$STRING</componentCategory>
      <softwareVersion>$STRING</softwareVersion>
      <serialNumber>$STRING</serialNumber>
    </component>
  </components>
  <networkInfo type="$STRING">
    <macAddress>$MACADDR</macAddress>
    <ipAddress>$IPADDR</ipAddress>
  </networkInfo>
</info>
```

---

### 6.15 `/name`
Set device name.
```xml
<name>$STRING</name>
```

---

## 7. WebSockets
SoundTouch devices use WebSockets on **port 8080** (protocol `gabbo`).  
Example:
```js
socket = new WebSocket("ws://<device_ip>:8080", "gabbo");
```

---

### 7.1 WebSocket Asynchronous Notifications
Clients listen for notifications from the SoundTouch device.

Example:
```xml
<updates deviceID="$MACADDR">
  <volume>
    <targetvolume>$INT</targetvolume>
  </volume>
</updates>
```

#### 7.1.1 PresetsChangedNotifyUI
Triggered when presets are changed.

#### 7.1.2 RecentsUpdatedNotifyUI
Triggered when recents list changes.

#### 7.1.3 AcctModeChangedNotifyUI
Triggered when account association changes.

#### 7.1.4 ErrorNotification
Reports an error.

#### 7.1.5 NowPlayingChange
Triggered when playback changes.

#### 7.1.6 VolumeChange
Triggered when volume changes.

#### 7.1.7 BassChange
Triggered when bass changes.

#### 7.1.8 ZoneMapChange
Triggered when zone configuration changes.

#### 7.1.9 SWUpdateStatusChange
Triggered when firmware update status changes.

#### 7.1.10 SiteSurveyResultsChange
Triggered when Wi-Fi survey results update.

#### 7.1.11 SourcesChange
Triggered when available sources change.

#### 7.1.12 NowSelectionChange
Triggered when the selected item changes.

#### 7.1.13 NetworkConnectionStatus
Triggered when network connection changes.

#### 7.1.14 InfoChange
Triggered when device information changes (e.g., name).

---
