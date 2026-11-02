import type { API, Characteristic, Service, WithUUID } from 'homebridge';

/**
 * The hap Characteristic *class*, reached through API rather than a value
 * import of 'homebridge' (which a plugin should not pull in at runtime).
 */
type HapCharacteristicClass = WithUUID<API['hap']['Characteristic']>;

/**
 * Service.getCharacteristic()/updateCharacteristic() take a zero-arg
 * constructor; addOptionalCharacteristic() takes the class itself. These
 * classes satisfy both, but TypeScript needs to be told which at each use.
 */
export type EveCharacteristicClass = WithUUID<new () => Characteristic>;

/**
 * Eve's power characteristics.
 *
 * HomeKit defines no characteristic for electrical power on an Outlet, so
 * there is nothing standard to publish watts on. Eve's UUIDs are the de
 * facto convention and are what Eve, Controller for HomeKit and Home+ read.
 *
 * Apple's own Home app ignores them -- it renders an Outlet as on/off and
 * nothing more. Publishing these does not make consumption visible there,
 * and no plugin can, so Grafana remains the place to actually look at the
 * numbers.
 */
export const EVE_CURRENT_CONSUMPTION_UUID =
  'E863F10D-079E-48FF-8F27-9C2605A29F52';
export const EVE_TOTAL_CONSUMPTION_UUID =
  'E863F10C-079E-48FF-8F27-9C2605A29F52';

export interface EveCharacteristics {
  CurrentConsumption: EveCharacteristicClass;
  TotalConsumption: EveCharacteristicClass;
}

/**
 * Build the characteristic classes against the running Homebridge's hap,
 * rather than importing hap-nodejs directly: a plugin that pulls in its own
 * copy ends up with classes the bridge does not recognise.
 */
export function createEveCharacteristics(api: API): EveCharacteristics {
  const { Characteristic: Base, Formats, Perms } = api.hap;

  class CurrentConsumption extends Base {
    public static readonly UUID = EVE_CURRENT_CONSUMPTION_UUID;

    constructor() {
      super('Consumption', EVE_CURRENT_CONSUMPTION_UUID, {
        format: Formats.FLOAT,
        unit: 'W',
        minValue: 0,
        maxValue: 65535,
        minStep: 0.1,
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      });
      this.value = 0;
    }
  }

  class TotalConsumption extends Base {
    public static readonly UUID = EVE_TOTAL_CONSUMPTION_UUID;

    constructor() {
      super('Total Consumption', EVE_TOTAL_CONSUMPTION_UUID, {
        format: Formats.FLOAT,
        unit: 'kWh',
        minValue: 0,
        maxValue: 1000000,
        minStep: 0.001,
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      });
      this.value = 0;
    }
  }

  return {
    CurrentConsumption: CurrentConsumption as unknown as EveCharacteristicClass,
    TotalConsumption: TotalConsumption as unknown as EveCharacteristicClass,
  };
}

/**
 * Declare the Eve characteristics as optional members of a service before
 * binding them.
 *
 * Without this Homebridge logs "Characteristic not in required or optional
 * characteristic section for service Outlet. Adding anyway." once per
 * characteristic per accessory on every start -- sixteen lines here -- and
 * plugin verification treats that warning as a defect.
 */
export function registerEveOptional(
  service: Service,
  eve: EveCharacteristics,
): void {
  // testCharacteristic() is typed against the class, addOptionalCharacteristic()
  // against its constructor signature. One object, two views, so each call
  // gets the one it expects.
  for (const characteristic of [eve.CurrentConsumption, eve.TotalConsumption]) {
    const asClass = characteristic as unknown as HapCharacteristicClass;
    if (!service.testCharacteristic(asClass)) {
      service.addOptionalCharacteristic(characteristic);
    }
  }
}
