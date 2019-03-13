"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createSim = createSim;
exports.getExistingSim = getExistingSim;
exports.runSimulatorReset = runSimulatorReset;
exports.installToSimulator = installToSimulator;
exports.shutdownSimulator = shutdownSimulator;
exports.shutdownOtherSimulators = shutdownOtherSimulators;

require("source-map-support/register");

var _path = _interopRequireDefault(require("path"));

var _appiumIosSimulator = require("appium-ios-simulator");

var _nodeSimctl = require("node-simctl");

var _utils = require("./utils");

var _lodash = _interopRequireDefault(require("lodash"));

var _logger = _interopRequireDefault(require("./logger"));

var _appiumSupport = require("appium-support");

const INSTALL_DAEMON_CACHE = 'com.apple.mobile.installd.staging';

async function createSim(caps) {
  const appiumTestDeviceName = `appiumTest-${caps.deviceName}`;
  const udid = await (0, _nodeSimctl.createDevice)(appiumTestDeviceName, caps.deviceName, caps.platformVersion);
  return await (0, _appiumIosSimulator.getSimulator)(udid);
}

async function getExistingSim(opts) {
  const devices = await (0, _nodeSimctl.getDevices)(opts.platformVersion);
  const appiumTestDeviceName = `appiumTest-${opts.deviceName}`;
  let appiumTestDevice;

  for (const device of _lodash.default.values(devices)) {
    if (device.name === opts.deviceName) {
      return await (0, _appiumIosSimulator.getSimulator)(device.udid);
    }

    if (device.name === appiumTestDeviceName) {
      appiumTestDevice = device;
    }
  }

  if (appiumTestDevice) {
    _logger.default.warn(`Unable to find device '${opts.deviceName}'. Found '${appiumTestDevice.name}' (udid: '${appiumTestDevice.udid}') instead`);

    return await (0, _appiumIosSimulator.getSimulator)(appiumTestDevice.udid);
  }

  return null;
}

async function shutdownSimulator(device) {
  await (0, _utils.resetXCTestProcesses)(device.udid, true);
  await device.shutdown();
}

async function runSimulatorReset(device, opts) {
  if (opts.noReset && !opts.fullReset) {
    _logger.default.debug('Reset: noReset is on. Leaving simulator as is');

    return;
  }

  if (!device) {
    _logger.default.debug('Reset: no device available. Skipping');

    return;
  }

  if (opts.fullReset) {
    _logger.default.debug('Reset: fullReset is on. Cleaning simulator');

    await shutdownSimulator(device);
    let isKeychainsBackupSuccessful = false;

    if (opts.keychainsExcludePatterns || opts.keepKeyChains) {
      isKeychainsBackupSuccessful = await device.backupKeychains();
    }

    await device.clean();

    if (isKeychainsBackupSuccessful) {
      await device.restoreKeychains(opts.keychainsExcludePatterns || []);

      _logger.default.info(`Successfully restored keychains after full reset`);
    } else if (opts.keychainsExcludePatterns || opts.keepKeyChains) {
      _logger.default.warn('Cannot restore keychains after full reset, because ' + 'the backup operation did not succeed');
    }
  } else if (opts.bundleId) {
    if (await device.isRunning()) {
      if (device.xcodeVersion.major >= 8) {
        try {
          await (0, _nodeSimctl.terminate)(device.udid, opts.bundleId);
        } catch (err) {
          _logger.default.warn(`Reset: failed to terminate Simulator application with id "${opts.bundleId}"`);
        }
      } else {
        await shutdownSimulator(device);
      }
    }

    if (opts.app) {
      _logger.default.info('Not scrubbing third party app in anticipation of uninstall');

      return;
    }

    const isSafari = (opts.browserName || '').toLowerCase() === 'safari';

    try {
      if (isSafari) {
        await device.cleanSafari();
      } else {
        await device.scrubCustomApp(_path.default.basename(opts.app), opts.bundleId);
      }
    } catch (err) {
      _logger.default.warn(err.message);

      _logger.default.warn(`Reset: could not scrub ${isSafari ? 'Safari browser' : 'application with id "' + opts.bundleId + '"'}. Leaving as is.`);
    }
  }
}

