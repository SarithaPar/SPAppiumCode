"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.commands = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _path = _interopRequireDefault(require("path"));

var _appiumSupport = require("appium-support");

var _teen_process = require("teen_process");

var _logger = _interopRequireDefault(require("../logger"));

var _utils = require("../utils");

var _asyncbox = require("asyncbox");

let commands = {};
exports.commands = commands;
const RECORDERS_CACHE = {};
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const STOP_TIMEOUT_MS = 3 * 60 * 1000;
const START_TIMEOUT_MS = 15 * 1000;
const DEFAULT_PROFILE_NAME = 'Activity Monitor';
const DEFAULT_EXT = '.trace';

async function finishPerfRecord(proc, stopGracefully = true) {
  if (!proc.isRunning) {
    return;
  }

  if (stopGracefully) {
    _logger.default.debug(`Sending SIGINT to the running instruments process`);

    return await proc.stop('SIGINT', STOP_TIMEOUT_MS);
  }

  _logger.default.debug(`Sending SIGTERM to the running instruments process`);

  await proc.stop();
}

async function uploadTrace(localFile, remotePath = null, uploadOptions = {}) {
  try {
    return await (0, _utils.encodeBase64OrUpload)(localFile, remotePath, uploadOptions);
  } finally {
    await _appiumSupport.fs.rimraf(localFile);
  }
}

commands.mobileStartPerfRecord = async function (opts = {}) {
  if (!this.relaxedSecurityEnabled && !this.isRealDevice()) {
    _logger.default.errorAndThrow(`Appium server must have relaxed security flag set in order ` + `for Simulator performance measurement to work`);
  }

  const {
    timeout = DEFAULT_TIMEOUT_MS,
    profileName = DEFAULT_PROFILE_NAME,
    pid
  } = opts;
  const runningRecorders = RECORDERS_CACHE[profileName];

  if (_lodash.default.isPlainObject(runningRecorders) && runningRecorders[this.opts.device.udid]) {
    const {
      proc,
      localPath
    } = runningRecorders[this.opts.device.udid];
    await finishPerfRecord(proc, false);

    if (await _appiumSupport.fs.exists(localPath)) {
      await _appiumSupport.fs.rimraf(localPath);
    }

    delete runningRecorders[this.opts.device.udid];
  }

  if (!(await _appiumSupport.fs.which('instruments'))) {
    _logger.default.errorAndThrow(`Cannot start performance recording, because 'instruments' ` + `tool cannot be found in PATH. Are Xcode development tools installed?`);
  }

  const localPath = await _appiumSupport.tempDir.path({
    prefix: `appium_perf_${profileName}_${Date.now()}`.replace(/\W/g, '_'),
    suffix: DEFAULT_EXT
  });
  const args = ['-w', this.opts.device.udid, '-t', profileName, '-D', localPath, '-l', timeout];

  if (pid) {
    if (`${pid}`.toLowerCase() === 'current') {
      const appInfo = await this.proxyCommand('/wda/activeAppInfo', 'GET');
      args.push('-p', appInfo.pid);
    } else {
      args.push('-p', pid);
    }
  }

  const proc = new _teen_process.SubProcess('instruments', args);

  _logger.default.info(`Starting 'instruments' with arguments: ${args.join(' ')}`);

  proc.on('exit', code => {
    const msg = `instruments exited with code '${code}'`;

    if (code) {
      _logger.default.warn(msg);
    } else {
      _logger.default.debug(msg);
    }
  });
  proc.on('output', (stdout, stderr) => {
    (stdout || stderr).split('\n').filter(x => x.length).map(x => _logger.default.debug(`[instruments] ${x}`));
  });
  await proc.start(0);

  try {
    await (0, _asyncbox.waitForCondition)(async () => await _appiumSupport.fs.exists(localPath), {
      waitMs: START_TIMEOUT_MS,
      intervalMs: 500
    });
  } catch (err) {
    try {
      await proc.stop('SIGKILL');
    } catch (ign) {}

    _logger.default.errorAndThrow(`Cannot start performance monitoring for '${profileName}' profile in ${START_TIMEOUT_MS}ms. ` + `Make sure you can execute it manually.`);
  }

  RECORDERS_CACHE[profileName] = Object.assign({}, RECORDERS_CACHE[profileName] || {}, {
    [this.opts.device.udid]: {
      proc,
      localPath
    }
  });
};

