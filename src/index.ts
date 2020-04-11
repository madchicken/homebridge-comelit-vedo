import { ComelitVedoPlatform } from './comelit-vedo-platform';
import { Homebridge } from '../types';

export let HomebridgeAPI: Homebridge;

export default function(homebridge: Homebridge) {
  HomebridgeAPI = homebridge;
  homebridge.registerPlatform('homebridge-comelit-vedo', 'ComelitVedo', ComelitVedoPlatform, true);
}