async function installToSimulator(device, app, bundleId, noReset = true) {
  if (!app) {
    _logger.default.debug('No app path is given. Nothing to install.');

    return;
  }

  if (bundleId) {
    if (await device.isAppInstalled(bundleId)) {
      if (noReset) {
        _logger.default.debug(`App '${bundleId}' is already installed. No need to reinstall.`);

        return;
      }

      _logger.default.debug(`Reset requested. Removing app with id '${bundleId}' from the device`);

      await device.removeApp(bundleId);
    }
  }

  const installdCacheRoot = _path.default.resolve(device.getDir(), 'Library', 'Caches', INSTALL_DAEMON_CACHE);

  let tmpRoot = null;

  if (await _appiumSupport.fs.exists(installdCacheRoot)) {
    tmpRoot = await _appiumSupport.tempDir.openDir();

    _logger.default.debug('Cleaning installd cache to save the disk space');

    await _appiumSupport.fs.mv(installdCacheRoot, _path.default.resolve(tmpRoot, INSTALL_DAEMON_CACHE), {
      mkdirp: true
    });
    await (0, _appiumSupport.mkdirp)(installdCacheRoot);
  }

  _logger.default.debug(`Installing '${app}' on Simulator with UUID '${device.udid}'...`);

  try {
    try {
      await device.installApp(app);
    } catch (e) {
      _logger.default.info(`Got an error on '${app}' install: ${e.message}`);

      if (e.message.includes('domain=MIInstallerErrorDomain, code=35') && tmpRoot) {
        _logger.default.info(`installd requires the cache to be available in order to install '${app}'. ` + `Restoring the cache`);

        await _appiumSupport.fs.rimraf(installdCacheRoot);
        await _appiumSupport.fs.mv(_path.default.resolve(tmpRoot, INSTALL_DAEMON_CACHE), installdCacheRoot, {
          mkdirp: true
        });
      }

      _logger.default.info('Retrying application install');

      await device.installApp(app);
    }

    _logger.default.debug('The app has been installed successfully.');
  } finally {
    if (tmpRoot && (await _appiumSupport.fs.exists(tmpRoot))) {
      await _appiumSupport.fs.rimraf(tmpRoot);
    }
  }
}

