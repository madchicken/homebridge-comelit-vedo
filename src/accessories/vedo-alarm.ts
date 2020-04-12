import {
  Callback,
  Categories,
  Characteristic,
  CharacteristicEventTypes,
  Service,
} from 'hap-nodejs';
import { HomebridgeAPI } from '../index';
import { AlarmArea, VedoClient, VedoClientConfig, ZoneStatus } from 'comelit-client';
import {
  SecuritySystemCurrentState,
  SecuritySystemTargetState,
} from 'hap-nodejs/dist/lib/gen/HomeKit';

const DEFAULT_ALARM_CHECK_TIMEOUT = 5000;

const ALL = 32;

export interface VedoAlarmConfig extends Partial<VedoClientConfig> {
  night_area?: string;
  home_area?: string;
}

export class VedoAlarm {
  private readonly code: string;
  readonly client: VedoClient;
  readonly log: Function;
  readonly name: string;
  readonly category: Categories;
  private securityService: Service;
  private readonly checkFrequency: number;
  private lastUID: string;
  private nightAreaId: number = null;
  private homeAreaId: number = null;
  readonly config: VedoAlarmConfig;

  constructor(
    log: Function,
    address: string,
    port: number,
    code: string,
    config: VedoAlarmConfig,
    checkFrequency: number = DEFAULT_ALARM_CHECK_TIMEOUT
  ) {
    this.log = (str: string) => log(`[Vedo Alarm] ${str}`);
    this.code = code;
    this.name = 'Vedo Alarm @ ' + address;
    this.category = Categories.SECURITY_SYSTEM;
    this.checkFrequency = checkFrequency;
    this.client = new VedoClient(address, port, config);
    this.config = config;
  }

  getServices(): Service[] {
    const accessoryInformation = new HomebridgeAPI.hap.Service.AccessoryInformation(null, null);
    accessoryInformation
      .setCharacteristic(Characteristic.Name, 'Vedo Alarm')
      .setCharacteristic(Characteristic.Manufacturer, 'Comelit')
      .setCharacteristic(Characteristic.Model, 'None')
      .setCharacteristic(Characteristic.FirmwareRevision, 'None')
      .setCharacteristic(Characteristic.SerialNumber, 'None');

    this.securityService = new HomebridgeAPI.hap.Service.SecuritySystem('Vedo Alarm', null);
    this.securityService
      .getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .setValue(SecuritySystemCurrentState.DISARMED);
    this.securityService
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .setValue(SecuritySystemTargetState.DISARM);

    this.securityService
      .getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .on(CharacteristicEventTypes.GET, async (callback: Callback) => {
        try {
          const uid = await this.client.loginWithRetry(this.code);
          const alarmAreas = await this.client.findActiveAreas(uid);
          const armed = alarmAreas.reduce(
            (armed: boolean, area: AlarmArea) => armed || area.armed,
            false
          );
          const trigger = alarmAreas.reduce(
            (armed: boolean, area: AlarmArea) => armed || area.triggered,
            false
          );
          if (trigger) {
            callback(null, SecuritySystemCurrentState.ALARM_TRIGGERED);
          } else {
            callback(
              null,
              armed ? SecuritySystemCurrentState.AWAY_ARM : SecuritySystemCurrentState.DISARMED
            );
          }
        } catch (e) {
          callback(e.message);
        }
      });

    this.securityService
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on(CharacteristicEventTypes.SET, async (value: number, callback: Callback) => {
        try {
          const uid = await this.client.loginWithRetry(this.code);
          if (uid) {
            switch (value) {
              case SecuritySystemTargetState.DISARM:
                this.log('Disarming system');
                await this.client.disarm(uid, 32);
                callback();
                break;
              case SecuritySystemTargetState.AWAY_ARM:
                this.log('Arming system');
                await this.client.arm(uid, ALL);
                callback();
                break;
              case SecuritySystemTargetState.NIGHT_ARM:
                this.log('Arming system');
                await this.client.arm(uid, this.nightAreaId === null ? ALL : this.nightAreaId);
                callback();
                break;
              case SecuritySystemTargetState.STAY_ARM:
                this.log('Arming system');
                await this.client.arm(uid, this.homeAreaId === null ? ALL : this.homeAreaId);
                callback();
                break;
              default:
                callback(new Error('Cannot execute requested action ' + value));
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

  update(alarmAreas: AlarmArea[]) {
    const currentStatus = this.securityService.getCharacteristic(
      Characteristic.SecuritySystemCurrentState
    ).value;

    const status = alarmAreas.reduce(
      (armed: boolean, area: AlarmArea) => armed || area.armed,
      false
    );
    this.log(`Alarm status is ${status}`);
    const trigger = alarmAreas.reduce(
      (triggered: boolean, area: AlarmArea) => triggered || area.triggered,
      false
    );
    this.log(`Alarm trigger is ${trigger}`);
    if (trigger && currentStatus !== SecuritySystemCurrentState.ALARM_TRIGGERED) {
      this.securityService
        .getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .updateValue(SecuritySystemCurrentState.ALARM_TRIGGERED);
    } else {
      const newStatus = status
        ? SecuritySystemCurrentState.STAY_ARM
        : SecuritySystemCurrentState.DISARMED;
      if (currentStatus !== newStatus) {
        this.securityService
          .getCharacteristic(Characteristic.SecuritySystemCurrentState)
          .updateValue(newStatus);
      }
    }
  }

  async fetchZones(): Promise<ZoneStatus[]> {
    try {
      const uid = await this.client.loginWithRetry(this.code);
      if (uid) {
        this.lastUID = uid;
        return await this.client.zoneStatus(uid);
      }
    } catch (e) {
      this.lastUID = null;
      this.log(e.message);
    }
    return null;
  }

  async checkAlarm(): Promise<AlarmArea[]> {
    try {
      const uid = this.lastUID || (await this.client.loginWithRetry(this.code));
      if (uid) {
        this.lastUID = uid;
        const alarmAreas = await this.client.findActiveAreas(uid);
        if (this.config.home_area) {
          this.homeAreaId = alarmAreas.findIndex(
            (a: AlarmArea) => a.description === this.config.home_area
          );
          if (this.homeAreaId === -1) {
            this.homeAreaId = null;
          }
        }
        if (this.config.night_area) {
          this.nightAreaId = alarmAreas.findIndex(
            (a: AlarmArea) => a.description === this.config.home_area
          );
          if (this.nightAreaId === -1) {
            this.nightAreaId = null;
          }
        }
        return alarmAreas;
      }
    } catch (e) {
      this.lastUID = null;
      this.log(e.message);
    }
    return null;
  }
}
