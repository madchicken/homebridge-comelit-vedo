import { VedoClientConfig } from "comelit-client";
import { VedoAlarm } from "./accessories/vedo-alarm";
import { Homebridge } from "../types";

export interface HubConfig {
  alarm_url: string;
  alarm_port?: number;
  alarm_code: string;
  update_interval?: number;
  advanced?: VedoClientConfig;
}

export class ComelitVedoPlatform {
  private readonly log: (message?: any, ...optionalParams: any[]) => void;

  private readonly homebridge: Homebridge;

  private readonly config: HubConfig;

  constructor(
    log: (message?: any, ...optionalParams: any[]) => void,
    config: HubConfig,
    homebridge: Homebridge
  ) {
    this.log = log;
    this.log("Initializing platform: ", config);
    this.config = config;
    // Save the API object as plugin needs to register new accessory via this object
    this.homebridge = homebridge;
    this.log(`homebridge API version: ${homebridge.version}`);
  }

  async accessories(callback: (array: any[]) => void) {
    if (this.config && this.config.alarm_url) {
      this.log(
        `Map VEDO alarm @ ${this.config.alarm_url}:${this.config.alarm_port ||
          80}`
      );
      const alarm: VedoAlarm = await this.mapAlarm();
      if (alarm) {
        callback([alarm]);
      } else {
        callback([]);
      }
    }
  }

  private async mapAlarm(): Promise<VedoAlarm> {
    if (this.config.alarm_code) {
      this.log(
        `Alarm is enabled, mapping it at ${this.config.alarm_url} port ${this
          .config.alarm_port || 80}`
      );
      return new VedoAlarm(
        this.log,
        this.config.alarm_url,
        this.config.alarm_port,
        this.config.alarm_code,
        this.config.advanced || {}
      );
    } else {
      this.log(
        "Alarm enabled but not properly configured: missing access code"
      );
    }
  }
}
