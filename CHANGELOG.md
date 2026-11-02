# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](
https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](
https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-02

### Added
- Per-device customization: override a device's display name or hide it
  from HomeKit entirely, keyed by its Emporia device GID.

### Changed
- **Renamed the npm package to `homebridge-emporia`**, matching the
  `homebridge-<vendor>` convention. `PLUGIN_NAME` moves with it, since
  Homebridge passes it to `registerPlatformAccessories`.

  The platform alias is unchanged (`EmporiaEnergy`), so no
  `config.json` needs editing. **Existing accessories are not carried
  over, though:** cached accessories record the plugin that created
  them, so on first start under the new name Homebridge treats the
  eight it had as orphaned and the plugin re-registers them. Expect
  the Home app to want rooms, names and automations reassigned. Back
  up `/var/lib/homebridge/accessories/` before upgrading.
- `engines.homebridge` widened to `^1.8.0 || ^2.0.0`; verified running
  on Homebridge 2.4.0.
- `engines.node` now names the supported LTS lines (20, 22, 24) rather
  than `>=18`; Node 18 has been end-of-life since April 2025. CI
  matrices updated to match.
- The published tarball is now an explicit allowlist — `dist`, the
  config schema, README, CHANGELOG and LICENSE. Earlier builds shipped
  the development docs, Dockerfile and compose file as well.

### Fixed
- `config.schema.json` declared `required` as a boolean on four
  individual fields. That is invalid JSON schema, and Homebridge's
  plugin verification validates it strictly; the constraints are now
  arrays on their parent objects.
- The Emporia password is now masked in the Config UI instead of being
  rendered as plain text.

## [1.0.0] - 2025-11-17

### Added
- Initial release of Homebridge Emporia Energy plugin
- Support for Emporia smart outlets/plugs
- Support for Emporia EV chargers (EVSE)
- Automatic device discovery
- Real-time power consumption monitoring
- Persistent authentication token caching
- Configurable update intervals
- Docker-based test harness for development
- Comprehensive documentation
- GitHub Actions CI/CD pipeline with linting and spell checking

### Features
- Turn outlets on/off via HomeKit
- Start/stop EV charging via HomeKit
- View real-time power consumption
- Siri voice control support
- HomeKit automation support
- HomeKit scene integration

### Technical
- TypeScript implementation
- ESLint code quality checks
- Homebridge dynamic platform architecture
- Axios for HTTP API calls
- Support for Node.js 18+
- Support for Homebridge 1.8+

## [Unreleased]

### Planned Features
- Charging rate control for EV chargers
- Historical energy data tracking
- Support for individual circuit monitoring
- Integration with Eve app for advanced statistics
- Custom HomeKit characteristics for detailed energy data

