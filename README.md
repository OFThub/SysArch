# SysArch

A visual editor for designing system architecture across full stack
software, AI pipelines and embedded hardware, with validation, analytical
simulation and code generation.

[![CI](https://github.com/OFThub/SysArch/actions/workflows/ci.yml/badge.svg)](https://github.com/OFThub/SysArch/actions/workflows/ci.yml)

## Background

One diagram rarely covers a system that spans a web backend, a model
pipeline and a microcontroller on a bus. SysArch keeps them in one
document with a tab per domain (Full Stack, Yapay Zeka, Donanım) and an
overview tab where cross-domain links are drawn.

- **Catalog.** 22 component types across the three domains, plus
  hardware presets that carry real pins, voltages, current draw and I2C
  addresses (ESP32-S3, Raspberry Pi 5, Jetson Orin Nano, BME280, MPU6050,
  HC-SR04, SSD1306, SG90, SX1276 and more).
- **Pin-level wiring.** Edges carry a protocol (HTTP, gRPC, MQTT, SQL,
  I2C, SPI, UART, CAN, PWM, BLE, LoRa, power, …). Bus edges map each role
  (SDA/SCL, MOSI/MISO/SCK/CS, TX/RX) to a concrete pin pair.
- **Validation.** Voltage mismatches between pins, I2C address
  conflicts on a shared bus, pins used twice, missing or unsupported pin
  roles, protocol mismatches, and design smells such as a frontend
  talking to a database directly.
- **Simulation.** Link bandwidth versus payload rate, node capacity
  versus incoming requests, power budget and battery life per supply, and
  shortest-path latency between two components.
- **Exports.** JSON and YAML, PNG and SVG, an AI-readable
  `ARCHITECTURE.md` with `architecture.json`, and a zip holding generated
  `docker-compose.yml`, OpenAPI specs, `mosquitto.conf` with a topic
  list, and a `pins.h` per microcontroller.
- **Editor.** Undo/redo, multi-select, copy/paste across tabs, automatic
  layout (elkjs), light and dark themes, autosave with conflict
  detection. The UI is in Turkish.

## Install

Requires Node.js 22.12 or newer and pnpm 12 (pinned through
`packageManager`, so `corepack enable` is enough).

```bash
corepack enable
pnpm install
cp apps/server/.env.example apps/server/.env
```

In `apps/server/.env`, set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`)
and the client id and secret of at least one OAuth app. Sign-in is GitHub
or Google only. For local development, register the callback URL
`http://localhost:5173/api/auth/callback/github` (or `/google`).

### Self-hosting with Docker

One container serves both the web app and the API; SQLite lives on a
named volume.

```bash
cp apps/server/.env.example .env
# Set BETTER_AUTH_SECRET, the OAuth keys, and BETTER_AUTH_URL and
# WEB_ORIGIN to the public URL (http://localhost:8787 locally).
docker compose up -d --build
```

## Usage

```bash
pnpm dev
```

This starts the web app on <http://localhost:5173> and the API on port
8787; Vite proxies `/api` to the API. Sign in, then start from an empty
project or the Sera IoT template, a greenhouse monitor that spans all
three domains. Database migrations run when the server starts.

Keyboard shortcuts in the editor:

| Keys                               | Action                                                           |
| ---------------------------------- | ---------------------------------------------------------------- |
| Ctrl/⌘ Z, Ctrl/⌘ Shift Z, Ctrl/⌘ Y | Undo, redo                                                       |
| Ctrl/⌘ A                           | Select everything in the current tab                             |
| Ctrl/⌘ C, Ctrl/⌘ V                 | Copy and paste the selection, also between browser tabs          |
| Ctrl/⌘ D                           | Duplicate the selection                                          |
| Delete, Backspace                  | Delete the selection; asks first when connected edges go with it |
| Esc                                | Clear the selection                                              |

## Configuration

The server reads these variables and refuses to start if one is invalid.

| Variable                                   | Required | Default             | Description                                                                                  |
| ------------------------------------------ | -------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                       | yes      |                     | Signs session cookies. At least 32 characters.                                               |
| `BETTER_AUTH_URL`                          | yes      |                     | URL the browser uses for `/api`. OAuth callbacks go to `<url>/api/auth/callback/<provider>`. |
| `WEB_ORIGIN`                               | yes      |                     | The only origin allowed to call the API with credentials.                                    |
| `PORT`                                     | no       | `8787`              | API port.                                                                                    |
| `DATABASE_PATH`                            | no       | `./data/sysarch.db` | SQLite file. The Docker image uses `/data/sysarch.db`.                                       |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | no       |                     | Enables GitHub sign-in when both are set.                                                    |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no       |                     | Enables Google sign-in when both are set.                                                    |
| `WEB_DIST`                                 | no       |                     | Directory of the built web app to serve from the API process. Set by the Docker image.       |
| `ANTHROPIC_API_KEY`                        | no       |                     | Enables the AI assistant. Never sent to the browser.                                         |

## Development

```bash
pnpm check         # typecheck, lint and unit tests; must pass before a commit
pnpm test          # unit tests only (vitest, all packages)
pnpm format        # Prettier
pnpm exec playwright install chromium   # once
pnpm e2e           # end-to-end tests on their own ports and database
```

`pnpm --filter @sysarch/web build` and `pnpm --filter @sysarch/server build`
produce the production web bundle and the bundled server.

The repository is a pnpm workspace:

| Path              | Contents                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Document schema, catalog, validation, simulation and exporters. Pure TypeScript shared by web and server. |
| `apps/web`        | Vite + React editor built on React Flow.                                                                  |
| `apps/server`     | Hono API with Drizzle on SQLite and Better Auth.                                                          |
| `e2e`             | Playwright tests.                                                                                         |
