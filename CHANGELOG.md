# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.1] - 2026-10-08

### Added

- Terraform for Docker: `terraform/docker/` in the code zip runs the
  containers of `docker-compose.yml` through the Docker provider, under
  the same hostnames. Passwords are asked for at apply time, never
  written.

### Changed

- The AWS Terraform moved from `terraform/` to `terraform/aws/`, so each
  provider is its own module to init and apply.

## [0.6.0] - 2026-10-08

### Added

- Snapshots under "Sürümler": save the design under a name, compare it
  with the current one on the canvas, restore all or part of it as one
  undo step, or open a copy as a new project.
- Read-only share links under "Paylaş": anyone with the link sees the
  design without an account; revoking the link stops it at once.
- Terraform export: `terraform/main.tf` and `variables.tf` in the code zip
  for components bound for AWS (ECS, RDS, ElastiCache, SQS, load
  balancer, S3), valid against the AWS provider.

### Changed

- The editor header shows versions and sharing as icon buttons.

### Security

- A label, project name or pin name containing a line break could end a
  comment in generated `pins.h` (since 0.1.0) or Terraform and add code to
  it. User text in generated comments is now kept on one line.

## [0.5.0] - 2026-10-06

### Added

- Cost estimate in the "Maliyet" tab and in `ARCHITECTURE.md`: monthly
  running cost per component (managed services by the month, GPUs by the
  hour, LLMs by requests and tokens, storage by GB) and the hardware
  total. List prices are dated and each can be overridden per project.
- Trust boundaries in the "Tehditler" tab: zones built from the
  selection, drawn as dashed frames on the canvas, with a trust level
  each.
- STRIDE rules: unencrypted links across zones, public APIs without
  authentication, data stores reachable from the internet zone, personal
  data sent straight to outside services. Links can be marked
  "Şifreli (TLS)".
- The SaaS template comes with trust zones.

## [0.4.0] - 2026-10-04

### Added

- Wokwi export: the code zip gains `wokwi/diagram.json`, the hardware tab
  as a Wokwi simulation wired along the links' pin maps, with
  `wokwi.toml` and a README naming the parts Wokwi lacks.
- Bill of materials: `bom.csv` in the code zip, parts grouped with
  quantities, unit prices and totals.
- Import from docker-compose, Mermaid flowcharts (also inside a README)
  and Wokwi diagrams under "İçe aktar". The format is recognized from the
  content; what comes in arrives as a proposal to review and apply.
- Starter templates: edge AI camera, RAG app and SaaS app next to Sera
  IoT, each with flows and SLA targets, under "Şablonla başla".

### Changed

- The generic microcontroller type no longer claims an ESP32-S3 board for
  Wokwi; the board comes from the part's preset.
- Sensors can link over USB.

## [0.3.0] - 2026-10-03

### Added

- Drill-down: double-click a component, or use "İç yapısını aç", to
  design its inside in a view of its own. Parts added there belong to it,
  a breadcrumb leads back out, and the component shows how many parts it
  holds.
- Flows in the "Akışlar" tab: select the links a request or a reading
  travels, turn them into a named flow, give it an end-to-end target in
  ms, and play it step by step on the canvas. A flow over its target or
  broken by a removed link is listed under issues, and `ARCHITECTURE.md`
  draws each flow as a sequence diagram.
- "Kod" tab: the design as YAML, without its layout. Valid edits reach the
  canvas as you type, one undo step per burst of typing; mistakes are
  marked on their line. A change made elsewhere replaces the text, or
  offers to reload it while you are typing.

## [0.2.0] - 2026-10-02

### Added

- AI architecture assistant in the editor's "Asistan" tab: asks and
  answers about the architecture, or proposes changes for the current
  view and selection. Runs on the server with `ANTHROPIC_API_KEY`; it
  sees the issues its own changes introduce and fixes them before
  replying.
- Proposals: every change from the assistant or an MCP client waits in
  the "Öneriler" tab. Each one is previewed on the canvas (new, changed
  and removed parts marked), applied in full or in part, and undone in
  one step. Changes made since the proposal are kept; changes that no
  longer apply are flagged.
- MCP server (`apps/mcp`) with `list_projects`, `get_architecture`,
  `list_issues`, `export` and `propose_changes`.
- Personal API keys for MCP clients under "API anahtarları".
- Live updates: open editors pick up saves from other tabs and new
  proposals without a reload.

### Fixed

- The save status stayed on "Kaydedilmemiş değişiklikler" after an edit
  was undone before it was saved.
- An invalid API key answered 500 instead of 401.

## [0.1.0] - 2026-09-30

### Added

- Architecture editor with Full Stack, Yapay Zeka and Donanım tabs and an
  overview tab for cross-domain links; each view keeps its own layout.
- Component catalog of 22 types and hardware presets with pins, voltages,
  current draw, I2C addresses and prices.
- Pin-level wiring for bus protocols, with suggested pin mappings in the
  property panel.
- Property panel generated from the catalog, including payload schemas on
  edges.
- Undo/redo, multi-select, copy/paste (also between browser tabs),
  duplicate, delete confirmation, keyboard shortcuts and elkjs auto-layout.
- Sign-in with GitHub or Google, a project list, the Sera IoT template, and
  autosave with conflict detection when the project changed elsewhere.
- Validation: pin voltage mismatches, I2C address conflicts, pins used
  twice, missing or unsupported pin roles, protocol mismatches, frontend to
  database links, model serving without a model source, and unconnected
  components.
- Analytical simulation of link load, node capacity, power budget with
  battery life, and shortest-path latency.
- Analysis panel with issues and simulation tables; severity badges on
  nodes and edges.
- Exports: JSON, YAML, PNG, SVG, `ARCHITECTURE.md` with
  `architecture.json`, and a zip of generated `docker-compose.yml`,
  OpenAPI specs, `mosquitto.conf` with a topic list, and `pins.h`.
- Docker image and `docker-compose.yml` for self-hosting in one container.
- Continuous integration for formatting, types, lint, unit and end-to-end
  tests.

[unreleased]: https://github.com/OFThub/SysArch/compare/v0.6.1...HEAD
[0.6.1]: https://github.com/OFThub/SysArch/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/OFThub/SysArch/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/OFThub/SysArch/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/OFThub/SysArch/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/OFThub/SysArch/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/OFThub/SysArch/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/OFThub/SysArch/releases/tag/v0.1.0
