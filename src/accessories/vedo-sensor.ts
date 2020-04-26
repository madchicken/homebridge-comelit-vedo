import { ZoneStatus } from 'comelit-client';
import { Categories, Characteristic, Service } from 'hap-nodejs';
import { HomebridgeAPI } from '../index';
import { OccupancyDetected } from 'hap-nodejs/dist/lib/gen/HomeKit';
import client from 'prom-client';

const triggers_count = new client.Counter({
  name: 'comelit_vedo_sensor_triggers',
  help: 'Number of triggered sensors',
});

export class VedoSensor {
  readonly log: Function;
  readonly name: string;
  readonly category: Categories;
  private readonly zoneStatus: ZoneStatus;
  private sensorService: Service;

  constructor(log: Function, name: string, zoneStatus: ZoneStatus) {
    this.log = (str: string) => log(`[Sensor ${name}] ${str}`);
    this.name = name;
    this.category = Categories.SENSOR;
    this.zoneStatus = zoneStatus;
  }

  getServices(): Service[] {
    const accessoryInformation = new HomebridgeAPI.hap.Service.AccessoryInformation(null, null);
    accessoryInformation
      .setCharacteristic(Characteristic.Name, 'Vedo Alarm Sensor')
      .setCharacteristic(Characteristic.Manufacturer, 'Comelit')
      .setCharacteristic(Characteristic.Model, 'None')
      .setCharacteristic(Characteristic.FirmwareRevision, 'None')
      .setCharacteristic(Characteristic.SerialNumber, 'None');

    this.sensorService = new HomebridgeAPI.hap.Service.OccupancySensor(this.name, null);
    this.update(this.zoneStatus);

    return [accessoryInformation, this.sensorService];
  }

  update(zoneStatus: ZoneStatus) {
    const currentValue = this.sensorService.getCharacteristic(Characteristic.OccupancyDetected)
      .value;
    const newValue = zoneStatus.open
      ? OccupancyDetected.OCCUPANCY_DETECTED
      : OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    this.log(`Updating occupancy: ${zoneStatus.open}`);
    if (currentValue !== newValue) {
      if (newValue === OccupancyDetected.OCCUPANCY_DETECTED) {
        this.log(`Occupancy detected for sensor ${this.name}`);
        triggers_count.inc();
      }
      this.sensorService.getCharacteristic(Characteristic.OccupancyDetected).updateValue(newValue);
    }
  }
}
