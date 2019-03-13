"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.detectUdid = detectUdid;
exports.getAndCheckXcodeVersion = getAndCheckXcodeVersion;
exports.getAndCheckIosSdkVersion = getAndCheckIosSdkVersion;
exports.adjustWDAAttachmentsPermissions = adjustWDAAttachmentsPermissions;
exports.checkAppPresent = checkAppPresent;
exports.getDriverInfo = getDriverInfo;
exports.clearSystemFiles = clearSystemFiles;
exports.translateDeviceName = translateDeviceName;
exports.normalizeCommandTimeouts = normalizeCommandTimeouts;
exports.resetXCTestProcesses = resetXCTestProcesses;
exports.getPidUsingPattern = getPidUsingPattern;
exports.markSystemFilesForCleanup = markSystemFilesForCleanup;
exports.printUser = printUser;
exports.printLibimobiledeviceInfo = printLibimobiledeviceInfo;
exports.getPIDsListeningOnPort = getPIDsListeningOnPort;
exports.encodeBase64OrUpload = encodeBase64OrUpload;
exports.removeAllSessionWebSocketHandlers = removeAllSessionWebSocketHandlers;
exports.verifyApplicationPlatform = verifyApplicationPlatform;
exports.DEFAULT_TIMEOUT_KEY = void 0;

require("source-map-support/register");

var _bluebird = _interopRequireDefault(require("bluebird"));

var _appiumSupport = require("appium-support");

var _path = _interopRequireDefault(require("path"));

var _appiumIosDriver = require("appium-ios-driver");

var _teen_process = require("teen_process");

var _appiumXcode = _interopRequireDefault(require("appium-xcode"));

var _lodash = _interopRequireDefault(require("lodash"));

var _logger = _interopRequireDefault(require("./logger"));

var _fs2 = _interopRequireDefault(require("fs"));

var _url = _interopRequireDefault(require("url"));

var _v = _interopRequireDefault(require("v8"));

const DEFAULT_TIMEOUT_KEY = 'default';
exports.DEFAULT_TIMEOUT_KEY = DEFAULT_TIMEOUT_KEY;

async function detectUdid() {
  _logger.default.debug('Auto-detecting real device udid...');

  let cmd,
      args = [];

  try {
    cmd = await _appiumSupport.fs.which('idevice_id');
    args.push('-l');

    _logger.default.debug('Using idevice_id');
  } catch (err) {
    _logger.default.debug('Using udidetect');

    cmd = require.resolve('udidetect');
  }

  let udid;

  try {
    let {
      stdout
    } = await (0, _teen_process.exec)(cmd, args, {
      timeout: 3000
    });

    let udids = _lodash.default.uniq(_lodash.default.filter(stdout.split('\n'), Boolean));

    udid = _lodash.default.last(udids);

    if (udids.length > 1) {
      _logger.default.warn(`Multiple devices found: ${udids.join(', ')}`);

      _logger.default.warn(`Choosing '${udid}'. If this is wrong, manually set with 'udid' desired capability`);
    }
  } catch (err) {
    _logger.default.errorAndThrow(`Error detecting udid: ${err.message}`);
  }

  if (!udid || udid.length <= 2) {
    throw new Error('Could not detect udid.');
  }

  _logger.default.debug(`Detected real device udid: '${udid}'`);

  return udid;
}

async function getAndCheckXcodeVersion() {
  let version;

  try {
    version = await _appiumXcode.default.getVersion(true);
  } catch (err) {
    _logger.default.debug(err);

    _logger.default.errorAndThrow(`Could not determine Xcode version: ${err.message}`);
  }

  if (!version.toolsVersion) {
    try {
      version.toolsVersion = await _appiumXcode.default.getCommandLineToolsVersion();
    } catch (ign) {}
  }

  if (version.versionFloat < 7.3) {
    _logger.default.errorAndThrow(`Xcode version '${version.versionString}'. Support for ` + `Xcode ${version.versionString} is not supported. ` + `Please upgrade to version 7.3 or higher`);
  }

  return version;
}

async function getAndCheckIosSdkVersion() {
  let versionNumber;

  try {
    versionNumber = await _appiumXcode.default.getMaxIOSSDK();
  } catch (err) {
    _logger.default.errorAndThrow(`Could not determine iOS SDK version: ${err.message}`);
  }

  return versionNumber;
}

function translateDeviceName(platformVersion, devName = '') {
  let deviceName = devName;

  switch (devName.toLowerCase().trim()) {
    case 'iphone simulator':
      deviceName = 'iPhone 6';
      break;

    case 'ipad simulator':
      deviceName = parseFloat(platformVersion) < 10.3 ? 'iPad Retina' : 'iPad Air';
      break;
  }

  if (deviceName !== devName) {
    _logger.default.debug(`Changing deviceName from '${devName}' to '${deviceName}'`);
  }

  return deviceName;
}

const derivedDataPermissionsStacks = new Map();

async function adjustWDAAttachmentsPermissions(wda, perms) {
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    _logger.default.warn('No WebDriverAgent derived data available, so unable to set permissions on WDA attachments folder');

    return;
  }

  const attachmentsFolder = _path.default.join((await wda.retrieveDerivedDataPath()), 'Logs/Test/Attachments');

  const permsStack = derivedDataPermissionsStacks.get(attachmentsFolder) || [];

  if (permsStack.length) {
    if (_lodash.default.last(permsStack) === perms) {
      permsStack.push(perms);

      _logger.default.info(`Not changing permissions of '${attachmentsFolder}' to '${perms}', because they were already set by the other session`);

      return;
    }

    if (permsStack.length > 1) {
      permsStack.pop();

      _logger.default.info(`Not changing permissions of '${attachmentsFolder}' to '${perms}', because the other session does not expect them to be changed`);

      return;
    }
  }

  derivedDataPermissionsStacks.set(attachmentsFolder, [perms]);

  if (await _appiumSupport.fs.exists(attachmentsFolder)) {
    _logger.default.info(`Setting '${perms}' permissions to '${attachmentsFolder}' folder`);

    await _appiumSupport.fs.chmod(attachmentsFolder, perms);
    return;
  }

  _logger.default.info(`There is no ${attachmentsFolder} folder, so not changing permissions`);
}

const derivedDataCleanupMarkers = new Map();

async function markSystemFilesForCleanup(wda) {
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    _logger.default.warn('No WebDriverAgent derived data available, so unable to mark system files for cleanup');

    return;
  }

  const logsRoot = _path.default.resolve((await wda.retrieveDerivedDataPath()), 'Logs');

  let markersCount = 0;

  if (derivedDataCleanupMarkers.has(logsRoot)) {
    markersCount = derivedDataCleanupMarkers.get(logsRoot);
  }

  derivedDataCleanupMarkers.set(logsRoot, ++markersCount);
}

async function clearSystemFiles(wda) {
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    _logger.default.warn('No WebDriverAgent derived data available, so unable to clear system files');

    return;
  }

  const logsRoot = _path.default.resolve((await wda.retrieveDerivedDataPath()), 'Logs');

  if (derivedDataCleanupMarkers.has(logsRoot)) {
    let markersCount = derivedDataCleanupMarkers.get(logsRoot);
    derivedDataCleanupMarkers.set(logsRoot, --markersCount);

    if (markersCount > 0) {
      _logger.default.info(`Not cleaning '${logsRoot}' folder, because the other session does not expect it to be cleaned`);

      return;
    }
  }

  derivedDataCleanupMarkers.set(logsRoot, 0);
  const cleanupCmd = `find -E /private/var/folders ` + `-regex '.*/Session-WebDriverAgentRunner.*\\.log$|.*/StandardOutputAndStandardError\\.txt$' ` + `-type f -exec sh -c 'echo "" > "{}"' \\;`;
  const cleanupTask = new _teen_process.SubProcess('bash', ['-c', cleanupCmd], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await cleanupTask.start(0, true);

  _logger.default.debug(`Started background XCTest logs cleanup: ${cleanupCmd}`);

  if (await _appiumSupport.fs.exists(logsRoot)) {
    _logger.default.info(`Cleaning test logs in '${logsRoot}' folder`);

    await _appiumIosDriver.utils.clearLogs([logsRoot]);
    return;
  }

  _logger.default.info(`There is no ${logsRoot} folder, so not cleaning files`);
}

async function checkAppPresent(app) {
  _logger.default.debug(`Checking whether app '${app}' is actually present on file system`);

  if (!(await _appiumSupport.fs.exists(app))) {
    _logger.default.errorAndThrow(`Could not find app at '${app}'`);
  }

  _logger.default.debug('App is present');
}

async function getDriverInfo() {
  const stat = await _appiumSupport.fs.stat(_path.default.resolve(__dirname, '..'));
  const built = stat.mtime.getTime();

  const pkg = require(__filename.includes('build/lib/utils') ? '../../package.json' : '../package.json');

  const version = pkg.version;
  return {
    built,
    version
  };
}

function normalizeCommandTimeouts(value) {
  if (typeof value !== 'string') {
    return value;
  }

  let result = {};

  if (!isNaN(value)) {
    result[DEFAULT_TIMEOUT_KEY] = _lodash.default.toInteger(value);
    return result;
  }

  try {
    result = JSON.parse(value);

    if (!_lodash.default.isPlainObject(result)) {
      throw new Error();
    }
  } catch (err) {
    _logger.default.errorAndThrow(`"commandTimeouts" capability should be a valid JSON object. "${value}" was given instead`);
  }

  for (let [cmd, timeout] of _lodash.default.toPairs(result)) {
    if (!_lodash.default.isInteger(timeout) || timeout <= 0) {
      _logger.default.errorAndThrow(`The timeout for "${cmd}" should be a valid natural number of milliseconds. "${timeout}" was given instead`);
    }
  }

  return result;
}

