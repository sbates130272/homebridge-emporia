import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { EmporiaEnergyPlatform } from './platform.js';
import type { EmporiaOutlet } from './emporiaApi.js';
import { registerEveOptional } from './eveCharacteristics.js';

/**
 * Emporia Outlet Accessory
 * Handles an Emporia smart outlet/plug
 */
export class EmporiaOutletAccessory {
  private outletService: Service;
  private currentState = false;
  private lastUpdate = 0;
  private updateInProgress = false;

  // Energy monitoring
  private currentPower = 0; // Watts
  private totalConsumption = 0; // kWh

  constructor(
    private readonly platform: EmporiaEnergyPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const device = accessory.context.device as EmporiaOutlet;

    // Set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'Emporia Energy',
      )
      .setCharacteristic(this.platform.Characteristic.Model, 'Smart Outlet')
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        device.deviceGid.toString(),
      );

    // Get or create the Outlet service
    this.outletService =
      this.accessory.getService(this.platform.Service.Outlet) ||
      this.accessory.addService(this.platform.Service.Outlet);

    // Set the service name
    this.outletService.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.displayName,
    );

    // Register handlers for On/Off characteristic
    this.outletService
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    // Register handler for OutletInUse characteristic
    this.outletService
      .getCharacteristic(this.platform.Characteristic.OutletInUse)
      .onGet(this.getOutletInUse.bind(this));

    // Add energy monitoring if enabled.
    //
    // HomeKit has no characteristic for electrical power, so these are
    // Eve's. Eve, Controller for HomeKit and Home+ show them; Apple's Home
    // app does not, and cannot be made to.
    if (this.platform.config.exposeEnergyMonitoring === true) {
      registerEveOptional(this.outletService, this.platform.eve);

      this.outletService
        .getCharacteristic(this.platform.eve.CurrentConsumption)
        .onGet(() => this.currentPower);

      this.outletService
        .getCharacteristic(this.platform.eve.TotalConsumption)
        .onGet(() => this.totalConsumption);
    }

    // Initialize current state
    this.currentState = device.outletOn || false;

    // Set up periodic status updates
    this.startStatusPolling();
  }

  /**
   * Start polling for device status
   */
  private startStatusPolling(): void {
    const interval = (this.platform.config.updateInterval || 60) * 1000;

    setInterval(async () => {
      await this.updateStatus();
    }, interval);

    // Do an immediate update
    this.updateStatus();
  }

  /**
   * Update device status from API
   */
  private async updateStatus(): Promise<void> {
    if (this.updateInProgress) {
      return;
    }

    this.updateInProgress = true;

    try {
      const device = this.accessory.context.device as EmporiaOutlet;
      const outlets = await this.platform.getApi().getOutlets();
      const outlet = outlets.find((o) => o.deviceGid === device.deviceGid);

      if (outlet) {
        this.currentState = outlet.outletOn;
        this.accessory.context.device = outlet;

        // Update HomeKit
        this.outletService.updateCharacteristic(
          this.platform.Characteristic.On,
          this.currentState,
        );

        // Read power from the platform's shared cache, which refreshes
        // every device in one request rather than one request each.
        if (this.platform.config.exposeEnergyMonitoring === true) {
          const watts = this.platform.getPower(device.deviceGid);
          if (watts !== undefined) {
            this.currentPower = watts;
            // kWh accumulated since start: watts over one poll interval.
            const intervalHours =
              ((this.platform.config.updateInterval || 60) * 1000) / 3600000;
            this.totalConsumption += (watts / 1000) * intervalHours;

            this.outletService.updateCharacteristic(
              this.platform.eve.CurrentConsumption,
              this.currentPower,
            );
            this.outletService.updateCharacteristic(
              this.platform.eve.TotalConsumption,
              this.totalConsumption,
            );
          }
        }

        // OutletInUse is derived from power, so it only became meaningful
        // once the shared cache above started populating currentPower.
        this.outletService.updateCharacteristic(
          this.platform.Characteristic.OutletInUse,
          this.currentState && this.currentPower > 0,
        );

        this.lastUpdate = Date.now();
      }
    } catch (error) {
      this.platform.log.error(
        `Failed to update status for ${this.accessory.displayName}:`,
        error,
      );
    } finally {
      this.updateInProgress = false;
    }
  }

  /**
   * Handle SET requests for the On characteristic
   */
  async setOn(value: CharacteristicValue): Promise<void> {
    const newState = value as boolean;

    try {
      const device = this.accessory.context.device as EmporiaOutlet;
      await this.platform.getApi().updateOutlet(device.deviceGid, newState);

      this.currentState = newState;
      this.platform.log.info(
        `${this.accessory.displayName} turned ${newState ? 'ON' : 'OFF'}`,
      );

      // Update status after a short delay to confirm
      setTimeout(() => {
        this.updateStatus();
      }, 1000);
    } catch (error) {
      this.platform.log.error(
        `Failed to set outlet state for ${this.accessory.displayName}:`,
        error,
      );
      throw new this.platform.homebridgeApi.hap.HapStatusError(
        this.platform.homebridgeApi.hap.HAPStatus
          .SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  /**
   * Handle GET requests for the On characteristic
   */
  async getOn(): Promise<CharacteristicValue> {
    // Return cached state, updates happen via polling
    return this.currentState;
  }

  /**
   * Handle GET requests for the OutletInUse characteristic
   */
  async getOutletInUse(): Promise<CharacteristicValue> {
    // Return true if outlet is on and drawing power
    return this.currentState && this.currentPower > 0;
  }
}

