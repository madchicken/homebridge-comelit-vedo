import { VedoClient, ZoneStatus } from "comelit-client";
import { Categories, Characteristic, Service } from "hap-nodejs";
import { HomebridgeAPI } from "../index";

export class VedoSensor {
  readonly log: Function;
  readonly name: string;
  readonly index: number;
  readonly category: Categories;
  private zoneStatus: ZoneStatus;
  private sensorService: Service;

  constructor(log: Function, name: string, zoneStatus: ZoneStatus) {
    this.log = (str: string) => log(`[Sensor] ${str}`);
    this.name = `Vedo Sensor ${name}`;
    this.category = Categories.SENSOR;
    this.zoneStatus = zoneStatus;
  }

  getServices(): Service[] {
    const accessoryInformation = new HomebridgeAPI.hap.Service.AccessoryInformation(
      null,
      null
    );
    accessoryInformation
      .setCharacteristic(Characteristic.Name, "Vedo Alarm Sensor")
      .setCharacteristic(Characteristic.Manufacturer, "Comelit")
      .setCharacteristic(Characteristic.Model, "None")
      .setCharacteristic(Characteristic.FirmwareRevision, "None")
      .setCharacteristic(Characteristic.SerialNumber, "None");

    this.sensorService = new HomebridgeAPI.hap.Service.OccupancySensor(
      this.name,
      null
    );
    this.update(this.zoneStatus);

    return [accessoryInformation, this.sensorService];
  }

  update(zoneStatus: ZoneStatus) {
    this.sensorService
      .getCharacteristic(Characteristic.OccupancyDetected)
      .updateValue(zoneStatus.open);
  }
}