async function getPidUsingPattern(pgrepPattern) {
  const args = ['-nif', pgrepPattern];

  try {
    const {
      stdout
    } = await (0, _teen_process.exec)('pgrep', args);
    const pid = parseInt(stdout, 10);

    if (isNaN(pid)) {
      _logger.default.debug(`Cannot parse process id from 'pgrep ${args.join(' ')}' output: ${stdout}`);

      return null;
    }

    return `${pid}`;
  } catch (err) {
    _logger.default.debug(`'pgrep ${args.join(' ')}' didn't detect any matching processes. Return code: ${err.code}`);

    return null;
  }
}

async function killAppUsingPattern(pgrepPattern) {
  for (const signal of [2, 15, 9]) {
    if (!(await getPidUsingPattern(pgrepPattern))) {
      return;
    }

    const args = [`-${signal}`, '-if', pgrepPattern];

    try {
      await (0, _teen_process.exec)('pkill', args);
    } catch (err) {
      _logger.default.debug(`pkill ${args.join(' ')} -> ${err.message}`);
    }

    await _bluebird.default.delay(100);
  }
}

async function resetXCTestProcesses(udid, isSimulator, opts = {}) {
  const processPatterns = [`xcodebuild.*${udid}`];

  if (opts.wdaLocalPort) {
    processPatterns.push(`iproxy ${opts.wdaLocalPort}`);
  } else if (!isSimulator) {
    processPatterns.push(`iproxy.*${udid}`);
  }

  if (isSimulator) {
    processPatterns.push(`${udid}.*XCTRunner`);
  }

  _logger.default.debug(`Killing running processes '${processPatterns.join(', ')}' for the device ${udid}...`);

  for (const pgrepPattern of processPatterns) {
    await killAppUsingPattern(pgrepPattern);
  }
}

async function printUser() {
  try {
    let {
      stdout
    } = await (0, _teen_process.exec)('whoami');

    _logger.default.debug(`Current user: '${stdout.trim()}'`);
  } catch (err) {
    _logger.default.debug(`Unable to get username running server: ${err.message}`);
  }
}

async function printLibimobiledeviceInfo() {
  try {
    let {
      stdout
    } = await (0, _teen_process.exec)('brew', ['info', 'libimobiledevice']);
    let match = /libimobiledevice:(.+)/.exec(stdout);

    if (match && match[1]) {
      _logger.default.debug(`Current version of libimobiledevice: ${match[1].trim()}`);
    }
  } catch (err) {
    _logger.default.debug(`Unable to get version of libimobiledevice: ${err.message}`);
  }
}

async function getPIDsListeningOnPort(port, filteringFunc = null) {
  const result = [];

  try {
    const {
      stdout
    } = await (0, _teen_process.exec)('lsof', ['-ti', `tcp:${port}`]);
    result.push(...stdout.trim().split(/\n+/));
  } catch (e) {
    return result;
  }

  if (!_lodash.default.isFunction(filteringFunc)) {
    return result;
  }

  return await _bluebird.default.filter(result, async x => {
    const {
      stdout
    } = await (0, _teen_process.exec)('ps', ['-p', x, '-o', 'command']);
    return await filteringFunc(stdout);
  });
}

async function encodeBase64OrUpload(localFile, remotePath = null, uploadOptions = {}) {
  if (!(await _appiumSupport.fs.exists(localFile))) {
    _logger.default.errorAndThrow(`The file at '${localFile}' does not exist or is not accessible`);
  }

  const {
    size
  } = await _appiumSupport.fs.stat(localFile);

  _logger.default.debug(`The size of the file is ${_appiumSupport.util.toReadableSizeString(size)}`);

  if (_lodash.default.isEmpty(remotePath)) {
    const maxMemoryLimit = _v.default.getHeapStatistics().total_available_size / 2;

    if (size >= maxMemoryLimit) {
      _logger.default.info(`The file might be too large to fit into the process memory ` + `(${_appiumSupport.util.toReadableSizeString(size)} >= ${_appiumSupport.util.toReadableSizeString(maxMemoryLimit)}). ` + `Provide a link to a remote writable location for video upload ` + `(http(s) and ftp protocols are supported) if you experience Out Of Memory errors`);
    }

    const content = await _appiumSupport.fs.readFile(localFile);
    return content.toString('base64');
  }

  const remoteUrl = _url.default.parse(remotePath);

  let options = {};
  const {
    user,
    pass,
    method
  } = uploadOptions;

  if (remoteUrl.protocol.startsWith('http')) {
    options = {
      url: remoteUrl.href,
      method: method || 'PUT',
      multipart: [{
        body: _fs2.default.createReadStream(localFile)
      }]
    };

    if (user && pass) {
      options.auth = {
        user,
        pass
      };
    }
  } else if (remoteUrl.protocol === 'ftp:') {
    options = {
      host: remoteUrl.hostname,
      port: remoteUrl.port || 21
    };

    if (user && pass) {
      options.user = user;
      options.pass = pass;
    }
  }

  await _appiumSupport.net.uploadFile(localFile, remotePath, options);
  return '';
}

async function removeAllSessionWebSocketHandlers(server, sessionId) {
  if (!server || !_lodash.default.isFunction(server.getWebSocketHandlers)) {
    return;
  }

  const activeHandlers = await server.getWebSocketHandlers(sessionId);

  for (const pathname of _lodash.default.keys(activeHandlers)) {
    await server.removeWebSocketHandler(pathname);
  }
}

