import { Categories, Characteristic, Service } from 'hap-nodejs';
import { BinaryLike } from 'crypto';

export declare class PlatformAccessory {
  displayName: string;

  reachable: boolean;

  services: Service[];

  constructor(displayName: string, UUID: string, category: Categories);

  addService(service: Service): Service;

  removeService(service: Service): void;

  getService(name: string): Service;

  getServiceByUUIDAndSubType(UUID: string, subtype: string): Service;

  updateReachability(reachable: boolean): void;

  configureCameraSource(cameraSource: any): void;
}
export interface Logger {
  prefix: string;
  (message?: any, ...optionalParams: any[]): void;
  log: (message?: any, ...optionalParams: any[]) => void;
  info: (message?: any, ...optionalParams: any[]) => void;
  warning: (message?: any, ...optionalParams: any[]) => void;
  debug: (message?: any, ...optionalParams: any[]) => void;
  error: (message?: any, ...optionalParams: any[]) => void;
}

export interface Homebridge {
  version: string;
  platformAccessory: typeof PlatformAccessory;
  registerPlatform: (longName: string, name: string, platform: Function, dynamic: boolean) => void;
  registerPlatformAccessories: (
    pluginName: string,
    platformName: string,
    accessories: any[]
  ) => void;
  updatePlatformAccessories: (accessories: PlatformAccessory[]) => void;
  unregisterPlatformAccessories: (
    pluginName: string,
    platformName: string,
    accessories: PlatformAccessory[]
  ) => void;
  hap: {
    Service: typeof Service;
    Characteristic: typeof Characteristic;
    uuid: {
      generate: (value: BinaryLike) => string;
      isValid: (UUID: string) => boolean;
    };
  };
  on: (message: string, callback: Function) => void;
}
