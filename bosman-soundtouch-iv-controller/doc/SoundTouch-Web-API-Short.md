# Bose SoundTouch Web API – Kurzreferenz

## Basis
- **Protokoll:** HTTP
- **Port:** 8090 (REST), 8080 (WebSocket)
- **Format:** XML
- **GET** = lesen, **POST** = schreiben

---

## /key
Remote-Taste senden

**POST**
```xml
<key state="press|release" sender="app">PLAY</key>
```

---

## /select
Quelle auswählen

**POST**
```xml
<ContentItem source="AUX|BLUETOOTH|PRODUCT" sourceAccount="TV"/>
```

---

## /sources
Verfügbare Quellen

**GET**
```xml
<sources>
  <sourceItem source="AUX" status="READY"/>
</sources>
```

---

## /nowPlaying
Aktueller Wiedergabestatus

**GET**
```xml
<nowPlaying>
  <track>STRING</track>
  <artist>STRING</artist>
  <playStatus>PLAY_STATE</playStatus>
</nowPlaying>
```

---

## /volume
Lautstärke & Mute

**GET**
```xml
<volume>
  <targetvolume>50</targetvolume>
  <muteenabled>false</muteenabled>
</volume>
```

**POST**
```xml
<volume>40<muteenabled>false</muteenabled></volume>
```

---

## /bassCapabilities
Bass-Unterstützung

**GET**
```xml
<bassCapabilities>
  <bassAvailable>true</bassAvailable>
</bassCapabilities>
```

---

## /bass
Bass setzen/lesen

**POST**
```xml
<bass>5</bass>
```

---

## /presets
Presets abrufen

**GET**
```xml
<presets>
  <preset id="1">...</preset>
</presets>
```

---

## /info
Geräteinfos

**GET**
```xml
<info>
  <name>Wohnzimmer</name>
  <type>SoundTouch 300</type>
</info>
```

---

## /name
Gerätenamen setzen

**POST**
```xml
<name>Küche</name>
```

---

## Zonen (Multiroom)

### /getZone – GET  
### /setZone – POST  
### /addZoneSlave – POST  
### /removeZoneSlave – POST  

```xml
<zone master="MAC">
  <member ipaddress="IP">MAC</member>
</zone>
```

---

## WebSocket
```js
new WebSocket("ws://DEVICE_IP:8080", "gabbo")
```

Events:
- nowPlayingUpdated
- volumeUpdated
- bassUpdated
- zoneUpdated
