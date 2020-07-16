import { ZoneStatus } from 'comelit-client';
import { Logger, PlatformAccessory, Service } from 'homebridge';
import client from 'prom-client';
import { ComelitVedoPlatform } from '../comelit-vedo-platform';

const triggers_count = new client.Counter({
  name: 'comelit_vedo_sensor_triggers',
  help: 'Number of triggered sensors',
});

export class VedoSensor {
  readonly log: Logger;
  readonly platform: ComelitVedoPlatform;
  readonly accessory: PlatformAccessory;
  readonly name: string;
  private readonly zoneStatus: ZoneStatus;
  private sensorService: Service;

  constructor(
    platform: ComelitVedoPlatform,
    accessory: PlatformAccessory,
    name: string,
    zoneStatus: ZoneStatus
  ) {
    this.log = platform.log;
    this.accessory = accessory;
    this.platform = platform;
    this.name = name;
    this.zoneStatus = zoneStatus;
    this.getAvailableServices();
  }

  private getAvailableServices(): Service[] {
    const Service = this.platform.homebridge.hap.Service;
    const Characteristic = this.platform.homebridge.hap.Characteristic;
    const accessoryInformation =
      this.accessory.getService(Service.AccessoryInformation) ||
      this.accessory.addService(Service.AccessoryInformation);
    accessoryInformation
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Comelit')
      .setCharacteristic(Characteristic.Model, 'None')
      .setCharacteristic(Characteristic.FirmwareRevision, 'None')
      .setCharacteristic(Characteristic.SerialNumber, 'None');

    this.sensorService =
      this.accessory.getService(Service.OccupancySensor) ||
      this.accessory.addService(Service.OccupancySensor);
    this.sensorService.setCharacteristic(Characteristic.Name, this.name);
    this.update(this.zoneStatus);

    return [accessoryInformation, this.sensorService];
  }

  update(zoneStatus: ZoneStatus) {
    const Characteristic = this.platform.homebridge.hap.Characteristic;
    const currentValue = this.sensorService.getCharacteristic(Characteristic.OccupancyDetected)
      .value;
    const newValue = zoneStatus.open
      ? Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
      : Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    if (currentValue !== newValue) {
      if (newValue === Characteristic.OccupancyDetected.OCCUPANCY_DETECTED) {
        this.log.debug(`Occupancy detected for sensor ${this.name}`);
        triggers_count.inc();
      }
      this.sensorService.getCharacteristic(Characteristic.OccupancyDetected).updateValue(newValue);
    }
  }
}
