### Comparison of Self-Analyzed API vs. Official Bose SoundTouch Web API

I have compared your self-analyzed documentation (`doc/Bose_SoundTouch_API_v1.1.0.md`) with the newly provided official API document (`doc/2025.12.18-SoundTouch-Web-API.md`).

#### Key Findings

1.  **Version Paradox**
    - Your self-analyzed document is based on **Version 1.1.0 (2016)**.
    - The new official API is labeled **Version 1.0.0 (Release Date: January 7, 2026)**.
    - Despite the lower version number, the official API is the more recent publication and introduces several new modern endpoints.

2.  **Naming Discrepancies (Case Sensitivity)**
    - **Official API:** Lists `/nowPlaying` (CamelCase).
    - **Current Implementation & Scripts:** Your code in `src/lib/server/soundtouch.ts` and scripts in `http-scripts/` consistently use `/now_playing` (snake_case).
    - **Recommendation:** SoundTouch devices usually accept both, but it is worth noting that the official documentation now standardizes on CamelCase.

3.  **New Endpoints in Official API**
    The official API includes several endpoints that were **not** in your self-analyzed documentation:
    - `6.16 /capabilities`: Lists supported features of the device.
    - `6.17 /audiodspcontrols`: Control for Audio DSP modes.
    - `6.18 /audioproducttonecontrols`: Dedicated controls for Bass & Treble.
    - `6.19 /audioproductlevelcontrols`: Speaker level management.

4.  **Source & ContentItem Scope**
    - **Official API:** For `/select`, it only explicitly mentions `AUX`, `BLUETOOTH`, and `PRODUCT`.
    - **Self-Analyzed/Implementation:** Your version (especially v1.1.1) and code already handle much more complex scenarios like `STORED_MUSIC` (DLNA), `setMusicServiceAccount`, and `/browse`. These appear to be "extra" features that are either part of a more advanced spec or were discovered through analysis but are not highlighted in the simplified official v1.0.0 release.

5.  **WebSocket Notifications**
    - The official API confirms the use of port `8080` and the `gabbo` protocol.
    - It lists a subset of notifications (`NowPlayingChange`, `VolumeChange`, etc.), while your self-analyzed document contains a more exhaustive list (e.g., `RecentsUpdatedNotifyUI`, `SWUpdateStatusChange`).

### Summary Table

| Feature | Self-Analyzed (v1.1.0) | Official (v1.0.0 - 2026) | Match? |
| :--- | :--- | :--- | :--- |
| **Port** | 8090 | 8090 | ✅ Yes |
| **Now Playing** | `/nowPlaying` | `/nowPlaying` | ⚠️ Code uses `/now_playing` |
| **New Controls** | No | `/capabilities`, `/audiodspcontrols`, etc. | 🆕 New |
| **DLNA/Browse** | Yes (v1.1.1) | Not mentioned in v1.0.0 MD | 🔍 Extra |
| **WebSockets** | Port 8080 (gabbo) | Port 8080 (gabbo) | ✅ Yes |

### Conclusion
The "self-analyzed" API is actually **more detailed** regarding media browsing and DLNA integration than the initial official release. However, the official API introduces **new audio control endpoints** (`/capabilities`, `/audiodspcontrols`, etc.) that are not yet implemented in Bosman. You might want to explore these to add advanced audio settings to the app.