# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](
https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](
https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-11-25

### Added
- Device overrides can be keyed by `serialNumber`, the hex serial the
  Emporia app shows, as well as by `deviceGid`. `deviceGid` is no longer
  required.
- Discovery logs one line per device with its serial number, GID and
  Emporia name, so any of the three can be matched to the others.

### Changed
- **The HomeKit Serial Number is now the Emporia serial number**, not the
  decimal device GID, so a tile in Home can be matched to a device in the
  Emporia app. Model and firmware come from Emporia too.
- A changed name is now also written to the accessory's own `Name` and to
  `ConfiguredName`, which is what Home reads. This happens once per name
  change, so a rename made in Home is not overwritten on restart. On the
  first start after upgrading it applies the configured name once.

### Fixed
- **A wrong password was retried every 60 seconds forever**, which locks
  the Emporia account. A rejected username or password now stops with a
  clear error; other failures back off from one minute up to one hour.
- Every restart needed the password. Saved tokens were only written at
  password login and discarded once the one-hour ID token expired. The
  saved refresh token is now used on startup and tokens are saved after
  each refresh, with mode `0600`.
- Power polling ran, and logged a stack trace, while not logged in.

## [1.2.0] - 2026-11-02

### Added
- Outlets now publish instantaneous power and cumulative energy using
  Eve's `Consumption` (W) and `Total Consumption` (kWh) characteristics,
  when `exposeEnergyMonitoring` is on.

  **Apple's Home app will not show these.** HomeKit defines no
  characteristic for electrical power on an outlet, so there is nothing
  standard to publish it on; Eve's UUIDs are the de facto convention and
  are read by Eve, Controller for HomeKit and Home+. No plugin can make
  watts appear in Apple Home.

### Fixed
- **Outlets were always named `Emporia Outlet <gid>`.** `getDevices()`
  read `customerDevices` from `/customers/devices`, but the payload key
  is `devices`, so it had always returned an empty array. The name was
  being fetched and thrown away. Outlets now take their Emporia device
  name, and a rename in the Emporia app follows through on restart.
- `OutletInUse` was effectively always false. It is derived from
  `currentPower`, which was only set by a per-accessory usage call that
  was not reliably returning data — an outlet drawing 135 W reported
  itself as not in use.
- Energy monitoring made one API request per outlet per poll (eight
  every 30 s here). `getDeviceListUsages` accepts a comma-separated
  `deviceGids`, so the platform now fetches all of them in one request
  and the accessories read from a shared cache. This is what
  `emvue-exporter` does.
- `updateAllDevices()` was an empty method that the poll timer called
  every interval; it now owns that shared refresh.

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

