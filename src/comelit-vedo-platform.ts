import { VedoClientConfig } from 'comelit-client';
import { VedoAlarm } from './accessories/vedo-alarm';
import { Homebridge } from '../types';
import { VedoSensor } from './accessories/vedo-sensor';
import Timeout = NodeJS.Timeout;

export interface HubConfig {
  alarm_address: string;
  alarm_port?: number;
  alarm_code: string;
  map_sensors: boolean;
  update_interval?: number;
  night_area?: string;
  home_area?: string;
  advanced?: VedoClientConfig;
}

export class ComelitVedoPlatform {
  private readonly log: (message?: any, ...optionalParams: any[]) => void;

  private readonly homebridge: Homebridge;

  private readonly config: HubConfig;

  private timeout: Timeout;

  private mappedZones: VedoSensor[];

  constructor(
    log: (message?: any, ...optionalParams: any[]) => void,
    config: HubConfig,
    homebridge: Homebridge
  ) {
    this.log = log;
    this.log('Initializing platform: ', config);
    this.config = config;
    // Save the API object as plugin needs to register new accessory via this object
    this.homebridge = homebridge;
    this.log(`homebridge API version: ${homebridge.version}`);
  }

  async accessories(callback: (array: any[]) => void) {
    if (this.hasValidConfig()) {
      this.log(`Map VEDO alarm @ ${this.config.alarm_address}:${this.config.alarm_port || 80}`);
      const checkFrequency = this.config.update_interval
        ? this.config.update_interval * 1000
        : 5000;
      const advanced: Partial<VedoClientConfig> = this.config.advanced || {};
      const config = {
        ...advanced,
        home_area: this.config.home_area,
        night_area: this.config.night_area,
      };
      const alarm: VedoAlarm = new VedoAlarm(
        this.log,
        this.config.alarm_address,
        this.config.alarm_port,
        this.config.alarm_code,
        config,
        checkFrequency
      );
      if (this.config.map_sensors) {
        const zones = await alarm.fetchZones();
        this.mappedZones = zones
          .filter(zone => zone.description !== '')
          .map(zone => new VedoSensor(this.log, zone.description, zone));
      }

      callback(this.config.map_sensors ? [alarm, ...this.mappedZones] : [alarm]);
      this.timeout = setTimeout(async () => {
        const alarmAreas = await alarm.checkAlarm();
        if (alarmAreas) {
          alarm.update(alarmAreas);
          if (this.config.map_sensors) {
            const zones = await alarm.fetchZones();
            if (zones) {
              zones
                .filter(zone => zone.description !== '')
                .forEach(zone =>
                  this.mappedZones.find(z => z.name === zone.description).update(zone)
                );
            }
          }
        }
        this.timeout.refresh();
      }, checkFrequency);
      return;
    } else {
      this.log('Invalid configuration ', this.config);
    }
    callback([]);
  }

  private hasValidConfig() {
    return this.config && this.config.alarm_address && this.config.alarm_code;
  }
}
