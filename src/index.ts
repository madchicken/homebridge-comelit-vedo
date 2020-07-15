import { ComelitVedoPlatform } from './comelit-vedo-platform';
import { API } from 'homebridge';
import { PLATFORM_NAME } from './constants';

export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, ComelitVedoPlatform);
};
