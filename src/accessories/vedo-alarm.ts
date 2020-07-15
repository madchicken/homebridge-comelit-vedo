import {
  AlarmArea,
  AreaDesc,
  VedoClient,
  VedoClientConfig,
  ZoneDesc,
  ZoneStatus,
} from 'comelit-client';
import {
  SecuritySystemCurrentState,
  SecuritySystemTargetState,
} from 'hap-nodejs/dist/lib/gen/HomeKit';
import { intersection } from 'lodash';
import {
  Callback,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  Logger,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { ComelitVedoPlatform } from '../comelit-vedo-platform';

const ALL = 32;

export interface VedoAlarmConfig extends Partial<VedoClientConfig> {
  away_areas?: string[];
  night_areas?: string[];
  home_areas?: string[];
}

const DEFAULT_LOGIN_TIMEOUT = 15000;

export class VedoAlarm {
  private readonly code: string;
  readonly client: VedoClient;
  readonly log: Logger;
  readonly accessory: PlatformAccessory;
  readonly platform: ComelitVedoPlatform;
  readonly name: string;
  private securityService: Service;
  private lastUID: string;
  private lastLogin: number;
  private readonly away_areas: string[];
  private readonly night_areas: string[];
  private readonly home_areas: string[];
  private zones: ZoneDesc;
  private areas: AreaDesc;
  private currentAlarmStatus: number;

  constructor(
    platform: ComelitVedoPlatform,
    accessory: PlatformAccessory,
    address: string,
    port: number,
    code: string,
    config: VedoAlarmConfig
  ) {
    this.platform = platform;
    this.accessory = accessory;
    this.log = platform.log;
    this.code = code;
    this.name = 'VEDO Alarm @ ' + address;
    this.client = new VedoClient(address, port, config);
    this.client.setLogger(platform.log);
    this.away_areas = config.away_areas ? config.away_areas.map(a => a.toLowerCase().trim()) : [];
    this.night_areas = config.night_areas
      ? config.night_areas.map(a => a.toLowerCase().trim())
      : [];
    this.home_areas = config.home_areas ? config.home_areas.map(a => a.toLowerCase().trim()) : [];
    this.lastLogin = 0;
    this.currentAlarmStatus = SecuritySystemCurrentState.DISARMED; // Default
    this.log.debug('Mapping areas set to ', this.night_areas, this.away_areas, this.home_areas);
    this.getAvailableServices();
  }

  private getAvailableServices(): Service[] {
    const Characteristic = this.platform.homebridge.hap.Characteristic;
    const Service = this.platform.homebridge.hap.Service;
    const accessoryInformation =
      this.accessory.getService(Service.AccessoryInformation) ||
      this.accessory.addService(Service.AccessoryInformation);
    accessoryInformation
      .setCharacteristic(Characteristic.Name, 'Vedo Alarm')
      .setCharacteristic(Characteristic.Manufacturer, 'Comelit')
      .setCharacteristic(Characteristic.Model, 'None')
      .setCharacteristic(Characteristic.FirmwareRevision, 'None')
      .setCharacteristic(Characteristic.SerialNumber, 'None');

    this.securityService =
      this.accessory.getService(Service.SecuritySystem) ||
      this.accessory.addService(Service.SecuritySystem);
    this.securityService.setCharacteristic(Characteristic.Name, 'VEDO Alarm');

    this.securityService.setCharacteristic(
      Characteristic.SecuritySystemCurrentState,
      SecuritySystemCurrentState.DISARMED
    );
    this.securityService.setCharacteristic(
      Characteristic.SecuritySystemTargetState,
      SecuritySystemTargetState.DISARM
    );

    this.securityService
      .getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        callback(null, this.currentAlarmStatus);
      });

    this.securityService
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on(CharacteristicEventTypes.SET, async (value: number, callback: Callback) => {
        try {
          const uid = await this.client.loginWithRetry(this.code);
          if (uid) {
            switch (value) {
              case SecuritySystemTargetState.DISARM:
                this.log.info('Disarming system');
                await this.client.disarm(uid, ALL);
                callback();
                break;
              case SecuritySystemTargetState.AWAY_ARM:
                this.log.info('Arm system: AWAY');
                await this.armAreas(this.away_areas, uid);
                callback();
                break;
              case SecuritySystemTargetState.NIGHT_ARM:
                this.log.info('Arm system: NIGHT');
                await this.armAreas(this.night_areas, uid);
                callback();
                break;
              case SecuritySystemTargetState.STAY_ARM:
                this.log.info('Arm system: STAY');
                await this.armAreas(this.home_areas, uid);
                callback();
                break;
              default:
                callback(new Error(`Cannot execute requested action ${value}`));
            }
          } else {
            callback(new Error('Cannot login into system'));
          }
        } catch (e) {
          callback(e);
        }
      });

    return [accessoryInformation, this.securityService];
  }

  private async armAreas(areas: string[], uid: string): Promise<number[]> {
    this.log.info(`Arming system: ${areas.length ? areas.join(', ') : 'ALL SYSTEM'}`);
    const alarmAreas = await this.client.findActiveAreas(uid);
    if (areas && areas.length) {
      const indexes = areas
        .map(area => alarmAreas.findIndex(a => a.description.toLowerCase() === area))
        .filter(index => index !== -1);
      if (indexes.length) {
        const promises = indexes.map(index => this.client.arm(uid, index));
        await Promise.all(promises);
        return indexes;
      }
    }
    await this.client.arm(uid, ALL);
    return [ALL];
  }

  update(alarmAreas: AlarmArea[]) {
    const Characteristic = this.platform.homebridge.hap.Characteristic;
    const currentStatus = this.securityService.getCharacteristic(
      Characteristic.SecuritySystemCurrentState
    ).value;

    const armedAreas = alarmAreas
      .filter((area: AlarmArea) => area.armed)
      .map(a => a.description.toLowerCase());
    const status = armedAreas.length !== 0;
    this.log.debug(`Alarmed areas`, alarmAreas);
    const trigger = alarmAreas.reduce(
      (triggered: boolean, area: AlarmArea) => triggered || area.triggered || area.sabotaged,
      false
    );
    if (trigger) {
      this.log.warn(
        `Alarm triggered in area ${alarmAreas.filter(a => a.triggered || a.sabotaged).join(', ')}`
      );
    }
    if (trigger && currentStatus !== SecuritySystemCurrentState.ALARM_TRIGGERED) {
      this.securityService
        .getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .updateValue(SecuritySystemCurrentState.ALARM_TRIGGERED);
    } else {
      let newStatus = status
        ? SecuritySystemCurrentState.AWAY_ARM
        : SecuritySystemCurrentState.DISARMED;

      if (status) {
        if (
          this.away_areas.length &&
          intersection(armedAreas, this.away_areas).length === armedAreas.length
        ) {
          newStatus = SecuritySystemCurrentState.AWAY_ARM;
        } else if (
          this.home_areas.length &&
          intersection(armedAreas, this.home_areas).length === armedAreas.length
        ) {
          newStatus = SecuritySystemCurrentState.STAY_ARM;
        } else if (
          this.night_areas.length &&
          intersection(armedAreas, this.night_areas).length === armedAreas.length
        ) {
          newStatus = SecuritySystemCurrentState.NIGHT_ARM;
        }
      }

      this.currentAlarmStatus = newStatus;
      this.securityService
        .getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .updateValue(newStatus);
    }
  }

  async fetchZones(): Promise<ZoneStatus[]> {
    try {
      if (!this.lastUID || this.getTimeElapsedFromLastLogin() > DEFAULT_LOGIN_TIMEOUT) {
        if (this.lastUID) {
          await this.client.logout(this.lastUID);
        }
        this.lastUID = null;
        this.lastUID = await this.client.loginWithRetry(this.code);
        this.lastLogin = new Date().getTime();
      }
      if (!this.zones) {
        this.zones = await this.client.zoneDesc(this.lastUID);
      }

      return await this.client.zoneStatus(this.lastUID, this.zones);
    } catch (e) {
      this.log.error(`Error fetching zones: ${e.message}`);
    }
    this.log.error('Unable to fetch token');
    this.lastUID = null;
    return null;
  }

  async checkAlarm(): Promise<AlarmArea[]> {
    try {
      if (this.shouldLogin()) {
        if (this.lastUID) {
          await this.client.logout(this.lastUID);
        }
        this.lastUID = null;
        this.lastUID = await this.client.loginWithRetry(this.code);
        this.lastLogin = new Date().getTime();
      }
      if (!this.areas) {
        this.areas = await this.client.areaDesc(this.lastUID);
      }

      return await this.client.findActiveAreas(this.lastUID, this.areas);
    } catch (e) {
      this.log.error(`Error checking alarm: ${e.message}`);
    }
    this.log.error('Unable to fetch token');
    this.lastUID = null;
    return null;
  }

  private shouldLogin() {
    return !this.lastUID || this.getTimeElapsedFromLastLogin() > DEFAULT_LOGIN_TIMEOUT;
  }

  private getTimeElapsedFromLastLogin() {
    const now = new Date().getTime();
    return now - this.lastLogin;
  }
}
