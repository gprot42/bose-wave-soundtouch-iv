# Projekt-Guidelines für Junie

## Allgemeines

- Projektname: Bosman – SvelteKit-5-App zur lokalen Verwaltung von Bose SoundTouch Geräten im Heimnetz.
- Tech-Stack:
    - Svelte 5 mit SvelteKit (`@sveltejs/kit`).
    - Vite als Dev-/Build-Tool.
    - Tailwind CSS 4 + Flowbite-Svelte und Flowbite-Svelte-Plugins für UI-Komponenten.
    - TypeScript als primäre Sprache.
    - Adapter: `@sveltejs/adapter-node` für Serverbetrieb, optional `@sveltejs/adapter-static` für statische Builds.
    - Capacitor 7 (Android, iOS) für mobile Builds mit `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` und weiteren Plugins.
- Ziel:
    - Eine einheitliche Codebasis, die im Browser, als Node-Backend und als mobile App über Capacitor laufen kann.
    - Lokale Steuerung von Bose SoundTouch Geräten über die inoffizielle Bose SoundTouch Webservices API v1.1.0.

## Projektstruktur / SvelteKit

- Standard SvelteKit-Struktur verwenden:[web:11]
    - Seiten und Routen unter `src/routes`.
    - Wiederverwendbare Komponenten unter `src/lib/components`.
    - Stores (z.B. für Geräte- und Preset-Status) unter `src/lib/stores`.
    - Utility-/Service-Layer (z.B. Bose-/SSDP-Client, DB-Zugriff) unter `src/lib/utils`.
- Beim Erstellen neuer Routen:
    - UI in `+page.svelte`.
    - Datenladen nur bei Bedarf in `+page.ts` oder `+page.server.ts` entsprechend SvelteKit-Best Practices.
- Adapter:
    - Bestehende Adapter-Konfiguration (`@sveltejs/adapter-node`, `@sveltejs/adapter-static`) nicht eigenständig ändern, außer wenn ausdrücklich beauftragt.

## Styling / UI

- Styling ausschließlich mit Tailwind CSS 4 und Flowbite-Svelte-/Flowbite-Svelte-Plugins umsetzen.[web:33][web:36][web:39]
- Wenn neue UI-Elemente benötigt werden:
    - Zuerst Flowbite-Svelte-Komponenten verwenden, erst danach eigene Komponenten in `src/lib/components` erstellen.
- Formulare:
    - `@tailwindcss/forms`-Plugin nutzen.
- Typografie:
    - `@tailwindcss/typography` für längere Texte / Dokumentationsseiten.
- Keine Inline-Styles, außer für sehr kleine, klar begrenzte Ausnahmen.

## Bose SoundTouch & Discovery

- Discovery:
    - Für die Suche nach lokalen Bose SoundTouch Geräten `node-ssdp` verwenden.[web:26][web:29][web:38]
    - Es gibt bereits ein /Users/andre/work/bosman/src/lib/server/soundtouch.ts die alle Schnittstellen zu der Bose Box Kapseln soll. Alle Post, Get usw. sollen die Funktionen in der Datei verwenden. 
    - SSDP-Discovery in einem eigenen Modul kapseln, z.B. `src/lib/utils/ssdpDiscovery.ts`.
    - Funktionen bereitstellen wie:
        - `discoverDevices()` → Liste der gefundenen Geräte (IP, Friendly Name, Typ, ggf. weitere Metadaten).
- Bose-Control:
    - Gerätelogik in einem separaten Client-Modul, z.B. `src/lib/utils/boseClient.ts`.
    - Der Client nutzt die bekannte/intern dokumentierte Bose SoundTouch Webservices API (HTTP/XML) über die IP des Geräts:[web:16][web:41]
        - Endpunkte auf Port 8090 (z.B. `GET /now_playing`, `POST /select`, `POST /volume`, Zonen-Steuerung usw.).
    - Der Client soll:
        - Status, Lautstärke, Quelle, Presets und ggf. Now-Playing-Infos abrufen.
        - Befehle ausführen: Play/Pause, Lautstärke, Mute, Preset-Auswahl, Quellenwechsel, Zonen/Multiroom (falls unterstützt).
- Netzwerk / Sicherheit:
    - Lokales Netz ist primäre Zielumgebung.
    - Timeouts und robuste Fehlerbehandlung bei Netzwerkzugriffen einbauen.
    - Keine sensiblen Konfigurationswerte hardcoden; falls nötig über Umgebungsvariablen und SvelteKit-Konfiguration.

