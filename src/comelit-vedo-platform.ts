import { sleep, VedoClientConfig } from 'comelit-client';
import { VedoAlarm, VedoAlarmConfig } from './accessories/vedo-alarm';
import { VedoSensor } from './accessories/vedo-sensor';
import express, { Express } from 'express';
import client, { register } from 'prom-client';
import * as http from 'http';
import {
  API,
  APIEvent,
  Categories,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_IDENTIFIER } from './constants';
import Timeout = NodeJS.Timeout;

export interface VedoPlatformConfig extends PlatformConfig {
  alarm_address: string;
  alarm_port?: number;
  alarm_code: string;
  map_sensors: boolean;
  update_interval?: number;
  export_prometheus_metrics?: boolean;
  exporter_http_port?: number;
  area_mapping: {
    away_areas?: string[];
    night_areas?: string[];
    home_areas?: string[];
  };
  advanced?: VedoClientConfig;
}

const polling = new client.Gauge({
  name: 'comelit_vedo_polling',
  help: 'Comelit client polling beat',
  labelNames: ['service'],
});

const DEFAULT_HTTP_PORT = 3003;
const expr: Express = express();
expr.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

const DEFAULT_ALARM_CHECK_TIMEOUT = 5000;

export class ComelitVedoPlatform implements DynamicPlatformPlugin {
  readonly log: Logger;

  readonly homebridge: API;

  readonly config: VedoPlatformConfig;

  private timeoutAlarm: Timeout;

  private timeoutSensors: Timeout;

  private timeoutSentinel: Timeout;

  private mappedZones: VedoSensor[];

  private alarm: VedoAlarm;

  private server: http.Server;

  private lastAlarmCheck: number;

  private lastSensorsCheck: number;

  private readonly accessories: Map<string, PlatformAccessory>;

  constructor(log: Logger, config: VedoPlatformConfig, homebridge: API) {
    this.log = log;
    this.config = config;
    // Save the API object as plugin needs to register new accessory via this object
    this.homebridge = homebridge;
    this.accessories = new Map();
    this.log.info('Initializing platform: ', { ...config, alarm_code: '******' });
    this.log.debug(`Homebridge API version: ${homebridge.version}`);
    this.homebridge.on(APIEvent.DID_FINISH_LAUNCHING, async () => await this.discoverDevices());
    this.homebridge.on(APIEvent.SHUTDOWN, async () => await this.shutdown());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.set(accessory.UUID, accessory);
  }

  private async startPolling() {
    if (!this.server && this.config.export_prometheus_metrics) {
      this.server = expr.listen(this.config.exporter_http_port || DEFAULT_HTTP_PORT);
    }
    const checkFrequency = this.getCheckFrequency();
    this.log.info(`Setting up polling timeout every ${checkFrequency / 1000} secs`);
    this.pollAlarm();
    await sleep(1000); //give a second between calls
    this.pollSensors();
    this.timeoutSentinel = setInterval(async () => {
      await this.sentinel();
    }, 1000);
  }

  private getCheckFrequency() {
    return this.config.update_interval
      ? this.config.update_interval * 1000
      : DEFAULT_ALARM_CHECK_TIMEOUT;
  }

  private async sentinel() {
    const now = Date.now();
    if (this.timeoutAlarm) {
      if (this.lastAlarmCheck - now > 5 * this.getCheckFrequency()) {
        this.log.warn('Alarm check seems to be stuck. Restart polling');
        clearTimeout(this.timeoutAlarm);
        this.lastAlarmCheck = null;
        this.pollAlarm();
      }
    }

    if (this.timeoutSensors) {
      if (this.lastSensorsCheck - now > 5 * this.getCheckFrequency()) {
        this.log.warn('Sensors check seems to be stuck. Restart polling');
        clearTimeout(this.timeoutSensors);
        this.lastSensorsCheck = null;
        await sleep(1000); //give a second between calls
        this.pollSensors();
      }
    }
  }

