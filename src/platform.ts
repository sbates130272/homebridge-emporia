import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { EmporiaOutletAccessory } from './outletAccessory.js';
import { EmporiaChargerAccessory } from './chargerAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import {
  createEveCharacteristics,
  type EveCharacteristics,
} from './eveCharacteristics.js';
import { EmporiaApi, EmporiaAuthError, EmporiaTokens } from './emporiaApi.js';
import * as fs from 'fs';
import * as path from 'path';

export interface DeviceConfig {
  /** The hex serial number the Emporia app shows. */
  serialNumber?: string;
  deviceGid?: number;
  name?: string;
  hide?: boolean;
}

export interface EmporiaPlatformConfig extends PlatformConfig {
  username: string;
  password: string;
  updateInterval?: number;
  exposeOutlets?: boolean;
  exposeChargers?: boolean;
  exposeEnergyMonitoring?: boolean;
  debug?: boolean;
  devices?: DeviceConfig[];
}

/**
 * Emporia Energy Platform Plugin
 * Discovers and manages Emporia Vue devices including outlets and 
 * EV chargers
 */
export class EmporiaEnergyPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // Track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  private readonly discoveredUUIDs: Set<string> = new Set();

  // Emporia API client
  private readonly api: EmporiaApi;
  private updateInterval?: NodeJS.Timeout;
  private readonly tokensFile: string;

  /** False until discovery succeeds, so polling never runs unauthenticated. */
  private ready = false;
  private authRetryMs = 60000;

  /** Shared instantaneous power, gid -> watts. Filled by updateAllDevices. */
  private powerByGid = new Map<number, number>();

  /** Eve power characteristics, built once against the running hap. */
  public readonly eve: EveCharacteristics;

  constructor(
    public readonly log: Logging,
    public readonly config: EmporiaPlatformConfig,
    public readonly homebridgeApi: API,
  ) {
    this.Service = homebridgeApi.hap.Service;
    this.Characteristic = homebridgeApi.hap.Characteristic;
    this.eve = createEveCharacteristics(homebridgeApi);

    // Initialize Emporia API client
    this.api = new EmporiaApi(log);
    this.api.onTokensChanged = (tokens) => this.saveTokens(tokens);

    // Path for storing tokens
    this.tokensFile = path.join(
      homebridgeApi.user.storagePath(),
      'emporia-tokens.json',
    );

    // Validate configuration
    if (!config.username || !config.password) {
      this.log.error(
        'Username and password are required in the plugin configuration',
      );
      return;
    }

    this.log.info('Emporia Energy Platform initialized');

    // Wait for Homebridge to finish launching before discovering devices
    this.homebridgeApi.on('didFinishLaunching', () => {
      log.info('Homebridge finished launching, discovering devices...');
      this.authenticateAndDiscoverDevices();

      // Set up periodic update interval
      const interval = (config.updateInterval || 60) * 1000;
      this.updateInterval = setInterval(() => {
        this.updateAllDevices();
      }, interval);
    });

    // Cleanup on shutdown
    this.homebridgeApi.on('shutdown', () => {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
    });
  }

  /**
   * Restore cached accessories from disk
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading cached accessory:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  /**
   * Authenticate and discover devices
   */
  private async authenticateAndDiscoverDevices(): Promise<void> {
    try {
      if (!(await this.restoreSavedSession())) {
        this.log.info('Authenticating with Emporia API...');
        this.saveTokens(await this.api.login(
          this.config.username,
          this.config.password,
        ));
      }

      // Details first: discoverDevices() reads names and serials from them.
      await this.api.refreshDeviceInfo();

      await this.discoverDevices();
      this.ready = true;
      this.authRetryMs = 60000;
    } catch (error) {
      if (error instanceof EmporiaAuthError && error.credentialsRejected) {
        // Retrying a rejected password locks the Emporia account, for this
        // plugin and for everything else that logs in to it.
        this.log.error(
          'Emporia rejected the configured username or password. Not ' +
          'retrying. Correct them in the plugin settings and restart.',
        );
        return;
      }

      this.log.error(
        'Failed to authenticate or discover devices; retrying in ' +
        `${this.authRetryMs / 1000}s:`,
        error,
      );
      setTimeout(() => {
        this.authenticateAndDiscoverDevices();
      }, this.authRetryMs);
      this.authRetryMs = Math.min(this.authRetryMs * 2, 3600000);
    }
  }

  /**
   * Resume from the saved tokens. Returns false if there are none or
   * they no longer work, in which case the caller logs in with the password.
   */
  private async restoreSavedSession(): Promise<boolean> {
    if (!fs.existsSync(this.tokensFile)) {
      return false;
    }
    try {
      const tokens: EmporiaTokens = JSON.parse(
        fs.readFileSync(this.tokensFile, 'utf-8'),
      );
      await this.api.restoreSession(tokens, this.config.username);
      this.log.info('Resumed saved Emporia session');
      return true;
    } catch (error) {
      this.log.warn('Could not resume saved Emporia session:', error);
      return false;
    }
  }

  private saveTokens(tokens: EmporiaTokens): void {
    try {
      fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2), {
        mode: 0o600,
      });
      fs.chmodSync(this.tokensFile, 0o600);
    } catch (error) {
      this.log.warn('Failed to save authentication tokens:', error);
    }
  }

  /**
   * Discover and register devices
   */
  private async discoverDevices(): Promise<void> {
    try {
      const exposeOutlets = this.config.exposeOutlets !== false;
      const exposeChargers = this.config.exposeChargers !== false;

      // Get outlets if enabled
      if (exposeOutlets) {
        const outlets = await this.api.getOutlets();
        this.log.info(`Discovered ${outlets.length} outlet(s)`);

        for (const outlet of outlets) {
          // Check if device should be hidden
          if (this.isDeviceHidden(outlet.deviceGid)) {
            this.log.info(
              `Skipping hidden outlet: ${outlet.deviceGid}`,
            );
            continue;
          }

          const uuid = this.homebridgeApi.hap.uuid.generate(
            `outlet-${outlet.deviceGid}`,
          );
          this.discoveredUUIDs.add(uuid);

          // Get custom or default name
          const defaultName = outlet.locationProperties?.deviceName ||
            `Emporia Outlet ${outlet.deviceGid}`;
          const name = this.getDeviceName(outlet.deviceGid, defaultName);
          this.logIdentity('Outlet', outlet.deviceGid, name);

          const existingAccessory = this.accessories.get(uuid);

          if (existingAccessory) {
            this.log.info(
              'Restoring outlet from cache:',
              existingAccessory.displayName,
            );
            // Update name if it changed
            if (existingAccessory.displayName !== name) {
              this.log.info(`Updating outlet name to: ${name}`);
              existingAccessory.displayName = name;
              existingAccessory._associatedHAPAccessory.displayName = name;
            }
            existingAccessory.context.device = outlet;
            new EmporiaOutletAccessory(this, existingAccessory);
            this.homebridgeApi.updatePlatformAccessories([existingAccessory]);
          } else {
            this.log.info('Adding new outlet:', name);

            const accessory = new this.homebridgeApi.platformAccessory(
              name,
              uuid,
            );
            accessory.context.device = outlet;

            new EmporiaOutletAccessory(this, accessory);
            this.homebridgeApi.registerPlatformAccessories(
              PLUGIN_NAME,
              PLATFORM_NAME,
              [accessory],
            );
            this.accessories.set(uuid, accessory);
          }
        }
      }

      // Get EV chargers if enabled
      if (exposeChargers) {
        const chargers = await this.api.getChargers();
        this.log.info(`Discovered ${chargers.length} EV charger(s)`);

        for (const charger of chargers) {
          // Check if device should be hidden
          if (this.isDeviceHidden(charger.deviceGid)) {
            this.log.info(
              `Skipping hidden charger: ${charger.deviceGid}`,
            );
            continue;
          }

          const uuid = this.homebridgeApi.hap.uuid.generate(
            `charger-${charger.deviceGid}`,
          );
          this.discoveredUUIDs.add(uuid);

          // Get custom or default name
          const defaultName = `Emporia Charger ${charger.deviceGid}`;
          const name = this.getDeviceName(charger.deviceGid, defaultName);
          this.logIdentity('Charger', charger.deviceGid, name);

          const existingAccessory = this.accessories.get(uuid);

          if (existingAccessory) {
            this.log.info(
              'Restoring charger from cache:',
              existingAccessory.displayName,
            );
            // Update name if it changed
            if (existingAccessory.displayName !== name) {
              this.log.info(`Updating charger name to: ${name}`);
              existingAccessory.displayName = name;
              existingAccessory._associatedHAPAccessory.displayName = name;
            }
            existingAccessory.context.device = charger;
            new EmporiaChargerAccessory(this, existingAccessory);
            this.homebridgeApi.updatePlatformAccessories([existingAccessory]);
          } else {
            this.log.info('Adding new EV charger:', name);

            const accessory = new this.homebridgeApi.platformAccessory(
              name,
              uuid,
            );
            accessory.context.device = charger;

            new EmporiaChargerAccessory(this, accessory);
            this.homebridgeApi.registerPlatformAccessories(
              PLUGIN_NAME,
              PLATFORM_NAME,
              [accessory],
            );
            this.accessories.set(uuid, accessory);
          }
        }
      }

      // Remove accessories no longer present
      for (const [uuid, accessory] of this.accessories) {
        if (!this.discoveredUUIDs.has(uuid)) {
          this.log.info(
            'Removing accessory no longer present:',
            accessory.displayName,
          );
          this.homebridgeApi.unregisterPlatformAccessories(
            PLUGIN_NAME,
            PLATFORM_NAME,
            [accessory],
          );
          this.accessories.delete(uuid);
        }
      }

      this.log.info('Device discovery complete');
    } catch (error) {
      this.log.error('Failed to discover devices:', error);
      throw error;
    }
  }

  /**
   * Refresh the shared power cache.
   *
   * One request covers every outlet, so this lives here rather than in the
   * accessories: they poll independently, and a per-accessory usage call
   * meant eight requests per cycle for data a single request returns.
   */
  private async updateAllDevices(): Promise<void> {
    if (!this.ready || this.config.exposeEnergyMonitoring !== true) {
      return;
    }

    const gids = [...this.accessories.values()]
      .map((accessory) => accessory.context.device?.deviceGid)
      .filter((gid): gid is number => typeof gid === 'number');

    try {
      this.powerByGid = await this.api.getPowerByGid(gids);
      if (this.config.debug) {
        this.log.debug(`Refreshed power for ${this.powerByGid.size} device(s)`);
      }
    } catch (error) {
      // Usage is best-effort: a failure here must not disturb on/off state.
      this.log.debug('Could not refresh power usage:', error);
    }
  }

  /**
   * Latest known watts for a device, or undefined if not yet polled.
   */
  getPower(deviceGid: number): number | undefined {
    return this.powerByGid.get(deviceGid);
  }

  /**
   * Get the Emporia API client
   */
  getApi(): EmporiaApi {
    return this.api;
  }

  /**
   * Publish a device's identity to HomeKit.
   *
   * The serial number is the one the Emporia app shows, so a tile in Home
   * can be matched to a device there. The gid is only a fallback.
   */
  publishIdentity(
    accessory: PlatformAccessory,
    service: Service,
    fallbackModel: string,
  ): void {
    const deviceGid = accessory.context.device.deviceGid as number;
    const info = this.api.getDeviceInfo(deviceGid);
    const name = accessory.displayName;

    const information = accessory
      .getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, 'Emporia Energy')
      .setCharacteristic(
        this.Characteristic.Model,
        info?.model || fallbackModel,
      )
      .setCharacteristic(
        this.Characteristic.SerialNumber,
        info?.manufacturerDeviceId || deviceGid.toString(),
      );

    // HomeKit only accepts x, x.y or x.y.z here.
    if (info?.firmware && /^\d+(\.\d+){0,2}$/.test(info.firmware)) {
      information.setCharacteristic(
        this.Characteristic.FirmwareRevision,
        info.firmware,
      );
    }

    service.setCharacteristic(this.Characteristic.Name, name);

    // Only when the name changes: Home writes a rename made there back to
    // ConfiguredName, and setting it on every start would undo that.
    if (accessory.context.publishedName !== name) {
      information.setCharacteristic(this.Characteristic.Name, name);
      service.addOptionalCharacteristic(this.Characteristic.ConfiguredName);
      service.setCharacteristic(this.Characteristic.ConfiguredName, name);
      accessory.context.publishedName = name;
    }
  }

  /**
   * One line per device tying together every identifier it goes by.
   */
  private logIdentity(kind: string, deviceGid: number, name: string): void {
    const info = this.api.getDeviceInfo(deviceGid);
    this.log.info(
      `${kind} "${name}": serial ${info?.manufacturerDeviceId ?? 'unknown'}, ` +
      `GID ${deviceGid}, Emporia name "${info?.name ?? 'unknown'}"`,
    );
  }

  /**
   * Get device configuration, matched by serial number or by GID
   */
  private getDeviceConfig(deviceGid: number): DeviceConfig | undefined {
    const serial = this.api
      .getDeviceInfo(deviceGid)
      ?.manufacturerDeviceId?.toLowerCase();
    return this.config.devices?.find(
      (d) =>
        d.deviceGid === deviceGid ||
        (serial !== undefined &&
          d.serialNumber?.trim().toLowerCase() === serial),
    );
  }

  /**
   * Get custom name for device or fall back to default
   */
  private getDeviceName(
    deviceGid: number,
    defaultName: string,
  ): string {
    const deviceConfig = this.getDeviceConfig(deviceGid);
    return deviceConfig?.name || defaultName;
  }

  /**
   * Check if device should be hidden
   */
  private isDeviceHidden(deviceGid: number): boolean {
    const deviceConfig = this.getDeviceConfig(deviceGid);
    return deviceConfig?.hide === true;
  }
}