## Capacitor / Mobile

- Capacitor-Abhängigkeiten (`@capacitor/android`, `@capacitor/ios`, `@capacitor/core`, `@capacitor-community/sqlite` usw.) werden für Mobil-Builds genutzt.
- Junie soll:
    - Keine Plattform-spezifischen Build-Skripte oder `capacitor.config` grundlegend verändern, außer dies wird explizit angefordert.
    - Beim Zugriff auf Plattform-APIs prüfen, ob der Code sowohl im Browser als auch im Capacitor-Kontext sicher läuft (trennen von Node-spezifischen Imports und Browser-Code).

## Datenhaltung (SQLite / sql.js)

- Lokale Datenhaltung:
    - `sql.js` und/oder `@capacitor-community/sqlite` verwenden.[web:54]
    - Zugriff auf Datenbank in einem separaten Modul, z.B. `src/lib/utils/db.ts`.
    - Kein SQL direkt in Svelte-Komponenten; statt dessen API-Funktionen anbieten wie:
        - `getDevices()`, `saveDevice()`, `getPresets()`, `savePreset()` usw.
- Ziel:
    - Klarer, testbarer Datenzugriff.
    - Leichte Austauschbarkeit der konkreten DB-Implementierung.

## Internationalisierung

- Für Übersetzungen `svelte-i18n` verwenden.[web:37]
- Neue Texte:
    - Keys in bestehenden i18n-Dateien ergänzen, keine hartkodierten Strings einführen, sofern eine i18n-Struktur existiert.
- Junie soll:
    - Bei neuen UI-Texten bevorzugt vorhandene Pattern und Namespaces verwenden.

## Linting / Formatierung

- ESLint mit `@typescript-eslint` und `eslint-plugin-svelte` verwenden.
- Prettier mit `prettier-plugin-svelte` als Formatierungsstandard.
- Junie soll:
    - Sich an die bestehende ESLint/Prettier-Konfiguration halten.
    - Keine bestehenden Lint-/Format-Konfigurationen löschen oder grundlegend umstrukturieren.

## UX-Richtlinien für Bosman

- Startseite:
    - Liste aller gefundenen Bose SoundTouch Geräte mit Name, Erreichbarkeit/Status und Basisaktionen (Play/Pause, Lautstärke, ggf. Quelle).[web:12][web:48]
- Detailseite je Gerät:
    - Steuerung von Lautstärke (Slider), Mute, Quellenwechsel, Preset-Auswahl.
    - Anzeige des aktuellen Titels / Inputs, sofern von der API bereitgestellt.[web:16][web:52]
- Lade- und Fehlerzustände:
    - Deutliche Ladeindikatoren für Discovery (z.B. „Suche nach Geräten…“).
    - Nutzerfreundliche Fehlermeldungen bei nicht erreichbaren Geräten oder Netzwerkproblemen sowie Möglichkeit zum erneuten Versuch.

## HTTP-Scripts für SoundTouch

- Beispiel-HTTP-Requests zur Bose SoundTouch API sollen immer im Ordner `http-scripts/` im Projektroot abgelegt werden.
- Format der Dateien:
    - Manuell ausführbare Skripte (z.B. `.http` / `.rest` mit HTTP-Client-Syntax, `curl`-Snippets oder kleine Node-Skripte) mit klaren Parametern für IP/Port.
    - Ein Skript pro Datei oder logisch gruppiert (z.B. `volume.http`, `presets.http`, `zones.http`).
- Zweck:
    - Die Skripte sollen das Verhalten einzelner Endpunkte der inoffiziellen SoundTouch Webservices API demonstrieren und testbar machen.[web:16][web:43]
    - Sie müssen so geschrieben sein, dass sie leicht von Hand angepasst und ausgeführt werden können (z.B. IP/DeviceID am Anfang der Datei als Variable/Konstante).
- Wenn neue API-Aufrufe implementiert werden (z.B. neue Endpunkte aus Bose SoundTouch API v1.1.0 oder inoffizielle Erweiterungen), soll Junie:
    1. Einen passenden HTTP-Request in `http-scripts/` anlegen oder bestehende Dateien erweitern.
    2. Die wichtigsten Beispiele mit kurzen Kommentaren versehen (z.B. „Set volume“, „Get now playing“, „Create zone
