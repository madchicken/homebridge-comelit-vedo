import { ComelitVedoPlatform } from './comelit-vedo-platform';
import { API } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_IDENTIFIER } from './constants';

export default function(homebridge: API) {
  homebridge.registerPlatform(PLUGIN_IDENTIFIER, PLATFORM_NAME, ComelitVedoPlatform);
}