commands.mobileStopPerfRecord = async function (opts = {}) {
  if (!this.relaxedSecurityEnabled && !this.isRealDevice()) {
    _logger.default.errorAndThrow(`Appium server must have relaxed security flag set in order ` + `for Simulator performance measurement to work`);
  }

  const {
    remotePath,
    user,
    pass,
    method,
    profileName = DEFAULT_PROFILE_NAME
  } = opts;
  const runningRecorders = RECORDERS_CACHE[profileName];

  if (!_lodash.default.isPlainObject(runningRecorders) || !runningRecorders[this.opts.device.udid]) {
    _logger.default.errorAndThrow(`There are no records for performance profile '${profileName}' ` + `and device ${this.opts.device.udid}. ` + `Have you started the profiling before?`);
  }

  const {
    proc,
    localPath
  } = runningRecorders[this.opts.device.udid];
  await finishPerfRecord(proc, true);

  if (!(await _appiumSupport.fs.exists(localPath))) {
    _logger.default.errorAndThrow(`There is no .trace file found for performance profile '${profileName}' ` + `and device ${this.opts.device.udid}. ` + `Make sure the profile is supported on this device. ` + `You can use 'instruments -s' command to see the list of all available profiles.`);
  }

  const zipPath = `${localPath}.zip`;
  const zipArgs = ['-9', '-r', zipPath, _path.default.basename(localPath)];

  _logger.default.info(`Found perf trace record '${localPath}'. Compressing it with 'zip ${zipArgs.join(' ')}'`);

  try {
    await (0, _teen_process.exec)('zip', zipArgs, {
      cwd: _path.default.dirname(localPath)
    });
    return await uploadTrace(zipPath, remotePath, {
      user,
      pass,
      method
    });
  } finally {
    delete runningRecorders[this.opts.device.udid];

    if (await _appiumSupport.fs.exists(localPath)) {
      await _appiumSupport.fs.rimraf(localPath);
    }
  }
};

