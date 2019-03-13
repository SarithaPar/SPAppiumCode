"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.extensions = exports.helpers = exports.commands = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _appiumBaseDriver = require("appium-base-driver");

var _appiumIosDriver = require("appium-ios-driver");

var _logger = _interopRequireDefault(require("../logger"));

var _appiumSupport = require("appium-support");

let commands = {},
    helpers = {},
    extensions = {};
exports.extensions = extensions;
exports.helpers = helpers;
exports.commands = commands;

commands.active = async function () {
  if (this.isWebContext()) {
    return await this.executeAtom('active_element', []);
  }

  return await this.proxyCommand(`/element/active`, 'GET');
};

commands.background = async function (duration) {
  const homescreenEndpoint = '/wda/homescreen';
  const deactivateAppEndpoint = '/wda/deactivateApp';
  let endpoint;
  let params;

  if (_lodash.default.isUndefined(duration)) {
    _logger.default.warn('commands.background: Application under test will never be restored in the future if no duration is provided. ' + 'See https://github.com/appium/appium/issues/7741');

    endpoint = deactivateAppEndpoint;
    params = {};
  } else if (_lodash.default.isNumber(duration)) {
    _logger.default.warn('commands.background: Passing numbers to \'duration\' argument is deprecated. ' + 'See https://github.com/appium/appium/issues/7741');

    if (duration >= 0) {
      params = {
        duration
      };
      endpoint = deactivateAppEndpoint;
    } else {
      endpoint = homescreenEndpoint;
    }
  } else if (_lodash.default.isPlainObject(duration)) {
    if (_lodash.default.has(duration, 'timeout')) {
      if (duration.timeout === null) {
        endpoint = homescreenEndpoint;
      } else if (_lodash.default.isNumber(duration.timeout)) {
        if (duration.timeout >= 0) {
          params = {
            duration: duration.timeout / 1000.0
          };
          endpoint = deactivateAppEndpoint;
        } else {
          endpoint = homescreenEndpoint;
        }
      }
    }
  }

  if (_lodash.default.isUndefined(endpoint)) {
    _logger.default.errorAndThrow('commands.background: Argument value is expected to be an object or \'undefined\'. ' + `'${duration}' value has been provided instead. ` + 'The \'timeout\' attribute can be \'null\' or any negative number to put the app under test ' + 'into background and never come back or a positive number of milliseconds to wait until the app is restored.');
  }

  return await this.proxyCommand(endpoint, 'POST', params, endpoint !== homescreenEndpoint);
};

commands.touchId = async function (match = true) {
  await this.mobileSendBiometricMatch({
    match
  });
};

commands.toggleEnrollTouchId = async function (isEnabled = true) {
  await this.mobileEnrollBiometric({
    isEnabled
  });
};

helpers.getWindowSizeWeb = async function getWindowSizeWeb() {
  return await this.executeAtom('get_window_size', []);
};

helpers.getWindowSizeNative = async function getWindowSizeNative() {
  return await this.proxyCommand(`/window/size`, 'GET');
};

commands.getWindowSize = async function (windowHandle = 'current') {
  if (windowHandle !== "current") {
    throw new _appiumBaseDriver.errors.NotYetImplementedError('Currently only getting current window size is supported.');
  }

  if (!this.isWebContext()) {
    return await this.getWindowSizeNative();
  } else {
    return await this.getWindowSizeWeb();
  }
};

commands.getWindowRect = async function () {
  const {
    width,
    height
  } = await this.getWindowSize();
  return {
    width,
    height,
    x: 0,
    y: 0
  };
};

commands.hideKeyboard = async function (strategy, ...possibleKeys) {
  if (!(this.opts.deviceName || '').includes('iPhone')) {
    try {
      await this.proxyCommand('/wda/keyboard/dismiss', 'POST');
      return;
    } catch (err) {
      _logger.default.debug('Cannot dismiss the keyboard using the native call. Trying to apply a workaround...');
    }
  }

  let keyboard;

  try {
    keyboard = await this.findNativeElementOrElements('class name', 'XCUIElementTypeKeyboard', false);
  } catch (err) {
    _logger.default.debug('No keyboard found. Unable to hide.');

    return;
  }

  possibleKeys.pop();
  possibleKeys = possibleKeys.filter(element => !!element);

  if (possibleKeys.length) {
    for (let key of possibleKeys) {
      let el = _lodash.default.last((await this.findNativeElementOrElements('accessibility id', key, true, keyboard)));

      if (el) {
        _logger.default.debug(`Attempting to hide keyboard by pressing '${key}' key.`);

        await this.nativeClick(el);
        return;
      }
    }
  } else {
    _logger.default.debug('Finding keyboard and clicking final button to close');

    if ((await this.getNativeAttribute('visible', keyboard)) === 'false') {
      _logger.default.debug('No visible keyboard found. Returning');

      return;
    }

    let buttons = await this.findNativeElementOrElements('class name', 'XCUIElementTypeButton', true, keyboard);
    await this.nativeClick(_lodash.default.last(buttons));
  }
};

