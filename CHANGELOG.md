# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