async function shutdownOtherSimulators(currentDevice) {
  const allDevices = _lodash.default.flatMap(_lodash.default.values((await (0, _nodeSimctl.getDevices)())));

  const otherBootedDevices = allDevices.filter(device => device.udid !== currentDevice.udid && device.state === 'Booted');

  if (_lodash.default.isEmpty(otherBootedDevices)) {
    _logger.default.info('No other running simulators have been detected');

    return;
  }

  _logger.default.info(`Detected ${otherBootedDevices.length} other running Simulator${otherBootedDevices.length === 1 ? '' : 's'}.` + `Shutting ${otherBootedDevices.length === 1 ? 'it' : 'them'} down...`);

  for (const _ref of otherBootedDevices) {
    const {
      udid
    } = _ref;
    await (0, _utils.resetXCTestProcesses)(udid, true);
    await (0, _nodeSimctl.shutdown)(udid);
  }
}require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9zaW11bGF0b3ItbWFuYWdlbWVudC5qcyJdLCJuYW1lcyI6WyJJTlNUQUxMX0RBRU1PTl9DQUNIRSIsImNyZWF0ZVNpbSIsImNhcHMiLCJhcHBpdW1UZXN0RGV2aWNlTmFtZSIsImRldmljZU5hbWUiLCJ1ZGlkIiwicGxhdGZvcm1WZXJzaW9uIiwiZ2V0RXhpc3RpbmdTaW0iLCJvcHRzIiwiZGV2aWNlcyIsImFwcGl1bVRlc3REZXZpY2UiLCJkZXZpY2UiLCJfIiwidmFsdWVzIiwibmFtZSIsImxvZyIsIndhcm4iLCJzaHV0ZG93blNpbXVsYXRvciIsInNodXRkb3duIiwicnVuU2ltdWxhdG9yUmVzZXQiLCJub1Jlc2V0IiwiZnVsbFJlc2V0IiwiZGVidWciLCJpc0tleWNoYWluc0JhY2t1cFN1Y2Nlc3NmdWwiLCJrZXljaGFpbnNFeGNsdWRlUGF0dGVybnMiLCJrZWVwS2V5Q2hhaW5zIiwiYmFja3VwS2V5Y2hhaW5zIiwiY2xlYW4iLCJyZXN0b3JlS2V5Y2hhaW5zIiwiaW5mbyIsImJ1bmRsZUlkIiwiaXNSdW5uaW5nIiwieGNvZGVWZXJzaW9uIiwibWFqb3IiLCJlcnIiLCJhcHAiLCJpc1NhZmFyaSIsImJyb3dzZXJOYW1lIiwidG9Mb3dlckNhc2UiLCJjbGVhblNhZmFyaSIsInNjcnViQ3VzdG9tQXBwIiwicGF0aCIsImJhc2VuYW1lIiwibWVzc2FnZSIsImluc3RhbGxUb1NpbXVsYXRvciIsImlzQXBwSW5zdGFsbGVkIiwicmVtb3ZlQXBwIiwiaW5zdGFsbGRDYWNoZVJvb3QiLCJyZXNvbHZlIiwiZ2V0RGlyIiwidG1wUm9vdCIsImZzIiwiZXhpc3RzIiwidGVtcERpciIsIm9wZW5EaXIiLCJtdiIsIm1rZGlycCIsImluc3RhbGxBcHAiLCJlIiwiaW5jbHVkZXMiLCJyaW1yYWYiLCJzaHV0ZG93bk90aGVyU2ltdWxhdG9ycyIsImN1cnJlbnREZXZpY2UiLCJhbGxEZXZpY2VzIiwiZmxhdE1hcCIsIm90aGVyQm9vdGVkRGV2aWNlcyIsImZpbHRl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TUFBTSw2QkFBZixFQUFWLENBQW5COztBQUNBLFFBQU1vRCxrQkFBa0IsR0FBR0YsVUFBVSxDQUFDRyxNQUFYLENBQW1CdkQsTUFBRCxJQUFZQSxNQUFNLENBQUNOLElBQVAsS0FBZ0J5RCxhQUFhLENBQUN6RCxJQUE5QixJQUFzQ00sTUFBTSxDQUFDd0QsS0FBUCxLQUFpQixRQUFyRixDQUEzQjs7QUFDQSxNQUFJdkQsZ0JBQUV3RCxPQUFGLENBQVVILGtCQUFWLENBQUosRUFBbUM7QUFDakNsRCxvQkFBSWMsSUFBSixDQUFTLGdEQUFUOztBQUNBO0FBQ0Q7O0FBQ0RkLGtCQUFJYyxJQUFKLENBQVUsWUFBV29DLGtCQUFrQixDQUFDSSxNQUFPLDJCQUEwQkosa0JBQWtCLENBQUNJLE1BQW5CLEtBQThCLENBQTlCLEdBQWtDLEVBQWxDLEdBQXVDLEdBQUksR0FBM0csR0FDQyxZQUFXSixrQkFBa0IsQ0FBQ0ksTUFBbkIsS0FBOEIsQ0FBOUIsR0FBa0MsSUFBbEMsR0FBeUMsTUFBTyxVQURyRTs7QUFFQSxxQkFBcUJKLGtCQUFyQixFQUF5QztBQUFBLFVBQTlCO0FBQUM1RCxNQUFBQTtBQUFELEtBQThCO0FBR3ZDLFVBQU0saUNBQXFCQSxJQUFyQixFQUEyQixJQUEzQixDQUFOO0FBQ0EsVUFBTSwwQkFBU0EsSUFBVCxDQUFOO0FBQ0Q7QUFDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgZ2V0U2ltdWxhdG9yIH0gZnJvbSAnYXBwaXVtLWlvcy1zaW11bGF0b3InO1xuaW1wb3J0IHsgY3JlYXRlRGV2aWNlLCBnZXREZXZpY2VzLCB0ZXJtaW5hdGUsIHNodXRkb3duIH0gZnJvbSAnbm9kZS1zaW1jdGwnO1xuaW1wb3J0IHsgcmVzZXRYQ1Rlc3RQcm9jZXNzZXMgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IHRlbXBEaXIsIGZzLCBta2RpcnAgfSBmcm9tICdhcHBpdW0tc3VwcG9ydCc7XG5cbmNvbnN0IElOU1RBTExfREFFTU9OX0NBQ0hFID0gJ2NvbS5hcHBsZS5tb2JpbGUuaW5zdGFsbGQuc3RhZ2luZyc7XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IHNpbXVsYXRvciB3aXRoIGBhcHBpdW1UZXN0LWAgcHJlZml4IGFuZCByZXR1cm4gdGhlIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gY2FwcyAtIENhcGFiaWxpdHkgc2V0IGJ5IGEgdXNlci4gVGhlIG9wdGlvbnMgYXZhaWxhYmxlIGFyZTpcbiAqICAgLSBgZGV2aWNlTmFtZWAgLSBhIG5hbWUgZm9yIHRoZSBkZXZpY2VcbiAqICAgLSBgcGxhdGZvcm1WZXJzaW9uYCAtIHRoZSB2ZXJzaW9uIG9mIGlPUyB0byB1c2VcbiAqIEByZXR1cm5zIHtvYmplY3R9IFNpbXVsYXRvciBvYmplY3QgYXNzb2NpYXRlZCB3aXRoIHRoZSB1ZGlkIHBhc3NlZCBpbi5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gY3JlYXRlU2ltIChjYXBzKSB7XG4gIGNvbnN0IGFwcGl1bVRlc3REZXZpY2VOYW1lID0gYGFwcGl1bVRlc3QtJHtjYXBzLmRldmljZU5hbWV9YDtcbiAgY29uc3QgdWRpZCA9IGF3YWl0IGNyZWF0ZURldmljZShhcHBpdW1UZXN0RGV2aWNlTmFtZSwgY2Fwcy5kZXZpY2VOYW1lLCBjYXBzLnBsYXRmb3JtVmVyc2lvbik7XG4gIHJldHVybiBhd2FpdCBnZXRTaW11bGF0b3IodWRpZCk7XG59XG5cbi8qKlxuICogR2V0IGEgc2ltdWxhdG9yIHdoaWNoIGlzIGFscmVhZHkgcnVubmluZy5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gb3B0cyAtIENhcGFiaWxpdHkgc2V0IGJ5IGEgdXNlci4gVGhlIG9wdGlvbnMgYXZhaWxhYmxlIGFyZTpcbiAqICAgLSBgZGV2aWNlTmFtZWAgLSBhIG5hbWUgZm9yIHRoZSBkZXZpY2VcbiAqICAgLSBgcGxhdGZvcm1WZXJzaW9uYCAtIHRoZSB2ZXJzaW9uIG9mIGlPUyB0byB1c2VcbiAqIEByZXR1cm5zIHs/b2JqZWN0fSBTaW11bGF0b3Igb2JqZWN0IGFzc29jaWF0ZWQgd2l0aCB0aGUgdWRpZCBwYXNzZWQgaW4uIE9yIG51bGwgaWYgbm8gZGV2aWNlIGlzIHJ1bm5pbmcuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGdldEV4aXN0aW5nU2ltIChvcHRzKSB7XG4gIGNvbnN0IGRldmljZXMgPSBhd2FpdCBnZXREZXZpY2VzKG9wdHMucGxhdGZvcm1WZXJzaW9uKTtcbiAgY29uc3QgYXBwaXVtVGVzdERldmljZU5hbWUgPSBgYXBwaXVtVGVzdC0ke29wdHMuZGV2aWNlTmFtZX1gO1xuXG4gIGxldCBhcHBpdW1UZXN0RGV2aWNlO1xuXG4gIGZvciAoY29uc3QgZGV2aWNlIG9mIF8udmFsdWVzKGRldmljZXMpKSB7XG4gICAgaWYgKGRldmljZS5uYW1lID09PSBvcHRzLmRldmljZU5hbWUpIHtcbiAgICAgIHJldHVybiBhd2FpdCBnZXRTaW11bGF0b3IoZGV2aWNlLnVkaWQpO1xuICAgIH1cblxuICAgIGlmIChkZXZpY2UubmFtZSA9PT0gYXBwaXVtVGVzdERldmljZU5hbWUpIHtcbiAgICAgIGFwcGl1bVRlc3REZXZpY2UgPSBkZXZpY2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKGFwcGl1bVRlc3REZXZpY2UpIHtcbiAgICBsb2cud2FybihgVW5hYmxlIHRvIGZpbmQgZGV2aWNlICcke29wdHMuZGV2aWNlTmFtZX0nLiBGb3VuZCAnJHthcHBpdW1UZXN0RGV2aWNlLm5hbWV9JyAodWRpZDogJyR7YXBwaXVtVGVzdERldmljZS51ZGlkfScpIGluc3RlYWRgKTtcbiAgICByZXR1cm4gYXdhaXQgZ2V0U2ltdWxhdG9yKGFwcGl1bVRlc3REZXZpY2UudWRpZCk7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNodXRkb3duU2ltdWxhdG9yIChkZXZpY2UpIHtcbiAgLy8gc3RvcCBYQ1Rlc3QgcHJvY2Vzc2VzIGlmIHJ1bm5pbmcgdG8gYXZvaWQgdW5leHBlY3RlZCBzaWRlIGVmZmVjdHNcbiAgYXdhaXQgcmVzZXRYQ1Rlc3RQcm9jZXNzZXMoZGV2aWNlLnVkaWQsIHRydWUpO1xuICBhd2FpdCBkZXZpY2Uuc2h1dGRvd24oKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuU2ltdWxhdG9yUmVzZXQgKGRldmljZSwgb3B0cykge1xuICBpZiAob3B0cy5ub1Jlc2V0ICYmICFvcHRzLmZ1bGxSZXNldCkge1xuICAgIC8vIG5vUmVzZXQgPT09IHRydWUgJiYgZnVsbFJlc2V0ID09PSBmYWxzZVxuICAgIGxvZy5kZWJ1ZygnUmVzZXQ6IG5vUmVzZXQgaXMgb24uIExlYXZpbmcgc2ltdWxhdG9yIGFzIGlzJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCFkZXZpY2UpIHtcbiAgICBsb2cuZGVidWcoJ1Jlc2V0OiBubyBkZXZpY2UgYXZhaWxhYmxlLiBTa2lwcGluZycpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChvcHRzLmZ1bGxSZXNldCkge1xuICAgIGxvZy5kZWJ1ZygnUmVzZXQ6IGZ1bGxSZXNldCBpcyBvbi4gQ2xlYW5pbmcgc2ltdWxhdG9yJyk7XG4gICAgYXdhaXQgc2h1dGRvd25TaW11bGF0b3IoZGV2aWNlKTtcbiAgICBsZXQgaXNLZXljaGFpbnNCYWNrdXBTdWNjZXNzZnVsID0gZmFsc2U7XG4gICAgaWYgKG9wdHMua2V5Y2hhaW5zRXhjbHVkZVBhdHRlcm5zIHx8IG9wdHMua2VlcEtleUNoYWlucykge1xuICAgICAgaXNLZXljaGFpbnNCYWNrdXBTdWNjZXNzZnVsID0gYXdhaXQgZGV2aWNlLmJhY2t1cEtleWNoYWlucygpO1xuICAgIH1cbiAgICBhd2FpdCBkZXZpY2UuY2xlYW4oKTtcbiAgICBpZiAoaXNLZXljaGFpbnNCYWNrdXBTdWNjZXNzZnVsKSB7XG4gICAgICBhd2FpdCBkZXZpY2UucmVzdG9yZUtleWNoYWlucyhvcHRzLmtleWNoYWluc0V4Y2x1ZGVQYXR0ZXJucyB8fCBbXSk7XG4gICAgICBsb2cuaW5mbyhgU3VjY2Vzc2Z1bGx5IHJlc3RvcmVkIGtleWNoYWlucyBhZnRlciBmdWxsIHJlc2V0YCk7XG4gICAgfSBlbHNlIGlmIChvcHRzLmtleWNoYWluc0V4Y2x1ZGVQYXR0ZXJucyB8fCBvcHRzLmtlZXBLZXlDaGFpbnMpIHtcbiAgICAgIGxvZy53YXJuKCdDYW5ub3QgcmVzdG9yZSBrZXljaGFpbnMgYWZ0ZXIgZnVsbCByZXNldCwgYmVjYXVzZSAnICtcbiAgICAgICAgICAgICAgICd0aGUgYmFja3VwIG9wZXJhdGlvbiBkaWQgbm90IHN1Y2NlZWQnKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAob3B0cy5idW5kbGVJZCkge1xuICAgIC8vIFRlcm1pbmF0ZSB0aGUgYXBwIHVuZGVyIHRlc3QgaWYgaXQgaXMgc3RpbGwgcnVubmluZyBvbiBTaW11bGF0b3JcbiAgICAvLyBUZXJtaW5hdGlvbiBpcyBub3QgbmVlZGVkIGlmIFNpbXVsYXRvciBpcyBub3QgcnVubmluZ1xuICAgIGlmIChhd2FpdCBkZXZpY2UuaXNSdW5uaW5nKCkpIHtcbiAgICAgIGlmIChkZXZpY2UueGNvZGVWZXJzaW9uLm1ham9yID49IDgpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0ZXJtaW5hdGUoZGV2aWNlLnVkaWQsIG9wdHMuYnVuZGxlSWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBsb2cud2FybihgUmVzZXQ6IGZhaWxlZCB0byB0ZXJtaW5hdGUgU2ltdWxhdG9yIGFwcGxpY2F0aW9uIHdpdGggaWQgXCIke29wdHMuYnVuZGxlSWR9XCJgKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgc2h1dGRvd25TaW11bGF0b3IoZGV2aWNlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9wdHMuYXBwKSB7XG4gICAgICBsb2cuaW5mbygnTm90IHNjcnViYmluZyB0aGlyZCBwYXJ0eSBhcHAgaW4gYW50aWNpcGF0aW9uIG9mIHVuaW5zdGFsbCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpc1NhZmFyaSA9IChvcHRzLmJyb3dzZXJOYW1lIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSAnc2FmYXJpJztcbiAgICB0cnkge1xuICAgICAgaWYgKGlzU2FmYXJpKSB7XG4gICAgICAgIGF3YWl0IGRldmljZS5jbGVhblNhZmFyaSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgZGV2aWNlLnNjcnViQ3VzdG9tQXBwKHBhdGguYmFzZW5hbWUob3B0cy5hcHApLCBvcHRzLmJ1bmRsZUlkKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy53YXJuKGVyci5tZXNzYWdlKTtcbiAgICAgIGxvZy53YXJuKGBSZXNldDogY291bGQgbm90IHNjcnViICR7aXNTYWZhcmkgPyAnU2FmYXJpIGJyb3dzZXInIDogJ2FwcGxpY2F0aW9uIHdpdGggaWQgXCInICsgb3B0cy5idW5kbGVJZCArICdcIid9LiBMZWF2aW5nIGFzIGlzLmApO1xuICAgIH1cbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBpbnN0YWxsVG9TaW11bGF0b3IgKGRldmljZSwgYXBwLCBidW5kbGVJZCwgbm9SZXNldCA9IHRydWUpIHtcbiAgaWYgKCFhcHApIHtcbiAgICBsb2cuZGVidWcoJ05vIGFwcCBwYXRoIGlzIGdpdmVuLiBOb3RoaW5nIHRvIGluc3RhbGwuJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGJ1bmRsZUlkKSB7XG4gICAgaWYgKGF3YWl0IGRldmljZS5pc0FwcEluc3RhbGxlZChidW5kbGVJZCkpIHtcbiAgICAgIGlmIChub1Jlc2V0KSB7XG4gICAgICAgIGxvZy5kZWJ1ZyhgQXBwICcke2J1bmRsZUlkfScgaXMgYWxyZWFkeSBpbnN0YWxsZWQuIE5vIG5lZWQgdG8gcmVpbnN0YWxsLmApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsb2cuZGVidWcoYFJlc2V0IHJlcXVlc3RlZC4gUmVtb3ZpbmcgYXBwIHdpdGggaWQgJyR7YnVuZGxlSWR9JyBmcm9tIHRoZSBkZXZpY2VgKTtcbiAgICAgIGF3YWl0IGRldmljZS5yZW1vdmVBcHAoYnVuZGxlSWQpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGluc3RhbGxkQ2FjaGVSb290ID0gcGF0aC5yZXNvbHZlKGRldmljZS5nZXREaXIoKSwgJ0xpYnJhcnknLCAnQ2FjaGVzJywgSU5TVEFMTF9EQUVNT05fQ0FDSEUpO1xuICBsZXQgdG1wUm9vdCA9IG51bGw7XG4gIGlmIChhd2FpdCBmcy5leGlzdHMoaW5zdGFsbGRDYWNoZVJvb3QpKSB7XG4gICAgLy8gQ2xlYW51cCBvZiBpbnN0YWxsZCBjYWNoZSBoZWxwcyB0byBzYXZlIGRpc2sgc3BhY2Ugd2hpbGUgcnVubmluZyBtdWx0aXBsZSB0ZXN0c1xuICAgIC8vIHdpdGhvdXQgcmVzdGFydGluZyB0aGUgU2ltdWxhdG9yOiBodHRwczovL2dpdGh1Yi5jb20vYXBwaXVtL2FwcGl1bS9pc3N1ZXMvOTQxMFxuICAgIHRtcFJvb3QgPSBhd2FpdCB0ZW1wRGlyLm9wZW5EaXIoKTtcbiAgICBsb2cuZGVidWcoJ0NsZWFuaW5nIGluc3RhbGxkIGNhY2hlIHRvIHNhdmUgdGhlIGRpc2sgc3BhY2UnKTtcbiAgICBhd2FpdCBmcy5tdihpbnN0YWxsZENhY2hlUm9vdCwgcGF0aC5yZXNvbHZlKHRtcFJvb3QsIElOU1RBTExfREFFTU9OX0NBQ0hFKSwge21rZGlycDogdHJ1ZX0pO1xuICAgIGF3YWl0IG1rZGlycChpbnN0YWxsZENhY2hlUm9vdCk7XG4gIH1cblxuICBsb2cuZGVidWcoYEluc3RhbGxpbmcgJyR7YXBwfScgb24gU2ltdWxhdG9yIHdpdGggVVVJRCAnJHtkZXZpY2UudWRpZH0nLi4uYCk7XG4gIHRyeSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGRldmljZS5pbnN0YWxsQXBwKGFwcCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLy8gb24gWGNvZGUgMTAgc29tZXRpbWVzIHRoaXMgaXMgdG9vIGZhc3QgYW5kIGl0IGZhaWxzXG4gICAgICBsb2cuaW5mbyhgR290IGFuIGVycm9yIG9uICcke2FwcH0nIGluc3RhbGw6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgaWYgKGUubWVzc2FnZS5pbmNsdWRlcygnZG9tYWluPU1JSW5zdGFsbGVyRXJyb3JEb21haW4sIGNvZGU9MzUnKSAmJiB0bXBSb290KSB7XG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hcHBpdW0vYXBwaXVtL2lzc3Vlcy8xMTM1MFxuICAgICAgICBsb2cuaW5mbyhgaW5zdGFsbGQgcmVxdWlyZXMgdGhlIGNhY2hlIHRvIGJlIGF2YWlsYWJsZSBpbiBvcmRlciB0byBpbnN0YWxsICcke2FwcH0nLiBgICtcbiAgICAgICAgICBgUmVzdG9yaW5nIHRoZSBjYWNoZWApO1xuICAgICAgICBhd2FpdCBmcy5yaW1yYWYoaW5zdGFsbGRDYWNoZVJvb3QpO1xuICAgICAgICBhd2FpdCBmcy5tdihwYXRoLnJlc29sdmUodG1wUm9vdCwgSU5TVEFMTF9EQUVNT05fQ0FDSEUpLCBpbnN0YWxsZENhY2hlUm9vdCwge21rZGlycDogdHJ1ZX0pO1xuICAgICAgfVxuICAgICAgbG9nLmluZm8oJ1JldHJ5aW5nIGFwcGxpY2F0aW9uIGluc3RhbGwnKTtcbiAgICAgIGF3YWl0IGRldmljZS5pbnN0YWxsQXBwKGFwcCk7XG4gICAgfVxuICAgIGxvZy5kZWJ1ZygnVGhlIGFwcCBoYXMgYmVlbiBpbnN0YWxsZWQgc3VjY2Vzc2Z1bGx5LicpO1xuICB9IGZpbmFsbHkge1xuICAgIGlmICh0bXBSb290ICYmIGF3YWl0IGZzLmV4aXN0cyh0bXBSb290KSkge1xuICAgICAgYXdhaXQgZnMucmltcmFmKHRtcFJvb3QpO1xuICAgIH1cbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzaHV0ZG93bk90aGVyU2ltdWxhdG9ycyAoY3VycmVudERldmljZSkge1xuICBjb25zdCBhbGxEZXZpY2VzID0gXy5mbGF0TWFwKF8udmFsdWVzKGF3YWl0IGdldERldmljZXMoKSkpO1xuICBjb25zdCBvdGhlckJvb3RlZERldmljZXMgPSBhbGxEZXZpY2VzLmZpbHRlcigoZGV2aWNlKSA9PiBkZXZpY2UudWRpZCAhPT0gY3VycmVudERldmljZS51ZGlkICYmIGRldmljZS5zdGF0ZSA9PT0gJ0Jvb3RlZCcpO1xuICBpZiAoXy5pc0VtcHR5KG90aGVyQm9vdGVkRGV2aWNlcykpIHtcbiAgICBsb2cuaW5mbygnTm8gb3RoZXIgcnVubmluZyBzaW11bGF0b3JzIGhhdmUgYmVlbiBkZXRlY3RlZCcpO1xuICAgIHJldHVybjtcbiAgfVxuICBsb2cuaW5mbyhgRGV0ZWN0ZWQgJHtvdGhlckJvb3RlZERldmljZXMubGVuZ3RofSBvdGhlciBydW5uaW5nIFNpbXVsYXRvciR7b3RoZXJCb290ZWREZXZpY2VzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfS5gICtcbiAgICAgICAgICAgYFNodXR0aW5nICR7b3RoZXJCb290ZWREZXZpY2VzLmxlbmd0aCA9PT0gMSA/ICdpdCcgOiAndGhlbSd9IGRvd24uLi5gKTtcbiAgZm9yIChjb25zdCB7dWRpZH0gb2Ygb3RoZXJCb290ZWREZXZpY2VzKSB7XG4gICAgLy8gSXQgaXMgbmVjZXNzYXJ5IHRvIHN0b3AgdGhlIGNvcnJlc3BvbmRpbmcgeGNvZGVidWlsZCBwcm9jZXNzIGJlZm9yZSBraWxsaW5nXG4gICAgLy8gdGhlIHNpbXVsYXRvciwgb3RoZXJ3aXNlIGl0IHdpbGwgYmUgYXV0b21hdGljYWxseSByZXN0YXJ0ZWRcbiAgICBhd2FpdCByZXNldFhDVGVzdFByb2Nlc3Nlcyh1ZGlkLCB0cnVlKTtcbiAgICBhd2FpdCBzaHV0ZG93bih1ZGlkKTtcbiAgfVxufVxuXG5leHBvcnQgeyBjcmVhdGVTaW0sIGdldEV4aXN0aW5nU2ltLCBydW5TaW11bGF0b3JSZXNldCwgaW5zdGFsbFRvU2ltdWxhdG9yLFxuICBzaHV0ZG93blNpbXVsYXRvciwgc2h1dGRvd25PdGhlclNpbXVsYXRvcnMgfTtcbiJdLCJmaWxlIjoibGliL3NpbXVsYXRvci1tYW5hZ2VtZW50LmpzIiwic291cmNlUm9vdCI6Ii4uLy4uIn0=