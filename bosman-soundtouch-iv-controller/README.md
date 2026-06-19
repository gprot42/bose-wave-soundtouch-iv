# Bosman — Bose SoundTouch™  Manager

Bosman is a modern, independent open-source solution for managing and controlling Bose SoundTouch™ devices in your local home network.

![Bosman Screenshot](src/assets/screenshot.png)

The app provides an intuitive user interface for controlling volume, playback, presets, and multi-room zones, built with Svelte 5 and modern web technologies.

## ✨ Features

- **Automatic Device Discovery:** Finds SoundTouch devices in the local network using SSDP.
- **Real-time Synchronization:** Status updates (Now Playing, volume) via WebSockets directly from the device.
- **Multi-room Control:** Easily manage zones (Master/Member setups).
- **Preset Management:** Quick access to your stored favorites.
- **Media Server Support:** Browse local DLNA media servers and play content directly on your devices.
- **Modern Interface:** Optimized for desktop and mobile (Capacitor support).

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- A local network with Bose SoundTouch™ devices

### Installation & Startup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/bosman.git
   cd bosman
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

Open `http://localhost:5173` in your browser. The app will automatically start searching for devices in your network.

## ⚖️ Legal Disclaimer

**Bosman is an independent software solution and is not affiliated with Bose Corporation.**

"Bose", "SoundTouch", and the associated logos are registered trademarks of Bose Corporation. This project uses the unofficial SoundTouch Webservices API v1.1.0 to communicate with the devices. Use at your own risk. Kambrium Software GmbH assumes no liability for any damage or malfunctions to your devices.

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 Kambrium Software GmbH

---

*For technical details and contribution information, see [CONTRIBUTING.md](CONTRIBUTING.md).*
