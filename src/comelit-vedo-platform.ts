import { VedoClientConfig } from 'comelit-client';
import { VedoAlarm, VedoAlarmConfig } from './accessories/vedo-alarm';
import { Homebridge, Logger } from '../types';
import { VedoSensor } from './accessories/vedo-sensor';
import Timeout = NodeJS.Timeout;
import express, { Express } from 'express';
import client, { register } from 'prom-client';
import * as http from 'http';

export interface PlatformConfig {
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
});

const DEFAULT_HTTP_PORT = 3003;
const expr: Express = express();
expr.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

const DEFAULT_ALARM_CHECK_TIMEOUT = 5000;

export class ComelitVedoPlatform {
  private readonly log: Logger;

  private readonly homebridge: Homebridge;

  private readonly config: PlatformConfig;

  private timeout: Timeout;

  private mappedZones: VedoSensor[];

  private alarm: VedoAlarm;

  private server: http.Server;

  constructor(log: Logger, config: PlatformConfig, homebridge: Homebridge) {
    this.log = log;
    this.log('Initializing platform: ', { ...config, alarm_code: '******' });
    this.config = config;
    // Save the API object as plugin needs to register new accessory via this object
    this.homebridge = homebridge;
    this.log(`Homebridge API version: ${homebridge.version}`);
    this.homebridge.on('didFinishLaunching', () => setTimeout(this.startPolling.bind(this), 5000));
  }

  private startPolling() {
    if (!this.server && this.config.export_prometheus_metrics) {
      this.server = expr.listen(this.config.exporter_http_port || DEFAULT_HTTP_PORT);
    }

    const checkFrequency = this.config.update_interval
      ? this.config.update_interval * 1000
      : DEFAULT_ALARM_CHECK_TIMEOUT;
    this.log(`Setting up polling timeout every ${checkFrequency / 1000} secs`);
    this.timeout = setTimeout(async () => {
      try {
        if (this.alarm) {
          const alarmAreas = await this.alarm.checkAlarm();
          if (alarmAreas) {
            this.log.debug(
              `Found ${alarmAreas.length} areas: ${alarmAreas.map(a => a.description).join(', ')}`
            );
            this.alarm.update(alarmAreas);
            if (this.config.map_sensors) {
              const zones = await this.alarm.fetchZones();
              if (zones) {
                this.log.debug(
                  `Found ${zones.length} areas: ${zones
                    .filter(zone => zone.description !== '')
                    .map(a => a.description)
                    .join(', ')}`
                );
                zones
                  .filter(zone => zone.description !== '')
                  .forEach(zone =>
                    this.mappedZones.find(z => z.name === zone.description).update(zone)
                  );
              } else {
                this.log.warn(`No zone found`);
              }
            }
          } else {
            this.log.warn(`No area found`);
          }
        }
      } catch (e) {
        this.log.error(`Polling error: ${e.message}`, e);
      } finally {
        polling.set(1);
        this.log.debug('Reset polling');
        this.timeout.refresh();
      }
    }, checkFrequency);
  }

  async accessories(callback: (array: any[]) => void) {
    if (this.hasValidConfig()) {
      this.log(`Map VEDO alarm @ ${this.config.alarm_address}:${this.config.alarm_port || 80}`);
      const advanced: Partial<VedoClientConfig> = this.config.advanced || {};
      const area_mapping = this.config.area_mapping || {};
      const config: VedoAlarmConfig = {
        ...advanced,
        away_areas: area_mapping.away_areas ? [...area_mapping.away_areas] : [],
        home_areas: area_mapping.home_areas ? [...area_mapping.home_areas] : [],
        night_areas: area_mapping.night_areas ? [...area_mapping.night_areas] : [],
      };
      this.alarm = new VedoAlarm(
        this.log,
        this.config.alarm_address,
        this.config.alarm_port,
        this.config.alarm_code,
        config
      );
      if (this.config.map_sensors) {
        const zones = await this.alarm.fetchZones();
        if (zones && zones.length) {
          this.mappedZones = zones.map(zone => new VedoSensor(this.log, zone.description, zone));
          callback([this.alarm, ...this.mappedZones]);
        }
      } else {
        callback([this.alarm]);
      }
    } else {
      this.log.error('Invalid configuration ', this.config);
      callback([]);
    }
  }

  private hasValidConfig() {
    return this.config && this.config.alarm_address && this.config.alarm_code;
  }
}
