[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm version](https://badge.fury.io/js/homebridge-comelit-vedo-platform.svg)](https://badge.fury.io/js/homebridge-comelit-vedo-platform)

# Comelit VEDO integration for Homebridge

This plugin will connect to the VEDO WEB interface and then it will automatically map it as new accessory in HomeKit.
Be aware to provide an alarm code in the config, otherwise the plugin won't be able to mount the accessory.

```json
{
  "platform": "ComelitVedo",
  "alarm_address": "192.168.1.2",
  "alarm_port": 80,
  "alarm_code": "12345678"
}
```

## Advanced configuration

Some installation offer access to VEDO through the alarm network adapter, some other installation will proxy VEDO
configuration through the domotic WEB interface. This plugin is configured by default to use the VEDO network adapter.
If your installation is different then you need to tweak the installation by changing default URLs this plugin uses.
Default config comes with this values:

```json
{
  "platform": "ComelitVedo",
  "alarm_address": "192.168.1.2",
  "alarm_port": 80,
  "alarm_code": "12345678",
  "advanced": {
    "login": "/login.cgi",
    "login_info": "/login.json",
    "area_desc": "/user/area_desc.json",
    "area_stat": "/user/area_stat.json",
    "zone_desc": "/user/zone_desc.json",
    "zone_stat": "/user/zone_stat.json",
    "action": "/action.cgi",
    "code_param": "code"
  }
}
```

A possible alternative configuration for Vedo without an IP could be:

```json
{
  "platform": "ComelitVedo",
  "alarm_address": "192.168.1.2",
  "alarm_port": 80,
  "alarm_code": "12345678",
  "advanced": {
    "login": "/login.cgi",
    "login_info": "/login.json",
    "area_desc": "/user/vedo_area_desc.json",
    "area_stat": "/user/vedo_area_stat.json",
    "zone_desc": "/user/vedo_zone_desc.json",
    "zone_stat": "/user/vedo_zone_stat.json",
    "action": "/user/action.cgi",
    "code_param": "alm"
  }
}
```

You can also configure areas to match Home App states (Home, Night and Away) and always-on areas:

```json
{
  "platform": "ComelitVedo",
  "alarm_address": "192.168.1.2",
  "alarm_port": 80,
  "alarm_code": "12345678",
  "update_interval": 2,
  "map_sensors": true,
  "area_mapping": {
    "away_areas": ["AREA_1"],
    "home_areas": ["AREA_2"],
    "night_areas": ["AREA_3"],
    "always_on_areas": ["AREA_ALWAYS_TRIGGERED"]
  },
  "advanced": {
    "login": "/login.cgi",
    "login_info": "/login.json",
    "area_desc": "/user/vedo_area_desc.json",
    "area_stat": "/user/vedo_area_stat.json",
    "zone_desc": "/user/vedo_zone_desc.json",
    "zone_stat": "/user/vedo_zone_stat.json",
    "action": "/user/action.cgi",
    "code_param": "alm"
  }
}
```

If you don't provide any value for night and home areas you will only be able to switch your alarm on and off from the Home App.

Note: in always_on_areas you can provide one or more areas that are always in trigger mode (some systems have them configured). Areas in this array won't be checked, so please do not add any area here if you don't know what you are doing.

## Version History

- 1.0.0 - Initial version
- 1.1.0 - Add the possibility to specify an array of "ALWAYS ON" areas: these areas won't be checked if active.

## Screenshots

![Home application screenshot - Alarm](https://github.com/madchicken/homebridge-comelit-vedo/raw/master/images/vedo.png)
![Home application screenshot - Sensor](https://github.com/madchicken/homebridge-comelit-vedo/raw/master/images/sensor.png)
![Home application screenshot - Sensor active](https://github.com/madchicken/homebridge-comelit-vedo/raw/master/images/sensor-active.png)