  private pollSensors() {
    if (this.config.map_sensors) {
      this.timeoutSensors = setTimeout(async () => {
        try {
          if (this.alarm) {
            this.log.debug('Check sensors status');
            this.lastAlarmCheck = Date.now();
            const zones = await this.alarm.fetchZones();
            if (zones) {
              this.log.debug(
                `Found ${zones.length} areas: ${zones.map(a => a.description).join(', ')}`
              );
              zones.forEach(zone =>
                this.mappedZones.find(z => z.name === zone.description).update(zone)
              );
            } else {
              this.log.warn('No zones found');
            }
          } else {
            this.log.warn('No areas found');
          }
        } catch (e) {
          this.log.error(`Polling error: ${e.message}`, e);
        } finally {
          polling.set({ service: 'sensors' }, 1);
          this.log.debug('Reset polling');
          this.timeoutSensors.refresh();
        }
      }, this.getCheckFrequency());
    }
  }

  private pollAlarm() {
    this.timeoutAlarm = setTimeout(async () => {
      try {
        await this.singleAreaCheck();
      } catch (e) {
        this.log.error(`Polling error: ${e.message}`, e);
      } finally {
        polling.set({ service: 'alarm' }, 1);
        this.log.debug('Reset polling');
        this.timeoutAlarm.refresh();
      }
    }, this.getCheckFrequency());
  }

  private async singleAreaCheck() {
    if (this.alarm) {
      this.log.debug('Check alarm status');
      this.lastAlarmCheck = Date.now();
      const alarmAreas = await this.alarm.checkAlarm();
      if (alarmAreas) {
        this.log.debug(
          `Found ${alarmAreas.length} areas: ${alarmAreas.map(a => a.description).join(', ')}`
        );
        this.alarm.update(alarmAreas);
      } else {
        this.log.warn('No area found');
      }
    }
  }

  async discoverDevices() {
    if (this.hasValidConfig()) {
      this.log.info(
        `Map VEDO alarm @ ${this.config.alarm_address}:${this.config.alarm_port || 80}`
      );
      const advanced: Partial<VedoClientConfig> = this.config.advanced || {};
      const area_mapping = this.config.area_mapping || {};
      const config: VedoAlarmConfig = {
        ...advanced,
        away_areas: area_mapping.away_areas ? [...area_mapping.away_areas] : [],
        home_areas: area_mapping.home_areas ? [...area_mapping.home_areas] : [],
        night_areas: area_mapping.night_areas ? [...area_mapping.night_areas] : [],
      };
      const accessory = this.createHapAccessory('VEDO Alarm', Categories.SECURITY_SYSTEM);
      this.alarm = new VedoAlarm(
        this,
        accessory,
        this.config.alarm_address,
        this.config.alarm_port,
        this.config.alarm_code,
        config
      );
      if (this.config.map_sensors) {
        const zones = await this.alarm.fetchZones();
        if (zones && zones.length) {
          this.mappedZones = zones.map(zone => {
            const sensorAccessory = this.createHapAccessory(zone.description, Categories.SENSOR);
            return new VedoSensor(this, sensorAccessory, zone.description, zone, this.alarm);
          });
        }
      }
      await this.singleAreaCheck();
      await this.startPolling();
    } else {
      this.log.error('Invalid configuration ', this.config);
    }
  }

  private createHapAccessory(name: string, category: Categories) {
    const PlatformAccessory = this.homebridge.platformAccessory;
    const uuid = this.homebridge.hap.uuid.generate(name);
    const existingAccessory = this.accessories.get(uuid);
    const accessory = existingAccessory || new PlatformAccessory(name, uuid, category);
    if (existingAccessory) {
      this.log.debug(`Reuse accessory from cache with uuid ${uuid}`);
    } else {
      this.log.debug(`Registering new accessory with uuid ${uuid}`);
      this.homebridge.registerPlatformAccessories(PLUGIN_IDENTIFIER, PLATFORM_NAME, [accessory]);
    }
    return accessory;
  }

  private hasValidConfig() {
    return this.config && this.config.alarm_address && this.config.alarm_code;
  }

  private async shutdown() {
    clearInterval(this.timeoutSentinel);
    clearTimeout(this.timeoutAlarm);
    clearTimeout(this.timeoutSensors);
    return Promise.resolve(undefined);
  }
}
