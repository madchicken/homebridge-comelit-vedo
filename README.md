[![npm version](https://badge.fury.io/js/homebridge-comelit-platform.svg)](https://badge.fury.io/js/homebridge-comelit-platform)

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

A possible configuration could be:

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
    "action": "/action.cgi",
    "code_param": "alm"
  }
}
```

## Version History

1.0.0 - Initial version