async function verifyApplicationPlatform(app, isSimulator) {
  _logger.default.debug('Verifying application platform');

  const infoPlist = _path.default.resolve(app, 'Info.plist');

  if (!(await _appiumSupport.fs.exists(infoPlist))) {
    _logger.default.debug(`'${infoPlist}' does not exist`);

    return null;
  }

  const {
    CFBundleSupportedPlatforms
  } = await _appiumSupport.plist.parsePlistFile(infoPlist);

  _logger.default.debug(`CFBundleSupportedPlatforms: ${JSON.stringify(CFBundleSupportedPlatforms)}`);

  if (!_lodash.default.isArray(CFBundleSupportedPlatforms)) {
    _logger.default.debug(`CFBundleSupportedPlatforms key does not exist in '${infoPlist}'`);

    return null;
  }

  const isAppSupported = isSimulator && CFBundleSupportedPlatforms.includes('iPhoneSimulator') || !isSimulator && CFBundleSupportedPlatforms.includes('iPhoneOS');

  if (isAppSupported) {
    return true;
  }

  throw new Error(`${isSimulator ? 'Simulator' : 'Real device'} architecture is unsupported by the '${app}' application. ` + `Make sure the correct deployment target has been selected for its compilation in Xcode.`);
}require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi91dGlscy5qcyJdLCJuYW1lcyI6WyJERUZBVUxUX1RJTUVPVVRfS0VZIiwiZGV0ZWN0VWRpZCIsImxvZyIsImRlYnVnIiwiY21kIiwiYXJncyIsImZzIiwid2hpY2giLCJwdXNoIiwiZXJyIiwicmVxdWlyZSIsInJlc29sdmUiLCJ1ZGlkIiwic3Rkb3V0IiwidGltZW91dCIsInVkaWRzIiwiXyIsInVuaXEiLCJmaWx0ZXIiLCJzcGxpdCIsIkJvb2xlYW4iLCJsYXN0IiwibGVuZ3RoIiwid2FybiIsImpvaW4iLCJlcnJvckFuZFRocm93IiwibWVzc2FnZSIsIkVycm9yIiwiZ2V0QW5kQ2hlY2tYY29kZVZlcnNpb24iLCJ2ZXJzaW9uIiwieGNvZGUiLCJnZXRWZXJzaW9uIiwidG9vbHNWZXJzaW9uIiwiZ2V0Q29tbWFuZExpbmVUb29sc1ZlcnNpb24iLCJpZ24iLCJ2ZXJzaW9uRmxvYXQiLCJ2ZXJzaW9uU3RyaW5nIiwiZ2V0QW5kQ2hlY2tJb3NTZGtWZXJzaW9uIiwidmVyc2lvbk51bWJlciIsImdldE1heElPU1NESyIsInRyYW5zbGF0ZURldmljZU5hbWUiLCJwbGF0Zm9ybVZlcnNpb24iLCJkZXZOYW1lIiwiZGV2aWNlTmFtZSIsInRvTG93ZXJDYXNlIiwidHJpbSIsInBhcnNlRmxvYXQiLCJkZXJpdmVkRGF0YVBlcm1pc3Npb25zU3RhY2tzIiwiTWFwIiwiYWRqdXN0V0RBQXR0YWNobWVudHNQZXJtaXNzaW9ucyIsIndkYSIsInBlcm1zIiwicmV0cmlldmVEZXJpdmVkRGF0YVBhdGgiLCJhdHRhY2htZW50c0ZvbGRlciIsInBhdGgiLCJwZXJtc1N0YWNrIiwiZ2V0IiwiaW5mbyIsInBvcCIsInNldCIsImV4aXN0cyIsImNobW9kIiwiZGVyaXZlZERhdGFDbGVhbnVwTWFya2VycyIsIm1hcmtTeXN0ZW1GaWxlc0ZvckNsZWFudXAiLCJsb2dzUm9vdCIsIm1hcmtlcnNDb3VudCIsImhhcyIsImNsZWFyU3lzdGVtRmlsZXMiLCJjbGVhbnVwQ21kIiwiY2xlYW51cFRhc2siLCJTdWJQcm9jZXNzIiwiZGV0YWNoZWQiLCJzdGRpbyIsInN0YXJ0IiwiaW9zVXRpbHMiLCJjbGVhckxvZ3MiLCJjaGVja0FwcFByZXNlbnQiLCJhcHAiLCJnZXREcml2ZXJJbmZvIiwic3RhdCIsIl9fZGlybmFtZSIsImJ1aWx0IiwibXRpbWUiLCJnZXRUaW1lIiwicGtnIiwiX19maWxlbmFtZSIsImluY2x1ZGVzIiwibm9ybWFsaXplQ29tbWFuZFRpbWVvdXRzIiwidmFsdWUiLCJyZXN1bHQiLCJpc05hTiIsInRvSW50ZWdlciIsIkpTT04iLCJwYXJzZSIsImlzUGxhaW5PYmplY3QiLCJ0b1BhaXJzIiwiaXNJbnRlZ2VyIiwiZ2V0UGlkVXNpbmdQYXR0ZXJuIiwicGdyZXBQYXR0ZXJuIiwicGlkIiwicGFyc2VJbnQiLCJjb2RlIiwia2lsbEFwcFVzaW5nUGF0dGVybiIsInNpZ25hbCIsIkIiLCJkZWxheSIsInJlc2V0WENUZXN0UHJvY2Vzc2VzIiwiaXNTaW11bGF0b3IiLCJvcHRzIiwicHJvY2Vzc1BhdHRlcm5zIiwid2RhTG9jYWxQb3J0IiwicHJpbnRVc2VyIiwicHJpbnRMaWJpbW9iaWxlZGV2aWNlSW5mbyIsIm1hdGNoIiwiZXhlYyIsImdldFBJRHNMaXN0ZW5pbmdPblBvcnQiLCJwb3J0IiwiZmlsdGVyaW5nRnVuYyIsImUiLCJpc0Z1bmN0aW9uIiwieCIsImVuY29kZUJhc2U2NE9yVXBsb2FkIiwibG9jYWxGaWxlIiwicmVtb3RlUGF0aCIsInVwbG9hZE9wdGlvbnMiLCJzaXplIiwidXRpbCIsInRvUmVhZGFibGVTaXplU3RyaW5nIiwiaXNFbXB0eSIsIm1heE1lbW9yeUxpbWl0IiwidjgiLCJnZXRIZWFwU3RhdGlzdGljcyIsInRvdGFsX2F2YWlsYWJsZV9zaXplIiwiY29udGVudCIsInJlYWRGaWxlIiwidG9TdHJpbmciLCJyZW1vdGVVcmwiLCJ1cmwiLCJvcHRpb25zIiwidXNlciIsInBhc3MiLCJtZXRob2QiLCJwcm90b2NvbCIsInN0YXJ0c1dpdGgiLCJocmVmIiwibXVsdGlwYXJ0IiwiYm9keSIsIl9mcyIsImNyZWF0ZVJlYWRTdHJlYW0iLCJhdXRoIiwiaG9zdCIsImhvc3RuYW1lIiwibmV0IiwidXBsb2FkRmlsZSIsInJlbW92ZUFsbFNlc3Npb25XZWJTb2NrZXRIYW5kbGVycyIsInNlcnZlciIsInNlc3Npb25JZCIsImdldFdlYlNvY2tldEhhbmRsZXJzIiwiYWN0aXZlSGFuZGxlcnMiLCJwYXRobmFtZSIsImtleXMiLCJyZW1vdmVXZWJTb2NrZXRIYW5kbGVyIiwidmVyaWZ5QXBwbGljYXRpb25QbGF0Zm9ybSIsImluZm9QbGlzdCIsIkNGQnVuZGxlU3VwcG9ydGVkUGxhdGZvcm1zIiwicGxpc3QiLCJwYXJzZVBsaXN0RmlsZSIsInN0cmluZ2lmeSIsImlzQXJyYXkiLCJpc0FwcFN1cHBvcnRlZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFFQSxNQUFNQSxtQkFBbUIsR0FBRyxTQUE1Qjs7O0FBR0EsZUFBZUMsVUFBZixHQUE2QjtBQUMzQkMsa0JBQUlDLEtBQUosQ0FBVSxvQ0FBVjs7QUFDQSxNQUFJQyxHQUFKO0FBQUEsTUFBU0MsSUFBSSxHQUFHLEVBQWhCOztBQUNBLE1BQUk7QUFDRkQsSUFBQUEsR0FBRyxHQUFHLE1BQU1FLGtCQUFHQyxLQUFILENBQVMsWUFBVCxDQUFaO0FBQ0FGLElBQUFBLElBQUksQ0FBQ0csSUFBTCxDQUFVLElBQVY7O0FBQ0FOLG9CQUFJQyxLQUFKLENBQVUsa0JBQVY7QUFDRCxHQUpELENBSUUsT0FBT00sR0FBUCxFQUFZO0FBQ1pQLG9CQUFJQyxLQUFKLENBQVUsaUJBQVY7O0FBQ0FDLElBQUFBLEdBQUcsR0FBR00sT0FBTyxDQUFDQyxPQUFSLENBQWdCLFdBQWhCLENBQU47QUFDRDs7QUFDRCxNQUFJQyxJQUFKOztBQUNBLE1BQUk7QUFDRixRQUFJO0FBQUNDLE1B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NEQ7QUFDMUR6RyxrQkFBSUMsS0FBSixDQUFVLGdDQUFWOztBQUVBLFFBQU1nSyxTQUFTLEdBQUc3RyxjQUFLM0MsT0FBTCxDQUFha0UsR0FBYixFQUFrQixZQUFsQixDQUFsQjs7QUFDQSxNQUFJLEVBQUMsTUFBTXZFLGtCQUFHc0QsTUFBSCxDQUFVdUcsU0FBVixDQUFQLENBQUosRUFBaUM7QUFDL0JqSyxvQkFBSUMsS0FBSixDQUFXLElBQUdnSyxTQUFVLGtCQUF4Qjs7QUFDQSxXQUFPLElBQVA7QUFDRDs7QUFFRCxRQUFNO0FBQUNDLElBQUFBO0FBQUQsTUFBK0IsTUFBTUMscUJBQU1DLGNBQU4sQ0FBcUJILFNBQXJCLENBQTNDOztBQUNBakssa0JBQUlDLEtBQUosQ0FBVywrQkFBOEJ5RixJQUFJLENBQUMyRSxTQUFMLENBQWVILDBCQUFmLENBQTJDLEVBQXBGOztBQUNBLE1BQUksQ0FBQ3BKLGdCQUFFd0osT0FBRixDQUFVSiwwQkFBVixDQUFMLEVBQTRDO0FBQzFDbEssb0JBQUlDLEtBQUosQ0FBVyxxREFBb0RnSyxTQUFVLEdBQXpFOztBQUNBLFdBQU8sSUFBUDtBQUNEOztBQUVELFFBQU1NLGNBQWMsR0FBSTlELFdBQVcsSUFBSXlELDBCQUEwQixDQUFDOUUsUUFBM0IsQ0FBb0MsaUJBQXBDLENBQWhCLElBQ2pCLENBQUNxQixXQUFELElBQWdCeUQsMEJBQTBCLENBQUM5RSxRQUEzQixDQUFvQyxVQUFwQyxDQUR0Qjs7QUFFQSxNQUFJbUYsY0FBSixFQUFvQjtBQUNsQixXQUFPLElBQVA7QUFDRDs7QUFDRCxRQUFNLElBQUk5SSxLQUFKLENBQVcsR0FBRWdGLFdBQVcsR0FBRyxXQUFILEdBQWlCLGFBQWMsd0NBQXVDOUIsR0FBSSxpQkFBeEYsR0FDQyx5RkFEWCxDQUFOO0FBRUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQiBmcm9tICdibHVlYmlyZCc7XG5pbXBvcnQgeyBmcywgdXRpbCwgbmV0LCBwbGlzdCB9IGZyb20gJ2FwcGl1bS1zdXBwb3J0JztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgdXRpbHMgYXMgaW9zVXRpbHMgfSBmcm9tICdhcHBpdW0taW9zLWRyaXZlcic7XG5pbXBvcnQgeyBTdWJQcm9jZXNzLCBleGVjIH0gZnJvbSAndGVlbl9wcm9jZXNzJztcbmltcG9ydCB4Y29kZSBmcm9tICdhcHBpdW0teGNvZGUnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBsb2cgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IF9mcyBmcm9tICdmcyc7XG5pbXBvcnQgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgdjggZnJvbSAndjgnO1xuXG5jb25zdCBERUZBVUxUX1RJTUVPVVRfS0VZID0gJ2RlZmF1bHQnO1xuXG5cbmFzeW5jIGZ1bmN0aW9uIGRldGVjdFVkaWQgKCkge1xuICBsb2cuZGVidWcoJ0F1dG8tZGV0ZWN0aW5nIHJlYWwgZGV2aWNlIHVkaWQuLi4nKTtcbiAgbGV0IGNtZCwgYXJncyA9IFtdO1xuICB0cnkge1xuICAgIGNtZCA9IGF3YWl0IGZzLndoaWNoKCdpZGV2aWNlX2lkJyk7XG4gICAgYXJncy5wdXNoKCctbCcpO1xuICAgIGxvZy5kZWJ1ZygnVXNpbmcgaWRldmljZV9pZCcpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBsb2cuZGVidWcoJ1VzaW5nIHVkaWRldGVjdCcpO1xuICAgIGNtZCA9IHJlcXVpcmUucmVzb2x2ZSgndWRpZGV0ZWN0Jyk7XG4gIH1cbiAgbGV0IHVkaWQ7XG4gIHRyeSB7XG4gICAgbGV0IHtzdGRvdXR9ID0gYXdhaXQgZXhlYyhjbWQsIGFyZ3MsIHt0aW1lb3V0OiAzMDAwfSk7XG4gICAgbGV0IHVkaWRzID0gXy51bmlxKF8uZmlsdGVyKHN0ZG91dC5zcGxpdCgnXFxuJyksIEJvb2xlYW4pKTtcbiAgICB1ZGlkID0gXy5sYXN0KHVkaWRzKTtcbiAgICBpZiAodWRpZHMubGVuZ3RoID4gMSkge1xuICAgICAgbG9nLndhcm4oYE11bHRpcGxlIGRldmljZXMgZm91bmQ6ICR7dWRpZHMuam9pbignLCAnKX1gKTtcbiAgICAgIGxvZy53YXJuKGBDaG9vc2luZyAnJHt1ZGlkfScuIElmIHRoaXMgaXMgd3JvbmcsIG1hbnVhbGx5IHNldCB3aXRoICd1ZGlkJyBkZXNpcmVkIGNhcGFiaWxpdHlgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGxvZy5lcnJvckFuZFRocm93KGBFcnJvciBkZXRlY3RpbmcgdWRpZDogJHtlcnIubWVzc2FnZX1gKTtcbiAgfVxuICBpZiAoIXVkaWQgfHwgdWRpZC5sZW5ndGggPD0gMikge1xuICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGRldGVjdCB1ZGlkLicpO1xuICB9XG4gIGxvZy5kZWJ1ZyhgRGV0ZWN0ZWQgcmVhbCBkZXZpY2UgdWRpZDogJyR7dWRpZH0nYCk7XG4gIHJldHVybiB1ZGlkO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRBbmRDaGVja1hjb2RlVmVyc2lvbiAoKSB7XG4gIGxldCB2ZXJzaW9uO1xuICB0cnkge1xuICAgIHZlcnNpb24gPSBhd2FpdCB4Y29kZS5nZXRWZXJzaW9uKHRydWUpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBsb2cuZGVidWcoZXJyKTtcbiAgICBsb2cuZXJyb3JBbmRUaHJvdyhgQ291bGQgbm90IGRldGVybWluZSBYY29kZSB2ZXJzaW9uOiAke2Vyci5tZXNzYWdlfWApO1xuICB9XG5cbiAgaWYgKCF2ZXJzaW9uLnRvb2xzVmVyc2lvbikge1xuICAgIHRyeSB7XG4gICAgICB2ZXJzaW9uLnRvb2xzVmVyc2lvbiA9IGF3YWl0IHhjb2RlLmdldENvbW1hbmRMaW5lVG9vbHNWZXJzaW9uKCk7XG4gICAgfSBjYXRjaCAoaWduKSB7fVxuICB9XG5cbiAgLy8gd2UgZG8gbm90IHN1cHBvcnQgWGNvZGVzIDwgNy4zLFxuICBpZiAodmVyc2lvbi52ZXJzaW9uRmxvYXQgPCA3LjMpIHtcbiAgICBsb2cuZXJyb3JBbmRUaHJvdyhgWGNvZGUgdmVyc2lvbiAnJHt2ZXJzaW9uLnZlcnNpb25TdHJpbmd9Jy4gU3VwcG9ydCBmb3IgYCArXG4gICAgICAgICAgICAgICAgICAgICAgYFhjb2RlICR7dmVyc2lvbi52ZXJzaW9uU3RyaW5nfSBpcyBub3Qgc3VwcG9ydGVkLiBgICtcbiAgICAgICAgICAgICAgICAgICAgICBgUGxlYXNlIHVwZ3JhZGUgdG8gdmVyc2lvbiA3LjMgb3IgaGlnaGVyYCk7XG4gIH1cbiAgcmV0dXJuIHZlcnNpb247XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEFuZENoZWNrSW9zU2RrVmVyc2lvbiAoKSB7XG4gIGxldCB2ZXJzaW9uTnVtYmVyO1xuICB0cnkge1xuICAgIHZlcnNpb25OdW1iZXIgPSBhd2FpdCB4Y29kZS5nZXRNYXhJT1NTREsoKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgbG9nLmVycm9yQW5kVGhyb3coYENvdWxkIG5vdCBkZXRlcm1pbmUgaU9TIFNESyB2ZXJzaW9uOiAke2Vyci5tZXNzYWdlfWApO1xuICB9XG4gIHJldHVybiB2ZXJzaW9uTnVtYmVyO1xufVxuXG5mdW5jdGlvbiB0cmFuc2xhdGVEZXZpY2VOYW1lIChwbGF0Zm9ybVZlcnNpb24sIGRldk5hbWUgPSAnJykge1xuICBsZXQgZGV2aWNlTmFtZSA9IGRldk5hbWU7XG4gIHN3aXRjaCAoZGV2TmFtZS50b0xvd2VyQ2FzZSgpLnRyaW0oKSkge1xuICAgIGNhc2UgJ2lwaG9uZSBzaW11bGF0b3InOlxuICAgICAgZGV2aWNlTmFtZSA9ICdpUGhvbmUgNic7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdpcGFkIHNpbXVsYXRvcic6XG4gICAgICAvLyBubyBuZWVkIHRvIHdvcnJ5IGFib3V0IGZsb2F0aW5nIHBvaW50IGNvbXBhcmlzb24gYmVjYXVzZSBvZiB0aGVcbiAgICAgIC8vICAgbmF0dXJlIG9mIHRoZSBudW1iZXJzIGJlaW5nIGNvbXBhcmVkXG4gICAgICAvLyBpUGFkIFJldGluYSBpcyBubyBsb25nZXIgYXZhaWxhYmxlIGZvciBpb3MgMTAuM1xuICAgICAgLy8gICBzbyB3ZSBwaWNrIGFub3RoZXIgaVBhZCB0byB1c2UgYXMgZGVmYXVsdFxuICAgICAgZGV2aWNlTmFtZSA9IChwYXJzZUZsb2F0KHBsYXRmb3JtVmVyc2lvbikgPCAxMC4zKSA/ICdpUGFkIFJldGluYScgOiAnaVBhZCBBaXInO1xuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZGV2aWNlTmFtZSAhPT0gZGV2TmFtZSkge1xuICAgIGxvZy5kZWJ1ZyhgQ2hhbmdpbmcgZGV2aWNlTmFtZSBmcm9tICcke2Rldk5hbWV9JyB0byAnJHtkZXZpY2VOYW1lfSdgKTtcbiAgfVxuICByZXR1cm4gZGV2aWNlTmFtZTtcbn1cblxuLy8gVGhpcyBtYXAgY29udGFpbnMgZGVyaXZlZCBkYXRhIGF0dGFjaG1lbnQgZm9sZGVycyBhcyBrZXlzXG4vLyBhbmQgdmFsdWVzIGFyZSBzdGFja3Mgb2YgcGVybXNzaW9uIG1hc2tzXG4vLyBJdCBpcyB1c2VkIHRvIHN5bmNocm9uaXplIHBlcm1pc3Npb25zIGNoYW5nZVxuLy8gb24gc2hhcmVkIGZvbGRlcnNcbmNvbnN0IGRlcml2ZWREYXRhUGVybWlzc2lvbnNTdGFja3MgPSBuZXcgTWFwKCk7XG5cbmFzeW5jIGZ1bmN0aW9uIGFkanVzdFdEQUF0dGFjaG1lbnRzUGVybWlzc2lvbnMgKHdkYSwgcGVybXMpIHtcbiAgaWYgKCF3ZGEgfHwgIWF3YWl0IHdkYS5yZXRyaWV2ZURlcml2ZWREYXRhUGF0aCgpKSB7XG4gICAgbG9nLndhcm4oJ05vIFdlYkRyaXZlckFnZW50IGRlcml2ZWQgZGF0YSBhdmFpbGFibGUsIHNvIHVuYWJsZSB0byBzZXQgcGVybWlzc2lvbnMgb24gV0RBIGF0dGFjaG1lbnRzIGZvbGRlcicpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGF0dGFjaG1lbnRzRm9sZGVyID0gcGF0aC5qb2luKGF3YWl0IHdkYS5yZXRyaWV2ZURlcml2ZWREYXRhUGF0aCgpLCAnTG9ncy9UZXN0L0F0dGFjaG1lbnRzJyk7XG4gIGNvbnN0IHBlcm1zU3RhY2sgPSBkZXJpdmVkRGF0YVBlcm1pc3Npb25zU3RhY2tzLmdldChhdHRhY2htZW50c0ZvbGRlcikgfHwgW107XG4gIGlmIChwZXJtc1N0YWNrLmxlbmd0aCkge1xuICAgIGlmIChfLmxhc3QocGVybXNTdGFjaykgPT09IHBlcm1zKSB7XG4gICAgICBwZXJtc1N0YWNrLnB1c2gocGVybXMpO1xuICAgICAgbG9nLmluZm8oYE5vdCBjaGFuZ2luZyBwZXJtaXNzaW9ucyBvZiAnJHthdHRhY2htZW50c0ZvbGRlcn0nIHRvICcke3Blcm1zfScsIGJlY2F1c2UgdGhleSB3ZXJlIGFscmVhZHkgc2V0IGJ5IHRoZSBvdGhlciBzZXNzaW9uYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChwZXJtc1N0YWNrLmxlbmd0aCA+IDEpIHtcbiAgICAgIHBlcm1zU3RhY2sucG9wKCk7XG4gICAgICBsb2cuaW5mbyhgTm90IGNoYW5naW5nIHBlcm1pc3Npb25zIG9mICcke2F0dGFjaG1lbnRzRm9sZGVyfScgdG8gJyR7cGVybXN9JywgYmVjYXVzZSB0aGUgb3RoZXIgc2Vzc2lvbiBkb2VzIG5vdCBleHBlY3QgdGhlbSB0byBiZSBjaGFuZ2VkYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIGRlcml2ZWREYXRhUGVybWlzc2lvbnNTdGFja3Muc2V0KGF0dGFjaG1lbnRzRm9sZGVyLCBbcGVybXNdKTtcblxuICBpZiAoYXdhaXQgZnMuZXhpc3RzKGF0dGFjaG1lbnRzRm9sZGVyKSkge1xuICAgIGxvZy5pbmZvKGBTZXR0aW5nICcke3Blcm1zfScgcGVybWlzc2lvbnMgdG8gJyR7YXR0YWNobWVudHNGb2xkZXJ9JyBmb2xkZXJgKTtcbiAgICBhd2FpdCBmcy5jaG1vZChhdHRhY2htZW50c0ZvbGRlciwgcGVybXMpO1xuICAgIHJldHVybjtcbiAgfVxuICBsb2cuaW5mbyhgVGhlcmUgaXMgbm8gJHthdHRhY2htZW50c0ZvbGRlcn0gZm9sZGVyLCBzbyBub3QgY2hhbmdpbmcgcGVybWlzc2lvbnNgKTtcbn1cblxuLy8gVGhpcyBtYXAgY29udGFpbnMgZGVyaXZlZCBkYXRhIGxvZ3MgZm9sZGVycyBhcyBrZXlzXG4vLyBhbmQgdmFsdWVzIGFyZSB0aGUgY291bnQgb2YgdGltZXMgdGhlIHBhcnRpY3VsYXJcbi8vIGZvbGRlciBoYXMgYmVlbiBzY2hlZHVsZWQgZm9yIHJlbW92YWxcbmNvbnN0IGRlcml2ZWREYXRhQ2xlYW51cE1hcmtlcnMgPSBuZXcgTWFwKCk7XG5cbmFzeW5jIGZ1bmN0aW9uIG1hcmtTeXN0ZW1GaWxlc0ZvckNsZWFudXAgKHdkYSkge1xuICBpZiAoIXdkYSB8fCAhYXdhaXQgd2RhLnJldHJpZXZlRGVyaXZlZERhdGFQYXRoKCkpIHtcbiAgICBsb2cud2FybignTm8gV2ViRHJpdmVyQWdlbnQgZGVyaXZlZCBkYXRhIGF2YWlsYWJsZSwgc28gdW5hYmxlIHRvIG1hcmsgc3lzdGVtIGZpbGVzIGZvciBjbGVhbnVwJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbG9nc1Jvb3QgPSBwYXRoLnJlc29sdmUoYXdhaXQgd2RhLnJldHJpZXZlRGVyaXZlZERhdGFQYXRoKCksICdMb2dzJyk7XG4gIGxldCBtYXJrZXJzQ291bnQgPSAwO1xuICBpZiAoZGVyaXZlZERhdGFDbGVhbnVwTWFya2Vycy5oYXMobG9nc1Jvb3QpKSB7XG4gICAgbWFya2Vyc0NvdW50ID0gZGVyaXZlZERhdGFDbGVhbnVwTWFya2Vycy5nZXQobG9nc1Jvb3QpO1xuICB9XG4gIGRlcml2ZWREYXRhQ2xlYW51cE1hcmtlcnMuc2V0KGxvZ3NSb290LCArK21hcmtlcnNDb3VudCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNsZWFyU3lzdGVtRmlsZXMgKHdkYSkge1xuICAvLyBvbmx5IHdhbnQgdG8gY2xlYXIgdGhlIHN5c3RlbSBmaWxlcyBmb3IgdGhlIHBhcnRpY3VsYXIgV0RBIHhjb2RlIHJ1blxuICBpZiAoIXdkYSB8fCAhYXdhaXQgd2RhLnJldHJpZXZlRGVyaXZlZERhdGFQYXRoKCkpIHtcbiAgICBsb2cud2FybignTm8gV2ViRHJpdmVyQWdlbnQgZGVyaXZlZCBkYXRhIGF2YWlsYWJsZSwgc28gdW5hYmxlIHRvIGNsZWFyIHN5c3RlbSBmaWxlcycpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGxvZ3NSb290ID0gcGF0aC5yZXNvbHZlKGF3YWl0IHdkYS5yZXRyaWV2ZURlcml2ZWREYXRhUGF0aCgpLCAnTG9ncycpO1xuICBpZiAoZGVyaXZlZERhdGFDbGVhbnVwTWFya2Vycy5oYXMobG9nc1Jvb3QpKSB7XG4gICAgbGV0IG1hcmtlcnNDb3VudCA9IGRlcml2ZWREYXRhQ2xlYW51cE1hcmtlcnMuZ2V0KGxvZ3NSb290KTtcbiAgICBkZXJpdmVkRGF0YUNsZWFudXBNYXJrZXJzLnNldChsb2dzUm9vdCwgLS1tYXJrZXJzQ291bnQpO1xuICAgIGlmIChtYXJrZXJzQ291bnQgPiAwKSB7XG4gICAgICBsb2cuaW5mbyhgTm90IGNsZWFuaW5nICcke2xvZ3NSb290fScgZm9sZGVyLCBiZWNhdXNlIHRoZSBvdGhlciBzZXNzaW9uIGRvZXMgbm90IGV4cGVjdCBpdCB0byBiZSBjbGVhbmVkYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIGRlcml2ZWREYXRhQ2xlYW51cE1hcmtlcnMuc2V0KGxvZ3NSb290LCAwKTtcblxuICAvLyBDbGVhbmluZyB1cCBiaWcgdGVtcG9yYXJ5IGZpbGVzIGNyZWF0ZWQgYnkgWENUZXN0OiBodHRwczovL2dpdGh1Yi5jb20vYXBwaXVtL2FwcGl1bS9pc3N1ZXMvOTQxMFxuICBjb25zdCBjbGVhbnVwQ21kID0gYGZpbmQgLUUgL3ByaXZhdGUvdmFyL2ZvbGRlcnMgYCArXG4gICAgYC1yZWdleCAnLiovU2Vzc2lvbi1XZWJEcml2ZXJBZ2VudFJ1bm5lci4qXFxcXC5sb2ckfC4qL1N0YW5kYXJkT3V0cHV0QW5kU3RhbmRhcmRFcnJvclxcXFwudHh0JCcgYCArXG4gICAgYC10eXBlIGYgLWV4ZWMgc2ggLWMgJ2VjaG8gXCJcIiA+IFwie31cIicgXFxcXDtgO1xuICBjb25zdCBjbGVhbnVwVGFzayA9IG5ldyBTdWJQcm9jZXNzKCdiYXNoJywgWyctYycsIGNsZWFudXBDbWRdLCB7XG4gICAgZGV0YWNoZWQ6IHRydWUsXG4gICAgc3RkaW86IFsnaWdub3JlJywgJ3BpcGUnLCAncGlwZSddLFxuICB9KTtcbiAgLy8gRG8gbm90IHdhaXQgZm9yIHRoZSB0YXNrIHRvIGJlIGNvbXBsZXRlZCwgc2luY2UgaXQgbWlnaHQgdGFrZSBhIGxvdCBvZiB0aW1lXG4gIC8vIFdlIGtlZXAgaXQgcnVubmluZyBhZnRlciBBcHBpdW0gcHJvY2VzcyBpcyBraWxsZWRcbiAgYXdhaXQgY2xlYW51cFRhc2suc3RhcnQoMCwgdHJ1ZSk7XG4gIGxvZy5kZWJ1ZyhgU3RhcnRlZCBiYWNrZ3JvdW5kIFhDVGVzdCBsb2dzIGNsZWFudXA6ICR7Y2xlYW51cENtZH1gKTtcblxuICBpZiAoYXdhaXQgZnMuZXhpc3RzKGxvZ3NSb290KSkge1xuICAgIGxvZy5pbmZvKGBDbGVhbmluZyB0ZXN0IGxvZ3MgaW4gJyR7bG9nc1Jvb3R9JyBmb2xkZXJgKTtcbiAgICBhd2FpdCBpb3NVdGlscy5jbGVhckxvZ3MoW2xvZ3NSb290XSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxvZy5pbmZvKGBUaGVyZSBpcyBubyAke2xvZ3NSb290fSBmb2xkZXIsIHNvIG5vdCBjbGVhbmluZyBmaWxlc2ApO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjaGVja0FwcFByZXNlbnQgKGFwcCkge1xuICBsb2cuZGVidWcoYENoZWNraW5nIHdoZXRoZXIgYXBwICcke2FwcH0nIGlzIGFjdHVhbGx5IHByZXNlbnQgb24gZmlsZSBzeXN0ZW1gKTtcbiAgaWYgKCEoYXdhaXQgZnMuZXhpc3RzKGFwcCkpKSB7XG4gICAgbG9nLmVycm9yQW5kVGhyb3coYENvdWxkIG5vdCBmaW5kIGFwcCBhdCAnJHthcHB9J2ApO1xuICB9XG4gIGxvZy5kZWJ1ZygnQXBwIGlzIHByZXNlbnQnKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RHJpdmVySW5mbyAoKSB7XG4gIGNvbnN0IHN0YXQgPSBhd2FpdCBmcy5zdGF0KHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLicpKTtcbiAgY29uc3QgYnVpbHQgPSBzdGF0Lm10aW1lLmdldFRpbWUoKTtcblxuICAvLyBnZXQgdGhlIHBhY2thZ2UuanNvbiBhbmQgdGhlIHZlcnNpb24gZnJvbSBpdFxuICBjb25zdCBwa2cgPSByZXF1aXJlKF9fZmlsZW5hbWUuaW5jbHVkZXMoJ2J1aWxkL2xpYi91dGlscycpID8gJy4uLy4uL3BhY2thZ2UuanNvbicgOiAnLi4vcGFja2FnZS5qc29uJyk7XG4gIGNvbnN0IHZlcnNpb24gPSBwa2cudmVyc2lvbjtcblxuICByZXR1cm4ge1xuICAgIGJ1aWx0LFxuICAgIHZlcnNpb24sXG4gIH07XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUNvbW1hbmRUaW1lb3V0cyAodmFsdWUpIHtcbiAgLy8gVGhlIHZhbHVlIGlzIG5vcm1hbGl6ZWQgYWxyZWFkeVxuICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIGxldCByZXN1bHQgPSB7fTtcbiAgLy8gVXNlIGFzIGRlZmF1bHQgdGltZW91dCBmb3IgYWxsIGNvbW1hbmRzIGlmIGEgc2luZ2xlIGludGVnZXIgdmFsdWUgaXMgcHJvdmlkZWRcbiAgaWYgKCFpc05hTih2YWx1ZSkpIHtcbiAgICByZXN1bHRbREVGQVVMVF9USU1FT1VUX0tFWV0gPSBfLnRvSW50ZWdlcih2YWx1ZSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIEpTT04gb2JqZWN0IGhhcyBiZWVuIHByb3ZpZGVkLiBMZXQncyBwYXJzZSBpdFxuICB0cnkge1xuICAgIHJlc3VsdCA9IEpTT04ucGFyc2UodmFsdWUpO1xuICAgIGlmICghXy5pc1BsYWluT2JqZWN0KHJlc3VsdCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgbG9nLmVycm9yQW5kVGhyb3coYFwiY29tbWFuZFRpbWVvdXRzXCIgY2FwYWJpbGl0eSBzaG91bGQgYmUgYSB2YWxpZCBKU09OIG9iamVjdC4gXCIke3ZhbHVlfVwiIHdhcyBnaXZlbiBpbnN0ZWFkYCk7XG4gIH1cbiAgZm9yIChsZXQgW2NtZCwgdGltZW91dF0gb2YgXy50b1BhaXJzKHJlc3VsdCkpIHtcbiAgICBpZiAoIV8uaXNJbnRlZ2VyKHRpbWVvdXQpIHx8IHRpbWVvdXQgPD0gMCkge1xuICAgICAgbG9nLmVycm9yQW5kVGhyb3coYFRoZSB0aW1lb3V0IGZvciBcIiR7Y21kfVwiIHNob3VsZCBiZSBhIHZhbGlkIG5hdHVyYWwgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcy4gXCIke3RpbWVvdXR9XCIgd2FzIGdpdmVuIGluc3RlYWRgKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIHByb2Nlc3MgaWQgb2YgdGhlIG1vc3QgcmVjZW50IHJ1bm5pbmcgYXBwbGljYXRpb25cbiAqIGhhdmluZyB0aGUgcGFydGljdWxhciBjb21tYW5kIGxpbmUgcGF0dGVybi5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGdyZXBQYXR0ZXJuIC0gcGdyZXAtY29tcGF0aWJsZSBzZWFyY2ggcGF0dGVybi5cbiAqIEByZXR1cm4ge3N0cmluZ30gRWl0aGVyIGEgcHJvY2VzcyBpZCBvciBudWxsIGlmIG5vIG1hdGNoZXMgd2VyZSBmb3VuZC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0UGlkVXNpbmdQYXR0ZXJuIChwZ3JlcFBhdHRlcm4pIHtcbiAgY29uc3QgYXJncyA9IFsnLW5pZicsIHBncmVwUGF0dGVybl07XG4gIHRyeSB7XG4gICAgY29uc3Qge3N0ZG91dH0gPSBhd2FpdCBleGVjKCdwZ3JlcCcsIGFyZ3MpO1xuICAgIGNvbnN0IHBpZCA9IHBhcnNlSW50KHN0ZG91dCwgMTApO1xuICAgIGlmIChpc05hTihwaWQpKSB7XG4gICAgICBsb2cuZGVidWcoYENhbm5vdCBwYXJzZSBwcm9jZXNzIGlkIGZyb20gJ3BncmVwICR7YXJncy5qb2luKCcgJyl9JyBvdXRwdXQ6ICR7c3Rkb3V0fWApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBgJHtwaWR9YDtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgbG9nLmRlYnVnKGAncGdyZXAgJHthcmdzLmpvaW4oJyAnKX0nIGRpZG4ndCBkZXRlY3QgYW55IG1hdGNoaW5nIHByb2Nlc3Nlcy4gUmV0dXJuIGNvZGU6ICR7ZXJyLmNvZGV9YCk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBLaWxsIGEgcHJvY2VzcyBoYXZpbmcgdGhlIHBhcnRpY3VsYXIgY29tbWFuZCBsaW5lIHBhdHRlcm4uXG4gKiBUaGlzIG1ldGhvZCB0cmllcyB0byBzZW5kIFNJR0lOVCwgU0lHVEVSTSBhbmQgU0lHS0lMTCB0byB0aGVcbiAqIG1hdGNoZWQgcHJvY2Vzc2VzIGluIHRoaXMgb3JkZXIgaWYgdGhlIHByb2Nlc3MgaXMgc3RpbGwgcnVubmluZy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGdyZXBQYXR0ZXJuIC0gcGdyZXAtY29tcGF0aWJsZSBzZWFyY2ggcGF0dGVybi5cbiAqL1xuYXN5bmMgZnVuY3Rpb24ga2lsbEFwcFVzaW5nUGF0dGVybiAocGdyZXBQYXR0ZXJuKSB7XG4gIGZvciAoY29uc3Qgc2lnbmFsIG9mIFsyLCAxNSwgOV0pIHtcbiAgICBpZiAoIWF3YWl0IGdldFBpZFVzaW5nUGF0dGVybihwZ3JlcFBhdHRlcm4pKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGFyZ3MgPSBbYC0ke3NpZ25hbH1gLCAnLWlmJywgcGdyZXBQYXR0ZXJuXTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZXhlYygncGtpbGwnLCBhcmdzKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy5kZWJ1ZyhgcGtpbGwgJHthcmdzLmpvaW4oJyAnKX0gLT4gJHtlcnIubWVzc2FnZX1gKTtcbiAgICB9XG4gICAgYXdhaXQgQi5kZWxheSgxMDApO1xuICB9XG59XG5cbi8qKlxuICogS2lsbHMgcnVubmluZyBYQ1Rlc3QgcHJvY2Vzc2VzIGZvciB0aGUgcGFydGljdWxhciBkZXZpY2UuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHVkaWQgLSBUaGUgZGV2aWNlIFVESUQuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGlzU2ltdWxhdG9yIC0gRXF1YWxzIHRvIHRydWUgaWYgdGhlIGN1cnJlbnQgZGV2aWNlIGlzIGEgU2ltdWxhdG9yXG4gKiBAcGFyYW0ge29iamVjdH0gb3B0cyAtIEFkZGl0aW9uYWwgb3B0aW9ucyBtYXBwaW5nLiBQb3NzaWJsZSBrZXlzIGFyZTpcbiAqICAgLSB7c3RyaW5nfG51bWJlcn0gd2RhTG9jYWxQb3J0OiBUaGUgbnVtYmVyIG9mIGxvY2FsIHBvcnQgV0RBIGlzIGxpc3RlbmluZyBvbi5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVzZXRYQ1Rlc3RQcm9jZXNzZXMgKHVkaWQsIGlzU2ltdWxhdG9yLCBvcHRzID0ge30pIHtcbiAgY29uc3QgcHJvY2Vzc1BhdHRlcm5zID0gW2B4Y29kZWJ1aWxkLioke3VkaWR9YF07XG4gIGlmIChvcHRzLndkYUxvY2FsUG9ydCkge1xuICAgIHByb2Nlc3NQYXR0ZXJucy5wdXNoKGBpcHJveHkgJHtvcHRzLndkYUxvY2FsUG9ydH1gKTtcbiAgfSBlbHNlIGlmICghaXNTaW11bGF0b3IpIHtcbiAgICBwcm9jZXNzUGF0dGVybnMucHVzaChgaXByb3h5Lioke3VkaWR9YCk7XG4gIH1cbiAgaWYgKGlzU2ltdWxhdG9yKSB7XG4gICAgcHJvY2Vzc1BhdHRlcm5zLnB1c2goYCR7dWRpZH0uKlhDVFJ1bm5lcmApO1xuICB9XG4gIGxvZy5kZWJ1ZyhgS2lsbGluZyBydW5uaW5nIHByb2Nlc3NlcyAnJHtwcm9jZXNzUGF0dGVybnMuam9pbignLCAnKX0nIGZvciB0aGUgZGV2aWNlICR7dWRpZH0uLi5gKTtcbiAgZm9yIChjb25zdCBwZ3JlcFBhdHRlcm4gb2YgcHJvY2Vzc1BhdHRlcm5zKSB7XG4gICAgYXdhaXQga2lsbEFwcFVzaW5nUGF0dGVybihwZ3JlcFBhdHRlcm4pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByaW50VXNlciAoKSB7XG4gIHRyeSB7XG4gICAgbGV0IHtzdGRvdXR9ID0gYXdhaXQgZXhlYygnd2hvYW1pJyk7XG4gICAgbG9nLmRlYnVnKGBDdXJyZW50IHVzZXI6ICcke3N0ZG91dC50cmltKCl9J2ApO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBsb2cuZGVidWcoYFVuYWJsZSB0byBnZXQgdXNlcm5hbWUgcnVubmluZyBzZXJ2ZXI6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcHJpbnRMaWJpbW9iaWxlZGV2aWNlSW5mbyAoKSB7XG4gIHRyeSB7XG4gICAgbGV0IHtzdGRvdXR9ID0gYXdhaXQgZXhlYygnYnJldycsIFsnaW5mbycsICdsaWJpbW9iaWxlZGV2aWNlJ10pO1xuICAgIGxldCBtYXRjaCA9IC9saWJpbW9iaWxlZGV2aWNlOiguKykvLmV4ZWMoc3Rkb3V0KTtcbiAgICBpZiAobWF0Y2ggJiYgbWF0Y2hbMV0pIHtcbiAgICAgIGxvZy5kZWJ1ZyhgQ3VycmVudCB2ZXJzaW9uIG9mIGxpYmltb2JpbGVkZXZpY2U6ICR7bWF0Y2hbMV0udHJpbSgpfWApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgbG9nLmRlYnVnKGBVbmFibGUgdG8gZ2V0IHZlcnNpb24gb2YgbGliaW1vYmlsZWRldmljZTogJHtlcnIubWVzc2FnZX1gKTtcbiAgfVxufVxuXG4vKipcbiAqIEdldCB0aGUgSURzIG9mIHByb2Nlc3NlcyBsaXN0ZW5pbmcgb24gdGhlIHBhcnRpY3VsYXIgc3lzdGVtIHBvcnQuXG4gKiBJdCBpcyBhbHNvIHBvc3NpYmxlIHRvIGFwcGx5IGFkZGl0aW9uYWwgZmlsdGVyaW5nIGJhc2VkIG9uIHRoZVxuICogcHJvY2VzcyBjb21tYW5kIGxpbmUuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd8bnVtYmVyfSBwb3J0IC0gVGhlIHBvcnQgbnVtYmVyLlxuICogQHBhcmFtIHs/RnVuY3Rpb259IGZpbHRlcmluZ0Z1bmMgLSBPcHRpb25hbCBsYW1iZGEgZnVuY3Rpb24sIHdoaWNoXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVzIGNvbW1hbmQgbGluZSBzdHJpbmcgb2YgdGhlIHBhcnRpY3VsYXIgcHJvY2Vzc1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5pbmcgb24gZ2l2ZW4gcG9ydCwgYW5kIGlzIGV4cGVjdGVkIHRvIHJldHVyblxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlaXRoZXIgdHJ1ZSBvciBmYWxzZSB0byBpbmNsdWRlL2V4Y2x1ZGUgdGhlIGNvcnJlc3BvbmRpbmcgUElEXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb20gdGhlIHJlc3VsdGluZyBhcnJheS5cbiAqIEByZXR1cm5zIHtBcnJheTxzdHJpbmc+fSAtIHRoZSBsaXN0IG9mIG1hdGNoZWQgcHJvY2VzcyBpZHMuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGdldFBJRHNMaXN0ZW5pbmdPblBvcnQgKHBvcnQsIGZpbHRlcmluZ0Z1bmMgPSBudWxsKSB7XG4gIGNvbnN0IHJlc3VsdCA9IFtdO1xuICB0cnkge1xuICAgIC8vIFRoaXMgb25seSB3b3JrcyBzaW5jZSBNYWMgT1MgWCBFbCBDYXBpdGFuXG4gICAgY29uc3Qge3N0ZG91dH0gPSBhd2FpdCBleGVjKCdsc29mJywgWyctdGknLCBgdGNwOiR7cG9ydH1gXSk7XG4gICAgcmVzdWx0LnB1c2goLi4uKHN0ZG91dC50cmltKCkuc3BsaXQoL1xcbisvKSkpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmICghXy5pc0Z1bmN0aW9uKGZpbHRlcmluZ0Z1bmMpKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICByZXR1cm4gYXdhaXQgQi5maWx0ZXIocmVzdWx0LCBhc3luYyAoeCkgPT4ge1xuICAgIGNvbnN0IHtzdGRvdXR9ID0gYXdhaXQgZXhlYygncHMnLCBbJy1wJywgeCwgJy1vJywgJ2NvbW1hbmQnXSk7XG4gICAgcmV0dXJuIGF3YWl0IGZpbHRlcmluZ0Z1bmMoc3Rkb3V0KTtcbiAgfSk7XG59XG5cbi8qKlxuICogQHR5cGVkZWYge09iamVjdH0gVXBsb2FkT3B0aW9uc1xuICpcbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gdXNlciAtIFRoZSBuYW1lIG9mIHRoZSB1c2VyIGZvciB0aGUgcmVtb3RlIGF1dGhlbnRpY2F0aW9uLiBPbmx5IHdvcmtzIGlmIGByZW1vdGVQYXRoYCBpcyBwcm92aWRlZC5cbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gcGFzcyAtIFRoZSBwYXNzd29yZCBmb3IgdGhlIHJlbW90ZSBhdXRoZW50aWNhdGlvbi4gT25seSB3b3JrcyBpZiBgcmVtb3RlUGF0aGAgaXMgcHJvdmlkZWQuXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IG1ldGhvZCAtIFRoZSBodHRwIG11bHRpcGFydCB1cGxvYWQgbWV0aG9kIG5hbWUuIFRoZSAnUFVUJyBvbmUgaXMgdXNlZCBieSBkZWZhdWx0LlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICBPbmx5IHdvcmtzIGlmIGByZW1vdGVQYXRoYCBpcyBwcm92aWRlZC5cbiAqL1xuXG5cbi8qKlxuICogRW5jb2RlcyB0aGUgZ2l2ZW4gbG9jYWwgZmlsZSB0byBiYXNlNjQgYW5kIHJldHVybnMgdGhlIHJlc3VsdGluZyBzdHJpbmdcbiAqIG9yIHVwbG9hZHMgaXQgdG8gYSByZW1vdGUgc2VydmVyIHVzaW5nIGh0dHAvaHR0cHMgb3IgZnRwIHByb3RvY29sc1xuICogaWYgYHJlbW90ZVBhdGhgIGlzIHNldFxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBsb2NhbEZpbGUgLSBUaGUgcGF0aCB0byBhbiBleGlzdGluZyBsb2NhbCBmaWxlXG4gKiBAcGFyYW0gez9zdHJpbmd9IHJlbW90ZVBhdGggLSBUaGUgcGF0aCB0byB0aGUgcmVtb3RlIGxvY2F0aW9uLCB3aGVyZVxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcyBmaWxlIHNob3VsZCBiZSB1cGxvYWRlZFxuICogQHBhcmFtIHs/VXBsb2FkT3B0aW9uc30gdXBsb2FkT3B0aW9ucyAtIFNldCBvZiB1cGxvYWQgb3B0aW9uc1xuICogQHJldHVybnMge3N0cmluZ30gRWl0aGVyIGFuIGVtcHR5IHN0cmluZyBpZiB0aGUgdXBsb2FkIHdhcyBzdWNjZXNzZnVsIG9yXG4gKiBiYXNlNjQtZW5jb2RlZCBmaWxlIHJlcHJlc2VudGF0aW9uIGlmIGByZW1vdGVQYXRoYCBpcyBmYWxzeVxuICovXG5hc3luYyBmdW5jdGlvbiBlbmNvZGVCYXNlNjRPclVwbG9hZCAobG9jYWxGaWxlLCByZW1vdGVQYXRoID0gbnVsbCwgdXBsb2FkT3B0aW9ucyA9IHt9KSB7XG4gIGlmICghYXdhaXQgZnMuZXhpc3RzKGxvY2FsRmlsZSkpIHtcbiAgICBsb2cuZXJyb3JBbmRUaHJvdyhgVGhlIGZpbGUgYXQgJyR7bG9jYWxGaWxlfScgZG9lcyBub3QgZXhpc3Qgb3IgaXMgbm90IGFjY2Vzc2libGVgKTtcbiAgfVxuXG4gIGNvbnN0IHtzaXplfSA9IGF3YWl0IGZzLnN0YXQobG9jYWxGaWxlKTtcbiAgbG9nLmRlYnVnKGBUaGUgc2l6ZSBvZiB0aGUgZmlsZSBpcyAke3V0aWwudG9SZWFkYWJsZVNpemVTdHJpbmcoc2l6ZSl9YCk7XG4gIGlmIChfLmlzRW1wdHkocmVtb3RlUGF0aCkpIHtcbiAgICBjb25zdCBtYXhNZW1vcnlMaW1pdCA9IHY4LmdldEhlYXBTdGF0aXN0aWNzKCkudG90YWxfYXZhaWxhYmxlX3NpemUgLyAyO1xuICAgIGlmIChzaXplID49IG1heE1lbW9yeUxpbWl0KSB7XG4gICAgICBsb2cuaW5mbyhgVGhlIGZpbGUgbWlnaHQgYmUgdG9vIGxhcmdlIHRvIGZpdCBpbnRvIHRoZSBwcm9jZXNzIG1lbW9yeSBgICtcbiAgICAgICAgYCgke3V0aWwudG9SZWFkYWJsZVNpemVTdHJpbmcoc2l6ZSl9ID49ICR7dXRpbC50b1JlYWRhYmxlU2l6ZVN0cmluZyhtYXhNZW1vcnlMaW1pdCl9KS4gYCArXG4gICAgICAgIGBQcm92aWRlIGEgbGluayB0byBhIHJlbW90ZSB3cml0YWJsZSBsb2NhdGlvbiBmb3IgdmlkZW8gdXBsb2FkIGAgK1xuICAgICAgICBgKGh0dHAocykgYW5kIGZ0cCBwcm90b2NvbHMgYXJlIHN1cHBvcnRlZCkgaWYgeW91IGV4cGVyaWVuY2UgT3V0IE9mIE1lbW9yeSBlcnJvcnNgKTtcbiAgICB9XG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IGZzLnJlYWRGaWxlKGxvY2FsRmlsZSk7XG4gICAgcmV0dXJuIGNvbnRlbnQudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICB9XG5cbiAgY29uc3QgcmVtb3RlVXJsID0gdXJsLnBhcnNlKHJlbW90ZVBhdGgpO1xuICBsZXQgb3B0aW9ucyA9IHt9O1xuICBjb25zdCB7dXNlciwgcGFzcywgbWV0aG9kfSA9IHVwbG9hZE9wdGlvbnM7XG4gIGlmIChyZW1vdGVVcmwucHJvdG9jb2wuc3RhcnRzV2l0aCgnaHR0cCcpKSB7XG4gICAgb3B0aW9ucyA9IHtcbiAgICAgIHVybDogcmVtb3RlVXJsLmhyZWYsXG4gICAgICBtZXRob2Q6IG1ldGhvZCB8fCAnUFVUJyxcbiAgICAgIG11bHRpcGFydDogW3sgYm9keTogX2ZzLmNyZWF0ZVJlYWRTdHJlYW0obG9jYWxGaWxlKSB9XSxcbiAgICB9O1xuICAgIGlmICh1c2VyICYmIHBhc3MpIHtcbiAgICAgIG9wdGlvbnMuYXV0aCA9IHt1c2VyLCBwYXNzfTtcbiAgICB9XG4gIH0gZWxzZSBpZiAocmVtb3RlVXJsLnByb3RvY29sID09PSAnZnRwOicpIHtcbiAgICBvcHRpb25zID0ge1xuICAgICAgaG9zdDogcmVtb3RlVXJsLmhvc3RuYW1lLFxuICAgICAgcG9ydDogcmVtb3RlVXJsLnBvcnQgfHwgMjEsXG4gICAgfTtcbiAgICBpZiAodXNlciAmJiBwYXNzKSB7XG4gICAgICBvcHRpb25zLnVzZXIgPSB1c2VyO1xuICAgICAgb3B0aW9ucy5wYXNzID0gcGFzcztcbiAgICB9XG4gIH1cbiAgYXdhaXQgbmV0LnVwbG9hZEZpbGUobG9jYWxGaWxlLCByZW1vdGVQYXRoLCBvcHRpb25zKTtcbiAgcmV0dXJuICcnO1xufVxuXG4vKipcbiAqIFN0b3BzIGFuZCByZW1vdmVzIGFsbCB3ZWIgc29ja2V0IGhhbmRsZXJzIHRoYXQgYXJlIGxpc3RlbmluZ1xuICogaW4gc2NvcGUgb2YgdGhlIGN1cnJlY3Qgc2Vzc2lvbi5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gc2VydmVyIC0gVGhlIGluc3RhbmNlIG9mIE5vZGVKcyBIVFRQIHNlcnZlcixcbiAqIHdoaWNoIGhvc3RzIEFwcGl1bVxuICogQHBhcmFtIHtzdHJpbmd9IHNlc3Npb25JZCAtIFRoZSBpZCBvZiB0aGUgY3VycmVudCBzZXNzaW9uXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHJlbW92ZUFsbFNlc3Npb25XZWJTb2NrZXRIYW5kbGVycyAoc2VydmVyLCBzZXNzaW9uSWQpIHtcbiAgaWYgKCFzZXJ2ZXIgfHwgIV8uaXNGdW5jdGlvbihzZXJ2ZXIuZ2V0V2ViU29ja2V0SGFuZGxlcnMpKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYWN0aXZlSGFuZGxlcnMgPSBhd2FpdCBzZXJ2ZXIuZ2V0V2ViU29ja2V0SGFuZGxlcnMoc2Vzc2lvbklkKTtcbiAgZm9yIChjb25zdCBwYXRobmFtZSBvZiBfLmtleXMoYWN0aXZlSGFuZGxlcnMpKSB7XG4gICAgYXdhaXQgc2VydmVyLnJlbW92ZVdlYlNvY2tldEhhbmRsZXIocGF0aG5hbWUpO1xuICB9XG59XG5cbi8qKlxuICogVmVyaWZ5IHdoZXRoZXIgdGhlIGdpdmVuIGFwcGxpY2F0aW9uIGlzIGNvbXBhdGlibGUgdG8gdGhlXG4gKiBwbGF0Zm9ybSB3aGVyZSBpdCBpcyBnb2luZyB0byBiZSBpbnN0YWxsZWQgYW5kIHRlc3RlZC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYXBwIC0gVGhlIGFjdHVhbCBwYXRoIHRvIHRoZSBhcHBsaWNhdGlvbiBidW5kbGVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNTaW11bGF0b3IgLSBTaG91bGQgYmUgc2V0IHRvIGB0cnVlYCBpZiB0aGUgdGVzdCB3aWxsIGJlIGV4ZWN1dGVkIG9uIFNpbXVsYXRvclxuICogQHJldHVybnMgez9ib29sZWFufSBUaGUgZnVuY3Rpb24gcmV0dXJucyBgbnVsbGAgaWYgdGhlIGFwcGxpY2F0aW9uIGRvZXMgbm90IGV4aXN0IG9yIHRoZXJlIGlzIG5vXG4gKiBgQ0ZCdW5kbGVTdXBwb3J0ZWRQbGF0Zm9ybXNgIGtleSBpbiBpdHMgSW5mby5wbGlzdCBtYW5pZmVzdC5cbiAqIGB0cnVlYCBpcyByZXR1cm5lZCBpZiB0aGUgYnVuZGxlIGFyY2hpdGVjdHVyZSBtYXRjaGVzIHRoZSBkZXZpY2UgYXJjaGl0ZWN0dXJlLlxuICogQHRocm93cyB7RXJyb3J9IElmIGJ1bmRsZSBhcmNoaXRlY3R1cmUgZG9lcyBub3QgbWF0Y2ggdGhlIGRldmljZSBhcmNoaXRlY3R1cmUuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHZlcmlmeUFwcGxpY2F0aW9uUGxhdGZvcm0gKGFwcCwgaXNTaW11bGF0b3IpIHtcbiAgbG9nLmRlYnVnKCdWZXJpZnlpbmcgYXBwbGljYXRpb24gcGxhdGZvcm0nKTtcblxuICBjb25zdCBpbmZvUGxpc3QgPSBwYXRoLnJlc29sdmUoYXBwLCAnSW5mby5wbGlzdCcpO1xuICBpZiAoIWF3YWl0IGZzLmV4aXN0cyhpbmZvUGxpc3QpKSB7XG4gICAgbG9nLmRlYnVnKGAnJHtpbmZvUGxpc3R9JyBkb2VzIG5vdCBleGlzdGApO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3Qge0NGQnVuZGxlU3VwcG9ydGVkUGxhdGZvcm1zfSA9IGF3YWl0IHBsaXN0LnBhcnNlUGxpc3RGaWxlKGluZm9QbGlzdCk7XG4gIGxvZy5kZWJ1ZyhgQ0ZCdW5kbGVTdXBwb3J0ZWRQbGF0Zm9ybXM6ICR7SlNPTi5zdHJpbmdpZnkoQ0ZCdW5kbGVTdXBwb3J0ZWRQbGF0Zm9ybXMpfWApO1xuICBpZiAoIV8uaXNBcnJheShDRkJ1bmRsZVN1cHBvcnRlZFBsYXRmb3JtcykpIHtcbiAgICBsb2cuZGVidWcoYENGQnVuZGxlU3VwcG9ydGVkUGxhdGZvcm1zIGtleSBkb2VzIG5vdCBleGlzdCBpbiAnJHtpbmZvUGxpc3R9J2ApO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgaXNBcHBTdXBwb3J0ZWQgPSAoaXNTaW11bGF0b3IgJiYgQ0ZCdW5kbGVTdXBwb3J0ZWRQbGF0Zm9ybXMuaW5jbHVkZXMoJ2lQaG9uZVNpbXVsYXRvcicpKVxuICAgIHx8ICghaXNTaW11bGF0b3IgJiYgQ0ZCdW5kbGVTdXBwb3J0ZWRQbGF0Zm9ybXMuaW5jbHVkZXMoJ2lQaG9uZU9TJykpO1xuICBpZiAoaXNBcHBTdXBwb3J0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoYCR7aXNTaW11bGF0b3IgPyAnU2ltdWxhdG9yJyA6ICdSZWFsIGRldmljZSd9IGFyY2hpdGVjdHVyZSBpcyB1bnN1cHBvcnRlZCBieSB0aGUgJyR7YXBwfScgYXBwbGljYXRpb24uIGAgK1xuICAgICAgICAgICAgICAgICAgYE1ha2Ugc3VyZSB0aGUgY29ycmVjdCBkZXBsb3ltZW50IHRhcmdldCBoYXMgYmVlbiBzZWxlY3RlZCBmb3IgaXRzIGNvbXBpbGF0aW9uIGluIFhjb2RlLmApO1xufVxuXG5leHBvcnQgeyBkZXRlY3RVZGlkLCBnZXRBbmRDaGVja1hjb2RlVmVyc2lvbiwgZ2V0QW5kQ2hlY2tJb3NTZGtWZXJzaW9uLFxuICBhZGp1c3RXREFBdHRhY2htZW50c1Blcm1pc3Npb25zLCBjaGVja0FwcFByZXNlbnQsIGdldERyaXZlckluZm8sXG4gIGNsZWFyU3lzdGVtRmlsZXMsIHRyYW5zbGF0ZURldmljZU5hbWUsIG5vcm1hbGl6ZUNvbW1hbmRUaW1lb3V0cyxcbiAgREVGQVVMVF9USU1FT1VUX0tFWSwgcmVzZXRYQ1Rlc3RQcm9jZXNzZXMsIGdldFBpZFVzaW5nUGF0dGVybixcbiAgbWFya1N5c3RlbUZpbGVzRm9yQ2xlYW51cCwgcHJpbnRVc2VyLCBwcmludExpYmltb2JpbGVkZXZpY2VJbmZvLFxuICBnZXRQSURzTGlzdGVuaW5nT25Qb3J0LCBlbmNvZGVCYXNlNjRPclVwbG9hZCwgcmVtb3ZlQWxsU2Vzc2lvbldlYlNvY2tldEhhbmRsZXJzLFxuICB2ZXJpZnlBcHBsaWNhdGlvblBsYXRmb3JtIH07XG4iXSwiZmlsZSI6ImxpYi91dGlscy5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLiJ9