commands.getDeviceTime = _appiumIosDriver.iosCommands.general.getDeviceTime;
commands.getStrings = _appiumIosDriver.iosCommands.general.getStrings;

commands.removeApp = async function (bundleId) {
  return await this.mobileRemoveApp({
    bundleId
  });
};

commands.launchApp = _appiumIosDriver.iosCommands.general.launchApp;
commands.closeApp = _appiumIosDriver.iosCommands.general.closeApp;

commands.keys = async function (keys) {
  if (!this.isWebContext()) {
    throw new _appiumBaseDriver.errors.UnknownError('Command should be proxied to WDA');
  }

  let el = await this.active();

  if (_lodash.default.isUndefined(el.ELEMENT)) {
    throw new _appiumBaseDriver.errors.NoSuchElementError();
  }

  await this.setValue(keys, el.ELEMENT);
};

commands.setUrl = async function (url) {
  if (!this.isWebContext() && this.isRealDevice()) {
    return await this.proxyCommand('/url', 'POST', {
      url
    });
  }

  return await _appiumIosDriver.iosCommands.general.setUrl.call(this, url);
};

commands.getViewportRect = _appiumIosDriver.iosCommands.device.getViewportRect;

commands.getScreenInfo = async function () {
  return await this.proxyCommand('/wda/screen', 'GET');
};

commands.getStatusBarHeight = async function () {
  const {
    statusBarSize
  } = await this.getScreenInfo();
  return statusBarSize.height;
};

commands.getDevicePixelRatio = async function () {
  const {
    scale
  } = await this.getScreenInfo();
  return scale;
};

commands.mobilePressButton = async function (opts = {}) {
  const {
    name
  } = opts;

  if (!name) {
    _logger.default.errorAndThrow('Button name is mandatory');
  }

  return await this.proxyCommand('/wda/pressButton', 'POST', {
    name
  });
};

commands.mobileSiriCommand = async function (opts = {}) {
  const {
    text
  } = opts;

  if (!_appiumSupport.util.hasValue(text)) {
    _logger.default.errorAndThrow('"text" argument is mandatory');
  }

  return await this.proxyCommand('/wda/siri/activate', 'POST', {
    text
  });
};