var _default = commands;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jb21tYW5kcy9wZXJmb3JtYW5jZS5qcyJdLCJuYW1lcyI6WyJjb21tYW5kcyIsIlJFQ09SREVSU19DQUNIRSIsIkRFRkFVTFRfVElNRU9VVF9NUyIsIlNUT1BfVElNRU9VVF9NUyIsIlNUQVJUX1RJTUVPVVRfTVMiLCJERUZBVUxUX1BST0ZJTEVfTkFNRSIsIkRFRkFVTFRfRVhUIiwiZmluaXNoUGVyZlJlY29yZCIsInByb2MiLCJzdG9wR3JhY2VmdWxseSIsImlzUnVubmluZyIsImxvZyIsImRlYnVnIiwic3RvcCIsInVwbG9hZFRyYWNlIiwibG9jYWxGaWxlIiwicmVtb3RlUGF0aCIsInVwbG9hZE9wdGlvbnMiLCJmcyIsInJpbXJhZiIsIm1vYmlsZVN0YXJ0UGVyZlJlY29yZCIsIm9wdHMiLCJyZWxheGVkU2VjdXJpdHlFbmFibGVkIiwiaXNSZWFsRGV2aWNlIiwiZXJyb3JBbmRUaHJvdyIsInRpbWVvdXQiLCJwcm9maWxlTmFtZSIsInBpZCIsInJ1bm5pbmdSZWNvcmRlcnMiLCJfIiwiaXNQbGFpbk9iamVjdCIsImRldmljZSIsInVkaWQiLCJsb2NhbFBhdGgiLCJleGlzdHMiLCJ3aGljaCIsInRlbXBEaXIiLCJwYXRoIiwicHJlZml4IiwiRGF0ZSIsIm5vdyIsInJlcGxhY2UiLCJzdWZmaXgiLCJhcmdzIiwidG9Mb3dlckNhc2UiLCJhcHBJbmZvIiwicHJveHlDb21tYW5kIiwicHVzaCIsIlN1YlByb2Nlc3MiLCJpbmZvIiwiam9pbiIsIm9uIiwiY29kZSIsIm1zZyIsIndhcm4iLCJzdGRvdXQiLCJzdGRlcnIiLCJzcGxpdCIsImZpbHRlciIsIngiLCJsZW5ndGgiLCJtYXAiLCJzdGFydCIsIndhaXRNcyIsImludGVydmFsTXMiLCJlcnIiLCJpZ24iLCJPYmplY3QiLCJhc3NpZ24iLCJtb2JpbGVTdG9wUGVyZlJlY29yZCIsInVzZXIiLCJwYXNzIiwibWV0aG9kIiwiemlwUGF0aCIsInppcEFyZ3MiLCJiYXNlbmFtZSIsImN3ZCIsImRpcm5h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QUNkLElBRGMsRUFDUixJQURRLEVBQ0ZELE9BREUsRUFFZHBDLGNBQUtzQyxRQUFMLENBQWMxQyxTQUFkLENBRmMsQ0FBaEI7O0FBSUF0QixrQkFBSXNDLElBQUosQ0FBVSw0QkFBMkJoQixTQUFVLCtCQUE4QnlDLE9BQU8sQ0FBQ3hCLElBQVIsQ0FBYSxHQUFiLENBQWtCLEdBQS9GOztBQUNBLE1BQUk7QUFDRixVQUFNLHdCQUFLLEtBQUwsRUFBWXdCLE9BQVosRUFBcUI7QUFDekJFLE1BQUFBLEdBQUcsRUFBRXZDLGNBQUt3QyxPQUFMLENBQWE1QyxTQUFiO0FBRG9CLEtBQXJCLENBQU47QUFHQSxXQUFPLE1BQU1uQixXQUFXLENBQUMyRCxPQUFELEVBQVV6RCxVQUFWLEVBQXNCO0FBQUNzRCxNQUFBQSxJQUFEO0FBQU9DLE1BQUFBLElBQVA7QUFBYUMsTUFBQUE7QUFBYixLQUF0QixDQUF4QjtBQUNELEdBTEQsU0FLVTtBQUNSLFdBQU81QyxnQkFBZ0IsQ0FBQyxLQUFLUCxJQUFMLENBQVVVLE1BQVYsQ0FBaUJDLElBQWxCLENBQXZCOztBQUNBLFFBQUksTUFBTWQsa0JBQUdnQixNQUFILENBQVVELFNBQVYsQ0FBVixFQUFnQztBQUM5QixZQUFNZixrQkFBR0MsTUFBSCxDQUFVYyxTQUFWLENBQU47QUFDRDtBQUNGO0FBQ0YsQ0E5Q0Q7O2VBa0RlakMsUSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGZzLCB0ZW1wRGlyIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IHsgU3ViUHJvY2VzcywgZXhlYyB9IGZyb20gJ3RlZW5fcHJvY2Vzcyc7XG5pbXBvcnQgbG9nIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjRPclVwbG9hZCB9IGZyb20gJy4uL3V0aWxzJztcbmltcG9ydCB7IHdhaXRGb3JDb25kaXRpb24gfSBmcm9tICdhc3luY2JveCc7XG5cblxubGV0IGNvbW1hbmRzID0ge307XG5cbmNvbnN0IFJFQ09SREVSU19DQUNIRSA9IHt9O1xuY29uc3QgREVGQVVMVF9USU1FT1VUX01TID0gNSAqIDYwICogMTAwMDtcbmNvbnN0IFNUT1BfVElNRU9VVF9NUyA9IDMgKiA2MCAqIDEwMDA7XG5jb25zdCBTVEFSVF9USU1FT1VUX01TID0gMTUgKiAxMDAwO1xuY29uc3QgREVGQVVMVF9QUk9GSUxFX05BTUUgPSAnQWN0aXZpdHkgTW9uaXRvcic7XG5jb25zdCBERUZBVUxUX0VYVCA9ICcudHJhY2UnO1xuXG5cbmFzeW5jIGZ1bmN0aW9uIGZpbmlzaFBlcmZSZWNvcmQgKHByb2MsIHN0b3BHcmFjZWZ1bGx5ID0gdHJ1ZSkge1xuICBpZiAoIXByb2MuaXNSdW5uaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChzdG9wR3JhY2VmdWxseSkge1xuICAgIGxvZy5kZWJ1ZyhgU2VuZGluZyBTSUdJTlQgdG8gdGhlIHJ1bm5pbmcgaW5zdHJ1bWVudHMgcHJvY2Vzc2ApO1xuICAgIHJldHVybiBhd2FpdCBwcm9jLnN0b3AoJ1NJR0lOVCcsIFNUT1BfVElNRU9VVF9NUyk7XG4gIH1cbiAgbG9nLmRlYnVnKGBTZW5kaW5nIFNJR1RFUk0gdG8gdGhlIHJ1bm5pbmcgaW5zdHJ1bWVudHMgcHJvY2Vzc2ApO1xuICBhd2FpdCBwcm9jLnN0b3AoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBsb2FkVHJhY2UgKGxvY2FsRmlsZSwgcmVtb3RlUGF0aCA9IG51bGwsIHVwbG9hZE9wdGlvbnMgPSB7fSkge1xuICB0cnkge1xuICAgIHJldHVybiBhd2FpdCBlbmNvZGVCYXNlNjRPclVwbG9hZChsb2NhbEZpbGUsIHJlbW90ZVBhdGgsIHVwbG9hZE9wdGlvbnMpO1xuICB9IGZpbmFsbHkge1xuICAgIGF3YWl0IGZzLnJpbXJhZihsb2NhbEZpbGUpO1xuICB9XG59XG5cblxuLyoqXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBTdGFydFBlcmZSZWNvcmRPcHRpb25zXG4gKlxuICogQHByb3BlcnR5IHs/bnVtYmVyfHN0cmluZ30gdGltZW91dCBbMzAwMDAwXSAtIFRoZSBtYXhpbXVtIGNvdW50IG9mIG1pbGxpc2Vjb25kcyB0byByZWNvcmQgdGhlIHByb2ZpbGluZyBpbmZvcm1hdGlvbi5cbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gcHJvZmlsZU5hbWUgW0FjdGl2aXR5IE1vbml0b3JdIC0gVGhlIG5hbWUgb2YgZXhpc3RpbmcgcGVyZm9ybWFuY2UgcHJvZmlsZSB0byBhcHBseS5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgRXhlY3V0ZSBgaW5zdHJ1bWVudHMgLXNgIHRvIHNob3cgdGhlIGxpc3Qgb2YgYXZhaWxhYmxlIHByb2ZpbGVzLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBOb3RlLCB0aGF0IG5vdCBhbGwgcHJvZmlsZXMgYXJlIHN1cHBvcnRlZCBvbiBtb2JpbGUgZGV2aWNlcy5cbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ3xudW1iZXJ9IHBpZCAtIFRoZSBJRCBvZiB0aGUgcHJvY2VzcyB0byBtZWFzc3VyZSB0aGUgcGVyZm9ybWFuY2UgZm9yLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgU2V0IGl0IHRvIGBjdXJyZW50YCBpbiBvcmRlciB0byBtZWFzc3VyZSB0aGUgcGVyZm9ybWFuY2Ugb2ZcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZSBwcm9jZXNzLCB3aGljaCBiZWxvbmdzIHRvIHRoZSBjdXJyZW50bHkgYWN0aXZlIGFwcGxpY2F0aW9uLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQWxsIHByb2Nlc3NlcyBydW5uaW5nIG9uIHRoZSBkZXZpY2UgYXJlIG1lYXNzdXJlZCBpZlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGlkIGlzIHVuc2V0ICh0aGUgZGVmYXVsdCBzZXR0aW5nKS5cbiAqL1xuXG4vKipcbiAqIFN0YXJ0cyBwZXJmb3JtYW5jZSBwcm9maWxpbmcgZm9yIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqIFRoZSBgaW5zdHJ1bWVudHNgIGRldmVsb3BlciB1dGlsaXR5IGlzIHVzZWQgZm9yIHRoaXMgcHVycG9zZSB1bmRlciB0aGUgaG9vZC5cbiAqIEl0IGlzIHBvc3NpYmxlIHRvIHJlY29yZCBtdWx0aXBsZSBwcm9maWxlcyBhdCB0aGUgc2FtZSB0aW1lLlxuICogUmVhZCBodHRwczovL2RldmVsb3Blci5hcHBsZS5jb20vbGlicmFyeS9jb250ZW50L2RvY3VtZW50YXRpb24vRGV2ZWxvcGVyVG9vbHMvQ29uY2VwdHVhbC9JbnN0cnVtZW50c1VzZXJHdWlkZS9SZWNvcmRpbmcsUGF1c2luZyxhbmRTdG9wcGluZ1RyYWNlcy5odG1sXG4gKiBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIEBwYXJhbSB7P1N0YXJ0UGVyZlJlY29yZE9wdGlvbnN9IG9wdHMgLSBUaGUgc2V0IG9mIHBvc3NpYmxlIHN0YXJ0IHJlY29yZCBvcHRpb25zXG4gKi9cbmNvbW1hbmRzLm1vYmlsZVN0YXJ0UGVyZlJlY29yZCA9IGFzeW5jIGZ1bmN0aW9uIChvcHRzID0ge30pIHtcbiAgaWYgKCF0aGlzLnJlbGF4ZWRTZWN1cml0eUVuYWJsZWQgJiYgIXRoaXMuaXNSZWFsRGV2aWNlKCkpIHtcbiAgICBsb2cuZXJyb3JBbmRUaHJvdyhgQXBwaXVtIHNlcnZlciBtdXN0IGhhdmUgcmVsYXhlZCBzZWN1cml0eSBmbGFnIHNldCBpbiBvcmRlciBgICtcbiAgICAgICAgICAgICAgICAgICAgICBgZm9yIFNpbXVsYXRvciBwZXJmb3JtYW5jZSBtZWFzdXJlbWVudCB0byB3b3JrYCk7XG4gIH1cblxuICBjb25zdCB7XG4gICAgdGltZW91dCA9IERFRkFVTFRfVElNRU9VVF9NUyxcbiAgICBwcm9maWxlTmFtZSA9IERFRkFVTFRfUFJPRklMRV9OQU1FLFxuICAgIHBpZCxcbiAgfSA9IG9wdHM7XG5cbiAgLy8gQ2xlYW51cCB0aGUgcHJvY2VzcyBpZiBpdCBpcyBhbHJlYWR5IHJ1bm5pbmdcbiAgY29uc3QgcnVubmluZ1JlY29yZGVycyA9IFJFQ09SREVSU19DQUNIRVtwcm9maWxlTmFtZV07XG4gIGlmIChfLmlzUGxhaW5PYmplY3QocnVubmluZ1JlY29yZGVycykgJiYgcnVubmluZ1JlY29yZGVyc1t0aGlzLm9wdHMuZGV2aWNlLnVkaWRdKSB7XG4gICAgY29uc3Qge3Byb2MsIGxvY2FsUGF0aH0gPSBydW5uaW5nUmVjb3JkZXJzW3RoaXMub3B0cy5kZXZpY2UudWRpZF07XG4gICAgYXdhaXQgZmluaXNoUGVyZlJlY29yZChwcm9jLCBmYWxzZSk7XG4gICAgaWYgKGF3YWl0IGZzLmV4aXN0cyhsb2NhbFBhdGgpKSB7XG4gICAgICBhd2FpdCBmcy5yaW1yYWYobG9jYWxQYXRoKTtcbiAgICB9XG4gICAgZGVsZXRlIHJ1bm5pbmdSZWNvcmRlcnNbdGhpcy5vcHRzLmRldmljZS51ZGlkXTtcbiAgfVxuXG4gIGlmICghYXdhaXQgZnMud2hpY2goJ2luc3RydW1lbnRzJykpIHtcbiAgICBsb2cuZXJyb3JBbmRUaHJvdyhgQ2Fubm90IHN0YXJ0IHBlcmZvcm1hbmNlIHJlY29yZGluZywgYmVjYXVzZSAnaW5zdHJ1bWVudHMnIGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGB0b29sIGNhbm5vdCBiZSBmb3VuZCBpbiBQQVRILiBBcmUgWGNvZGUgZGV2ZWxvcG1lbnQgdG9vbHMgaW5zdGFsbGVkP2ApO1xuICB9XG5cbiAgY29uc3QgbG9jYWxQYXRoID0gYXdhaXQgdGVtcERpci5wYXRoKHtcbiAgICBwcmVmaXg6IGBhcHBpdW1fcGVyZl8ke3Byb2ZpbGVOYW1lfV8ke0RhdGUubm93KCl9YC5yZXBsYWNlKC9cXFcvZywgJ18nKSxcbiAgICBzdWZmaXg6IERFRkFVTFRfRVhULFxuICB9KTtcbiAgY29uc3QgYXJncyA9IFtcbiAgICAnLXcnLCB0aGlzLm9wdHMuZGV2aWNlLnVkaWQsXG4gICAgJy10JywgcHJvZmlsZU5hbWUsXG4gICAgJy1EJywgbG9jYWxQYXRoLFxuICAgICctbCcsIHRpbWVvdXQsXG4gIF07XG4gIGlmIChwaWQpIHtcbiAgICBpZiAoYCR7cGlkfWAudG9Mb3dlckNhc2UoKSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICBjb25zdCBhcHBJbmZvID0gYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoJy93ZGEvYWN0aXZlQXBwSW5mbycsICdHRVQnKTtcbiAgICAgIGFyZ3MucHVzaCgnLXAnLCBhcHBJbmZvLnBpZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFyZ3MucHVzaCgnLXAnLCBwaWQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBwcm9jID0gbmV3IFN1YlByb2Nlc3MoJ2luc3RydW1lbnRzJywgYXJncyk7XG4gIGxvZy5pbmZvKGBTdGFydGluZyAnaW5zdHJ1bWVudHMnIHdpdGggYXJndW1lbnRzOiAke2FyZ3Muam9pbignICcpfWApO1xuICBwcm9jLm9uKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICBjb25zdCBtc2cgPSBgaW5zdHJ1bWVudHMgZXhpdGVkIHdpdGggY29kZSAnJHtjb2RlfSdgO1xuICAgIGlmIChjb2RlKSB7XG4gICAgICBsb2cud2Fybihtc2cpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2cuZGVidWcobXNnKTtcbiAgICB9XG4gIH0pO1xuICBwcm9jLm9uKCdvdXRwdXQnLCAoc3Rkb3V0LCBzdGRlcnIpID0+IHtcbiAgICAoc3Rkb3V0IHx8IHN0ZGVycikuc3BsaXQoJ1xcbicpXG4gICAgICAuZmlsdGVyKHggPT4geC5sZW5ndGgpXG4gICAgICAubWFwKHggPT4gbG9nLmRlYnVnKGBbaW5zdHJ1bWVudHNdICR7eH1gKSk7XG4gIH0pO1xuXG4gIGF3YWl0IHByb2Muc3RhcnQoMCk7XG4gIHRyeSB7XG4gICAgYXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBmcy5leGlzdHMobG9jYWxQYXRoKSwge1xuICAgICAgd2FpdE1zOiBTVEFSVF9USU1FT1VUX01TLFxuICAgICAgaW50ZXJ2YWxNczogNTAwLFxuICAgIH0pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgcHJvYy5zdG9wKCdTSUdLSUxMJyk7XG4gICAgfSBjYXRjaCAoaWduKSB7fVxuICAgIGxvZy5lcnJvckFuZFRocm93KGBDYW5ub3Qgc3RhcnQgcGVyZm9ybWFuY2UgbW9uaXRvcmluZyBmb3IgJyR7cHJvZmlsZU5hbWV9JyBwcm9maWxlIGluICR7U1RBUlRfVElNRU9VVF9NU31tcy4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgYE1ha2Ugc3VyZSB5b3UgY2FuIGV4ZWN1dGUgaXQgbWFudWFsbHkuYCk7XG4gIH1cbiAgUkVDT1JERVJTX0NBQ0hFW3Byb2ZpbGVOYW1lXSA9IE9iamVjdC5hc3NpZ24oe30sIChSRUNPUkRFUlNfQ0FDSEVbcHJvZmlsZU5hbWVdIHx8IHt9KSwge1xuICAgIFt0aGlzLm9wdHMuZGV2aWNlLnVkaWRdOiB7cHJvYywgbG9jYWxQYXRofSxcbiAgfSk7XG59O1xuXG4vKipcbiAqIEB0eXBlZGVmIHtPYmplY3R9IFN0b3BSZWNvcmRpbmdPcHRpb25zXG4gKlxuICogQHByb3BlcnR5IHs/c3RyaW5nfSByZW1vdGVQYXRoIC0gVGhlIHBhdGggdG8gdGhlIHJlbW90ZSBsb2NhdGlvbiwgd2hlcmUgdGhlIHJlc3VsdGluZyB6aXBwZWQgLnRyYWNlIGZpbGUgc2hvdWxkIGJlIHVwbG9hZGVkLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVGhlIGZvbGxvd2luZyBwcm90b2NvbHMgYXJlIHN1cHBvcnRlZDogaHR0cC9odHRwcywgZnRwLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTnVsbCBvciBlbXB0eSBzdHJpbmcgdmFsdWUgKHRoZSBkZWZhdWx0IHNldHRpbmcpIG1lYW5zIHRoZSBjb250ZW50IG9mIHJlc3VsdGluZ1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsZSBzaG91bGQgYmUgemlwcGVkLCBlbmNvZGVkIGFzIEJhc2U2NCBhbmQgcGFzc2VkIGFzIHRoZSBlbmRwb3VudCByZXNwb25zZSB2YWx1ZS5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEFuIGV4Y2VwdGlvbiB3aWxsIGJlIHRocm93biBpZiB0aGUgZ2VuZXJhdGVkIGZpbGUgaXMgdG9vIGJpZyB0b1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZml0IGludG8gdGhlIGF2YWlsYWJsZSBwcm9jZXNzIG1lbW9yeS5cbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gdXNlciAtIFRoZSBuYW1lIG9mIHRoZSB1c2VyIGZvciB0aGUgcmVtb3RlIGF1dGhlbnRpY2F0aW9uLiBPbmx5IHdvcmtzIGlmIGByZW1vdGVQYXRoYCBpcyBwcm92aWRlZC5cbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gcGFzcyAtIFRoZSBwYXNzd29yZCBmb3IgdGhlIHJlbW90ZSBhdXRoZW50aWNhdGlvbi4gT25seSB3b3JrcyBpZiBgcmVtb3RlUGF0aGAgaXMgcHJvdmlkZWQuXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IG1ldGhvZCBbUFVUXSAtIFRoZSBodHRwIG11bHRpcGFydCB1cGxvYWQgbWV0aG9kIG5hbWUuIE9ubHkgd29ya3MgaWYgYHJlbW90ZVBhdGhgIGlzIHByb3ZpZGVkLlxuICogQHByb3BlcnR5IHs/c3RyaW5nfSBwcm9maWxlTmFtZSBbQWN0aXZpdHkgTW9uaXRvcl0gLSBUaGUgbmFtZSBvZiBhbiBleGlzdGluZyBwZXJmb3JtYW5jZSBwcm9maWxlIGZvciB3aGljaCB0aGUgcmVjb3JkaW5nIGhhcyBiZWVuIG1hZGUuXG4gKi9cblxuLyoqXG4gKiBTdG9wcyBwZXJmb3JtYW5jZSBwcm9maWxpbmcgZm9yIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqIFRoZSByZXN1bHRpbmcgZmlsZSBpbiAudHJhY2UgZm9ybWF0IGNhbiBiZSBlaXRoZXIgcmV0dXJuZWRcbiAqIGRpcmVjdGx5IGFzIGJhc2U2NC1lbmNvZGVkIHppcCBhcmNoaXZlIG9yIHVwbG9hZGVkIHRvIGEgcmVtb3RlIGxvY2F0aW9uXG4gKiAoc3VjaCBmaWxlcyBjYW4gYmUgcHJldHR5IGxhcmdlKS4gQWZ0ZXJ3YXJkcyBpdCBpcyBwb3NzaWJsZSB0byB1bmFyY2hpdmUgYW5kXG4gKiBvcGVuIHN1Y2ggZmlsZSB3aXRoIFhjb2RlIERldiBUb29scy5cbiAqXG4gKiBAcGFyYW0gez9TdG9wUmVjb3JkaW5nT3B0aW9uc30gb3B0cyAtIFRoZSBzZXQgb2YgcG9zc2libGUgc3RvcCByZWNvcmQgb3B0aW9uc1xuICogQHJldHVybiB7c3RyaW5nfSBFaXRoZXIgYW4gZW1wdHkgc3RyaW5nIGlmIHRoZSB1cGxvYWQgd3FhYXMgc3VjY2Vzc2Z1bCBvciBiYXNlLTY0IGVuY29kZWRcbiAqIGNvbnRlbnQgb2YgemlwcGVkIC50cmFjZSBmaWxlLlxuICogQHRocm93cyB7RXJyb3J9IElmIG5vIHBlcmZvcm1hbmNlIHJlY29yZGluZyB3aXRoIGdpdmVuIHByb2ZpbGUgbmFtZS9kZXZpY2UgdWRpZCBjb21iaW5hdGlvblxuICogaGFzIGJlZW4gc3RhcnRlZCBiZWZvcmUgb3IgdGhlIHJlc3VsdGluZyAudHJhY2UgZmlsZSBoYXMgbm90IGJlZW4gZ2VuZXJhdGVkIHByb3Blcmx5LlxuICovXG5jb21tYW5kcy5tb2JpbGVTdG9wUGVyZlJlY29yZCA9IGFzeW5jIGZ1bmN0aW9uIChvcHRzID0ge30pIHtcbiAgaWYgKCF0aGlzLnJlbGF4ZWRTZWN1cml0eUVuYWJsZWQgJiYgIXRoaXMuaXNSZWFsRGV2aWNlKCkpIHtcbiAgICBsb2cuZXJyb3JBbmRUaHJvdyhgQXBwaXVtIHNlcnZlciBtdXN0IGhhdmUgcmVsYXhlZCBzZWN1cml0eSBmbGFnIHNldCBpbiBvcmRlciBgICtcbiAgICAgICAgICAgICAgICAgICAgICBgZm9yIFNpbXVsYXRvciBwZXJmb3JtYW5jZSBtZWFzdXJlbWVudCB0byB3b3JrYCk7XG4gIH1cblxuICBjb25zdCB7XG4gICAgcmVtb3RlUGF0aCxcbiAgICB1c2VyLFxuICAgIHBhc3MsXG4gICAgbWV0aG9kLFxuICAgIHByb2ZpbGVOYW1lID0gREVGQVVMVF9QUk9GSUxFX05BTUUsXG4gIH0gPSBvcHRzO1xuICBjb25zdCBydW5uaW5nUmVjb3JkZXJzID0gUkVDT1JERVJTX0NBQ0hFW3Byb2ZpbGVOYW1lXTtcbiAgaWYgKCFfLmlzUGxhaW5PYmplY3QocnVubmluZ1JlY29yZGVycykgfHwgIXJ1bm5pbmdSZWNvcmRlcnNbdGhpcy5vcHRzLmRldmljZS51ZGlkXSkge1xuICAgIGxvZy5lcnJvckFuZFRocm93KGBUaGVyZSBhcmUgbm8gcmVjb3JkcyBmb3IgcGVyZm9ybWFuY2UgcHJvZmlsZSAnJHtwcm9maWxlTmFtZX0nIGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBhbmQgZGV2aWNlICR7dGhpcy5vcHRzLmRldmljZS51ZGlkfS4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgYEhhdmUgeW91IHN0YXJ0ZWQgdGhlIHByb2ZpbGluZyBiZWZvcmU/YCk7XG4gIH1cblxuICBjb25zdCB7cHJvYywgbG9jYWxQYXRofSA9IHJ1bm5pbmdSZWNvcmRlcnNbdGhpcy5vcHRzLmRldmljZS51ZGlkXTtcbiAgYXdhaXQgZmluaXNoUGVyZlJlY29yZChwcm9jLCB0cnVlKTtcbiAgaWYgKCFhd2FpdCBmcy5leGlzdHMobG9jYWxQYXRoKSkge1xuICAgIGxvZy5lcnJvckFuZFRocm93KGBUaGVyZSBpcyBubyAudHJhY2UgZmlsZSBmb3VuZCBmb3IgcGVyZm9ybWFuY2UgcHJvZmlsZSAnJHtwcm9maWxlTmFtZX0nIGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBhbmQgZGV2aWNlICR7dGhpcy5vcHRzLmRldmljZS51ZGlkfS4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgYE1ha2Ugc3VyZSB0aGUgcHJvZmlsZSBpcyBzdXBwb3J0ZWQgb24gdGhpcyBkZXZpY2UuIGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBZb3UgY2FuIHVzZSAnaW5zdHJ1bWVudHMgLXMnIGNvbW1hbmQgdG8gc2VlIHRoZSBsaXN0IG9mIGFsbCBhdmFpbGFibGUgcHJvZmlsZXMuYCk7XG4gIH1cblxuICBjb25zdCB6aXBQYXRoID0gYCR7bG9jYWxQYXRofS56aXBgO1xuICBjb25zdCB6aXBBcmdzID0gW1xuICAgICctOScsICctcicsIHppcFBhdGgsXG4gICAgcGF0aC5iYXNlbmFtZShsb2NhbFBhdGgpLFxuICBdO1xuICBsb2cuaW5mbyhgRm91bmQgcGVyZiB0cmFjZSByZWNvcmQgJyR7bG9jYWxQYXRofScuIENvbXByZXNzaW5nIGl0IHdpdGggJ3ppcCAke3ppcEFyZ3Muam9pbignICcpfSdgKTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBleGVjKCd6aXAnLCB6aXBBcmdzLCB7XG4gICAgICBjd2Q6IHBhdGguZGlybmFtZShsb2NhbFBhdGgpLFxuICAgIH0pO1xuICAgIHJldHVybiBhd2FpdCB1cGxvYWRUcmFjZSh6aXBQYXRoLCByZW1vdGVQYXRoLCB7dXNlciwgcGFzcywgbWV0aG9kfSk7XG4gIH0gZmluYWxseSB7XG4gICAgZGVsZXRlIHJ1bm5pbmdSZWNvcmRlcnNbdGhpcy5vcHRzLmRldmljZS51ZGlkXTtcbiAgICBpZiAoYXdhaXQgZnMuZXhpc3RzKGxvY2FsUGF0aCkpIHtcbiAgICAgIGF3YWl0IGZzLnJpbXJhZihsb2NhbFBhdGgpO1xuICAgIH1cbiAgfVxufTtcblxuXG5leHBvcnQgeyBjb21tYW5kcyB9O1xuZXhwb3J0IGRlZmF1bHQgY29tbWFuZHM7XG4iXSwiZmlsZSI6ImxpYi9jb21tYW5kcy9wZXJmb3JtYW5jZS5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLi8uLiJ9
