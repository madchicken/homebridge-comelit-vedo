import { ComelitVedoPlatform } from './comelit-vedo-platform';
import { API } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_IDENTIFIER } from './constants';

export = (api: API) => {
  api.registerPlatform(PLUGIN_IDENTIFIER, PLATFORM_NAME, ComelitVedoPlatform);
};