Object.assign(extensions, commands, helpers);
var _default = extensions;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jb21tYW5kcy9nZW5lcmFsLmpzIl0sIm5hbWVzIjpbImNvbW1hbmRzIiwiaGVscGVycyIsImV4dGVuc2lvbnMiLCJhY3RpdmUiLCJpc1dlYkNvbnRleHQiLCJleGVjdXRlQXRvbSIsInByb3h5Q29tbWFuZCIsImJhY2tncm91bmQiLCJkdXJhdGlvbiIsImhvbWVzY3JlZW5FbmRwb2ludCIsImRlYWN0aXZhdGVBcHBFbmRwb2ludCIsImVuZHBvaW50IiwicGFyYW1zIiwiXyIsImlzVW5kZWZpbmVkIiwibG9nIiwid2FybiIsImlzTnVtYmVyIiwiaXNQbGFpbk9iamVjdCIsImhhcyIsInRpbWVvdXQiLCJlcnJvckFuZFRocm93IiwidG91Y2hJZCIsIm1hdGNoIiwibW9iaWxlU2VuZEJpb21ldHJpY01hdGNoIiwidG9nZ2xlRW5yb2xsVG91Y2hJZCIsImlzRW5hYmxlZCIsIm1vYmlsZUVucm9sbEJpb21ldHJpYyIsImdldFdpbmRvd1NpemVXZWIiLCJnZXRXaW5kb3dTaXplTmF0aXZlIiwiZ2V0V2luZG93U2l6ZSIsIndpbmRvd0hhbmRsZSIsImVycm9ycyIsIk5vdFlldEltcGxlbWVudGVkRXJyb3IiLCJnZXRXaW5kb3dSZWN0Iiwid2lkdGgiLCJoZWlnaHQiLCJ4IiwieSIsImhpZGVLZXlib2FyZCIsInN0cmF0ZWd5IiwicG9zc2libGVLZXlzIiwib3B0cyIsImRldmljZU5hbWUiLCJpbmNsdWRlcyIsImVyciIsImRlYnVnIiwia2V5Ym9hcmQiLCJmaW5kTmF0aXZlRWxlbWVudE9yRWxlbWVudHMiLCJwb3AiLCJmaWx0ZXIiLCJlbGVtZW50IiwibGVuZ3RoIiwia2V5IiwiZWwiLCJsYXN0IiwibmF0aXZlQ2xpY2siLCJnZXROYXRpdmVBdHRyaWJ1dGUiLCJidXR0b25zIiwiZ2V0RGV2aWNlVGltZSIsImlvc0NvbW1hbmRzIiwiZ2VuZXJhbCIsImdldFN0cmluZ3MiLCJyZW1vdmVBcHAiLCJidW5kbGVJZCIsIm1vYmlsZVJlbW92ZUFwcCIsImxhdW5jaEFwcCIsImNsb3NlQXBwIiwia2V5cyIsIlVua25vd25FcnJvciIsIkVMRU1FTlQiLCJOb1N1Y2hFbGVtZW50RXJyb3IiLCJzZXRWYWx1ZSIsInNldFVybCIsInVybCIsImlzUmVhbERldmljZSIsImNhbGwiLCJnZXRWaWV3cG9ydFJlY3QiLCJkZXZpY2UiLCJnZXRTY3JlZW5JbmZvIiwiZ2V0U3RhdHVzQmFySGVpZ2h0Iiwic3RhdHVzQmFyU2l6ZSIsImdldERldmljZVBpeGVsUmF0aW8iLCJzY2FsZSIsIm1vYmlsZVByZXNzQnV0dG9uIiwibmFtZSIsIm1vYmlsZVNpcmlDb21tYW5kIiwidGV4dCIsInV0aWwiLCJoYXNWYWx1ZSIsIk9iamVjdCIsImFzc2lnbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFFQSxJQUFJQSxRQUFRLEdBQUcsRUFBZjtBQUFBLElBQW1CQyxPQUFPLEdBQUcsRUFBN0I7QUFBQSxJQUFpQ0MsVUFBVSxHQUFHLEVBQTlDOzs7OztBQUVBRixRQUFRLENBQUNHLE1BQVQsR0FBa0Isa0JBQWtCO0FBQ2xDLE1BQUksS0FBS0MsWUFBTCxFQUFKLEVBQXlCO0FBQ3ZCLFdBQU8sTUFBTSxLQUFLQyxXQUFMLENBQWlCLGdCQUFqQixFQUFtQyxFQUFuQyxDQUFiO0FBQ0Q7O0FBQ0QsU0FBTyxNQUFNLEtBQUtDLFlBQUwsQ0FBbUIsaUJBQW5CLEVBQXFDLEtBQXJDLENBQWI7QUFDRCxDQUxEOztBQWtCQU4sUUFBUSxDQUFDTyxVQUFULEdBQXNCLGdCQUFnQkMsUUFBaEIsRUFBMEI7QUFDOUMsUUFBTUMsa0JBQWtCLEdBQUcsaUJBQTNCO0FBQ0EsUUFBTUMscUJBQXFCLEdBQUcsb0JBQTlCO0FBQ0EsTUFBSUMsUUFBSjtBQUNBLE1BQUlDLE1BQUo7O0FBQ0EsTUFBSUMsZ0JBQUVDLFdBQUYsQ0FBY04sUUFBZCxDQUFKLEVBQTZCO0FBRzNCTyxvQkFBSUMsSUFBSixDQUFTLGtIQUNBLGtEQURUOztBQUVBTCxJQUFBQSxRQUFRLEdB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QUE5QjtBQUNBLFNBQU9FLGFBQWEsQ0FBQzdDLE1BQXJCO0FBQ0QsQ0FIRDs7QUFNQXBDLFFBQVEsQ0FBQ2tGLG1CQUFULEdBQStCLGtCQUFrQjtBQUMvQyxRQUFNO0FBQUNDLElBQUFBO0FBQUQsTUFBVSxNQUFNLEtBQUtKLGFBQUwsRUFBdEI7QUFDQSxTQUFPSSxLQUFQO0FBQ0QsQ0FIRDs7QUFLQW5GLFFBQVEsQ0FBQ29GLGlCQUFULEdBQTZCLGdCQUFnQjFDLElBQUksR0FBRyxFQUF2QixFQUEyQjtBQUN0RCxRQUFNO0FBQUMyQyxJQUFBQTtBQUFELE1BQVMzQyxJQUFmOztBQUNBLE1BQUksQ0FBQzJDLElBQUwsRUFBVztBQUNUdEUsb0JBQUlNLGFBQUosQ0FBa0IsMEJBQWxCO0FBQ0Q7O0FBQ0QsU0FBTyxNQUFNLEtBQUtmLFlBQUwsQ0FBa0Isa0JBQWxCLEVBQXNDLE1BQXRDLEVBQThDO0FBQUMrRSxJQUFBQTtBQUFELEdBQTlDLENBQWI7QUFDRCxDQU5EOztBQVFBckYsUUFBUSxDQUFDc0YsaUJBQVQsR0FBNkIsZ0JBQWdCNUMsSUFBSSxHQUFHLEVBQXZCLEVBQTJCO0FBQ3RELFFBQU07QUFBQzZDLElBQUFBO0FBQUQsTUFBUzdDLElBQWY7O0FBQ0EsTUFBSSxDQUFDOEMsb0JBQUtDLFFBQUwsQ0FBY0YsSUFBZCxDQUFMLEVBQTBCO0FBQ3hCeEUsb0JBQUlNLGFBQUosQ0FBa0IsOEJBQWxCO0FBQ0Q7O0FBQ0QsU0FBTyxNQUFNLEtBQUtmLFlBQUwsQ0FBa0Isb0JBQWxCLEVBQXdDLE1BQXhDLEVBQWdEO0FBQUNpRixJQUFBQTtBQUFELEdBQWhELENBQWI7QUFDRCxDQU5EOztBQVFBRyxNQUFNLENBQUNDLE1BQVAsQ0FBY3pGLFVBQWQsRUFBMEJGLFFBQTFCLEVBQW9DQyxPQUFwQztlQUdlQyxVIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IGVycm9ycyB9IGZyb20gJ2FwcGl1bS1iYXNlLWRyaXZlcic7XG5pbXBvcnQgeyBpb3NDb21tYW5kcyB9IGZyb20gJ2FwcGl1bS1pb3MtZHJpdmVyJztcbmltcG9ydCBsb2cgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCB7IHV0aWwgfSBmcm9tICdhcHBpdW0tc3VwcG9ydCc7XG5cbmxldCBjb21tYW5kcyA9IHt9LCBoZWxwZXJzID0ge30sIGV4dGVuc2lvbnMgPSB7fTtcblxuY29tbWFuZHMuYWN0aXZlID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc1dlYkNvbnRleHQoKSkge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVBdG9tKCdhY3RpdmVfZWxlbWVudCcsIFtdKTtcbiAgfVxuICByZXR1cm4gYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoYC9lbGVtZW50L2FjdGl2ZWAsICdHRVQnKTtcbn07XG5cbi8qKlxuICogQ2xvc2UgYXBwIChzaW11bGF0ZSBkZXZpY2UgaG9tZSBidXR0b24pLiBJdCBpcyBwb3NzaWJsZSB0byByZXN0b3JlXG4gKiB0aGUgYXBwIGFmdGVyIHRoZSB0aW1lb3V0IG9yIGtlZXAgaXQgbWluaW1pemVkIGJhc2VkIG9uIHRoZSBwYXJhbWV0ZXIgdmFsdWUuXG4gKlxuICogUG9zc2libGUgdmFsdWVzIGZvciBgZHVyYXRpb25gOlxuICogLSBhbnkgcG9zaXRpdmUgbnVtYmVyIG9mIHNlY29uZHM6IGNvbWUgYmFjayBhZnRlciBYIHNlY29uZHMsIHNob3cgZGVwcmVjYXRpb24gd2FybmluZ1xuICogLSBhbnkgbmVnYXRpdmUgbnVtYmVyIG9mIHNlY29uZHM6IG5ldmVyIGNvbWUgYmFjaywgc2hvdyBkZXByZWNhdGlvbiB3YXJuaW5nXG4gKiAtIHVuZGVmaW5lZDogY29tZSBiYWNrIGFmdGVyIHRoZSBkZWZhdWx0IHRpbWVvdXQgKGRlZmluZWQgYnkgV0RBKSwgc2hvdyBkZXByZWNhdGlvbiB3YXJuaW5nLiBBZnRlciBkZXByZWNhdGlvbjogbmV2ZXIgY29tZSBiYWNrXG4gKiAtIHt0aW1lb3V0OiA1MDAwfTogY29tZSBiYWNrIGFmdGVyIDUgc2Vjb25kc1xuICogLSB7dGltZW91dDogbnVsbH0sIHt0aW1lb3V0OiAtMn06IG5ldmVyIGNvbWUgYmFja1xuICovXG5jb21tYW5kcy5iYWNrZ3JvdW5kID0gYXN5bmMgZnVuY3Rpb24gKGR1cmF0aW9uKSB7XG4gIGNvbnN0IGhvbWVzY3JlZW5FbmRwb2ludCA9ICcvd2RhL2hvbWVzY3JlZW4nO1xuICBjb25zdCBkZWFjdGl2YXRlQXBwRW5kcG9pbnQgPSAnL3dkYS9kZWFjdGl2YXRlQXBwJztcbiAgbGV0IGVuZHBvaW50O1xuICBsZXQgcGFyYW1zO1xuICBpZiAoXy5pc1VuZGVmaW5lZChkdXJhdGlvbikpIHtcbiAgICAvLyBUT0RPOiBSZXBsYWNlIHRoZSBibG9jayBhZnRlciBkZXByZWNhdGVkIHN0dWZmIGlzIHJlbW92ZWRcbiAgICAvLyBlbmRwb2ludCA9IGhvbWVzY3JlZW5FbmRwb2ludDtcbiAgICBsb2cud2FybignY29tbWFuZHMuYmFja2dyb3VuZDogQXBwbGljYXRpb24gdW5kZXIgdGVzdCB3aWxsIG5ldmVyIGJlIHJlc3RvcmVkIGluIHRoZSBmdXR1cmUgaWYgbm8gZHVyYXRpb24gaXMgcHJvdmlkZWQuICcgK1xuICAgICAgICAgICAgICdTZWUgaHR0cHM6Ly9naXRodWIuY29tL2FwcGl1bS9hcHBpdW0vaXNzdWVzLzc3NDEnKTtcbiAgICBlbmRwb2ludCA9IGRlYWN0aXZhdGVBcHBFbmRwb2ludDtcbiAgICBwYXJhbXMgPSB7fTtcbiAgfSBlbHNlIGlmIChfLmlzTnVtYmVyKGR1cmF0aW9uKSkge1xuICAgIC8vIFRPRE86IGRlcHJlY2F0ZSB0aGlzIGNhc2VcbiAgICBsb2cud2FybignY29tbWFuZHMuYmFja2dyb3VuZDogUGFzc2luZyBudW1iZXJzIHRvIFxcJ2R1cmF0aW9uXFwnIGFyZ3VtZW50IGlzIGRlcHJlY2F0ZWQuICcgK1xuICAgICAgICAgICAgICdTZWUgaHR0cHM6Ly9naXRodWIuY29tL2FwcGl1bS9hcHBpdW0vaXNzdWVzLzc3NDEnKTtcbiAgICBpZiAoZHVyYXRpb24gPj0gMCkge1xuICAgICAgcGFyYW1zID0ge2R1cmF0aW9ufTtcbiAgICAgIGVuZHBvaW50ID0gZGVhY3RpdmF0ZUFwcEVuZHBvaW50O1xuICAgIH0gZWxzZSB7XG4gICAgICBlbmRwb2ludCA9IGhvbWVzY3JlZW5FbmRwb2ludDtcbiAgICB9XG4gIH0gZWxzZSBpZiAoXy5pc1BsYWluT2JqZWN0KGR1cmF0aW9uKSkge1xuICAgIGlmIChfLmhhcyhkdXJhdGlvbiwgJ3RpbWVvdXQnKSkge1xuICAgICAgaWYgKGR1cmF0aW9uLnRpbWVvdXQgPT09IG51bGwpIHtcbiAgICAgICAgZW5kcG9pbnQgPSBob21lc2NyZWVuRW5kcG9pbnQ7XG4gICAgICB9IGVsc2UgaWYgKF8uaXNOdW1iZXIoZHVyYXRpb24udGltZW91dCkpIHtcbiAgICAgICAgaWYgKGR1cmF0aW9uLnRpbWVvdXQgPj0gMCkge1xuICAgICAgICAgIHBhcmFtcyA9IHtkdXJhdGlvbjogZHVyYXRpb24udGltZW91dCAvIDEwMDAuMH07XG4gICAgICAgICAgZW5kcG9pbnQgPSBkZWFjdGl2YXRlQXBwRW5kcG9pbnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZW5kcG9pbnQgPSBob21lc2NyZWVuRW5kcG9pbnQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKF8uaXNVbmRlZmluZWQoZW5kcG9pbnQpKSB7XG4gICAgbG9nLmVycm9yQW5kVGhyb3coJ2NvbW1hbmRzLmJhY2tncm91bmQ6IEFyZ3VtZW50IHZhbHVlIGlzIGV4cGVjdGVkIHRvIGJlIGFuIG9iamVjdCBvciBcXCd1bmRlZmluZWRcXCcuICcgK1xuICAgICAgICAgICAgICAgICAgICAgIGAnJHtkdXJhdGlvbn0nIHZhbHVlIGhhcyBiZWVuIHByb3ZpZGVkIGluc3RlYWQuIGAgK1xuICAgICAgICAgICAgICAgICAgICAgICdUaGUgXFwndGltZW91dFxcJyBhdHRyaWJ1dGUgY2FuIGJlIFxcJ251bGxcXCcgb3IgYW55IG5lZ2F0aXZlIG51bWJlciB0byBwdXQgdGhlIGFwcCB1bmRlciB0ZXN0ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICdpbnRvIGJhY2tncm91bmQgYW5kIG5ldmVyIGNvbWUgYmFjayBvciBhIHBvc2l0aXZlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gd2FpdCB1bnRpbCB0aGUgYXBwIGlzIHJlc3RvcmVkLicpO1xuICB9XG4gIHJldHVybiBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZChlbmRwb2ludCwgJ1BPU1QnLCBwYXJhbXMsIGVuZHBvaW50ICE9PSBob21lc2NyZWVuRW5kcG9pbnQpO1xufTtcblxuY29tbWFuZHMudG91Y2hJZCA9IGFzeW5jIGZ1bmN0aW9uIChtYXRjaCA9IHRydWUpIHtcbiAgYXdhaXQgdGhpcy5tb2JpbGVTZW5kQmlvbWV0cmljTWF0Y2goe21hdGNofSk7XG59O1xuXG5jb21tYW5kcy50b2dnbGVFbnJvbGxUb3VjaElkID0gYXN5bmMgZnVuY3Rpb24gKGlzRW5hYmxlZCA9IHRydWUpIHtcbiAgYXdhaXQgdGhpcy5tb2JpbGVFbnJvbGxCaW9tZXRyaWMoe2lzRW5hYmxlZH0pO1xufTtcblxuLy8gbWVtb2l6ZWQgaW4gY29uc3RydWN0b3JcbmhlbHBlcnMuZ2V0V2luZG93U2l6ZVdlYiA9IGFzeW5jIGZ1bmN0aW9uIGdldFdpbmRvd1NpemVXZWIgKCkge1xuICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlQXRvbSgnZ2V0X3dpbmRvd19zaXplJywgW10pO1xufTtcblxuLy8gbWVtb2l6ZWQgaW4gY29uc3RydWN0b3JcbmhlbHBlcnMuZ2V0V2luZG93U2l6ZU5hdGl2ZSA9IGFzeW5jIGZ1bmN0aW9uIGdldFdpbmRvd1NpemVOYXRpdmUgKCkge1xuICByZXR1cm4gYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoYC93aW5kb3cvc2l6ZWAsICdHRVQnKTtcbn07XG5cbmNvbW1hbmRzLmdldFdpbmRvd1NpemUgPSBhc3luYyBmdW5jdGlvbiAod2luZG93SGFuZGxlID0gJ2N1cnJlbnQnKSB7XG4gIGlmICh3aW5kb3dIYW5kbGUgIT09IFwiY3VycmVudFwiKSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5Ob3RZZXRJbXBsZW1lbnRlZEVycm9yKCdDdXJyZW50bHkgb25seSBnZXR0aW5nIGN1cnJlbnQgd2luZG93IHNpemUgaXMgc3VwcG9ydGVkLicpO1xuICB9XG5cbiAgaWYgKCF0aGlzLmlzV2ViQ29udGV4dCgpKSB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0V2luZG93U2l6ZU5hdGl2ZSgpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFdpbmRvd1NpemVXZWIoKTtcbiAgfVxufTtcblxuLy8gRm9yIFczQ1xuY29tbWFuZHMuZ2V0V2luZG93UmVjdCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgY29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gYXdhaXQgdGhpcy5nZXRXaW5kb3dTaXplKCk7XG4gIHJldHVybiB7XG4gICAgd2lkdGgsXG4gICAgaGVpZ2h0LFxuICAgIHg6IDAsXG4gICAgeTogMFxuICB9O1xufTtcblxuY29tbWFuZHMuaGlkZUtleWJvYXJkID0gYXN5bmMgZnVuY3Rpb24gKHN0cmF0ZWd5LCAuLi5wb3NzaWJsZUtleXMpIHtcbiAgaWYgKCEodGhpcy5vcHRzLmRldmljZU5hbWUgfHwgJycpLmluY2x1ZGVzKCdpUGhvbmUnKSkge1xuICAgIC8vIFRPRE86IG9uY2UgV0RBIGNhbiBoYW5kbGUgZGlzbWlzc2luZyBrZXlib2FyZCBmb3IgaXBob25lLCB0YWtlIGF3YXkgY29uZGl0aW9uYWxcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoJy93ZGEva2V5Ym9hcmQvZGlzbWlzcycsICdQT1NUJyk7XG4gICAgICByZXR1cm47XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsb2cuZGVidWcoJ0Nhbm5vdCBkaXNtaXNzIHRoZSBrZXlib2FyZCB1c2luZyB0aGUgbmF0aXZlIGNhbGwuIFRyeWluZyB0byBhcHBseSBhIHdvcmthcm91bmQuLi4nKTtcbiAgICB9XG4gIH1cblxuICBsZXQga2V5Ym9hcmQ7XG4gIHRyeSB7XG4gICAga2V5Ym9hcmQgPSBhd2FpdCB0aGlzLmZpbmROYXRpdmVFbGVtZW50T3JFbGVtZW50cygnY2xhc3MgbmFtZScsICdYQ1VJRWxlbWVudFR5cGVLZXlib2FyZCcsIGZhbHNlKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gbm8ga2V5Ym9hcmQgZm91bmRcbiAgICBsb2cuZGVidWcoJ05vIGtleWJvYXJkIGZvdW5kLiBVbmFibGUgdG8gaGlkZS4nKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcG9zc2libGVLZXlzLnBvcCgpOyAvLyBsYXN0IHBhcmFtZXRlciBpcyB0aGUgc2Vzc2lvbiBpZFxuICBwb3NzaWJsZUtleXMgPSBwb3NzaWJsZUtleXMuZmlsdGVyKChlbGVtZW50KSA9PiAhIWVsZW1lbnQpOyAvLyBnZXQgcmlkIG9mIHVuZGVmaW5lZCBlbGVtZW50c1xuICBpZiAocG9zc2libGVLZXlzLmxlbmd0aCkge1xuICAgIGZvciAobGV0IGtleSBvZiBwb3NzaWJsZUtleXMpIHtcbiAgICAgIGxldCBlbCA9IF8ubGFzdChhd2FpdCB0aGlzLmZpbmROYXRpdmVFbGVtZW50T3JFbGVtZW50cygnYWNjZXNzaWJpbGl0eSBpZCcsIGtleSwgdHJ1ZSwga2V5Ym9hcmQpKTtcbiAgICAgIGlmIChlbCkge1xuICAgICAgICBsb2cuZGVidWcoYEF0dGVtcHRpbmcgdG8gaGlkZSBrZXlib2FyZCBieSBwcmVzc2luZyAnJHtrZXl9JyBrZXkuYCk7XG4gICAgICAgIGF3YWl0IHRoaXMubmF0aXZlQ2xpY2soZWwpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8vIGZpbmQgdGhlIGtleWJvYXJkLCBhbmQgaGl0IHRoZSBsYXN0IEJ1dHRvblxuICAgIGxvZy5kZWJ1ZygnRmluZGluZyBrZXlib2FyZCBhbmQgY2xpY2tpbmcgZmluYWwgYnV0dG9uIHRvIGNsb3NlJyk7XG4gICAgaWYgKGF3YWl0IHRoaXMuZ2V0TmF0aXZlQXR0cmlidXRlKCd2aXNpYmxlJywga2V5Ym9hcmQpID09PSAnZmFsc2UnKSB7XG4gICAgICBsb2cuZGVidWcoJ05vIHZpc2libGUga2V5Ym9hcmQgZm91bmQuIFJldHVybmluZycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgYnV0dG9ucyA9IGF3YWl0IHRoaXMuZmluZE5hdGl2ZUVsZW1lbnRPckVsZW1lbnRzKCdjbGFzcyBuYW1lJywgJ1hDVUlFbGVtZW50VHlwZUJ1dHRvbicsIHRydWUsIGtleWJvYXJkKTtcbiAgICBhd2FpdCB0aGlzLm5hdGl2ZUNsaWNrKF8ubGFzdChidXR0b25zKSk7XG4gIH1cbn07XG5cbmNvbW1hbmRzLmdldERldmljZVRpbWUgPSBpb3NDb21tYW5kcy5nZW5lcmFsLmdldERldmljZVRpbWU7XG5cbmNvbW1hbmRzLmdldFN0cmluZ3MgPSBpb3NDb21tYW5kcy5nZW5lcmFsLmdldFN0cmluZ3M7XG5cbmNvbW1hbmRzLnJlbW92ZUFwcCA9IGFzeW5jIGZ1bmN0aW9uIChidW5kbGVJZCkge1xuICByZXR1cm4gYXdhaXQgdGhpcy5tb2JpbGVSZW1vdmVBcHAoe2J1bmRsZUlkfSk7XG59O1xuXG5jb21tYW5kcy5sYXVuY2hBcHAgPSBpb3NDb21tYW5kcy5nZW5lcmFsLmxhdW5jaEFwcDtcblxuY29tbWFuZHMuY2xvc2VBcHAgPSBpb3NDb21tYW5kcy5nZW5lcmFsLmNsb3NlQXBwO1xuXG5jb21tYW5kcy5rZXlzID0gYXN5bmMgZnVuY3Rpb24gKGtleXMpIHtcbiAgaWYgKCF0aGlzLmlzV2ViQ29udGV4dCgpKSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5Vbmtub3duRXJyb3IoJ0NvbW1hbmQgc2hvdWxkIGJlIHByb3hpZWQgdG8gV0RBJyk7XG4gIH1cbiAgbGV0IGVsID0gYXdhaXQgdGhpcy5hY3RpdmUoKTtcbiAgaWYgKF8uaXNVbmRlZmluZWQoZWwuRUxFTUVOVCkpIHtcbiAgICB0aHJvdyBuZXcgZXJyb3JzLk5vU3VjaEVsZW1lbnRFcnJvcigpO1xuICB9XG4gIGF3YWl0IHRoaXMuc2V0VmFsdWUoa2V5cywgZWwuRUxFTUVOVCk7XG59O1xuXG5jb21tYW5kcy5zZXRVcmwgPSBhc3luYyBmdW5jdGlvbiAodXJsKSB7XG4gIGlmICghdGhpcy5pc1dlYkNvbnRleHQoKSAmJiB0aGlzLmlzUmVhbERldmljZSgpKSB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMucHJveHlDb21tYW5kKCcvdXJsJywgJ1BPU1QnLCB7dXJsfSk7XG4gIH1cbiAgcmV0dXJuIGF3YWl0IGlvc0NvbW1hbmRzLmdlbmVyYWwuc2V0VXJsLmNhbGwodGhpcywgdXJsKTtcbn07XG5cbmNvbW1hbmRzLmdldFZpZXdwb3J0UmVjdCA9IGlvc0NvbW1hbmRzLmRldmljZS5nZXRWaWV3cG9ydFJlY3Q7XG5cbi8vIG1lbW9pemVkIGluIGNvbnN0cnVjdG9yXG5jb21tYW5kcy5nZXRTY3JlZW5JbmZvID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICByZXR1cm4gYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoJy93ZGEvc2NyZWVuJywgJ0dFVCcpO1xufTtcblxuY29tbWFuZHMuZ2V0U3RhdHVzQmFySGVpZ2h0ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBjb25zdCB7c3RhdHVzQmFyU2l6ZX0gPSBhd2FpdCB0aGlzLmdldFNjcmVlbkluZm8oKTtcbiAgcmV0dXJuIHN0YXR1c0JhclNpemUuaGVpZ2h0O1xufTtcblxuLy8gbWVtb2l6ZWQgaW4gY29uc3RydWN0b3JcbmNvbW1hbmRzLmdldERldmljZVBpeGVsUmF0aW8gPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IHtzY2FsZX0gPSBhd2FpdCB0aGlzLmdldFNjcmVlbkluZm8oKTtcbiAgcmV0dXJuIHNjYWxlO1xufTtcblxuY29tbWFuZHMubW9iaWxlUHJlc3NCdXR0b24gPSBhc3luYyBmdW5jdGlvbiAob3B0cyA9IHt9KSB7XG4gIGNvbnN0IHtuYW1lfSA9IG9wdHM7XG4gIGlmICghbmFtZSkge1xuICAgIGxvZy5lcnJvckFuZFRocm93KCdCdXR0b24gbmFtZSBpcyBtYW5kYXRvcnknKTtcbiAgfVxuICByZXR1cm4gYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoJy93ZGEvcHJlc3NCdXR0b24nLCAnUE9TVCcsIHtuYW1lfSk7XG59O1xuXG5jb21tYW5kcy5tb2JpbGVTaXJpQ29tbWFuZCA9IGFzeW5jIGZ1bmN0aW9uIChvcHRzID0ge30pIHtcbiAgY29uc3Qge3RleHR9ID0gb3B0cztcbiAgaWYgKCF1dGlsLmhhc1ZhbHVlKHRleHQpKSB7XG4gICAgbG9nLmVycm9yQW5kVGhyb3coJ1widGV4dFwiIGFyZ3VtZW50IGlzIG1hbmRhdG9yeScpO1xuICB9XG4gIHJldHVybiBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZCgnL3dkYS9zaXJpL2FjdGl2YXRlJywgJ1BPU1QnLCB7dGV4dH0pO1xufTtcblxuT2JqZWN0LmFzc2lnbihleHRlbnNpb25zLCBjb21tYW5kcywgaGVscGVycyk7XG5cbmV4cG9ydCB7IGNvbW1hbmRzLCBoZWxwZXJzLCBleHRlbnNpb25zIH07XG5leHBvcnQgZGVmYXVsdCBleHRlbnNpb25zO1xuIl0sImZpbGUiOiJsaWIvY29tbWFuZHMvZ2VuZXJhbC5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLi8uLiJ9
