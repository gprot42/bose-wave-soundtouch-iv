# Contributing to Bosman

Thank you for your interest in Bosman! This document contains technical details about the architecture and information on how you can contribute to the project.

## 🛠 Tech Stack

- **Frontend:** Svelte 5 (Runes), SvelteKit
- **Styling:** Tailwind CSS 4, Flowbite-Svelte
- **Mobile:** Capacitor 7
- **Database:** sql.js / SQLite (for local storage of settings/devices)
- **Communication:** 
  - `node-ssdp` for device discovery
  - REST API (Port 8090) for commands
  - WebSockets (Port 8080) for real-time status updates
  - `fast-xml-parser` for processing Bose API responses

## 📁 Project Structure

- `src/lib/server/`: Server-side logic (e.g., SSDP discovery, DLNA).
- `src/lib/utils/`: Shared utility functions, Bose API client, and WebSocket logic.
- `src/lib/components/`: Reusable Svelte components (volume sliders, zone manager, etc.).
- `src/routes/`: SvelteKit routes and API endpoints.
- `http-scripts/`: Example requests for manual interaction with the Bose API (useful for debugging).
- `doc/`: Documentation and API specifications.

## 💻 Development

### Environment Variables
The project uses standard SvelteKit configurations. Special environment variables are currently not strictly required but can be used for port configuration.

### Commands
- `npm run dev`: Starts the development server.
- `npm run build`: Creates an optimized build version (Node adapter).
- `npm run preview`: Tests the local build.
- `npm run check`: Runs Svelte-check and TypeScript checks.

## 🏗 Architecture Details

### Device Discovery
Since browsers cannot send UDP packets for SSDP, discovery takes place on the server (`src/lib/server/soundtouch.ts`). The discovered devices are delivered to the frontend via an API endpoint.

### WebSocket Integration
To avoid delays (polling), Bosman connects directly to each SoundTouch device via WebSocket. This allows for immediate updates, e.g., when the volume is changed on the device itself or via the official app.

### Capacitor (Mobile)
The project is prepared for Capacitor. For mobile builds, `adapter-static` must be used (configuration in `svelte.config.js`). Note that SSDP on mobile devices may need to run via native plugins.

## 📝 Guidelines

- **Code Style:** Please adhere to the Prettier and ESLint configurations.
- **Svelte 5:** Prefer using Runes (`$state`, `$derived`, `$effect`).
- **Flowbite:** Use existing Flowbite-Svelte components whenever possible for UI consistency.

## ⚖️ License
By contributing, you agree that your contributions will be licensed under the project's MIT License.
