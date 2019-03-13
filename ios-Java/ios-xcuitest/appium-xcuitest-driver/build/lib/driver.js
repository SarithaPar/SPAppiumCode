"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.XCUITestDriver = exports.default = void 0;

require("source-map-support/register");

var _appiumBaseDriver = require("appium-base-driver");

var _appiumSupport = require("appium-support");

var _lodash = _interopRequireDefault(require("lodash"));

var _url = _interopRequireDefault(require("url"));

var _nodeSimctl = require("node-simctl");

var _webdriveragent = _interopRequireDefault(require("./wda/webdriveragent"));

var _logger = _interopRequireDefault(require("./logger"));

var _simulatorManagement = require("./simulator-management");

var _appiumIosSimulator = require("appium-ios-simulator");

var _asyncbox = require("asyncbox");

var _appiumIosDriver = require("appium-ios-driver");

var _desiredCaps = _interopRequireDefault(require("./desired-caps"));

var _index = _interopRequireDefault(require("./commands/index"));

var _utils = require("./utils");

var _realDeviceManagement = require("./real-device-management");

var _bluebird = _interopRequireDefault(require("bluebird"));

var _asyncLock = _interopRequireDefault(require("async-lock"));

const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const WDA_SIM_STARTUP_RETRIES = 2;
const WDA_REAL_DEV_STARTUP_RETRIES = 1;
const WDA_REAL_DEV_TUTORIAL_URL = 'https://github.com/appium/appium-xcuitest-driver/blob/master/docs/real-device-config.md';
const WDA_STARTUP_RETRY_INTERVAL = 10000;
const DEFAULT_SETTINGS = {
  nativeWebTap: false,
  useJSONSource: false,
  shouldUseCompactResponses: true,
  elementResponseAttributes: "type,label",
  mjpegServerScreenshotQuality: 25,
  mjpegServerFramerate: 10,
  screenshotQuality: 1
};
const SHARED_RESOURCES_GUARD = new _asyncLock.default();
const NO_PROXY_NATIVE_LIST = [['DELETE', /window/], ['GET', /^\/session\/[^\/]+$/], ['GET', /alert_text/], ['GET', /alert\/[^\/]+/], ['GET', /appium/], ['GET', /attribute/], ['GET', /context/], ['GET', /location/], ['GET', /log/], ['GET', /screenshot/], ['GET', /size/], ['GET', /source/], ['GET', /url/], ['GET', /window/], ['POST', /accept_alert/], ['POST', /actions$/], ['POST', /alert_text/], ['POST', /alert\/[^\/]+/], ['POST', /appium/], ['POST', /appium\/device\/is_locked/], ['POST', /appium\/device\/lock/], ['POST', /appium\/device\/unlock/], ['POST', /back/], ['POST', /clear/], ['POST', /context/], ['POST', /dismiss_alert/], ['POST', /element$/], ['POST', /elements$/], ['POST', /execute/], ['POST', /keys/], ['POST', /log/], ['POST', /moveto/], ['POST', /receive_async_response/], ['POST', /session\/[^\/]+\/location/], ['POST', /shake/], ['POST', /timeouts/], ['POST', /touch/], ['POST', /url/], ['POST', /value/], ['POST', /window/]];
const NO_PROXY_WEB_LIST = [['DELETE', /cookie/], ['GET', /attribute/], ['GET', /cookie/], ['GET', /element/], ['GET', /text/], ['GET', /title/], ['POST', /clear/], ['POST', /click/], ['POST', /cookie/], ['POST', /element/], ['POST', /forward/], ['POST', /frame/], ['POST', /keys/], ['POST', /refresh/]].concat(NO_PROXY_NATIVE_LIST);
const MEMOIZED_FUNCTIONS = ['getWindowSizeNative', 'getWindowSizeWeb', 'getStatusBarHeight', 'getDevicePixelRatio', 'getScreenInfo', 'getSafariIsIphone', 'getSafariIsIphoneX'];

class XCUITestDriver extends _appiumBaseDriver.BaseDriver {
  constructor(opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);
    this.desiredCapConstraints = _desiredCaps.default;
    this.locatorStrategies = ['xpath', 'id', 'name', 'class name', '-ios predicate string', '-ios class chain', 'accessibility id'];
    this.webLocatorStrategies = ['link text', 'css selector', 'tag name', 'link text', 'partial link text'];
    this.resetIos();
    this.settings = new _appiumBaseDriver.DeviceSettings(DEFAULT_SETTINGS, this.onSettingsUpdate.bind(this));

    for (const fn of MEMOIZED_FUNCTIONS) {
      this[fn] = _lodash.default.memoize(this[fn]);
    }
  }

  async onSettingsUpdate(key, value) {
    if (key !== 'nativeWebTap') {
      return await this.proxyCommand('/appium/settings', 'POST', {
        settings: {
          [key]: value
        }
      });
    }

    this.opts.nativeWebTap = !!value;
  }

  resetIos() {
    this.opts = this.opts || {};
    this.wda = null;
    this.opts.device = null;
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    this.jwpProxyAvoid = [];
    this.safari = false;
    this.cachedWdaStatus = null;
    this.curWebFrames = [];
    this.webElementIds = [];
    this._currentUrl = null;
    this.curContext = null;
    this.xcodeVersion = {};
    this.iosSdkVersion = null;
    this.contexts = [];
    this.implicitWaitMs = 0;
    this.asynclibWaitMs = 0;
    this.pageLoadMs = 6000;
    this.landscapeWebCoordsOffset = 0;
  }

  get driverData() {
    return {};
  }

  async getStatus() {
    if (typeof this.driverInfo === 'undefined') {
      this.driverInfo = await (0, _utils.getDriverInfo)();
    }

    let status = {
      build: {
        version: this.driverInfo.version
      }
    };

    if (this.cachedWdaStatus) {
      status.wda = this.cachedWdaStatus;
    }

    return status;
  }

  async createSession(...args) {
    this.lifecycleData = {};

    try {
      let [sessionId, caps] = await super.createSession(...args);
      this.opts.sessionId = sessionId;
      await this.start();
      caps = Object.assign({}, _appiumIosDriver.defaultServerCaps, caps);
      caps.udid = this.opts.udid;

      if (_lodash.default.has(this.opts, 'nativeWebTap')) {
        await this.updateSettings({
          nativeWebTap: this.opts.nativeWebTap
        });
      }

      if (_lodash.default.has(this.opts, 'useJSONSource')) {
        await this.updateSettings({
          useJSONSource: this.opts.useJSONSource
        });
      }

      let wdaSettings = {
        elementResponseAttributes: DEFAULT_SETTINGS.elementResponseAttributes,
        shouldUseCompactResponses: DEFAULT_SETTINGS.shouldUseCompactResponses
      };

      if (_lodash.default.has(this.opts, 'elementResponseAttributes')) {
        wdaSettings.elementResponseAttributes = this.opts.elementResponseAttributes;
      }

      if (_lodash.default.has(this.opts, 'shouldUseCompactResponses')) {
        wdaSettings.shouldUseCompactResponses = this.opts.shouldUseCompactResponses;
      }

      if (_lodash.default.has(this.opts, 'mjpegServerScreenshotQuality')) {
        wdaSettings.mjpegServerScreenshotQuality = this.opts.mjpegServerScreenshotQuality;
      }

      if (_lodash.default.has(this.opts, 'mjpegServerFramerate')) {
        wdaSettings.mjpegServerFramerate = this.opts.mjpegServerFramerate;
      }

      if (this.opts.screenshotQuality) {
        _logger.default.info(`Setting the quality of phone screenshot: '${this.opts.screenshotQuality}'`);

        wdaSettings.screenshotQuality = this.opts.screenshotQuality;
      }

      await this.updateSettings(wdaSettings);

      if (this.opts.mjpegScreenshotUrl) {
        _logger.default.info(`Starting MJPEG stream reading URL: '${this.opts.mjpegScreenshotUrl}'`);

        this.mjpegStream = new _appiumSupport.mjpeg.MJpegStream(this.opts.mjpegScreenshotUrl);
        await this.mjpegStream.start();
      }

      return [sessionId, caps];
    } catch (e) {
      _logger.default.error(e);

      await this.deleteSession();
      throw e;
    }
  }

  async start() {
    this.opts.noReset = !!this.opts.noReset;
    this.opts.fullReset = !!this.opts.fullReset;
    await (0, _utils.printUser)();

    if (this.opts.platformVersion && parseFloat(this.opts.platformVersion) < 9.3) {
      throw Error(`Platform version must be 9.3 or above. '${this.opts.platformVersion}' is not supported.`);
    }

    const {
      device,
      udid,
      realDevice
    } = await this.determineDevice();

    _logger.default.info(`Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`);

    this.opts.device = device;
    this.opts.udid = udid;
    this.opts.realDevice = realDevice;

    if (_lodash.default.isEmpty(this.xcodeVersion) && (!this.opts.webDriverAgentUrl || !this.opts.realDevice)) {
      this.xcodeVersion = await (0, _utils.getAndCheckXcodeVersion)();
      const tools = !this.xcodeVersion.toolsVersion ? '' : `(tools v${this.xcodeVersion.toolsVersion})`;

      _logger.default.debug(`Xcode version set to '${this.xcodeVersion.versionString}' ${tools}`);

      this.iosSdkVersion = await (0, _utils.getAndCheckIosSdkVersion)();

      _logger.default.debug(`iOS SDK Version set to '${this.iosSdkVersion}'`);
    }

    this.logEvent('xcodeDetailsRetrieved');

    if (this.opts.enableAsyncExecuteFromHttps && !this.isRealDevice()) {
      await (0, _simulatorManagement.shutdownSimulator)(this.opts.device);
      await this.startHttpsAsyncServer();
    }

    if (!this.opts.platformVersion) {
      if (this.opts.device && _lodash.default.isFunction(this.opts.device.getPlatformVersion)) {
        this.opts.platformVersion = await this.opts.device.getPlatformVersion();

        _logger.default.info(`No platformVersion specified. Using device version: '${this.opts.platformVersion}'`);
      } else {}
    }

    if (!this.opts.webDriverAgentUrl && this.iosSdkVersion) {
      if (parseFloat(this.opts.platformVersion) > parseFloat(this.iosSdkVersion)) {
        let msg = `Xcode ${this.xcodeVersion.versionString} has a maximum SDK version of ${this.iosSdkVersion}. ` + `It does not support iOS version ${this.opts.platformVersion}`;

        _logger.default.errorAndThrow(msg);
      }
    } else {
      _logger.default.debug('Xcode version will not be validated against iOS SDK version.');
    }

    if ((this.opts.browserName || '').toLowerCase() === 'safari') {
      _logger.default.info('Safari test requested');

      this.safari = true;
      this.opts.app = undefined;
      this.opts.processArguments = this.opts.processArguments || {};
      this.opts.bundleId = SAFARI_BUNDLE_ID;
      this._currentUrl = this.opts.safariInitialUrl || (this.isRealDevice() ? 'http://appium.io' : `http://${this.opts.address}:${this.opts.port}/welcome`);
      this.opts.processArguments.args = ['-u', this._currentUrl];
    } else {
      await this.configureApp();
    }

    this.logEvent('appConfigured');

    if (this.opts.app) {
      await (0, _utils.checkAppPresent)(this.opts.app);
    }

    if (!this.opts.bundleId) {
      this.opts.bundleId = await _appiumIosDriver.appUtils.extractBundleId(this.opts.app);
    }

    await this.runReset();

    const startLogCapture = async () => {
      const result = await this.startLogCapture();

      if (result) {
        this.logEvent('logCaptureStarted');
      }

      return result;
    };

    const isLogCaptureStarted = await startLogCapture();

    _logger.default.info(`Setting up ${this.isRealDevice() ? 'real device' : 'simulator'}`);

    if (this.isSimulator()) {
      if (this.opts.shutdownOtherSimulators) {
        if (!this.relaxedSecurityEnabled) {
          _logger.default.errorAndThrow(`Appium server must have relaxed security flag set in order ` + `for 'shutdownOtherSimulators' capability to work`);
        }

        await (0, _simulatorManagement.shutdownOtherSimulators)(this.opts.device);
      }

      if (_appiumSupport.util.hasValue(this.opts.reduceMotion)) {
        await this.opts.device.setReduceMotion(this.opts.reduceMotion);
      }

      this.localConfig = await _appiumIosDriver.settings.setLocaleAndPreferences(this.opts.device, this.opts, this.isSafari(), async sim => {
        await (0, _simulatorManagement.shutdownSimulator)(sim);
        await _appiumIosDriver.settings.setLocaleAndPreferences(sim, this.opts, this.isSafari());
      });
      await this.startSim();

      if (this.opts.customSSLCert) {
        if (await (0, _appiumIosSimulator.hasSSLCert)(this.opts.customSSLCert, this.opts.udid)) {
          _logger.default.info(`SSL cert '${_lodash.default.truncate(this.opts.customSSLCert, {
            length: 20
          })}' already installed`);
        } else {
          _logger.default.info(`Installing ssl cert '${_lodash.default.truncate(this.opts.customSSLCert, {
            length: 20
          })}'`);

          await (0, _simulatorManagement.shutdownSimulator)(this.opts.device);
          await (0, _appiumIosSimulator.installSSLCert)(this.opts.customSSLCert, this.opts.udid);

          _logger.default.info(`Restarting Simulator so that SSL certificate installation takes effect`);

          await this.startSim();
          this.logEvent('customCertInstalled');
        }
      }

      this.logEvent('simStarted');

      if (!isLogCaptureStarted) {
        await startLogCapture();
      }
    }

    if (this.opts.app) {
      await this.installAUT();
      this.logEvent('appInstalled');
    }

    if (!this.opts.app && this.opts.bundleId && !this.safari) {
      if (!(await this.opts.device.isAppInstalled(this.opts.bundleId))) {
        _logger.default.errorAndThrow(`App with bundle identifier '${this.opts.bundleId}' unknown`);
      }
    }

    if (this.opts.permissions) {
      if (this.isSimulator()) {
        _logger.default.debug('Setting the requested permissions before WDA is started');

        for (const [bundleId, permissionsMapping] of _lodash.default.toPairs(JSON.parse(this.opts.permissions))) {
          await this.opts.device.setPermissions(bundleId, permissionsMapping);
        }
      } else {
        _logger.default.warn('Setting permissions is only supported on Simulator. ' + 'The "permissions" capability will be ignored.');
      }
    }

    await SHARED_RESOURCES_GUARD.acquire(XCUITestDriver.name, async () => await this.startWda(this.opts.sessionId, realDevice));
    await this.setInitialOrientation(this.opts.orientation);
    this.logEvent('orientationSet');

    if (this.isRealDevice() && this.opts.startIWDP) {
      try {
        await this.startIWDP();

        _logger.default.debug(`Started ios_webkit_debug proxy server at: ${this.iwdpServer.endpoint}`);
      } catch (err) {
        _logger.default.errorAndThrow(`Could not start ios_webkit_debug_proxy server: ${err.message}`);
      }
    }

    if (this.isSafari() || this.opts.autoWebview) {
      _logger.default.debug('Waiting for initial webview');

      await this.navToInitialWebview();
      this.logEvent('initialWebviewNavigated');
    }

    if (!this.isRealDevice()) {
      if (this.opts.calendarAccessAuthorized) {
        await this.opts.device.enableCalendarAccess(this.opts.bundleId);
      } else if (this.opts.calendarAccessAuthorized === false) {
        await this.opts.device.disableCalendarAccess(this.opts.bundleId);
      }
    }
  }

  async startWda(sessionId, realDevice) {
    this.wda = new _webdriveragent.default(this.xcodeVersion, this.opts);
    await this.wda.cleanupObsoleteProcesses();

    if (this.opts.useNewWDA) {
      _logger.default.debug(`Capability 'useNewWDA' set to true, so uninstalling WDA before proceeding`);

      await this.wda.quitAndUninstall();
      this.logEvent('wdaUninstalled');
    } else if (!_appiumSupport.util.hasValue(this.wda.webDriverAgentUrl)) {
      await this.wda.setupCaching(this.opts.updatedWDABundleId);
    }

    const quitAndUninstall = async msg => {
      _logger.default.debug(msg);

      if (this.opts.webDriverAgentUrl) {
        _logger.default.debug('Not quitting and unsinstalling WebDriverAgent as webDriverAgentUrl is provided');

        throw new Error(msg);
      }

      _logger.default.warn('Quitting and uninstalling WebDriverAgent, then retrying');

      await this.wda.quitAndUninstall();
      throw new Error(msg);
    };

    const startupRetries = this.opts.wdaStartupRetries || (this.isRealDevice() ? WDA_REAL_DEV_STARTUP_RETRIES : WDA_SIM_STARTUP_RETRIES);
    const startupRetryInterval = this.opts.wdaStartupRetryInterval || WDA_STARTUP_RETRY_INTERVAL;

    _logger.default.debug(`Trying to start WebDriverAgent ${startupRetries} times with ${startupRetryInterval}ms interval`);

    await (0, _asyncbox.retryInterval)(startupRetries, startupRetryInterval, async () => {
      this.logEvent('wdaStartAttempted');

      try {
        const retries = this.xcodeVersion.major >= 10 ? 2 : 1;
        this.cachedWdaStatus = await (0, _asyncbox.retry)(retries, this.wda.launch.bind(this.wda), sessionId, realDevice);
      } catch (err) {
        this.logEvent('wdaStartFailed');
        let errorMsg = `Unable to launch WebDriverAgent because of xcodebuild failure: "${err.message}".`;

        if (this.isRealDevice()) {
          errorMsg += ` Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}. ` + `Try to remove the WebDriverAgentRunner application from the device if it is installed ` + `and reboot the device.`;
        }

        await quitAndUninstall(errorMsg);
      }

      this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
      this.jwpProxyActive = true;

      try {
        await (0, _asyncbox.retryInterval)(15, 1000, async () => {
          this.logEvent('wdaSessionAttempted');

          _logger.default.debug('Sending createSession command to WDA');

          try {
            this.cachedWdaStatus = this.cachedWdaStatus || (await this.proxyCommand('/status', 'GET'));
            await this.startWdaSession(this.opts.bundleId, this.opts.processArguments);
          } catch (err) {
            _logger.default.debug(`Failed to create WDA session (${err.message}). Retrying...`);

            throw err;
          }
        });
        this.logEvent('wdaSessionStarted');
      } catch (err) {
        let errorMsg = `Unable to start WebDriverAgent session because of xcodebuild failure: ${err.message}`;

        if (this.isRealDevice()) {
          errorMsg += ` Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}. ` + `Try to remove the WebDriverAgentRunner application from the device if it is installed ` + `and reboot the device.`;
        }

        await quitAndUninstall(errorMsg);
      }

      if (!_appiumSupport.util.hasValue(this.opts.preventWDAAttachments)) {
        this.opts.preventWDAAttachments = this.xcodeVersion.major < 9;

        if (this.opts.preventWDAAttachments) {
          _logger.default.info('Enabled WDA attachments prevention by default to save the disk space. ' + `Set 'preventWDAAttachments' capability to false if this is an undesired behavior.`);
        }
      }

      if (this.opts.preventWDAAttachments) {
        await (0, _utils.adjustWDAAttachmentsPermissions)(this.wda, this.opts.preventWDAAttachments ? '555' : '755');
        this.logEvent('wdaPermsAdjusted');
      }

      if (this.opts.clearSystemFiles) {
        await (0, _utils.markSystemFilesForCleanup)(this.wda);
      }

      this.wda.fullyStarted = true;
      this.logEvent('wdaStarted');
    });
  }

  async runReset(opts = null) {
    this.logEvent('resetStarted');

    if (this.isRealDevice()) {
      await (0, _realDeviceManagement.runRealDeviceReset)(this.opts.device, opts || this.opts);
    } else {
      await (0, _simulatorManagement.runSimulatorReset)(this.opts.device, opts || this.opts);
    }

    this.logEvent('resetComplete');
  }

  async deleteSession() {
    await (0, _utils.removeAllSessionWebSocketHandlers)(this.server, this.sessionId);
    await SHARED_RESOURCES_GUARD.acquire(XCUITestDriver.name, async () => {
      await this.stop();

      if (this.opts.preventWDAAttachments) {
        await (0, _utils.adjustWDAAttachmentsPermissions)(this.wda, '755');
      }

      if (this.opts.clearSystemFiles) {
        if (this.isAppTemporary) {
          await _appiumSupport.fs.rimraf(this.opts.app);
        }

        await (0, _utils.clearSystemFiles)(this.wda, !!this.opts.showXcodeLog);
      } else {
        _logger.default.debug('Not clearing log files. Use `clearSystemFiles` capability to turn on.');
      }
    });

    if (this.isWebContext()) {
      _logger.default.debug('In a web session. Removing remote debugger');

      await this.stopRemote();
    }

    if (this.opts.resetOnSessionStartOnly === false) {
      await this.runReset();
    }

    if (this.isSimulator() && !this.opts.noReset && !!this.opts.device) {
      if (this.lifecycleData.createSim) {
        _logger.default.debug(`Deleting simulator created for this run (udid: '${this.opts.udid}')`);

        await (0, _simulatorManagement.shutdownSimulator)(this.opts.device);
        await this.opts.device.delete();
      }
    }

    if (!_lodash.default.isEmpty(this.logs)) {
      await this.logs.syslog.stopCapture();
      this.logs = {};
    }

    if (this.iwdpServer) {
      await this.stopIWDP();
    }

    if (this.opts.enableAsyncExecuteFromHttps && !this.isRealDevice()) {
      await this.stopHttpsAsyncServer();
    }

    if (this.mjpegStream) {
      _logger.default.info('Closing MJPEG stream');

      this.mjpegStream.stop();
    }

    this.resetIos();
    await super.deleteSession();
  }

  async stop() {
    this.jwpProxyActive = false;
    this.proxyReqRes = null;

    if (this.wda && this.wda.fullyStarted) {
      if (this.wda.jwproxy) {
        try {
          await this.proxyCommand(`/session/${this.sessionId}`, 'DELETE');
        } catch (err) {
          _logger.default.debug(`Unable to DELETE session on WDA: '${err.message}'. Continuing shutdown.`);
        }
      }

      if (this.wda && !this.wda.webDriverAgentUrl && this.opts.useNewWDA) {
        await this.wda.quit();
      }
    }
  }

  async executeCommand(cmd, ...args) {
    _logger.default.debug(`Executing command '${cmd}'`);

    if (cmd === 'receiveAsyncResponse') {
      return await this.receiveAsyncResponse(...args);
    }

    if (cmd === 'getStatus') {
      return await this.getStatus();
    }

    return await super.executeCommand(cmd, ...args);
  }

  async configureApp() {
    function appIsPackageOrBundle(app) {
      return /^([a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+)+$/.test(app);
    }

    if (!this.opts.bundleId && appIsPackageOrBundle(this.opts.app)) {
      this.opts.bundleId = this.opts.app;
      this.opts.app = '';
    }

    if (this.opts.bundleId && appIsPackageOrBundle(this.opts.bundleId) && (this.opts.app === '' || appIsPackageOrBundle(this.opts.app))) {
      _logger.default.debug('App is an iOS bundle, will attempt to run as pre-existing');

      return;
    }

    if (this.opts.app && this.opts.app.toLowerCase() === 'settings') {
      this.opts.bundleId = 'com.apple.Preferences';
      this.opts.app = null;
      return;
    } else if (this.opts.app && this.opts.app.toLowerCase() === 'calendar') {
      this.opts.bundleId = 'com.apple.mobilecal';
      this.opts.app = null;
      return;
    }

    const originalAppPath = this.opts.app;

    try {
      this.opts.app = await this.helpers.configureApp(this.opts.app, '.app', this.opts.mountRoot, this.opts.windowsShareUserName, this.opts.windowsSharePassword);
    } catch (err) {
      _logger.default.error(err);

      throw new Error(`Bad app: ${this.opts.app}. App paths need to be absolute, or relative to the appium ` + 'server install dir, or a URL to compressed file, or a special app name.');
    }

    this.isAppTemporary = this.opts.app && originalAppPath !== this.opts.app;
  }

  async determineDevice() {
    this.lifecycleData.createSim = false;
    this.opts.deviceName = (0, _utils.translateDeviceName)(this.opts.platformVersion, this.opts.deviceName);

    if (this.opts.udid) {
      if (this.opts.udid.toLowerCase() === 'auto') {
        try {
          this.opts.udid = await (0, _utils.detectUdid)();
        } catch (err) {
          _logger.default.warn(`Cannot detect any connected real devices. Falling back to Simulator. Original error: ${err.message}`);

          const device = await (0, _simulatorManagement.getExistingSim)(this.opts);

          if (!device) {
            _logger.default.errorAndThrow(`Cannot detect udid for ${this.opts.deviceName} Simulator running iOS ${this.opts.platformVersion}`);
          }

          this.opts.udid = device.udid;
          return {
            device,
            realDevice: false,
            udid: device.udid
          };
        }
      } else {
        const devices = await (0, _realDeviceManagement.getConnectedDevices)();

        _logger.default.debug(`Available devices: ${devices.join(', ')}`);

        if (!devices.includes(this.opts.udid)) {
          if (await (0, _appiumIosSimulator.simExists)(this.opts.udid)) {
            const device = await (0, _appiumIosSimulator.getSimulator)(this.opts.udid);
            return {
              device,
              realDevice: false,
              udid: this.opts.udid
            };
          }

          throw new Error(`Unknown device or simulator UDID: '${this.opts.udid}'`);
        }
      }

      const device = await (0, _realDeviceManagement.getRealDeviceObj)(this.opts.udid);
      return {
        device,
        realDevice: true,
        udid: this.opts.udid
      };
    }

    let device = await (0, _simulatorManagement.getExistingSim)(this.opts);

    if (device) {
      return {
        device,
        realDevice: false,
        udid: device.udid
      };
    }

    _logger.default.info('Simulator udid not provided, using desired caps to create a new simulator');

    if (!this.opts.platformVersion && this.iosSdkVersion) {
      _logger.default.info(`No platformVersion specified. Using latest version Xcode supports: '${this.iosSdkVersion}' ` + `This may cause problems if a simulator does not exist for this platform version.`);

      this.opts.platformVersion = this.iosSdkVersion;
    }

    if (this.opts.noReset) {
      let device = await (0, _simulatorManagement.getExistingSim)(this.opts);

      if (device) {
        return {
          device,
          realDevice: false,
          udid: device.udid
        };
      }
    }

    device = await this.createSim();
    return {
      device,
      realDevice: false,
      udid: device.udid
    };
  }

  async startSim() {
    const runOpts = {
      scaleFactor: this.opts.scaleFactor,
      connectHardwareKeyboard: !!this.opts.connectHardwareKeyboard,
      isHeadless: !!this.opts.isHeadless,
      devicePreferences: {}
    };

    if (this.opts.SimulatorWindowCenter) {
      runOpts.devicePreferences.SimulatorWindowCenter = this.opts.SimulatorWindowCenter;
    }

    const orientation = _lodash.default.isString(this.opts.orientation) && this.opts.orientation.toUpperCase();

    switch (orientation) {
      case 'LANDSCAPE':
        runOpts.devicePreferences.SimulatorWindowOrientation = 'LandscapeLeft';
        runOpts.devicePreferences.SimulatorWindowRotationAngle = 90;
        break;

      case 'PORTRAIT':
        runOpts.devicePreferences.SimulatorWindowOrientation = 'Portrait';
        runOpts.devicePreferences.SimulatorWindowRotationAngle = 0;
        break;
    }

    await this.opts.device.run(runOpts);
  }

  async createSim() {
    this.lifecycleData.createSim = true;
    let sim = await (0, _simulatorManagement.createSim)(this.opts);

    _logger.default.info(`Created simulator with udid '${sim.udid}'.`);

    return sim;
  }

  async launchApp() {
    const APP_LAUNCH_TIMEOUT = 20 * 1000;
    this.logEvent('appLaunchAttempted');
    await (0, _nodeSimctl.launch)(this.opts.device.udid, this.opts.bundleId);

    let checkStatus = async () => {
      let response = await this.proxyCommand('/status', 'GET');
      let currentApp = response.currentApp.bundleID;

      if (currentApp !== this.opts.bundleId) {
        throw new Error(`${this.opts.bundleId} not in foreground. ${currentApp} is in foreground`);
      }
    };

    _logger.default.info(`Waiting for '${this.opts.bundleId}' to be in foreground`);

    let retries = parseInt(APP_LAUNCH_TIMEOUT / 200, 10);
    await (0, _asyncbox.retryInterval)(retries, 200, checkStatus);

    _logger.default.info(`${this.opts.bundleId} is in foreground`);

    this.logEvent('appLaunched');
  }

  async startWdaSession(bundleId, processArguments) {
    let args = processArguments ? processArguments.args || [] : [];

    if (!_lodash.default.isArray(args)) {
      throw new Error(`processArguments.args capability is expected to be an array. ` + `${JSON.stringify(args)} is given instead`);
    }

    let env = processArguments ? processArguments.env || {} : {};

    if (!_lodash.default.isPlainObject(env)) {
      throw new Error(`processArguments.env capability is expected to be a dictionary. ` + `${JSON.stringify(env)} is given instead`);
    }

    let shouldWaitForQuiescence = _appiumSupport.util.hasValue(this.opts.waitForQuiescence) ? this.opts.waitForQuiescence : true;
    let maxTypingFrequency = _appiumSupport.util.hasValue(this.opts.maxTypingFrequency) ? this.opts.maxTypingFrequency : 60;
    let shouldUseSingletonTestManager = _appiumSupport.util.hasValue(this.opts.shouldUseSingletonTestManager) ? this.opts.shouldUseSingletonTestManager : true;
    let shouldUseTestManagerForVisibilityDetection = false;

    if (_appiumSupport.util.hasValue(this.opts.simpleIsVisibleCheck)) {
      shouldUseTestManagerForVisibilityDetection = this.opts.simpleIsVisibleCheck;
    }

    if (!isNaN(parseFloat(this.opts.platformVersion)) && parseFloat(this.opts.platformVersion).toFixed(1) === '9.3') {
      _logger.default.info(`Forcing shouldUseSingletonTestManager capability value to true, because of known XCTest issues under 9.3 platform version`);

      shouldUseTestManagerForVisibilityDetection = true;
    }

    if (_appiumSupport.util.hasValue(this.opts.language)) {
      args.push('-AppleLanguages', `(${this.opts.language})`);
      args.push('-NSLanguages', `(${this.opts.language})`);
    }

    if (_appiumSupport.util.hasValue(this.opts.locale)) {
      args.push('-AppleLocale', this.opts.locale);
    }

    let desired = {
      desiredCapabilities: {
        bundleId,
        arguments: args,
        environment: env,
        shouldWaitForQuiescence,
        shouldUseTestManagerForVisibilityDetection,
        maxTypingFrequency,
        shouldUseSingletonTestManager
      }
    };

    if (_appiumSupport.util.hasValue(this.opts.shouldUseCompactResponses)) {
      desired.desiredCapabilities.shouldUseCompactResponses = this.opts.shouldUseCompactResponses;
    }

    if (_appiumSupport.util.hasValue(this.opts.elementResponseFields)) {
      desired.desiredCapabilities.elementResponseFields = this.opts.elementResponseFields;
    }

    if (this.opts.autoAcceptAlerts) {
      desired.desiredCapabilities.defaultAlertAction = 'accept';
    } else if (this.opts.autoDismissAlerts) {
      desired.desiredCapabilities.defaultAlertAction = 'dismiss';
    }

    await this.proxyCommand('/session', 'POST', desired);
  }

  proxyActive() {
    return this.jwpProxyActive;
  }

  getProxyAvoidList() {
    if (this.isWebview()) {
      return NO_PROXY_WEB_LIST;
    }

    return NO_PROXY_NATIVE_LIST;
  }

  canProxy() {
    return true;
  }

  isSafari() {
    return !!this.safari;
  }

  isRealDevice() {
    return this.opts.realDevice;
  }

  isSimulator() {
    return !this.opts.realDevice;
  }

  isWebview() {
    return this.isSafari() || this.isWebContext();
  }

  validateLocatorStrategy(strategy) {
    super.validateLocatorStrategy(strategy, this.isWebContext());
  }

  validateDesiredCaps(caps) {
    if (!super.validateDesiredCaps(caps)) {
      return false;
    }

    if ((caps.browserName || '').toLowerCase() !== 'safari' && !caps.app && !caps.bundleId) {
      let msg = 'The desired capabilities must include either an app or a bundleId for iOS';

      _logger.default.errorAndThrow(msg);
    }

    let verifyProcessArgument = processArguments => {
      const {
        args,
        env
      } = processArguments;

      if (!_lodash.default.isNil(args) && !_lodash.default.isArray(args)) {
        _logger.default.errorAndThrow('processArguments.args must be an array of strings');
      }

      if (!_lodash.default.isNil(env) && !_lodash.default.isPlainObject(env)) {
        _logger.default.errorAndThrow('processArguments.env must be an object <key,value> pair {a:b, c:d}');
      }
    };

    if (caps.processArguments) {
      if (_lodash.default.isString(caps.processArguments)) {
        try {
          caps.processArguments = JSON.parse(caps.processArguments);
          verifyProcessArgument(caps.processArguments);
        } catch (err) {
          _logger.default.errorAndThrow(`processArguments must be a json format or an object with format {args : [], env : {a:b, c:d}}. ` + `Both environment and argument can be null. Error: ${err}`);
        }
      } else if (_lodash.default.isPlainObject(caps.processArguments)) {
        verifyProcessArgument(caps.processArguments);
      } else {
        _logger.default.errorAndThrow(`'processArguments must be an object, or a string JSON object with format {args : [], env : {a:b, c:d}}. ` + `Both environment and argument can be null.`);
      }
    }

    if (caps.keychainPath && !caps.keychainPassword || !caps.keychainPath && caps.keychainPassword) {
      _logger.default.errorAndThrow(`If 'keychainPath' is set, 'keychainPassword' must also be set (and vice versa).`);
    }

    this.opts.resetOnSessionStartOnly = !_appiumSupport.util.hasValue(this.opts.resetOnSessionStartOnly) || this.opts.resetOnSessionStartOnly;
    this.opts.useNewWDA = _appiumSupport.util.hasValue(this.opts.useNewWDA) ? this.opts.useNewWDA : false;

    if (caps.commandTimeouts) {
      caps.commandTimeouts = (0, _utils.normalizeCommandTimeouts)(caps.commandTimeouts);
    }

    if (_lodash.default.isString(caps.webDriverAgentUrl)) {
      const {
        protocol,
        host
      } = _url.default.parse(caps.webDriverAgentUrl);

      if (_lodash.default.isEmpty(protocol) || _lodash.default.isEmpty(host)) {
        _logger.default.errorAndThrow(`'webDriverAgentUrl' capability is expected to contain a valid WebDriverAgent server URL. ` + `'${caps.webDriverAgentUrl}' is given instead`);
      }
    }

    if (caps.browserName) {
      if (caps.bundleId) {
        _logger.default.errorAndThrow(`'browserName' cannot be set together with 'bundleId' capability`);
      }

      if (caps.app) {
        _logger.default.warn(`The capabilities should generally not include both an 'app' and a 'browserName'`);
      }
    }

    if (caps.permissions) {
      try {
        for (const [bundleId, perms] of _lodash.default.toPairs(JSON.parse(caps.permissions))) {
          if (!_lodash.default.isString(bundleId)) {
            throw new Error(`'${JSON.stringify(bundleId)}' must be a string`);
          }

          if (!_lodash.default.isPlainObject(perms)) {
            throw new Error(`'${JSON.stringify(perms)}' must be a JSON object`);
          }
        }
      } catch (e) {
        _logger.default.errorAndThrow(`'${caps.permissions}' is expected to be a valid object with format ` + `{"<bundleId1>": {"<serviceName1>": "<serviceStatus1>", ...}, ...}. Original error: ${e.message}`);
      }
    }

    return true;
  }

  async installAUT() {
    if (this.isSafari()) {
      return;
    }

    if (this.opts.autoLaunch === false) {
      return;
    }

    try {
      await (0, _utils.verifyApplicationPlatform)(this.opts.app, this.isSimulator());
    } catch (err) {
      _logger.default.warn(`*********************************`);

      _logger.default.warn(`${this.isSimulator() ? 'Simulator' : 'Real device'} architecture appears to be unsupported ` + `by the '${this.opts.app}' application. ` + `Make sure the correct deployment target has been selected for its compilation in Xcode.`);

      _logger.default.warn('Don\'t be surprised if the application fails to launch.');

      _logger.default.warn(`*********************************`);
    }

    if (this.isRealDevice()) {
      await (0, _realDeviceManagement.installToRealDevice)(this.opts.device, this.opts.app, this.opts.bundleId, this.opts.noReset);
    } else {
      await (0, _simulatorManagement.installToSimulator)(this.opts.device, this.opts.app, this.opts.bundleId, this.opts.noReset);
    }

    if (_appiumSupport.util.hasValue(this.opts.iosInstallPause)) {
      let pause = parseInt(this.opts.iosInstallPause, 10);

      _logger.default.debug(`iosInstallPause set. Pausing ${pause} ms before continuing`);

      await _bluebird.default.delay(pause);
    }
  }

  async setInitialOrientation(orientation) {
    if (!_lodash.default.isString(orientation)) {
      _logger.default.info('Skipping setting of the initial display orientation. ' + 'Set the "orientation" capability to either "LANDSCAPE" or "PORTRAIT", if this is an undesired behavior.');

      return;
    }

    orientation = orientation.toUpperCase();

    if (!_lodash.default.includes(['LANDSCAPE', 'PORTRAIT'], orientation)) {
      _logger.default.debug(`Unable to set initial orientation to '${orientation}'`);

      return;
    }

    _logger.default.debug(`Setting initial orientation to '${orientation}'`);

    try {
      await this.proxyCommand('/orientation', 'POST', {
        orientation
      });
      this.opts.curOrientation = orientation;
    } catch (err) {
      _logger.default.warn(`Setting initial orientation failed with: ${err.message}`);
    }
  }

  _getCommandTimeout(cmdName) {
    if (this.opts.commandTimeouts) {
      if (cmdName && _lodash.default.has(this.opts.commandTimeouts, cmdName)) {
        return this.opts.commandTimeouts[cmdName];
      }

      return this.opts.commandTimeouts[_utils.DEFAULT_TIMEOUT_KEY];
    }
  }

  async getSession() {
    const driverSession = await super.getSession();

    if (!this.wdaCaps) {
      this.wdaCaps = await this.proxyCommand('/', 'GET');
    }

    if (!this.deviceCaps) {
      const {
        statusBarSize,
        scale
      } = await this.getScreenInfo();
      this.deviceCaps = {
        pixelRatio: scale,
        statBarHeight: statusBarSize.height,
        viewportRect: await this.getViewportRect()
      };
    }

    _logger.default.info("Merging WDA caps over Appium caps for session detail response");

    return Object.assign({
      udid: this.opts.udid
    }, driverSession, this.wdaCaps.capabilities, this.deviceCaps);
  }

  async startIWDP() {
    this.logEvent('iwdpStarting');
    this.iwdpServer = new _appiumIosDriver.IWDP(this.opts.webkitDebugProxyPort, this.opts.udid);
    await this.iwdpServer.start();
    this.logEvent('iwdpStarted');
  }

  async stopIWDP() {
    if (this.iwdpServer) {
      await this.iwdpServer.stop();
      delete this.iwdpServer;
    }
  }

  async reset() {
    if (this.opts.noReset) {
      let opts = _lodash.default.cloneDeep(this.opts);

      opts.noReset = false;
      opts.fullReset = false;
      const shutdownHandler = this.resetOnUnexpectedShutdown;

      this.resetOnUnexpectedShutdown = () => {};

      try {
        await this.runReset(opts);
      } finally {
        this.resetOnUnexpectedShutdown = shutdownHandler;
      }
    }

    await super.reset();
  }

}

exports.XCUITestDriver = XCUITestDriver;
Object.assign(XCUITestDriver.prototype, _index.default);
var _default = XCUITestDriver;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9kcml2ZXIuanMiXSwibmFtZXMiOlsiU0FGQVJJX0JVTkRMRV9JRCIsIldEQV9TSU1fU1RBUlRVUF9SRVRSSUVTIiwiV0RBX1JFQUxfREVWX1NUQVJUVVBfUkVUUklFUyIsIldEQV9SRUFMX0RFVl9UVVRPUklBTF9VUkwiLCJXREFfU1RBUlRVUF9SRVRSWV9JTlRFUlZBTCIsIkRFRkFVTFRfU0VUVElOR1MiLCJuYXRpdmVXZWJUYXAiLCJ1c2VKU09OU291cmNlIiwic2hvdWxkVXNlQ29tcGFjdFJlc3BvbnNlcyIsImVsZW1lbnRSZXNwb25zZUF0dHJpYnV0ZXMiLCJtanBlZ1NlcnZlclNjcmVlbnNob3RRdWFsaXR5IiwibWpwZWdTZXJ2ZXJGcmFtZXJhdGUiLCJzY3JlZW5zaG90UXVhbGl0eSIsIlNIQVJFRF9SRVNPVVJDRVNfR1VBUkQiLCJBc3luY0xvY2siLCJOT19QUk9YWV9OQVRJVkVfTElTVCIsIk5PX1BST1hZX1dFQl9MSVNUIiwiY29uY2F0IiwiTUVNT0laRURfRlVOQ1RJT05TIiwiWENVSVRlc3REcml2ZXIiLCJCYXNlRHJpdmVyIiwiY29uc3RydWN0b3IiLCJvcHRzIiwic2hvdWxkVmFsaWRhdGVDYXBzIiwiZGVzaXJlZENhcENvbnN0cmFpbnRzIiwibG9jYXRvclN0cmF0ZWdpZXMiLCJ3ZWJMb2NhdG9yU3RyYXRlZ2llcyIsInJlc2V0SW9zIiwic2V0dGluZ3MiLCJEZXZpY2VTZXR0aW5ncyIsIm9uU2V0dGluZ3NVcGRhdGUiLCJiaW5kIiwiZm4iLCJfIiwibWVtb2l6ZSIsImtleSIsInZhbHVlIiwicHJveHlDb21tYW5kIiwid2RhIiwiZGV2aWNlIiwiandwUHJveHlBY3RpdmUiLCJwcm94eVJlcVJlcyIsImp3cFByb3h5QXZvaWQiLCJzYWZhcmkiLCJjYWNoZWRXZGFTdGF0dXMiLCJjdXJXZWJGcmFtZXMiLCJ3ZWJFbGVtZW50SWRzIiwiX2N1cnJlbnRVcmwiLCJjdXJDb250ZXh0IiwieGNvZGVWZXJzaW9uIiwiaW9zU2RrVmVyc2lvbiIsImNvbnRleHRzIiwiaW1wbGljaXRXYWl0TXMiLCJhc3luY2xpYldhaXRNcyIsInBhZ2VMb2FkTXMiLCJsYW5kc2NhcGVXZWJDb29yZHNPZmZzZXQiLCJkcml2ZXJEYXRhIiwiZ2V0U3RhdHVzIiwiZHJpdmVySW5mbyIsInN0YXR1cyIsImJ1aWxkIiwidmVyc2lvbiIsImNyZWF0ZVNlc3Npb24iLCJhcmdzIiwibGlmZWN5Y2xlRGF0YSIsInNlc3Npb25JZCIsImNhcHMiLCJzdGFydCIsIk9iamVjdCIsImFzc2lnbiIsImRlZmF1bHRTZXJ2ZXJDYXBzIiwidWRpZCIsImhhcyIsInVwZGF0ZVNldHRpbmdzIiwid2RhU2V0dGluZ3MiLCJsb2ciLCJpbmZvIiwibWpwZWdTY3JlZW5zaG90VXJsIiwibWpwZWdTdHJlYW0iLCJtanBlZyIsIk1KcGVnU3RyZWFtIiwiZSIsImVycm9yIiwiZGVsZXRlU2Vzc2lvbiIsIm5vUmVzZXQiLCJmdWxsUmVzZXQiLCJwbGF0Zm9ybVZlcnNpb24iLCJwYXJzZUZsb2F0IiwiRXJyb3IiLCJyZWFsRGV2aWNlIiwiZGV0ZXJtaW5lRGV2aWNlIiwiaXNFbXB0eSIsIndlYkRyaXZlckFnZW50VXJsIiwidG9vbHMiLCJ0b29sc1ZlcnNpb24iLCJkZWJ1ZyIsInZlcnNpb25TdHJpbmciLCJsb2dFdmVudCIsImVuYWJsZUFzeW5jRXhlY3V0ZUZyb21IdHRwcyIsImlzUmVhbERldmljZSIsInN0YXJ0SHR0cHNBc3luY1NlcnZlciIsImlzRnVuY3Rpb24iLCJnZXRQbGF0Zm9ybVZlcnNpb24iLCJtc2ciLCJlcnJvckFuZFRocm93IiwiYnJvd3Nlck5hbWUiLCJ0b0xvd2VyQ2FzZSIsImFwcCIsInVuZGVmaW5lZCIsInByb2Nlc3NBcmd1bWVudHMiLCJidW5kbGVJZCIsInNhZmFyaUluaXRpYWxVcmwiLCJhZGRyZXNzIiwicG9ydCIsImNvbmZpZ3VyZUFwcCIsImFwcFV0aWxzIiwiZXh0cmFjdEJ1bmRsZUlkIiwicnVuUmVzZXQiLCJzdGFydExvZ0NhcHR1cmUiLCJyZXN1bHQiLCJpc0xvZ0NhcHR1cmVTdGFydGVkIiwiaXNTaW11bGF0b3IiLCJzaHV0ZG93bk90aGVyU2ltdWxhdG9ycyIsInJlbGF4ZWRTZWN1cml0eUVuYWJsZWQiLCJ1dGlsIiwiaGFzVmFsdWUiLCJyZWR1Y2VNb3Rpb24iLCJzZXRSZWR1Y2VNb3Rpb24iLCJsb2NhbENvbmZpZyIsImlvc1NldHRpbmdzIiwic2V0TG9jYWxlQW5kUHJlZmVyZW5jZXMiLCJpc1NhZmFyaSIsInNpbSIsInN0YXJ0U2ltIiwiY3VzdG9tU1NMQ2VydCIsInRydW5jYXRlIiwibGVuZ3RoIiwiaW5zdGFsbEFVVCIsImlzQXBwSW5zdGFsbGVkIiwicGVybWlzc2lvbnMiLCJwZXJtaXNzaW9uc01hcHBpbmciLCJ0b1BhaXJzIiwiSlNPTiIsInBhcnNlIiwic2V0UGVybWlzc2lvbnMiLCJ3YXJuIiwiYWNxdWlyZSIsIm5hbWUiLCJzdGFydFdkYSIsInNldEluaXRpYWxPcmllbnRhdGlvbiIsIm9yaWVudGF0aW9uIiwic3RhcnRJV0RQIiwiaXdkcFNlcnZlciIsImVuZHBvaW50IiwiZXJyIiwibWVzc2FnZSIsImF1dG9XZWJ2aWV3IiwibmF2VG9Jbml0aWFsV2VidmlldyIsImNhbGVuZGFyQWNjZXNzQXV0aG9yaXplZCIsImVuYWJsZUNhbGVuZGFyQWNjZXNzIiwiZGlzYWJsZUNhbGVuZGFyQWNjZXNzIiwiV2ViRHJpdmVyQWdlbnQiLCJjbGVhbnVwT2Jzb2xldGVQcm9jZXNzZXMiLCJ1c2VOZXdXREEiLCJxdWl0QW5kVW5pbnN0YWxsIiwic2V0dXBDYWNoaW5nIiwidXBkYXRlZFdEQUJ1bmRsZUlkIiwic3RhcnR1cFJldHJpZXMiLCJ3ZGFTdGFydHVwUmV0cmllcyIsInN0YXJ0dXBSZXRyeUludGVydmFsIiwid2RhU3RhcnR1cFJldHJ5SW50ZXJ2YWwiLCJyZXRyaWVzIiwibWFqb3IiLCJsYXVuY2giLCJlcnJvck1zZyIsInN0YXJ0V2RhU2Vzc2lvbiIsInByZXZlbnRXREFBdHRhY2htZW50cyIsImNsZWFyU3lzdGVtRmlsZXMiLCJmdWxseVN0YXJ0ZWQiLCJzZXJ2ZXIiLCJzdG9wIiwiaXNBcHBUZW1wb3JhcnkiLCJmcyIsInJpbXJhZiIsInNob3dYY29kZUxvZyIsImlzV2ViQ29udGV4dCIsInN0b3BSZW1vdGUiLCJyZXNldE9uU2Vzc2lvblN0YXJ0T25seSIsImNyZWF0ZVNpbSIsImRlbGV0ZSIsImxvZ3MiLCJzeXNsb2ciLCJzdG9wQ2FwdHVyZSIsInN0b3BJV0RQIiwic3RvcEh0dHBzQXN5bmNTZXJ2ZXIiLCJqd3Byb3h5IiwicXVpdCIsImV4ZWN1dGVDb21tYW5kIiwiY21kIiwicmVjZWl2ZUFzeW5jUmVzcG9uc2UiLCJhcHBJc1BhY2thZ2VPckJ1bmRsZSIsInRlc3QiLCJvcmlnaW5hbEFwcFBhdGgiLCJoZWxwZXJzIiwibW91bnRSb290Iiwid2luZG93c1NoYXJlVXNlck5hbWUiLCJ3aW5kb3dzU2hhcmVQYXNzd29yZCIsImRldmljZU5hbWUiLCJkZXZpY2VzIiwiam9pbiIsImluY2x1ZGVzIiwicnVuT3B0cyIsInNjYWxlRmFjdG9yIiwiY29ubmVjdEhhcmR3YXJlS2V5Ym9hcmQiLCJpc0hlYWRsZXNzIiwiZGV2aWNlUHJlZmVyZW5jZXMiLCJTaW11bGF0b3JXaW5kb3dDZW50ZXIiLCJpc1N0cmluZyIsInRvVXBwZXJDYXNlIiwiU2ltdWxhdG9yV2luZG93T3JpZW50YXRpb24iLCJTaW11bGF0b3JXaW5kb3dSb3RhdGlvbkFuZ2xlIiwicnVuIiwibGF1bmNoQXBwIiwiQVBQX0xBVU5DSF9USU1FT1VUIiwiY2hlY2tTdGF0dXMiLCJyZXNwb25zZSIsImN1cnJlbnRBcHAiLCJidW5kbGVJRCIsInBhcnNlSW50IiwiaXNBcnJheSIsInN0cmluZ2lmeSIsImVudiIsImlzUGxhaW5PYmplY3QiLCJzaG91bGRXYWl0Rm9yUXVpZXNjZW5jZSIsIndhaXRGb3JRdWllc2NlbmNlIiwibWF4VHlwaW5nRnJlcXVlbmN5Iiwic2hvdWxkVXNlU2luZ2xldG9uVGVzdE1hbmFnZXIiLCJzaG91bGRVc2VUZXN0TWFuYWdlckZvclZpc2liaWxpdHlEZXRlY3Rpb24iLCJzaW1wbGVJc1Zpc2libGVDaGVjayIsImlzTmFOIiwidG9GaXhlZCIsImxhbmd1YWdlIiwicHVzaCIsImxvY2FsZSIsImRlc2lyZWQiLCJkZXNpcmVkQ2FwYWJpbGl0aWVzIiwiYXJndW1lbnRzIiwiZW52aXJvbm1lbnQiLCJlbGVtZW50UmVzcG9uc2VGaWVsZHMiLCJhdXRvQWNjZXB0QWxlcnRzIiwiZGVmYXVsdEFsZXJ0QWN0aW9uIiwiYXV0b0Rpc21pc3NBbGVydHMiLCJwcm94eUFjdGl2ZSIsImdldFByb3h5QXZvaWRMaXN0IiwiaXNXZWJ2aWV3IiwiY2FuUHJveHkiLCJ2YWxpZGF0ZUxvY2F0b3JTdHJhdGVneSIsInN0cmF0ZWd5IiwidmFsaWRhdGVEZXNpcmVkQ2FwcyIsInZlcmlmeVByb2Nlc3NBcmd1bWVudCIsImlzTmlsIiwia2V5Y2hhaW5QYXRoIiwia2V5Y2hhaW5QYXNzd29yZCIsImNvbW1hbmRUaW1lb3V0cyIsInByb3RvY29sIiwiaG9zdCIsInVybCIsInBlcm1zIiwiYXV0b0xhdW5jaCIsImlvc0luc3RhbGxQYXVzZSIsInBhdXNlIiwiQiIsImRlbGF5IiwiY3VyT3JpZW50YXRpb24iLCJfZ2V0Q29tbWFuZFRpbWVvdXQiLCJjbWROYW1lIiwiREVGQVVMVF9USU1FT1VUX0tFWSIsImdldFNlc3Npb24iLCJkcml2ZXJTZXNzaW9uIiwid2RhQ2FwcyIsImRldmljZUNhcHMiLCJzdGF0dXNCYXJTaXplIiwic2NhbGUiLCJnZXRTY3JlZW5JbmZvIiwicGl4ZWxSYXRpbyIsInN0YXRCYXJIZWlnaHQiLCJoZWlnaHQiLCJ2aWV3cG9ydFJlY3QiLCJnZXRWaWV3cG9ydFJlY3QiLCJjYXBhYmlsaXRpZXMiLCJJV0RQIiwid2Via2l0RGVidWdQcm94eVBvcnQiLCJyZXNldCIsImNsb25lRGVlcCIsInNodXRkb3duSGFuZGxlciIsInJlc2V0T25VbmV4cGVjdGVkU2h1dGRvd24iLCJwcm90b3R5cGUiLCJjb21tYW5kcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQTs7QUFD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LEtBQUs5USxJQUFMLENBQVU4RCxPQUFkLEVBQXVCO0FBRXJCLFVBQUk5RCxJQUFJLEdBQUdXLGdCQUFFb1EsU0FBRixDQUFZLEtBQUsvUSxJQUFqQixDQUFYOztBQUNBQSxNQUFBQSxJQUFJLENBQUM4RCxPQUFMLEdBQWUsS0FBZjtBQUNBOUQsTUFBQUEsSUFBSSxDQUFDK0QsU0FBTCxHQUFpQixLQUFqQjtBQUNBLFlBQU1pTixlQUFlLEdBQUcsS0FBS0MseUJBQTdCOztBQUNBLFdBQUtBLHlCQUFMLEdBQWlDLE1BQU0sQ0FBRSxDQUF6Qzs7QUFDQSxVQUFJO0FBQ0YsY0FBTSxLQUFLbEwsUUFBTCxDQUFjL0YsSUFBZCxDQUFOO0FBQ0QsT0FGRCxTQUVVO0FBQ1IsYUFBS2lSLHlCQUFMLEdBQWlDRCxlQUFqQztBQUNEO0FBQ0Y7O0FBQ0QsVUFBTSxNQUFNRixLQUFOLEVBQU47QUFDRDs7QUF2L0JxQzs7O0FBMC9CeENoTyxNQUFNLENBQUNDLE1BQVAsQ0FBY2xELGNBQWMsQ0FBQ3FSLFNBQTdCLEVBQXdDQyxjQUF4QztlQUVldFIsYyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJhc2VEcml2ZXIsIERldmljZVNldHRpbmdzIH0gZnJvbSAnYXBwaXVtLWJhc2UtZHJpdmVyJztcbmltcG9ydCB7IHV0aWwsIGZzLCBtanBlZyB9IGZyb20gJ2FwcGl1bS1zdXBwb3J0JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgeyBsYXVuY2ggfSBmcm9tICdub2RlLXNpbWN0bCc7XG5pbXBvcnQgV2ViRHJpdmVyQWdlbnQgZnJvbSAnLi93ZGEvd2ViZHJpdmVyYWdlbnQnO1xuaW1wb3J0IGxvZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBjcmVhdGVTaW0sIGdldEV4aXN0aW5nU2ltLCBydW5TaW11bGF0b3JSZXNldCwgaW5zdGFsbFRvU2ltdWxhdG9yLFxuICAgICAgICAgc2h1dGRvd25PdGhlclNpbXVsYXRvcnMsIHNodXRkb3duU2ltdWxhdG9yIH0gZnJvbSAnLi9zaW11bGF0b3ItbWFuYWdlbWVudCc7XG5pbXBvcnQgeyBzaW1FeGlzdHMsIGdldFNpbXVsYXRvciwgaW5zdGFsbFNTTENlcnQsIGhhc1NTTENlcnQgfSBmcm9tICdhcHBpdW0taW9zLXNpbXVsYXRvcic7XG5pbXBvcnQgeyByZXRyeUludGVydmFsLCByZXRyeSB9IGZyb20gJ2FzeW5jYm94JztcbmltcG9ydCB7IHNldHRpbmdzIGFzIGlvc1NldHRpbmdzLCBkZWZhdWx0U2VydmVyQ2FwcywgYXBwVXRpbHMsIElXRFAgfSBmcm9tICdhcHBpdW0taW9zLWRyaXZlcic7XG5pbXBvcnQgZGVzaXJlZENhcENvbnN0cmFpbnRzIGZyb20gJy4vZGVzaXJlZC1jYXBzJztcbmltcG9ydCBjb21tYW5kcyBmcm9tICcuL2NvbW1hbmRzL2luZGV4JztcbmltcG9ydCB7IGRldGVjdFVkaWQsIGdldEFuZENoZWNrWGNvZGVWZXJzaW9uLCBnZXRBbmRDaGVja0lvc1Nka1ZlcnNpb24sXG4gICAgICAgICBhZGp1c3RXREFBdHRhY2htZW50c1Blcm1pc3Npb25zLCBjaGVja0FwcFByZXNlbnQsIGdldERyaXZlckluZm8sXG4gICAgICAgICBjbGVhclN5c3RlbUZpbGVzLCB0cmFuc2xhdGVEZXZpY2VOYW1lLCBub3JtYWxpemVDb21tYW5kVGltZW91dHMsXG4gICAgICAgICBERUZBVUxUX1RJTUVPVVRfS0VZLCBtYXJrU3lzdGVtRmlsZXNGb3JDbGVhbnVwLFxuICAgICAgICAgcHJpbnRVc2VyLCByZW1vdmVBbGxTZXNzaW9uV2ViU29ja2V0SGFuZGxlcnMsIHZlcmlmeUFwcGxpY2F0aW9uUGxhdGZvcm0gfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IGdldENvbm5lY3RlZERldmljZXMsIHJ1blJlYWxEZXZpY2VSZXNldCwgaW5zdGFsbFRvUmVhbERldmljZSxcbiAgICAgICAgIGdldFJlYWxEZXZpY2VPYmogfSBmcm9tICcuL3JlYWwtZGV2aWNlLW1hbmFnZW1lbnQnO1xuaW1wb3J0IEIgZnJvbSAnYmx1ZWJpcmQnO1xuaW1wb3J0IEFzeW5jTG9jayBmcm9tICdhc3luYy1sb2NrJztcblxuXG5jb25zdCBTQUZBUklfQlVORExFX0lEID0gJ2NvbS5hcHBsZS5tb2JpbGVzYWZhcmknO1xuY29uc3QgV0RBX1NJTV9TVEFSVFVQX1JFVFJJRVMgPSAyO1xuY29uc3QgV0RBX1JFQUxfREVWX1NUQVJUVVBfUkVUUklFUyA9IDE7XG5jb25zdCBXREFfUkVBTF9ERVZfVFVUT1JJQUxfVVJMID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9hcHBpdW0vYXBwaXVtLXhjdWl0ZXN0LWRyaXZlci9ibG9iL21hc3Rlci9kb2NzL3JlYWwtZGV2aWNlLWNvbmZpZy5tZCc7XG5jb25zdCBXREFfU1RBUlRVUF9SRVRSWV9JTlRFUlZBTCA9IDEwMDAwO1xuY29uc3QgREVGQVVMVF9TRVRUSU5HUyA9IHtcbiAgbmF0aXZlV2ViVGFwOiBmYWxzZSxcbiAgdXNlSlNPTlNvdXJjZTogZmFsc2UsXG4gIHNob3VsZFVzZUNvbXBhY3RSZXNwb25zZXM6IHRydWUsXG4gIGVsZW1lbnRSZXNwb25zZUF0dHJpYnV0ZXM6IFwidHlwZSxsYWJlbFwiLFxuICAvLyBSZWFkIGh0dHBzOi8vZ2l0aHViLmNvbS9hcHBpdW0vV2ViRHJpdmVyQWdlbnQvYmxvYi9tYXN0ZXIvV2ViRHJpdmVyQWdlbnRMaWIvVXRpbGl0aWVzL0ZCQ29uZmlndXJhdGlvbi5tIGZvciBmb2xsb3dpbmcgc2V0dGluZ3MnIHZhbHVlc1xuICBtanBlZ1NlcnZlclNjcmVlbnNob3RRdWFsaXR5OiAyNSxcbiAgbWpwZWdTZXJ2ZXJGcmFtZXJhdGU6IDEwLFxuICBzY3JlZW5zaG90UXVhbGl0eTogMSxcbn07XG4vLyBUaGlzIGxvY2sgYXNzdXJlcywgdGhhdCBlYWNoIGRyaXZlciBzZXNzaW9uIGRvZXMgbm90XG4vLyBhZmZlY3Qgc2hhcmVkIHJlc291cmNlcyBvZiB0aGUgb3RoZXIgcGFyYWxsZWwgc2Vzc2lvbnNcbmNvbnN0IFNIQVJFRF9SRVNPVVJDRVNfR1VBUkQgPSBuZXcgQXN5bmNMb2NrKCk7XG5cbi8qIGVzbGludC1kaXNhYmxlIG5vLXVzZWxlc3MtZXNjYXBlICovXG5jb25zdCBOT19QUk9YWV9OQVRJVkVfTElTVCA9IFtcbiAgWydERUxFVEUnLCAvd2luZG93L10sXG4gIFsnR0VUJywgL15cXC9zZXNzaW9uXFwvW15cXC9dKyQvXSxcbiAgWydHRVQnLCAvYWxlcnRfdGV4dC9dLFxuICBbJ0dFVCcsIC9hbGVydFxcL1teXFwvXSsvXSxcbiAgWydHRVQnLCAvYXBwaXVtL10sXG4gIFsnR0VUJywgL2F0dHJpYnV0ZS9dLFxuICBbJ0dFVCcsIC9jb250ZXh0L10sXG4gIFsnR0VUJywgL2xvY2F0aW9uL10sXG4gIFsnR0VUJywgL2xvZy9dLFxuICBbJ0dFVCcsIC9zY3JlZW5zaG90L10sXG4gIFsnR0VUJywgL3NpemUvXSxcbiAgWydHRVQnLCAvc291cmNlL10sXG4gIFsnR0VUJywgL3VybC9dLFxuICBbJ0dFVCcsIC93aW5kb3cvXSxcbiAgWydQT1NUJywgL2FjY2VwdF9hbGVydC9dLFxuICBbJ1BPU1QnLCAvYWN0aW9ucyQvXSxcbiAgWydQT1NUJywgL2FsZXJ0X3RleHQvXSxcbiAgWydQT1NUJywgL2FsZXJ0XFwvW15cXC9dKy9dLFxuICBbJ1BPU1QnLCAvYXBwaXVtL10sXG4gIFsnUE9TVCcsIC9hcHBpdW1cXC9kZXZpY2VcXC9pc19sb2NrZWQvXSxcbiAgWydQT1NUJywgL2FwcGl1bVxcL2RldmljZVxcL2xvY2svXSxcbiAgWydQT1NUJywgL2FwcGl1bVxcL2RldmljZVxcL3VubG9jay9dLFxuICBbJ1BPU1QnLCAvYmFjay9dLFxuICBbJ1BPU1QnLCAvY2xlYXIvXSxcbiAgWydQT1NUJywgL2NvbnRleHQvXSxcbiAgWydQT1NUJywgL2Rpc21pc3NfYWxlcnQvXSxcbiAgWydQT1NUJywgL2VsZW1lbnQkL10sXG4gIFsnUE9TVCcsIC9lbGVtZW50cyQvXSxcbiAgWydQT1NUJywgL2V4ZWN1dGUvXSxcbiAgWydQT1NUJywgL2tleXMvXSxcbiAgWydQT1NUJywgL2xvZy9dLFxuICBbJ1BPU1QnLCAvbW92ZXRvL10sXG4gIFsnUE9TVCcsIC9yZWNlaXZlX2FzeW5jX3Jlc3BvbnNlL10sIC8vIGFsd2F5cywgaW4gY2FzZSBjb250ZXh0IHN3aXRjaGVzIHdoaWxlIHdhaXRpbmdcbiAgWydQT1NUJywgL3Nlc3Npb25cXC9bXlxcL10rXFwvbG9jYXRpb24vXSwgLy8gZ2VvIGxvY2F0aW9uLCBidXQgbm90IGVsZW1lbnQgbG9jYXRpb25cbiAgWydQT1NUJywgL3NoYWtlL10sXG4gIFsnUE9TVCcsIC90aW1lb3V0cy9dLFxuICBbJ1BPU1QnLCAvdG91Y2gvXSxcbiAgWydQT1NUJywgL3VybC9dLFxuICBbJ1BPU1QnLCAvdmFsdWUvXSxcbiAgWydQT1NUJywgL3dpbmRvdy9dLFxuXTtcbmNvbnN0IE5PX1BST1hZX1dFQl9MSVNUID0gW1xuICBbJ0RFTEVURScsIC9jb29raWUvXSxcbiAgWydHRVQnLCAvYXR0cmlidXRlL10sXG4gIFsnR0VUJywgL2Nvb2tpZS9dLFxuICBbJ0dFVCcsIC9lbGVtZW50L10sXG4gIFsnR0VUJywgL3RleHQvXSxcbiAgWydHRVQnLCAvdGl0bGUvXSxcbiAgWydQT1NUJywgL2NsZWFyL10sXG4gIFsnUE9TVCcsIC9jbGljay9dLFxuICBbJ1BPU1QnLCAvY29va2llL10sXG4gIFsnUE9TVCcsIC9lbGVtZW50L10sXG4gIFsnUE9TVCcsIC9mb3J3YXJkL10sXG4gIFsnUE9TVCcsIC9mcmFtZS9dLFxuICBbJ1BPU1QnLCAva2V5cy9dLFxuICBbJ1BPU1QnLCAvcmVmcmVzaC9dLFxuXS5jb25jYXQoTk9fUFJPWFlfTkFUSVZFX0xJU1QpO1xuLyogZXNsaW50LWVuYWJsZSBuby11c2VsZXNzLWVzY2FwZSAqL1xuXG5jb25zdCBNRU1PSVpFRF9GVU5DVElPTlMgPSBbXG4gICdnZXRXaW5kb3dTaXplTmF0aXZlJyxcbiAgJ2dldFdpbmRvd1NpemVXZWInLFxuICAnZ2V0U3RhdHVzQmFySGVpZ2h0JyxcbiAgJ2dldERldmljZVBpeGVsUmF0aW8nLFxuICAnZ2V0U2NyZWVuSW5mbycsXG4gICdnZXRTYWZhcmlJc0lwaG9uZScsXG4gICdnZXRTYWZhcmlJc0lwaG9uZVgnLFxuXTtcblxuY2xhc3MgWENVSVRlc3REcml2ZXIgZXh0ZW5kcyBCYXNlRHJpdmVyIHtcbiAgY29uc3RydWN0b3IgKG9wdHMgPSB7fSwgc2hvdWxkVmFsaWRhdGVDYXBzID0gdHJ1ZSkge1xuICAgIHN1cGVyKG9wdHMsIHNob3VsZFZhbGlkYXRlQ2Fwcyk7XG5cbiAgICB0aGlzLmRlc2lyZWRDYXBDb25zdHJhaW50cyA9IGRlc2lyZWRDYXBDb25zdHJhaW50cztcblxuICAgIHRoaXMubG9jYXRvclN0cmF0ZWdpZXMgPSBbXG4gICAgICAneHBhdGgnLFxuICAgICAgJ2lkJyxcbiAgICAgICduYW1lJyxcbiAgICAgICdjbGFzcyBuYW1lJyxcbiAgICAgICctaW9zIHByZWRpY2F0ZSBzdHJpbmcnLFxuICAgICAgJy1pb3MgY2xhc3MgY2hhaW4nLFxuICAgICAgJ2FjY2Vzc2liaWxpdHkgaWQnXG4gICAgXTtcbiAgICB0aGlzLndlYkxvY2F0b3JTdHJhdGVnaWVzID0gW1xuICAgICAgJ2xpbmsgdGV4dCcsXG4gICAgICAnY3NzIHNlbGVjdG9yJyxcbiAgICAgICd0YWcgbmFtZScsXG4gICAgICAnbGluayB0ZXh0JyxcbiAgICAgICdwYXJ0aWFsIGxpbmsgdGV4dCdcbiAgICBdO1xuICAgIHRoaXMucmVzZXRJb3MoKTtcbiAgICB0aGlzLnNldHRpbmdzID0gbmV3IERldmljZVNldHRpbmdzKERFRkFVTFRfU0VUVElOR1MsIHRoaXMub25TZXR0aW5nc1VwZGF0ZS5iaW5kKHRoaXMpKTtcblxuICAgIC8vIG1lbW9pemUgZnVuY3Rpb25zIGhlcmUsIHNvIHRoYXQgdGhleSBhcmUgZG9uZSBvbiBhIHBlci1pbnN0YW5jZSBiYXNpc1xuICAgIGZvciAoY29uc3QgZm4gb2YgTUVNT0laRURfRlVOQ1RJT05TKSB7XG4gICAgICB0aGlzW2ZuXSA9IF8ubWVtb2l6ZSh0aGlzW2ZuXSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgb25TZXR0aW5nc1VwZGF0ZSAoa2V5LCB2YWx1ZSkge1xuICAgIGlmIChrZXkgIT09ICduYXRpdmVXZWJUYXAnKSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoJy9hcHBpdW0vc2V0dGluZ3MnLCAnUE9TVCcsIHtcbiAgICAgICAgc2V0dGluZ3M6IHtba2V5XTogdmFsdWV9XG4gICAgICB9KTtcbiAgICB9XG4gICAgdGhpcy5vcHRzLm5hdGl2ZVdlYlRhcCA9ICEhdmFsdWU7XG4gIH1cblxuICByZXNldElvcyAoKSB7XG4gICAgdGhpcy5vcHRzID0gdGhpcy5vcHRzIHx8IHt9O1xuICAgIHRoaXMud2RhID0gbnVsbDtcbiAgICB0aGlzLm9wdHMuZGV2aWNlID0gbnVsbDtcbiAgICB0aGlzLmp3cFByb3h5QWN0aXZlID0gZmFsc2U7XG4gICAgdGhpcy5wcm94eVJlcVJlcyA9IG51bGw7XG4gICAgdGhpcy5qd3BQcm94eUF2b2lkID0gW107XG4gICAgdGhpcy5zYWZhcmkgPSBmYWxzZTtcbiAgICB0aGlzLmNhY2hlZFdkYVN0YXR1cyA9IG51bGw7XG5cbiAgICAvLyBzb21lIHRoaW5ncyB0aGF0IGNvbW1hbmRzIGltcG9ydGVkIGZyb20gYXBwaXVtLWlvcy1kcml2ZXIgbmVlZFxuICAgIHRoaXMuY3VyV2ViRnJhbWVzID0gW107XG4gICAgdGhpcy53ZWJFbGVtZW50SWRzID0gW107XG4gICAgdGhpcy5fY3VycmVudFVybCA9IG51bGw7XG4gICAgdGhpcy5jdXJDb250ZXh0ID0gbnVsbDtcbiAgICB0aGlzLnhjb2RlVmVyc2lvbiA9IHt9O1xuICAgIHRoaXMuaW9zU2RrVmVyc2lvbiA9IG51bGw7XG4gICAgdGhpcy5jb250ZXh0cyA9IFtdO1xuICAgIHRoaXMuaW1wbGljaXRXYWl0TXMgPSAwO1xuICAgIHRoaXMuYXN5bmNsaWJXYWl0TXMgPSAwO1xuICAgIHRoaXMucGFnZUxvYWRNcyA9IDYwMDA7XG4gICAgdGhpcy5sYW5kc2NhcGVXZWJDb29yZHNPZmZzZXQgPSAwO1xuICB9XG5cbiAgZ2V0IGRyaXZlckRhdGEgKCkge1xuICAgIC8vIFRPRE8gZmlsbCBvdXQgcmVzb3VyY2UgaW5mbyBoZXJlXG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgYXN5bmMgZ2V0U3RhdHVzICgpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMuZHJpdmVySW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRoaXMuZHJpdmVySW5mbyA9IGF3YWl0IGdldERyaXZlckluZm8oKTtcbiAgICB9XG4gICAgbGV0IHN0YXR1cyA9IHtidWlsZDoge3ZlcnNpb246IHRoaXMuZHJpdmVySW5mby52ZXJzaW9ufX07XG4gICAgaWYgKHRoaXMuY2FjaGVkV2RhU3RhdHVzKSB7XG4gICAgICBzdGF0dXMud2RhID0gdGhpcy5jYWNoZWRXZGFTdGF0dXM7XG4gICAgfVxuICAgIHJldHVybiBzdGF0dXM7XG4gIH1cblxuICBhc3luYyBjcmVhdGVTZXNzaW9uICguLi5hcmdzKSB7XG4gICAgdGhpcy5saWZlY3ljbGVEYXRhID0ge307IC8vIHRoaXMgaXMgdXNlZCBmb3Iga2VlcGluZyB0cmFjayBvZiB0aGUgc3RhdGUgd2Ugc3RhcnQgc28gd2hlbiB3ZSBkZWxldGUgdGhlIHNlc3Npb24gd2UgY2FuIHB1dCB0aGluZ3MgYmFja1xuICAgIHRyeSB7XG4gICAgICAvLyBUT0RPIGFkZCB2YWxpZGF0aW9uIG9uIGNhcHNcbiAgICAgIGxldCBbc2Vzc2lvbklkLCBjYXBzXSA9IGF3YWl0IHN1cGVyLmNyZWF0ZVNlc3Npb24oLi4uYXJncyk7XG4gICAgICB0aGlzLm9wdHMuc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuXG4gICAgICBhd2FpdCB0aGlzLnN0YXJ0KCk7XG5cbiAgICAgIC8vIG1lcmdlIHNlcnZlciBjYXBhYmlsaXRpZXMgKyBkZXNpcmVkIGNhcGFiaWxpdGllc1xuICAgICAgY2FwcyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRTZXJ2ZXJDYXBzLCBjYXBzKTtcbiAgICAgIC8vIHVwZGF0ZSB0aGUgdWRpZCB3aXRoIHdoYXQgaXMgYWN0dWFsbHkgdXNlZFxuICAgICAgY2Fwcy51ZGlkID0gdGhpcy5vcHRzLnVkaWQ7XG4gICAgICAvLyBlbnN1cmUgd2UgdHJhY2sgbmF0aXZlV2ViVGFwIGNhcGFiaWxpdHkgYXMgYSBzZXR0aW5nIGFzIHdlbGxcbiAgICAgIGlmIChfLmhhcyh0aGlzLm9wdHMsICduYXRpdmVXZWJUYXAnKSkge1xuICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNldHRpbmdzKHtuYXRpdmVXZWJUYXA6IHRoaXMub3B0cy5uYXRpdmVXZWJUYXB9KTtcbiAgICAgIH1cbiAgICAgIC8vIGVuc3VyZSB3ZSB0cmFjayB1c2VKU09OU291cmNlIGNhcGFiaWxpdHkgYXMgYSBzZXR0aW5nIGFzIHdlbGxcbiAgICAgIGlmIChfLmhhcyh0aGlzLm9wdHMsICd1c2VKU09OU291cmNlJykpIHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTZXR0aW5ncyh7dXNlSlNPTlNvdXJjZTogdGhpcy5vcHRzLnVzZUpTT05Tb3VyY2V9KTtcbiAgICAgIH1cblxuICAgICAgbGV0IHdkYVNldHRpbmdzID0ge1xuICAgICAgICBlbGVtZW50UmVzcG9uc2VBdHRyaWJ1dGVzOiBERUZBVUxUX1NFVFRJTkdTLmVsZW1lbnRSZXNwb25zZUF0dHJpYnV0ZXMsXG4gICAgICAgIHNob3VsZFVzZUNvbXBhY3RSZXNwb25zZXM6IERFRkFVTFRfU0VUVElOR1Muc2hvdWxkVXNlQ29tcGFjdFJlc3BvbnNlcyxcbiAgICAgIH07XG4gICAgICBpZiAoXy5oYXModGhpcy5vcHRzLCAnZWxlbWVudFJlc3BvbnNlQXR0cmlidXRlcycpKSB7XG4gICAgICAgIHdkYVNldHRpbmdzLmVsZW1lbnRSZXNwb25zZUF0dHJpYnV0ZXMgPSB0aGlzLm9wdHMuZWxlbWVudFJlc3BvbnNlQXR0cmlidXRlcztcbiAgICAgIH1cbiAgICAgIGlmIChfLmhhcyh0aGlzLm9wdHMsICdzaG91bGRVc2VDb21wYWN0UmVzcG9uc2VzJykpIHtcbiAgICAgICAgd2RhU2V0dGluZ3Muc2hvdWxkVXNlQ29tcGFjdFJlc3BvbnNlcyA9IHRoaXMub3B0cy5zaG91bGRVc2VDb21wYWN0UmVzcG9uc2VzO1xuICAgICAgfVxuICAgICAgaWYgKF8uaGFzKHRoaXMub3B0cywgJ21qcGVnU2VydmVyU2NyZWVuc2hvdFF1YWxpdHknKSkge1xuICAgICAgICB3ZGFTZXR0aW5ncy5tanBlZ1NlcnZlclNjcmVlbnNob3RRdWFsaXR5ID0gdGhpcy5vcHRzLm1qcGVnU2VydmVyU2NyZWVuc2hvdFF1YWxpdHk7XG4gICAgICB9XG4gICAgICBpZiAoXy5oYXModGhpcy5vcHRzLCAnbWpwZWdTZXJ2ZXJGcmFtZXJhdGUnKSkge1xuICAgICAgICB3ZGFTZXR0aW5ncy5tanBlZ1NlcnZlckZyYW1lcmF0ZSA9IHRoaXMub3B0cy5tanBlZ1NlcnZlckZyYW1lcmF0ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLm9wdHMuc2NyZWVuc2hvdFF1YWxpdHkpIHtcbiAgICAgICAgbG9nLmluZm8oYFNldHRpbmcgdGhlIHF1YWxpdHkgb2YgcGhvbmUgc2NyZWVuc2hvdDogJyR7dGhpcy5vcHRzLnNjcmVlbnNob3RRdWFsaXR5fSdgKTtcbiAgICAgICAgd2RhU2V0dGluZ3Muc2NyZWVuc2hvdFF1YWxpdHkgPSB0aGlzLm9wdHMuc2NyZWVuc2hvdFF1YWxpdHk7XG4gICAgICB9XG4gICAgICAvLyBlbnN1cmUgV0RBIGdldHMgb3VyIGRlZmF1bHRzIGluc3RlYWQgb2Ygd2hhdGV2ZXIgaXRzIG93biBtaWdodCBiZVxuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTZXR0aW5ncyh3ZGFTZXR0aW5ncyk7XG5cbiAgICAgIC8vIHR1cm4gb24gbWpwZWcgc3RyZWFtIHJlYWRpbmcgaWYgcmVxdWVzdGVkXG4gICAgICBpZiAodGhpcy5vcHRzLm1qcGVnU2NyZWVuc2hvdFVybCkge1xuICAgICAgICBsb2cuaW5mbyhgU3RhcnRpbmcgTUpQRUcgc3RyZWFtIHJlYWRpbmcgVVJMOiAnJHt0aGlzLm9wdHMubWpwZWdTY3JlZW5zaG90VXJsfSdgKTtcbiAgICAgICAgdGhpcy5tanBlZ1N0cmVhbSA9IG5ldyBtanBlZy5NSnBlZ1N0cmVhbSh0aGlzLm9wdHMubWpwZWdTY3JlZW5zaG90VXJsKTtcbiAgICAgICAgYXdhaXQgdGhpcy5tanBlZ1N0cmVhbS5zdGFydCgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtzZXNzaW9uSWQsIGNhcHNdO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZy5lcnJvcihlKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlU2Vzc2lvbigpO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzdGFydCAoKSB7XG4gICAgdGhpcy5vcHRzLm5vUmVzZXQgPSAhIXRoaXMub3B0cy5ub1Jlc2V0O1xuICAgIHRoaXMub3B0cy5mdWxsUmVzZXQgPSAhIXRoaXMub3B0cy5mdWxsUmVzZXQ7XG5cbiAgICBhd2FpdCBwcmludFVzZXIoKTtcblxuICAgIGlmICh0aGlzLm9wdHMucGxhdGZvcm1WZXJzaW9uICYmIHBhcnNlRmxvYXQodGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbikgPCA5LjMpIHtcbiAgICAgIHRocm93IEVycm9yKGBQbGF0Zm9ybSB2ZXJzaW9uIG11c3QgYmUgOS4zIG9yIGFib3ZlLiAnJHt0aGlzLm9wdHMucGxhdGZvcm1WZXJzaW9ufScgaXMgbm90IHN1cHBvcnRlZC5gKTtcbiAgICB9XG5cbiAgICBjb25zdCB7ZGV2aWNlLCB1ZGlkLCByZWFsRGV2aWNlfSA9IGF3YWl0IHRoaXMuZGV0ZXJtaW5lRGV2aWNlKCk7XG4gICAgbG9nLmluZm8oYERldGVybWluaW5nIGRldmljZSB0byBydW4gdGVzdHMgb246IHVkaWQ6ICcke3VkaWR9JywgcmVhbCBkZXZpY2U6ICR7cmVhbERldmljZX1gKTtcbiAgICB0aGlzLm9wdHMuZGV2aWNlID0gZGV2aWNlO1xuICAgIHRoaXMub3B0cy51ZGlkID0gdWRpZDtcbiAgICB0aGlzLm9wdHMucmVhbERldmljZSA9IHJlYWxEZXZpY2U7XG5cbiAgICBpZiAoXy5pc0VtcHR5KHRoaXMueGNvZGVWZXJzaW9uKSAmJiAoIXRoaXMub3B0cy53ZWJEcml2ZXJBZ2VudFVybCB8fCAhdGhpcy5vcHRzLnJlYWxEZXZpY2UpKSB7XG4gICAgICAvLyBubyBgd2ViRHJpdmVyQWdlbnRVcmxgLCBvciBvbiBhIHNpbXVsYXRvciwgc28gd2UgbmVlZCBhbiBYY29kZSB2ZXJzaW9uXG4gICAgICB0aGlzLnhjb2RlVmVyc2lvbiA9IGF3YWl0IGdldEFuZENoZWNrWGNvZGVWZXJzaW9uKCk7XG4gICAgICBjb25zdCB0b29scyA9ICF0aGlzLnhjb2RlVmVyc2lvbi50b29sc1ZlcnNpb24gPyAnJyA6IGAodG9vbHMgdiR7dGhpcy54Y29kZVZlcnNpb24udG9vbHNWZXJzaW9ufSlgO1xuICAgICAgbG9nLmRlYnVnKGBYY29kZSB2ZXJzaW9uIHNldCB0byAnJHt0aGlzLnhjb2RlVmVyc2lvbi52ZXJzaW9uU3RyaW5nfScgJHt0b29sc31gKTtcblxuICAgICAgdGhpcy5pb3NTZGtWZXJzaW9uID0gYXdhaXQgZ2V0QW5kQ2hlY2tJb3NTZGtWZXJzaW9uKCk7XG4gICAgICBsb2cuZGVidWcoYGlPUyBTREsgVmVyc2lvbiBzZXQgdG8gJyR7dGhpcy5pb3NTZGtWZXJzaW9ufSdgKTtcbiAgICB9XG4gICAgdGhpcy5sb2dFdmVudCgneGNvZGVEZXRhaWxzUmV0cmlldmVkJyk7XG5cbiAgICBpZiAodGhpcy5vcHRzLmVuYWJsZUFzeW5jRXhlY3V0ZUZyb21IdHRwcyAmJiAhdGhpcy5pc1JlYWxEZXZpY2UoKSkge1xuICAgICAgLy8gc2h1dGRvd24gdGhlIHNpbXVsYXRvciBzbyB0aGF0IHRoZSBzc2wgY2VydCBpcyByZWNvZ25pemVkXG4gICAgICBhd2FpdCBzaHV0ZG93blNpbXVsYXRvcih0aGlzLm9wdHMuZGV2aWNlKTtcbiAgICAgIGF3YWl0IHRoaXMuc3RhcnRIdHRwc0FzeW5jU2VydmVyKCk7XG4gICAgfVxuXG4gICAgLy8gYXQgdGhpcyBwb2ludCBpZiB0aGVyZSBpcyBubyBwbGF0Zm9ybVZlcnNpb24sIGdldCBpdCBmcm9tIHRoZSBkZXZpY2VcbiAgICBpZiAoIXRoaXMub3B0cy5wbGF0Zm9ybVZlcnNpb24pIHtcbiAgICAgIGlmICh0aGlzLm9wdHMuZGV2aWNlICYmIF8uaXNGdW5jdGlvbih0aGlzLm9wdHMuZGV2aWNlLmdldFBsYXRmb3JtVmVyc2lvbikpIHtcbiAgICAgICAgdGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbiA9IGF3YWl0IHRoaXMub3B0cy5kZXZpY2UuZ2V0UGxhdGZvcm1WZXJzaW9uKCk7XG4gICAgICAgIGxvZy5pbmZvKGBObyBwbGF0Zm9ybVZlcnNpb24gc3BlY2lmaWVkLiBVc2luZyBkZXZpY2UgdmVyc2lvbjogJyR7dGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbn0nYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIHdoZW4gaXQgaXMgYSByZWFsIGRldmljZS4gd2hlbiB3ZSBoYXZlIGEgcmVhbCBvYmplY3Qgd2lyZSBpdCBpblxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghdGhpcy5vcHRzLndlYkRyaXZlckFnZW50VXJsICYmIHRoaXMuaW9zU2RrVmVyc2lvbikge1xuICAgICAgLy8gbWFrZSBzdXJlIHRoYXQgdGhlIHhjb2RlIHdlIGFyZSB1c2luZyBjYW4gaGFuZGxlIHRoZSBwbGF0Zm9ybVxuICAgICAgaWYgKHBhcnNlRmxvYXQodGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbikgPiBwYXJzZUZsb2F0KHRoaXMuaW9zU2RrVmVyc2lvbikpIHtcbiAgICAgICAgbGV0IG1zZyA9IGBYY29kZSAke3RoaXMueGNvZGVWZXJzaW9uLnZlcnNpb25TdHJpbmd9IGhhcyBhIG1heGltdW0gU0RLIHZlcnNpb24gb2YgJHt0aGlzLmlvc1Nka1ZlcnNpb259LiBgICtcbiAgICAgICAgICAgICAgICAgIGBJdCBkb2VzIG5vdCBzdXBwb3J0IGlPUyB2ZXJzaW9uICR7dGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbn1gO1xuICAgICAgICBsb2cuZXJyb3JBbmRUaHJvdyhtc2cpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBsb2cuZGVidWcoJ1hjb2RlIHZlcnNpb24gd2lsbCBub3QgYmUgdmFsaWRhdGVkIGFnYWluc3QgaU9TIFNESyB2ZXJzaW9uLicpO1xuICAgIH1cblxuICAgIGlmICgodGhpcy5vcHRzLmJyb3dzZXJOYW1lIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSAnc2FmYXJpJykge1xuICAgICAgbG9nLmluZm8oJ1NhZmFyaSB0ZXN0IHJlcXVlc3RlZCcpO1xuICAgICAgdGhpcy5zYWZhcmkgPSB0cnVlO1xuICAgICAgdGhpcy5vcHRzLmFwcCA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMub3B0cy5wcm9jZXNzQXJndW1lbnRzID0gdGhpcy5vcHRzLnByb2Nlc3NBcmd1bWVudHMgfHwge307XG4gICAgICB0aGlzLm9wdHMuYnVuZGxlSWQgPSBTQUZBUklfQlVORExFX0lEO1xuICAgICAgdGhpcy5fY3VycmVudFVybCA9IHRoaXMub3B0cy5zYWZhcmlJbml0aWFsVXJsIHx8IChcbiAgICAgICAgdGhpcy5pc1JlYWxEZXZpY2UoKVxuICAgICAgICAgID8gJ2h0dHA6Ly9hcHBpdW0uaW8nXG4gICAgICAgICAgOiBgaHR0cDovLyR7dGhpcy5vcHRzLmFkZHJlc3N9OiR7dGhpcy5vcHRzLnBvcnR9L3dlbGNvbWVgXG4gICAgICApO1xuICAgICAgdGhpcy5vcHRzLnByb2Nlc3NBcmd1bWVudHMuYXJncyA9IFsnLXUnLCB0aGlzLl9jdXJyZW50VXJsXTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgdGhpcy5jb25maWd1cmVBcHAoKTtcbiAgICB9XG4gICAgdGhpcy5sb2dFdmVudCgnYXBwQ29uZmlndXJlZCcpO1xuXG4gICAgLy8gZmFpbCB2ZXJ5IGVhcmx5IGlmIHRoZSBhcHAgZG9lc24ndCBhY3R1YWxseSBleGlzdFxuICAgIC8vIG9yIGlmIGJ1bmRsZSBpZCBkb2Vzbid0IHBvaW50IHRvIGFuIGluc3RhbGxlZCBhcHBcbiAgICBpZiAodGhpcy5vcHRzLmFwcCkge1xuICAgICAgYXdhaXQgY2hlY2tBcHBQcmVzZW50KHRoaXMub3B0cy5hcHApO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5vcHRzLmJ1bmRsZUlkKSB7XG4gICAgICB0aGlzLm9wdHMuYnVuZGxlSWQgPSBhd2FpdCBhcHBVdGlscy5leHRyYWN0QnVuZGxlSWQodGhpcy5vcHRzLmFwcCk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5ydW5SZXNldCgpO1xuXG4gICAgY29uc3Qgc3RhcnRMb2dDYXB0dXJlID0gYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zdGFydExvZ0NhcHR1cmUoKTtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgdGhpcy5sb2dFdmVudCgnbG9nQ2FwdHVyZVN0YXJ0ZWQnKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgICBjb25zdCBpc0xvZ0NhcHR1cmVTdGFydGVkID0gYXdhaXQgc3RhcnRMb2dDYXB0dXJlKCk7XG5cbiAgICBsb2cuaW5mbyhgU2V0dGluZyB1cCAke3RoaXMuaXNSZWFsRGV2aWNlKCkgPyAncmVhbCBkZXZpY2UnIDogJ3NpbXVsYXRvcid9YCk7XG5cbiAgICBpZiAodGhpcy5pc1NpbXVsYXRvcigpKSB7XG4gICAgICBpZiAodGhpcy5vcHRzLnNodXRkb3duT3RoZXJTaW11bGF0b3JzKSB7XG4gICAgICAgIGlmICghdGhpcy5yZWxheGVkU2VjdXJpdHlFbmFibGVkKSB7XG4gICAgICAgICAgbG9nLmVycm9yQW5kVGhyb3coYEFwcGl1bSBzZXJ2ZXIgbXVzdCBoYXZlIHJlbGF4ZWQgc2VjdXJpdHkgZmxhZyBzZXQgaW4gb3JkZXIgYCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYGZvciAnc2h1dGRvd25PdGhlclNpbXVsYXRvcnMnIGNhcGFiaWxpdHkgdG8gd29ya2ApO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHNodXRkb3duT3RoZXJTaW11bGF0b3JzKHRoaXMub3B0cy5kZXZpY2UpO1xuICAgICAgfVxuXG4gICAgICAvLyBzZXQgcmVkdWNlTW90aW9uIGlmIGNhcGFiaWxpdHkgaXMgc2V0XG4gICAgICBpZiAodXRpbC5oYXNWYWx1ZSh0aGlzLm9wdHMucmVkdWNlTW90aW9uKSkge1xuICAgICAgICBhd2FpdCB0aGlzLm9wdHMuZGV2aWNlLnNldFJlZHVjZU1vdGlvbih0aGlzLm9wdHMucmVkdWNlTW90aW9uKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5sb2NhbENvbmZpZyA9IGF3YWl0IGlvc1NldHRpbmdzLnNldExvY2FsZUFuZFByZWZlcmVuY2VzKHRoaXMub3B0cy5kZXZpY2UsIHRoaXMub3B0cywgdGhpcy5pc1NhZmFyaSgpLCBhc3luYyAoc2ltKSA9PiB7XG4gICAgICAgIGF3YWl0IHNodXRkb3duU2ltdWxhdG9yKHNpbSk7XG5cbiAgICAgICAgLy8gd2UgZG9uJ3Qga25vdyBpZiB0aGVyZSBuZWVkcyB0byBiZSBjaGFuZ2VzIGEgcHJpb3JpLCBzbyBjaGFuZ2UgZmlyc3QuXG4gICAgICAgIC8vIHNvbWV0aW1lcyB0aGUgc2h1dGRvd24gcHJvY2VzcyBjaGFuZ2VzIHRoZSBzZXR0aW5ncywgc28gcmVzZXQgdGhlbSxcbiAgICAgICAgLy8ga25vd2luZyB0aGF0IHRoZSBzaW0gaXMgYWxyZWFkeSBzaHV0XG4gICAgICAgIGF3YWl0IGlvc1NldHRpbmdzLnNldExvY2FsZUFuZFByZWZlcmVuY2VzKHNpbSwgdGhpcy5vcHRzLCB0aGlzLmlzU2FmYXJpKCkpO1xuICAgICAgfSk7XG5cbiAgICAgIGF3YWl0IHRoaXMuc3RhcnRTaW0oKTtcblxuICAgICAgaWYgKHRoaXMub3B0cy5jdXN0b21TU0xDZXJ0KSB7XG4gICAgICAgIGlmIChhd2FpdCBoYXNTU0xDZXJ0KHRoaXMub3B0cy5jdXN0b21TU0xDZXJ0LCB0aGlzLm9wdHMudWRpZCkpIHtcbiAgICAgICAgICBsb2cuaW5mbyhgU1NMIGNlcnQgJyR7Xy50cnVuY2F0ZSh0aGlzLm9wdHMuY3VzdG9tU1NMQ2VydCwge2xlbmd0aDogMjB9KX0nIGFscmVhZHkgaW5zdGFsbGVkYCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbG9nLmluZm8oYEluc3RhbGxpbmcgc3NsIGNlcnQgJyR7Xy50cnVuY2F0ZSh0aGlzLm9wdHMuY3VzdG9tU1NMQ2VydCwge2xlbmd0aDogMjB9KX0nYCk7XG4gICAgICAgICAgYXdhaXQgc2h1dGRvd25TaW11bGF0b3IodGhpcy5vcHRzLmRldmljZSk7XG4gICAgICAgICAgYXdhaXQgaW5zdGFsbFNTTENlcnQodGhpcy5vcHRzLmN1c3RvbVNTTENlcnQsIHRoaXMub3B0cy51ZGlkKTtcbiAgICAgICAgICBsb2cuaW5mbyhgUmVzdGFydGluZyBTaW11bGF0b3Igc28gdGhhdCBTU0wgY2VydGlmaWNhdGUgaW5zdGFsbGF0aW9uIHRha2VzIGVmZmVjdGApO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc3RhcnRTaW0oKTtcbiAgICAgICAgICB0aGlzLmxvZ0V2ZW50KCdjdXN0b21DZXJ0SW5zdGFsbGVkJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5sb2dFdmVudCgnc2ltU3RhcnRlZCcpO1xuICAgICAgaWYgKCFpc0xvZ0NhcHR1cmVTdGFydGVkKSB7XG4gICAgICAgIC8vIFJldHJ5IGxvZyBjYXB0dXJlIGlmIFNpbXVsYXRvciB3YXMgbm90IHJ1bm5pbmcgYmVmb3JlXG4gICAgICAgIGF3YWl0IHN0YXJ0TG9nQ2FwdHVyZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLm9wdHMuYXBwKSB7XG4gICAgICBhd2FpdCB0aGlzLmluc3RhbGxBVVQoKTtcbiAgICAgIHRoaXMubG9nRXZlbnQoJ2FwcEluc3RhbGxlZCcpO1xuICAgIH1cblxuICAgIC8vIGlmIHdlIG9ubHkgaGF2ZSBidW5kbGUgaWRlbnRpZmllciBhbmQgbm8gYXBwLCBmYWlsIGlmIGl0IGlzIG5vdCBhbHJlYWR5IGluc3RhbGxlZFxuICAgIGlmICghdGhpcy5vcHRzLmFwcCAmJiB0aGlzLm9wdHMuYnVuZGxlSWQgJiYgIXRoaXMuc2FmYXJpKSB7XG4gICAgICBpZiAoIWF3YWl0IHRoaXMub3B0cy5kZXZpY2UuaXNBcHBJbnN0YWxsZWQodGhpcy5vcHRzLmJ1bmRsZUlkKSkge1xuICAgICAgICBsb2cuZXJyb3JBbmRUaHJvdyhgQXBwIHdpdGggYnVuZGxlIGlkZW50aWZpZXIgJyR7dGhpcy5vcHRzLmJ1bmRsZUlkfScgdW5rbm93bmApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLm9wdHMucGVybWlzc2lvbnMpIHtcbiAgICAgIGlmICh0aGlzLmlzU2ltdWxhdG9yKCkpIHtcbiAgICAgICAgbG9nLmRlYnVnKCdTZXR0aW5nIHRoZSByZXF1ZXN0ZWQgcGVybWlzc2lvbnMgYmVmb3JlIFdEQSBpcyBzdGFydGVkJyk7XG4gICAgICAgIGZvciAoY29uc3QgW2J1bmRsZUlkLCBwZXJtaXNzaW9uc01hcHBpbmddIG9mIF8udG9QYWlycyhKU09OLnBhcnNlKHRoaXMub3B0cy5wZXJtaXNzaW9ucykpKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5vcHRzLmRldmljZS5zZXRQZXJtaXNzaW9ucyhidW5kbGVJZCwgcGVybWlzc2lvbnNNYXBwaW5nKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nLndhcm4oJ1NldHRpbmcgcGVybWlzc2lvbnMgaXMgb25seSBzdXBwb3J0ZWQgb24gU2ltdWxhdG9yLiAnICtcbiAgICAgICAgICAnVGhlIFwicGVybWlzc2lvbnNcIiBjYXBhYmlsaXR5IHdpbGwgYmUgaWdub3JlZC4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhd2FpdCBTSEFSRURfUkVTT1VSQ0VTX0dVQVJELmFjcXVpcmUoWENVSVRlc3REcml2ZXIubmFtZSxcbiAgICAgIGFzeW5jICgpID0+IGF3YWl0IHRoaXMuc3RhcnRXZGEodGhpcy5vcHRzLnNlc3Npb25JZCwgcmVhbERldmljZSkpO1xuXG4gICAgYXdhaXQgdGhpcy5zZXRJbml0aWFsT3JpZW50YXRpb24odGhpcy5vcHRzLm9yaWVudGF0aW9uKTtcbiAgICB0aGlzLmxvZ0V2ZW50KCdvcmllbnRhdGlvblNldCcpO1xuXG4gICAgaWYgKHRoaXMuaXNSZWFsRGV2aWNlKCkgJiYgdGhpcy5vcHRzLnN0YXJ0SVdEUCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zdGFydElXRFAoKTtcbiAgICAgICAgbG9nLmRlYnVnKGBTdGFydGVkIGlvc193ZWJraXRfZGVidWcgcHJveHkgc2VydmVyIGF0OiAke3RoaXMuaXdkcFNlcnZlci5lbmRwb2ludH1gKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBsb2cuZXJyb3JBbmRUaHJvdyhgQ291bGQgbm90IHN0YXJ0IGlvc193ZWJraXRfZGVidWdfcHJveHkgc2VydmVyOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLmlzU2FmYXJpKCkgfHwgdGhpcy5vcHRzLmF1dG9XZWJ2aWV3KSB7XG4gICAgICBsb2cuZGVidWcoJ1dhaXRpbmcgZm9yIGluaXRpYWwgd2VidmlldycpO1xuICAgICAgYXdhaXQgdGhpcy5uYXZUb0luaXRpYWxXZWJ2aWV3KCk7XG4gICAgICB0aGlzLmxvZ0V2ZW50KCdpbml0aWFsV2Vidmlld05hdmlnYXRlZCcpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5pc1JlYWxEZXZpY2UoKSkge1xuICAgICAgaWYgKHRoaXMub3B0cy5jYWxlbmRhckFjY2Vzc0F1dGhvcml6ZWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5vcHRzLmRldmljZS5lbmFibGVDYWxlbmRhckFjY2Vzcyh0aGlzLm9wdHMuYnVuZGxlSWQpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLm9wdHMuY2FsZW5kYXJBY2Nlc3NBdXRob3JpemVkID09PSBmYWxzZSkge1xuICAgICAgICBhd2FpdCB0aGlzLm9wdHMuZGV2aWNlLmRpc2FibGVDYWxlbmRhckFjY2Vzcyh0aGlzLm9wdHMuYnVuZGxlSWQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydCBXZWJEcml2ZXJBZ2VudFJ1bm5lclxuICAgKiBAcGFyYW0ge3N0cmluZ30gc2Vzc2lvbklkIC0gVGhlIGlkIG9mIHRoZSB0YXJnZXQgc2Vzc2lvbiB0byBsYXVuY2ggV0RBIHdpdGguXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gcmVhbERldmljZSAtIEVxdWFscyB0byB0cnVlIGlmIHRoZSB0ZXN0IHRhcmdldCBkZXZpY2UgaXMgYSByZWFsIGRldmljZS5cbiAgICovXG4gIGFzeW5jIHN0YXJ0V2RhIChzZXNzaW9uSWQsIHJlYWxEZXZpY2UpIHtcbiAgICB0aGlzLndkYSA9IG5ldyBXZWJEcml2ZXJBZ2VudCh0aGlzLnhjb2RlVmVyc2lvbiwgdGhpcy5vcHRzKTtcblxuICAgIGF3YWl0IHRoaXMud2RhLmNsZWFudXBPYnNvbGV0ZVByb2Nlc3NlcygpO1xuXG4gICAgaWYgKHRoaXMub3B0cy51c2VOZXdXREEpIHtcbiAgICAgIGxvZy5kZWJ1ZyhgQ2FwYWJpbGl0eSAndXNlTmV3V0RBJyBzZXQgdG8gdHJ1ZSwgc28gdW5pbnN0YWxsaW5nIFdEQSBiZWZvcmUgcHJvY2VlZGluZ2ApO1xuICAgICAgYXdhaXQgdGhpcy53ZGEucXVpdEFuZFVuaW5zdGFsbCgpO1xuICAgICAgdGhpcy5sb2dFdmVudCgnd2RhVW5pbnN0YWxsZWQnKTtcbiAgICB9IGVsc2UgaWYgKCF1dGlsLmhhc1ZhbHVlKHRoaXMud2RhLndlYkRyaXZlckFnZW50VXJsKSkge1xuICAgICAgYXdhaXQgdGhpcy53ZGEuc2V0dXBDYWNoaW5nKHRoaXMub3B0cy51cGRhdGVkV0RBQnVuZGxlSWQpO1xuICAgIH1cblxuICAgIC8vIGxvY2FsIGhlbHBlciBmb3IgdGhlIHR3byBwbGFjZXMgd2UgbmVlZCB0byB1bmluc3RhbGwgd2RhIGFuZCByZS1zdGFydCBpdFxuICAgIGNvbnN0IHF1aXRBbmRVbmluc3RhbGwgPSBhc3luYyAobXNnKSA9PiB7XG4gICAgICBsb2cuZGVidWcobXNnKTtcbiAgICAgIGlmICh0aGlzLm9wdHMud2ViRHJpdmVyQWdlbnRVcmwpIHtcbiAgICAgICAgbG9nLmRlYnVnKCdOb3QgcXVpdHRpbmcgYW5kIHVuc2luc3RhbGxpbmcgV2ViRHJpdmVyQWdlbnQgYXMgd2ViRHJpdmVyQWdlbnRVcmwgaXMgcHJvdmlkZWQnKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgICB9XG4gICAgICBsb2cud2FybignUXVpdHRpbmcgYW5kIHVuaW5zdGFsbGluZyBXZWJEcml2ZXJBZ2VudCwgdGhlbiByZXRyeWluZycpO1xuICAgICAgYXdhaXQgdGhpcy53ZGEucXVpdEFuZFVuaW5zdGFsbCgpO1xuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICB9O1xuXG4gICAgY29uc3Qgc3RhcnR1cFJldHJpZXMgPSB0aGlzLm9wdHMud2RhU3RhcnR1cFJldHJpZXMgfHwgKHRoaXMuaXNSZWFsRGV2aWNlKCkgPyBXREFfUkVBTF9ERVZfU1RBUlRVUF9SRVRSSUVTIDogV0RBX1NJTV9TVEFSVFVQX1JFVFJJRVMpO1xuICAgIGNvbnN0IHN0YXJ0dXBSZXRyeUludGVydmFsID0gdGhpcy5vcHRzLndkYVN0YXJ0dXBSZXRyeUludGVydmFsIHx8IFdEQV9TVEFSVFVQX1JFVFJZX0lOVEVSVkFMO1xuICAgIGxvZy5kZWJ1ZyhgVHJ5aW5nIHRvIHN0YXJ0IFdlYkRyaXZlckFnZW50ICR7c3RhcnR1cFJldHJpZXN9IHRpbWVzIHdpdGggJHtzdGFydHVwUmV0cnlJbnRlcnZhbH1tcyBpbnRlcnZhbGApO1xuICAgIGF3YWl0IHJldHJ5SW50ZXJ2YWwoc3RhcnR1cFJldHJpZXMsIHN0YXJ0dXBSZXRyeUludGVydmFsLCBhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLmxvZ0V2ZW50KCd3ZGFTdGFydEF0dGVtcHRlZCcpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gb24geGNvZGUgMTAgaW5zdGFsbGQgd2lsbCBvZnRlbiB0cnkgdG8gYWNjZXNzIHRoZSBhcHAgZnJvbSBpdHMgc3RhZ2luZ1xuICAgICAgICAvLyBkaXJlY3RvcnkgYmVmb3JlIGZ1bGx5IG1vdmluZyBpdCB0aGVyZSwgYW5kIGZhaWwuIFJldHJ5aW5nIG9uY2VcbiAgICAgICAgLy8gaW1tZWRpYXRlbHkgaGVscHNcbiAgICAgICAgY29uc3QgcmV0cmllcyA9IHRoaXMueGNvZGVWZXJzaW9uLm1ham9yID49IDEwID8gMiA6IDE7XG4gICAgICAgIHRoaXMuY2FjaGVkV2RhU3RhdHVzID0gYXdhaXQgcmV0cnkocmV0cmllcywgdGhpcy53ZGEubGF1bmNoLmJpbmQodGhpcy53ZGEpLCBzZXNzaW9uSWQsIHJlYWxEZXZpY2UpO1xuICAgICAgICAvLyB0aGlzLmNhY2hlZFdkYVN0YXR1cyA9IGF3YWl0IHRoaXMud2RhLmxhdW5jaChzZXNzaW9uSWQsIHJlYWxEZXZpY2UpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHRoaXMubG9nRXZlbnQoJ3dkYVN0YXJ0RmFpbGVkJyk7XG4gICAgICAgIGxldCBlcnJvck1zZyA9IGBVbmFibGUgdG8gbGF1bmNoIFdlYkRyaXZlckFnZW50IGJlY2F1c2Ugb2YgeGNvZGVidWlsZCBmYWlsdXJlOiBcIiR7ZXJyLm1lc3NhZ2V9XCIuYDtcbiAgICAgICAgaWYgKHRoaXMuaXNSZWFsRGV2aWNlKCkpIHtcbiAgICAgICAgICBlcnJvck1zZyArPSBgIE1ha2Ugc3VyZSB5b3UgZm9sbG93IHRoZSB0dXRvcmlhbCBhdCAke1dEQV9SRUFMX0RFVl9UVVRPUklBTF9VUkx9LiBgICtcbiAgICAgICAgICAgICAgICAgICAgICBgVHJ5IHRvIHJlbW92ZSB0aGUgV2ViRHJpdmVyQWdlbnRSdW5uZXIgYXBwbGljYXRpb24gZnJvbSB0aGUgZGV2aWNlIGlmIGl0IGlzIGluc3RhbGxlZCBgICtcbiAgICAgICAgICAgICAgICAgICAgICBgYW5kIHJlYm9vdCB0aGUgZGV2aWNlLmA7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcXVpdEFuZFVuaW5zdGFsbChlcnJvck1zZyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMucHJveHlSZXFSZXMgPSB0aGlzLndkYS5wcm94eVJlcVJlcy5iaW5kKHRoaXMud2RhKTtcbiAgICAgIHRoaXMuandwUHJveHlBY3RpdmUgPSB0cnVlO1xuXG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCByZXRyeUludGVydmFsKDE1LCAxMDAwLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5sb2dFdmVudCgnd2RhU2Vzc2lvbkF0dGVtcHRlZCcpO1xuICAgICAgICAgIGxvZy5kZWJ1ZygnU2VuZGluZyBjcmVhdGVTZXNzaW9uIGNvbW1hbmQgdG8gV0RBJyk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuY2FjaGVkV2RhU3RhdHVzID0gdGhpcy5jYWNoZWRXZGFTdGF0dXMgfHwgYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoJy9zdGF0dXMnLCAnR0VUJyk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnN0YXJ0V2RhU2Vzc2lvbih0aGlzLm9wdHMuYnVuZGxlSWQsIHRoaXMub3B0cy5wcm9jZXNzQXJndW1lbnRzKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGxvZy5kZWJ1ZyhgRmFpbGVkIHRvIGNyZWF0ZSBXREEgc2Vzc2lvbiAoJHtlcnIubWVzc2FnZX0pLiBSZXRyeWluZy4uLmApO1xuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubG9nRXZlbnQoJ3dkYVNlc3Npb25TdGFydGVkJyk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgbGV0IGVycm9yTXNnID0gYFVuYWJsZSB0byBzdGFydCBXZWJEcml2ZXJBZ2VudCBzZXNzaW9uIGJlY2F1c2Ugb2YgeGNvZGVidWlsZCBmYWlsdXJlOiAke2Vyci5tZXNzYWdlfWA7XG4gICAgICAgIGlmICh0aGlzLmlzUmVhbERldmljZSgpKSB7XG4gICAgICAgICAgZXJyb3JNc2cgKz0gYCBNYWtlIHN1cmUgeW91IGZvbGxvdyB0aGUgdHV0b3JpYWwgYXQgJHtXREFfUkVBTF9ERVZfVFVUT1JJQUxfVVJMfS4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgYFRyeSB0byByZW1vdmUgdGhlIFdlYkRyaXZlckFnZW50UnVubmVyIGFwcGxpY2F0aW9uIGZyb20gdGhlIGRldmljZSBpZiBpdCBpcyBpbnN0YWxsZWQgYCArXG4gICAgICAgICAgICAgICAgICAgICAgYGFuZCByZWJvb3QgdGhlIGRldmljZS5gO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHF1aXRBbmRVbmluc3RhbGwoZXJyb3JNc2cpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXV0aWwuaGFzVmFsdWUodGhpcy5vcHRzLnByZXZlbnRXREFBdHRhY2htZW50cykpIHtcbiAgICAgICAgLy8gWENUZXN0IHByaW9yIHRvIFhjb2RlIDkgU0RLIGhhcyBubyBuYXRpdmUgd2F5IHRvIGRpc2FibGUgYXR0YWNobWVudHNcbiAgICAgICAgdGhpcy5vcHRzLnByZXZlbnRXREFBdHRhY2htZW50cyA9IHRoaXMueGNvZGVWZXJzaW9uLm1ham9yIDwgOTtcbiAgICAgICAgaWYgKHRoaXMub3B0cy5wcmV2ZW50V0RBQXR0YWNobWVudHMpIHtcbiAgICAgICAgICBsb2cuaW5mbygnRW5hYmxlZCBXREEgYXR0YWNobWVudHMgcHJldmVudGlvbiBieSBkZWZhdWx0IHRvIHNhdmUgdGhlIGRpc2sgc3BhY2UuICcgK1xuICAgICAgICAgICAgICAgICAgIGBTZXQgJ3ByZXZlbnRXREFBdHRhY2htZW50cycgY2FwYWJpbGl0eSB0byBmYWxzZSBpZiB0aGlzIGlzIGFuIHVuZGVzaXJlZCBiZWhhdmlvci5gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMub3B0cy5wcmV2ZW50V0RBQXR0YWNobWVudHMpIHtcbiAgICAgICAgYXdhaXQgYWRqdXN0V0RBQXR0YWNobWVudHNQZXJtaXNzaW9ucyh0aGlzLndkYSwgdGhpcy5vcHRzLnByZXZlbnRXREFBdHRhY2htZW50cyA/ICc1NTUnIDogJzc1NScpO1xuICAgICAgICB0aGlzLmxvZ0V2ZW50KCd3ZGFQZXJtc0FkanVzdGVkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLm9wdHMuY2xlYXJTeXN0ZW1GaWxlcykge1xuICAgICAgICBhd2FpdCBtYXJrU3lzdGVtRmlsZXNGb3JDbGVhbnVwKHRoaXMud2RhKTtcbiAgICAgIH1cblxuICAgICAgLy8gd2UgZXhwZWN0IGNlcnRhaW4gc29ja2V0IGVycm9ycyB1bnRpbCB0aGlzIHBvaW50LCBidXQgbm93XG4gICAgICAvLyBtYXJrIHRoaW5ncyBhcyBmdWxseSB3b3JraW5nXG4gICAgICB0aGlzLndkYS5mdWxseVN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgdGhpcy5sb2dFdmVudCgnd2RhU3RhcnRlZCcpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgcnVuUmVzZXQgKG9wdHMgPSBudWxsKSB7XG4gICAgdGhpcy5sb2dFdmVudCgncmVzZXRTdGFydGVkJyk7XG4gICAgaWYgKHRoaXMuaXNSZWFsRGV2aWNlKCkpIHtcbiAgICAgIGF3YWl0IHJ1blJlYWxEZXZpY2VSZXNldCh0aGlzLm9wdHMuZGV2aWNlLCBvcHRzIHx8IHRoaXMub3B0cyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHJ1blNpbXVsYXRvclJlc2V0KHRoaXMub3B0cy5kZXZpY2UsIG9wdHMgfHwgdGhpcy5vcHRzKTtcbiAgICB9XG4gICAgdGhpcy5sb2dFdmVudCgncmVzZXRDb21wbGV0ZScpO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlU2Vzc2lvbiAoKSB7XG4gICAgYXdhaXQgcmVtb3ZlQWxsU2Vzc2lvbldlYlNvY2tldEhhbmRsZXJzKHRoaXMuc2VydmVyLCB0aGlzLnNlc3Npb25JZCk7XG5cbiAgICBhd2FpdCBTSEFSRURfUkVTT1VSQ0VTX0dVQVJELmFjcXVpcmUoWENVSVRlc3REcml2ZXIubmFtZSwgYXN5bmMgKCkgPT4ge1xuICAgICAgYXdhaXQgdGhpcy5zdG9wKCk7XG5cbiAgICAgIC8vIHJlc2V0IHRoZSBwZXJtaXNzaW9ucyBvbiB0aGUgZGVyaXZlZCBkYXRhIGZvbGRlciwgaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAodGhpcy5vcHRzLnByZXZlbnRXREFBdHRhY2htZW50cykge1xuICAgICAgICBhd2FpdCBhZGp1c3RXREFBdHRhY2htZW50c1Blcm1pc3Npb25zKHRoaXMud2RhLCAnNzU1Jyk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLm9wdHMuY2xlYXJTeXN0ZW1GaWxlcykge1xuICAgICAgICBpZiAodGhpcy5pc0FwcFRlbXBvcmFyeSkge1xuICAgICAgICAgIGF3YWl0IGZzLnJpbXJhZih0aGlzLm9wdHMuYXBwKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjbGVhclN5c3RlbUZpbGVzKHRoaXMud2RhLCAhIXRoaXMub3B0cy5zaG93WGNvZGVMb2cpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nLmRlYnVnKCdOb3QgY2xlYXJpbmcgbG9nIGZpbGVzLiBVc2UgYGNsZWFyU3lzdGVtRmlsZXNgIGNhcGFiaWxpdHkgdG8gdHVybiBvbi4nKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmICh0aGlzLmlzV2ViQ29udGV4dCgpKSB7XG4gICAgICBsb2cuZGVidWcoJ0luIGEgd2ViIHNlc3Npb24uIFJlbW92aW5nIHJlbW90ZSBkZWJ1Z2dlcicpO1xuICAgICAgYXdhaXQgdGhpcy5zdG9wUmVtb3RlKCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMub3B0cy5yZXNldE9uU2Vzc2lvblN0YXJ0T25seSA9PT0gZmFsc2UpIHtcbiAgICAgIGF3YWl0IHRoaXMucnVuUmVzZXQoKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc1NpbXVsYXRvcigpICYmICF0aGlzLm9wdHMubm9SZXNldCAmJiAhIXRoaXMub3B0cy5kZXZpY2UpIHtcbiAgICAgIGlmICh0aGlzLmxpZmVjeWNsZURhdGEuY3JlYXRlU2ltKSB7XG4gICAgICAgIGxvZy5kZWJ1ZyhgRGVsZXRpbmcgc2ltdWxhdG9yIGNyZWF0ZWQgZm9yIHRoaXMgcnVuICh1ZGlkOiAnJHt0aGlzLm9wdHMudWRpZH0nKWApO1xuICAgICAgICBhd2FpdCBzaHV0ZG93blNpbXVsYXRvcih0aGlzLm9wdHMuZGV2aWNlKTtcbiAgICAgICAgYXdhaXQgdGhpcy5vcHRzLmRldmljZS5kZWxldGUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIV8uaXNFbXB0eSh0aGlzLmxvZ3MpKSB7XG4gICAgICBhd2FpdCB0aGlzLmxvZ3Muc3lzbG9nLnN0b3BDYXB0dXJlKCk7XG4gICAgICB0aGlzLmxvZ3MgPSB7fTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pd2RwU2VydmVyKSB7XG4gICAgICBhd2FpdCB0aGlzLnN0b3BJV0RQKCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMub3B0cy5lbmFibGVBc3luY0V4ZWN1dGVGcm9tSHR0cHMgJiYgIXRoaXMuaXNSZWFsRGV2aWNlKCkpIHtcbiAgICAgIGF3YWl0IHRoaXMuc3RvcEh0dHBzQXN5bmNTZXJ2ZXIoKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5tanBlZ1N0cmVhbSkge1xuICAgICAgbG9nLmluZm8oJ0Nsb3NpbmcgTUpQRUcgc3RyZWFtJyk7XG4gICAgICB0aGlzLm1qcGVnU3RyZWFtLnN0b3AoKTtcbiAgICB9XG5cbiAgICB0aGlzLnJlc2V0SW9zKCk7XG5cbiAgICBhd2FpdCBzdXBlci5kZWxldGVTZXNzaW9uKCk7XG4gIH1cblxuICBhc3luYyBzdG9wICgpIHtcbiAgICB0aGlzLmp3cFByb3h5QWN0aXZlID0gZmFsc2U7XG4gICAgdGhpcy5wcm94eVJlcVJlcyA9IG51bGw7XG5cbiAgICBpZiAodGhpcy53ZGEgJiYgdGhpcy53ZGEuZnVsbHlTdGFydGVkKSB7XG4gICAgICBpZiAodGhpcy53ZGEuandwcm94eSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucHJveHlDb21tYW5kKGAvc2Vzc2lvbi8ke3RoaXMuc2Vzc2lvbklkfWAsICdERUxFVEUnKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgLy8gYW4gZXJyb3IgaGVyZSBzaG91bGQgbm90IHNob3J0LWNpcmN1aXQgdGhlIHJlc3Qgb2YgY2xlYW4gdXBcbiAgICAgICAgICBsb2cuZGVidWcoYFVuYWJsZSB0byBERUxFVEUgc2Vzc2lvbiBvbiBXREE6ICcke2Vyci5tZXNzYWdlfScuIENvbnRpbnVpbmcgc2h1dGRvd24uYCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLndkYSAmJiAhdGhpcy53ZGEud2ViRHJpdmVyQWdlbnRVcmwgJiYgdGhpcy5vcHRzLnVzZU5ld1dEQSkge1xuICAgICAgICBhd2FpdCB0aGlzLndkYS5xdWl0KCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZUNvbW1hbmQgKGNtZCwgLi4uYXJncykge1xuICAgIGxvZy5kZWJ1ZyhgRXhlY3V0aW5nIGNvbW1hbmQgJyR7Y21kfSdgKTtcblxuICAgIGlmIChjbWQgPT09ICdyZWNlaXZlQXN5bmNSZXNwb25zZScpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnJlY2VpdmVBc3luY1Jlc3BvbnNlKC4uLmFyZ3MpO1xuICAgIH1cbiAgICAvLyBUT0RPOiBvbmNlIHRoaXMgZml4IGdldHMgaW50byBiYXNlIGRyaXZlciByZW1vdmUgZnJvbSBoZXJlXG4gICAgaWYgKGNtZCA9PT0gJ2dldFN0YXR1cycpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFN0YXR1cygpO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgc3VwZXIuZXhlY3V0ZUNvbW1hbmQoY21kLCAuLi5hcmdzKTtcbiAgfVxuXG4gIGFzeW5jIGNvbmZpZ3VyZUFwcCAoKSB7XG4gICAgZnVuY3Rpb24gYXBwSXNQYWNrYWdlT3JCdW5kbGUgKGFwcCkge1xuICAgICAgcmV0dXJuICgvXihbYS16QS1aMC05XFwtX10rXFwuW2EtekEtWjAtOVxcLV9dKykrJC8pLnRlc3QoYXBwKTtcbiAgICB9XG5cbiAgICAvLyB0aGUgYXBwIG5hbWUgaXMgYSBidW5kbGVJZCBhc3NpZ24gaXQgdG8gdGhlIGJ1bmRsZUlkIHByb3BlcnR5XG4gICAgaWYgKCF0aGlzLm9wdHMuYnVuZGxlSWQgJiYgYXBwSXNQYWNrYWdlT3JCdW5kbGUodGhpcy5vcHRzLmFwcCkpIHtcbiAgICAgIHRoaXMub3B0cy5idW5kbGVJZCA9IHRoaXMub3B0cy5hcHA7XG4gICAgICB0aGlzLm9wdHMuYXBwID0gJyc7XG4gICAgfVxuICAgIC8vIHdlIGhhdmUgYSBidW5kbGUgSUQsIGJ1dCBubyBhcHAsIG9yIGFwcCBpcyBhbHNvIGEgYnVuZGxlXG4gICAgaWYgKCh0aGlzLm9wdHMuYnVuZGxlSWQgJiYgYXBwSXNQYWNrYWdlT3JCdW5kbGUodGhpcy5vcHRzLmJ1bmRsZUlkKSkgJiZcbiAgICAgICAgKHRoaXMub3B0cy5hcHAgPT09ICcnIHx8IGFwcElzUGFja2FnZU9yQnVuZGxlKHRoaXMub3B0cy5hcHApKSkge1xuICAgICAgbG9nLmRlYnVnKCdBcHAgaXMgYW4gaU9TIGJ1bmRsZSwgd2lsbCBhdHRlbXB0IHRvIHJ1biBhcyBwcmUtZXhpc3RpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBjaGVjayBmb3Igc3VwcG9ydGVkIGJ1aWxkLWluIGFwcHNcbiAgICBpZiAodGhpcy5vcHRzLmFwcCAmJiB0aGlzLm9wdHMuYXBwLnRvTG93ZXJDYXNlKCkgPT09ICdzZXR0aW5ncycpIHtcbiAgICAgIHRoaXMub3B0cy5idW5kbGVJZCA9ICdjb20uYXBwbGUuUHJlZmVyZW5jZXMnO1xuICAgICAgdGhpcy5vcHRzLmFwcCA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmICh0aGlzLm9wdHMuYXBwICYmIHRoaXMub3B0cy5hcHAudG9Mb3dlckNhc2UoKSA9PT0gJ2NhbGVuZGFyJykge1xuICAgICAgdGhpcy5vcHRzLmJ1bmRsZUlkID0gJ2NvbS5hcHBsZS5tb2JpbGVjYWwnO1xuICAgICAgdGhpcy5vcHRzLmFwcCA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxBcHBQYXRoID0gdGhpcy5vcHRzLmFwcDtcbiAgICB0cnkge1xuICAgICAgLy8gZG93bmxvYWQgaWYgbmVjZXNzYXJ5XG4gICAgICB0aGlzLm9wdHMuYXBwID0gYXdhaXQgdGhpcy5oZWxwZXJzLmNvbmZpZ3VyZUFwcCh0aGlzLm9wdHMuYXBwLCAnLmFwcCcsIHRoaXMub3B0cy5tb3VudFJvb3QsIHRoaXMub3B0cy53aW5kb3dzU2hhcmVVc2VyTmFtZSwgdGhpcy5vcHRzLndpbmRvd3NTaGFyZVBhc3N3b3JkKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy5lcnJvcihlcnIpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQmFkIGFwcDogJHt0aGlzLm9wdHMuYXBwfS4gQXBwIHBhdGhzIG5lZWQgdG8gYmUgYWJzb2x1dGUsIG9yIHJlbGF0aXZlIHRvIHRoZSBhcHBpdW0gYCArXG4gICAgICAgICdzZXJ2ZXIgaW5zdGFsbCBkaXIsIG9yIGEgVVJMIHRvIGNvbXByZXNzZWQgZmlsZSwgb3IgYSBzcGVjaWFsIGFwcCBuYW1lLicpO1xuICAgIH1cbiAgICB0aGlzLmlzQXBwVGVtcG9yYXJ5ID0gdGhpcy5vcHRzLmFwcCAmJiBvcmlnaW5hbEFwcFBhdGggIT09IHRoaXMub3B0cy5hcHA7XG4gIH1cblxuICBhc3luYyBkZXRlcm1pbmVEZXZpY2UgKCkge1xuICAgIC8vIGluIHRoZSBvbmUgY2FzZSB3aGVyZSB3ZSBjcmVhdGUgYSBzaW0sIHdlIHdpbGwgc2V0IHRoaXMgc3RhdGVcbiAgICB0aGlzLmxpZmVjeWNsZURhdGEuY3JlYXRlU2ltID0gZmFsc2U7XG5cbiAgICAvLyBpZiB3ZSBnZXQgZ2VuZXJpYyBuYW1lcywgdHJhbnNsYXRlIHRoZW1cbiAgICB0aGlzLm9wdHMuZGV2aWNlTmFtZSA9IHRyYW5zbGF0ZURldmljZU5hbWUodGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbiwgdGhpcy5vcHRzLmRldmljZU5hbWUpO1xuXG4gICAgaWYgKHRoaXMub3B0cy51ZGlkKSB7XG4gICAgICBpZiAodGhpcy5vcHRzLnVkaWQudG9Mb3dlckNhc2UoKSA9PT0gJ2F1dG8nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdGhpcy5vcHRzLnVkaWQgPSBhd2FpdCBkZXRlY3RVZGlkKCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIC8vIFRyeWluZyB0byBmaW5kIG1hdGNoaW5nIFVESUQgZm9yIFNpbXVsYXRvclxuICAgICAgICAgIGxvZy53YXJuKGBDYW5ub3QgZGV0ZWN0IGFueSBjb25uZWN0ZWQgcmVhbCBkZXZpY2VzLiBGYWxsaW5nIGJhY2sgdG8gU2ltdWxhdG9yLiBPcmlnaW5hbCBlcnJvcjogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgICBjb25zdCBkZXZpY2UgPSBhd2FpdCBnZXRFeGlzdGluZ1NpbSh0aGlzLm9wdHMpO1xuICAgICAgICAgIGlmICghZGV2aWNlKSB7XG4gICAgICAgICAgICAvLyBObyBtYXRjaGluZyBTaW11bGF0b3IgaXMgZm91bmQuIFRocm93IGFuIGVycm9yXG4gICAgICAgICAgICBsb2cuZXJyb3JBbmRUaHJvdyhgQ2Fubm90IGRldGVjdCB1ZGlkIGZvciAke3RoaXMub3B0cy5kZXZpY2VOYW1lfSBTaW11bGF0b3IgcnVubmluZyBpT1MgJHt0aGlzLm9wdHMucGxhdGZvcm1WZXJzaW9ufWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBNYXRjaGluZyBTaW11bGF0b3IgZXhpc3RzIGFuZCBpcyBmb3VuZC4gVXNlIGl0XG4gICAgICAgICAgdGhpcy5vcHRzLnVkaWQgPSBkZXZpY2UudWRpZDtcbiAgICAgICAgICByZXR1cm4ge2RldmljZSwgcmVhbERldmljZTogZmFsc2UsIHVkaWQ6IGRldmljZS51ZGlkfTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gbWFrZSBzdXJlIGl0IGlzIGEgY29ubmVjdGVkIGRldmljZS4gSWYgbm90LCB0aGUgdWRpZCBwYXNzZWQgaW4gaXMgaW52YWxpZFxuICAgICAgICBjb25zdCBkZXZpY2VzID0gYXdhaXQgZ2V0Q29ubmVjdGVkRGV2aWNlcygpO1xuICAgICAgICBsb2cuZGVidWcoYEF2YWlsYWJsZSBkZXZpY2VzOiAke2RldmljZXMuam9pbignLCAnKX1gKTtcbiAgICAgICAgaWYgKCFkZXZpY2VzLmluY2x1ZGVzKHRoaXMub3B0cy51ZGlkKSkge1xuICAgICAgICAgIC8vIGNoZWNrIGZvciBhIHBhcnRpY3VsYXIgc2ltdWxhdG9yXG4gICAgICAgICAgaWYgKGF3YWl0IHNpbUV4aXN0cyh0aGlzLm9wdHMudWRpZCkpIHtcbiAgICAgICAgICAgIGNvbnN0IGRldmljZSA9IGF3YWl0IGdldFNpbXVsYXRvcih0aGlzLm9wdHMudWRpZCk7XG4gICAgICAgICAgICByZXR1cm4ge2RldmljZSwgcmVhbERldmljZTogZmFsc2UsIHVkaWQ6IHRoaXMub3B0cy51ZGlkfTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gZGV2aWNlIG9yIHNpbXVsYXRvciBVRElEOiAnJHt0aGlzLm9wdHMudWRpZH0nYCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgZGV2aWNlID0gYXdhaXQgZ2V0UmVhbERldmljZU9iaih0aGlzLm9wdHMudWRpZCk7XG4gICAgICByZXR1cm4ge2RldmljZSwgcmVhbERldmljZTogdHJ1ZSwgdWRpZDogdGhpcy5vcHRzLnVkaWR9O1xuICAgIH1cblxuICAgIC8vIGZpZ3VyZSBvdXQgdGhlIGNvcnJlY3Qgc2ltdWxhdG9yIHRvIHVzZSwgZ2l2ZW4gdGhlIGRlc2lyZWQgY2FwYWJpbGl0aWVzXG4gICAgbGV0IGRldmljZSA9IGF3YWl0IGdldEV4aXN0aW5nU2ltKHRoaXMub3B0cyk7XG5cbiAgICAvLyBjaGVjayBmb3IgYW4gZXhpc3Rpbmcgc2ltdWxhdG9yXG4gICAgaWYgKGRldmljZSkge1xuICAgICAgcmV0dXJuIHtkZXZpY2UsIHJlYWxEZXZpY2U6IGZhbHNlLCB1ZGlkOiBkZXZpY2UudWRpZH07XG4gICAgfVxuXG4gICAgLy8gbm8gZGV2aWNlIG9mIHRoaXMgdHlwZSBleGlzdHMsIHNvIGNyZWF0ZSBvbmVcbiAgICBsb2cuaW5mbygnU2ltdWxhdG9yIHVkaWQgbm90IHByb3ZpZGVkLCB1c2luZyBkZXNpcmVkIGNhcHMgdG8gY3JlYXRlIGEgbmV3IHNpbXVsYXRvcicpO1xuICAgIGlmICghdGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbiAmJiB0aGlzLmlvc1Nka1ZlcnNpb24pIHtcbiAgICAgIGxvZy5pbmZvKGBObyBwbGF0Zm9ybVZlcnNpb24gc3BlY2lmaWVkLiBVc2luZyBsYXRlc3QgdmVyc2lvbiBYY29kZSBzdXBwb3J0czogJyR7dGhpcy5pb3NTZGtWZXJzaW9ufScgYCArXG4gICAgICAgICAgICAgICBgVGhpcyBtYXkgY2F1c2UgcHJvYmxlbXMgaWYgYSBzaW11bGF0b3IgZG9lcyBub3QgZXhpc3QgZm9yIHRoaXMgcGxhdGZvcm0gdmVyc2lvbi5gKTtcbiAgICAgIHRoaXMub3B0cy5wbGF0Zm9ybVZlcnNpb24gPSB0aGlzLmlvc1Nka1ZlcnNpb247XG4gICAgfVxuXG4gICAgaWYgKHRoaXMub3B0cy5ub1Jlc2V0KSB7XG4gICAgICAvLyBDaGVjayBmb3IgZXhpc3Rpbmcgc2ltdWxhdG9yIGp1c3Qgd2l0aCBjb3JyZWN0IGNhcGFiaWxpdGllc1xuICAgICAgbGV0IGRldmljZSA9IGF3YWl0IGdldEV4aXN0aW5nU2ltKHRoaXMub3B0cyk7XG4gICAgICBpZiAoZGV2aWNlKSB7XG4gICAgICAgIHJldHVybiB7ZGV2aWNlLCByZWFsRGV2aWNlOiBmYWxzZSwgdWRpZDogZGV2aWNlLnVkaWR9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGRldmljZSA9IGF3YWl0IHRoaXMuY3JlYXRlU2ltKCk7XG4gICAgcmV0dXJuIHtkZXZpY2UsIHJlYWxEZXZpY2U6IGZhbHNlLCB1ZGlkOiBkZXZpY2UudWRpZH07XG4gIH1cblxuICBhc3luYyBzdGFydFNpbSAoKSB7XG4gICAgY29uc3QgcnVuT3B0cyA9IHtcbiAgICAgIHNjYWxlRmFjdG9yOiB0aGlzLm9wdHMuc2NhbGVGYWN0b3IsXG4gICAgICBjb25uZWN0SGFyZHdhcmVLZXlib2FyZDogISF0aGlzLm9wdHMuY29ubmVjdEhhcmR3YXJlS2V5Ym9hcmQsXG4gICAgICBpc0hlYWRsZXNzOiAhIXRoaXMub3B0cy5pc0hlYWRsZXNzLFxuICAgICAgZGV2aWNlUHJlZmVyZW5jZXM6IHt9LFxuICAgIH07XG5cbiAgICAvLyBhZGQgdGhlIHdpbmRvdyBjZW50ZXIsIGlmIGl0IGlzIHNwZWNpZmllZFxuICAgIGlmICh0aGlzLm9wdHMuU2ltdWxhdG9yV2luZG93Q2VudGVyKSB7XG4gICAgICBydW5PcHRzLmRldmljZVByZWZlcmVuY2VzLlNpbXVsYXRvcldpbmRvd0NlbnRlciA9IHRoaXMub3B0cy5TaW11bGF0b3JXaW5kb3dDZW50ZXI7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyB0byB3b3JrYXJvdW5kIFhDVGVzdCBidWcgYWJvdXQgY2hhbmdpbmcgU2ltdWxhdG9yXG4gICAgLy8gb3JpZW50YXRpb24gaXMgbm90IHN5bmNocm9uaXplZCB0byB0aGUgYWN0dWFsIHdpbmRvdyBvcmllbnRhdGlvblxuICAgIGNvbnN0IG9yaWVudGF0aW9uID0gXy5pc1N0cmluZyh0aGlzLm9wdHMub3JpZW50YXRpb24pICYmIHRoaXMub3B0cy5vcmllbnRhdGlvbi50b1VwcGVyQ2FzZSgpO1xuICAgIHN3aXRjaCAob3JpZW50YXRpb24pIHtcbiAgICAgIGNhc2UgJ0xBTkRTQ0FQRSc6XG4gICAgICAgIHJ1bk9wdHMuZGV2aWNlUHJlZmVyZW5jZXMuU2ltdWxhdG9yV2luZG93T3JpZW50YXRpb24gPSAnTGFuZHNjYXBlTGVmdCc7XG4gICAgICAgIHJ1bk9wdHMuZGV2aWNlUHJlZmVyZW5jZXMuU2ltdWxhdG9yV2luZG93Um90YXRpb25BbmdsZSA9IDkwO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BPUlRSQUlUJzpcbiAgICAgICAgcnVuT3B0cy5kZXZpY2VQcmVmZXJlbmNlcy5TaW11bGF0b3JXaW5kb3dPcmllbnRhdGlvbiA9ICdQb3J0cmFpdCc7XG4gICAgICAgIHJ1bk9wdHMuZGV2aWNlUHJlZmVyZW5jZXMuU2ltdWxhdG9yV2luZG93Um90YXRpb25BbmdsZSA9IDA7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMub3B0cy5kZXZpY2UucnVuKHJ1bk9wdHMpO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlU2ltICgpIHtcbiAgICB0aGlzLmxpZmVjeWNsZURhdGEuY3JlYXRlU2ltID0gdHJ1ZTtcblxuICAgIC8vIGNyZWF0ZSBzaW0gZm9yIGNhcHNcbiAgICBsZXQgc2ltID0gYXdhaXQgY3JlYXRlU2ltKHRoaXMub3B0cyk7XG4gICAgbG9nLmluZm8oYENyZWF0ZWQgc2ltdWxhdG9yIHdpdGggdWRpZCAnJHtzaW0udWRpZH0nLmApO1xuXG4gICAgcmV0dXJuIHNpbTtcbiAgfVxuXG4gIGFzeW5jIGxhdW5jaEFwcCAoKSB7XG4gICAgY29uc3QgQVBQX0xBVU5DSF9USU1FT1VUID0gMjAgKiAxMDAwO1xuXG4gICAgdGhpcy5sb2dFdmVudCgnYXBwTGF1bmNoQXR0ZW1wdGVkJyk7XG4gICAgYXdhaXQgbGF1bmNoKHRoaXMub3B0cy5kZXZpY2UudWRpZCwgdGhpcy5vcHRzLmJ1bmRsZUlkKTtcblxuICAgIGxldCBjaGVja1N0YXR1cyA9IGFzeW5jICgpID0+IHtcbiAgICAgIGxldCByZXNwb25zZSA9IGF3YWl0IHRoaXMucHJveHlDb21tYW5kKCcvc3RhdHVzJywgJ0dFVCcpO1xuICAgICAgbGV0IGN1cnJlbnRBcHAgPSByZXNwb25zZS5jdXJyZW50QXBwLmJ1bmRsZUlEO1xuICAgICAgaWYgKGN1cnJlbnRBcHAgIT09IHRoaXMub3B0cy5idW5kbGVJZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dGhpcy5vcHRzLmJ1bmRsZUlkfSBub3QgaW4gZm9yZWdyb3VuZC4gJHtjdXJyZW50QXBwfSBpcyBpbiBmb3JlZ3JvdW5kYCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGxvZy5pbmZvKGBXYWl0aW5nIGZvciAnJHt0aGlzLm9wdHMuYnVuZGxlSWR9JyB0byBiZSBpbiBmb3JlZ3JvdW5kYCk7XG4gICAgbGV0IHJldHJpZXMgPSBwYXJzZUludChBUFBfTEFVTkNIX1RJTUVPVVQgLyAyMDAsIDEwKTtcbiAgICBhd2FpdCByZXRyeUludGVydmFsKHJldHJpZXMsIDIwMCwgY2hlY2tTdGF0dXMpO1xuICAgIGxvZy5pbmZvKGAke3RoaXMub3B0cy5idW5kbGVJZH0gaXMgaW4gZm9yZWdyb3VuZGApO1xuICAgIHRoaXMubG9nRXZlbnQoJ2FwcExhdW5jaGVkJyk7XG4gIH1cblxuICBhc3luYyBzdGFydFdkYVNlc3Npb24gKGJ1bmRsZUlkLCBwcm9jZXNzQXJndW1lbnRzKSB7XG4gICAgbGV0IGFyZ3MgPSBwcm9jZXNzQXJndW1lbnRzID8gKHByb2Nlc3NBcmd1bWVudHMuYXJncyB8fCBbXSkgOiBbXTtcbiAgICBpZiAoIV8uaXNBcnJheShhcmdzKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBwcm9jZXNzQXJndW1lbnRzLmFyZ3MgY2FwYWJpbGl0eSBpcyBleHBlY3RlZCB0byBiZSBhbiBhcnJheS4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgYCR7SlNPTi5zdHJpbmdpZnkoYXJncyl9IGlzIGdpdmVuIGluc3RlYWRgKTtcbiAgICB9XG4gICAgbGV0IGVudiA9IHByb2Nlc3NBcmd1bWVudHMgPyAocHJvY2Vzc0FyZ3VtZW50cy5lbnYgfHwge30pIDoge307XG4gICAgaWYgKCFfLmlzUGxhaW5PYmplY3QoZW52KSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBwcm9jZXNzQXJndW1lbnRzLmVudiBjYXBhYmlsaXR5IGlzIGV4cGVjdGVkIHRvIGJlIGEgZGljdGlvbmFyeS4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgYCR7SlNPTi5zdHJpbmdpZnkoZW52KX0gaXMgZ2l2ZW4gaW5zdGVhZGApO1xuICAgIH1cblxuICAgIGxldCBzaG91bGRXYWl0Rm9yUXVpZXNjZW5jZSA9IHV0aWwuaGFzVmFsdWUodGhpcy5vcHRzLndhaXRGb3JRdWllc2NlbmNlKSA/IHRoaXMub3B0cy53YWl0Rm9yUXVpZXNjZW5jZSA6IHRydWU7XG4gICAgbGV0IG1heFR5cGluZ0ZyZXF1ZW5jeSA9IHV0aWwuaGFzVmFsdWUodGhpcy5vcHRzLm1heFR5cGluZ0ZyZXF1ZW5jeSkgPyB0aGlzLm9wdHMubWF4VHlwaW5nRnJlcXVlbmN5IDogNjA7XG4gICAgbGV0IHNob3VsZFVzZVNpbmdsZXRvblRlc3RNYW5hZ2VyID0gdXRpbC5oYXNWYWx1ZSh0aGlzLm9wdHMuc2hvdWxkVXNlU2luZ2xldG9uVGVzdE1hbmFnZXIpID8gdGhpcy5vcHRzLnNob3VsZFVzZVNpbmdsZXRvblRlc3RNYW5hZ2VyIDogdHJ1ZTtcbiAgICBsZXQgc2hvdWxkVXNlVGVzdE1hbmFnZXJGb3JWaXNpYmlsaXR5RGV0ZWN0aW9uID0gZmFsc2U7XG4gICAgaWYgKHV0aWwuaGFzVmFsdWUodGhpcy5vcHRzLnNpbXBsZUlzVmlzaWJsZUNoZWNrKSkge1xuICAgICAgc2hvdWxkVXNlVGVzdE1hbmFnZXJGb3JWaXNpYmlsaXR5RGV0ZWN0aW9uID0gdGhpcy5vcHRzLnNpbXBsZUlzVmlzaWJsZUNoZWNrO1xuICAgIH1cbiAgICBpZiAoIWlzTmFOKHBhcnNlRmxvYXQodGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbikpICYmIHBhcnNlRmxvYXQodGhpcy5vcHRzLnBsYXRmb3JtVmVyc2lvbikudG9GaXhlZCgxKSA9PT0gJzkuMycpIHtcbiAgICAgIGxvZy5pbmZvKGBGb3JjaW5nIHNob3VsZFVzZVNpbmdsZXRvblRlc3RNYW5hZ2VyIGNhcGFiaWxpdHkgdmFsdWUgdG8gdHJ1ZSwgYmVjYXVzZSBvZiBrbm93biBYQ1Rlc3QgaXNzdWVzIHVuZGVyIDkuMyBwbGF0Zm9ybSB2ZXJzaW9uYCk7XG4gICAgICBzaG91bGRVc2VUZXN0TWFuYWdlckZvclZpc2liaWxpdHlEZXRlY3Rpb24gPSB0cnVlO1xuICAgIH1cbiAgICBpZiAodXRpbC5oYXNWYWx1ZSh0aGlzLm9wdHMubGFuZ3VhZ2UpKSB7XG4gICAgICBhcmdzLnB1c2goJy1BcHBsZUxhbmd1YWdlcycsIGAoJHt0aGlzLm9wdHMubGFuZ3VhZ2V9KWApO1xuICAgICAgYXJncy5wdXNoKCctTlNMYW5ndWFnZXMnLCBgKCR7dGhpcy5vcHRzLmxhbmd1YWdlfSlgKTtcbiAgICB9XG5cbiAgICBpZiAodXRpbC5oYXNWYWx1ZSh0aGlzLm9wdHMubG9jYWxlKSkge1xuICAgICAgYXJncy5wdXNoKCctQXBwbGVMb2NhbGUnLCB0aGlzLm9wdHMubG9jYWxlKTtcbiAgICB9XG5cbiAgICBsZXQgZGVzaXJlZCA9IHtcbiAgICAgIGRlc2lyZWRDYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgYnVuZGxlSWQsXG4gICAgICAgIGFyZ3VtZW50czogYXJncyxcbiAgICAgICAgZW52aXJvbm1lbnQ6IGVudixcbiAgICAgICAgc2hvdWxkV2FpdEZvclF1aWVzY2VuY2UsXG4gICAgICAgIHNob3VsZFVzZVRlc3RNYW5hZ2VyRm9yVmlzaWJpbGl0eURldGVjdGlvbixcbiAgICAgICAgbWF4VHlwaW5nRnJlcXVlbmN5LFxuICAgICAgICBzaG91bGRVc2VTaW5nbGV0b25UZXN0TWFuYWdlcixcbiAgICAgIH1cbiAgICB9O1xuICAgIGlmICh1dGlsLmhhc1ZhbHVlKHRoaXMub3B0cy5zaG91bGRVc2VDb21wYWN0UmVzcG9uc2VzKSkge1xuICAgICAgZGVzaXJlZC5kZXNpcmVkQ2FwYWJpbGl0aWVzLnNob3VsZFVzZUNvbXBhY3RSZXNwb25zZXMgPSB0aGlzLm9wdHMuc2hvdWxkVXNlQ29tcGFjdFJlc3BvbnNlcztcbiAgICB9XG4gICAgaWYgKHV0aWwuaGFzVmFsdWUodGhpcy5vcHRzLmVsZW1lbnRSZXNwb25zZUZpZWxkcykpIHtcbiAgICAgIGRlc2lyZWQuZGVzaXJlZENhcGFiaWxpdGllcy5lbGVtZW50UmVzcG9uc2VGaWVsZHMgPSB0aGlzLm9wdHMuZWxlbWVudFJlc3BvbnNlRmllbGRzO1xuICAgIH1cbiAgICBpZiAodGhpcy5vcHRzLmF1dG9BY2NlcHRBbGVydHMpIHtcbiAgICAgIGRlc2lyZWQuZGVzaXJlZENhcGFiaWxpdGllcy5kZWZhdWx0QWxlcnRBY3Rpb24gPSAnYWNjZXB0JztcbiAgICB9IGVsc2UgaWYgKHRoaXMub3B0cy5hdXRvRGlzbWlzc0FsZXJ0cykge1xuICAgICAgZGVzaXJlZC5kZXNpcmVkQ2FwYWJpbGl0aWVzLmRlZmF1bHRBbGVydEFjdGlvbiA9ICdkaXNtaXNzJztcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZCgnL3Nlc3Npb24nLCAnUE9TVCcsIGRlc2lyZWQpO1xuICB9XG5cbiAgLy8gT3ZlcnJpZGUgUHJveHkgbWV0aG9kcyBmcm9tIEJhc2VEcml2ZXJcbiAgcHJveHlBY3RpdmUgKCkge1xuICAgIHJldHVybiB0aGlzLmp3cFByb3h5QWN0aXZlO1xuICB9XG5cbiAgZ2V0UHJveHlBdm9pZExpc3QgKCkge1xuICAgIGlmICh0aGlzLmlzV2VidmlldygpKSB7XG4gICAgICByZXR1cm4gTk9fUFJPWFlfV0VCX0xJU1Q7XG4gICAgfVxuICAgIHJldHVybiBOT19QUk9YWV9OQVRJVkVfTElTVDtcbiAgfVxuXG4gIGNhblByb3h5ICgpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlzU2FmYXJpICgpIHtcbiAgICByZXR1cm4gISF0aGlzLnNhZmFyaTtcbiAgfVxuXG4gIGlzUmVhbERldmljZSAoKSB7XG4gICAgcmV0dXJuIHRoaXMub3B0cy5yZWFsRGV2aWNlO1xuICB9XG5cbiAgaXNTaW11bGF0b3IgKCkge1xuICAgIHJldHVybiAhdGhpcy5vcHRzLnJlYWxEZXZpY2U7XG4gIH1cblxuICBpc1dlYnZpZXcgKCkge1xuICAgIHJldHVybiB0aGlzLmlzU2FmYXJpKCkgfHwgdGhpcy5pc1dlYkNvbnRleHQoKTtcbiAgfVxuXG4gIHZhbGlkYXRlTG9jYXRvclN0cmF0ZWd5IChzdHJhdGVneSkge1xuICAgIHN1cGVyLnZhbGlkYXRlTG9jYXRvclN0cmF0ZWd5KHN0cmF0ZWd5LCB0aGlzLmlzV2ViQ29udGV4dCgpKTtcbiAgfVxuXG4gIHZhbGlkYXRlRGVzaXJlZENhcHMgKGNhcHMpIHtcbiAgICBpZiAoIXN1cGVyLnZhbGlkYXRlRGVzaXJlZENhcHMoY2FwcykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBtYWtlIHN1cmUgdGhhdCB0aGUgY2FwYWJpbGl0aWVzIGhhdmUgb25lIG9mIGBhcHBgIG9yIGBidW5kbGVJZGBcbiAgICBpZiAoKGNhcHMuYnJvd3Nlck5hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCkgIT09ICdzYWZhcmknICYmICFjYXBzLmFwcCAmJiAhY2Fwcy5idW5kbGVJZCkge1xuICAgICAgbGV0IG1zZyA9ICdUaGUgZGVzaXJlZCBjYXBhYmlsaXRpZXMgbXVzdCBpbmNsdWRlIGVpdGhlciBhbiBhcHAgb3IgYSBidW5kbGVJZCBmb3IgaU9TJztcbiAgICAgIGxvZy5lcnJvckFuZFRocm93KG1zZyk7XG4gICAgfVxuXG4gICAgbGV0IHZlcmlmeVByb2Nlc3NBcmd1bWVudCA9IChwcm9jZXNzQXJndW1lbnRzKSA9PiB7XG4gICAgICBjb25zdCB7YXJncywgZW52fSA9IHByb2Nlc3NBcmd1bWVudHM7XG4gICAgICBpZiAoIV8uaXNOaWwoYXJncykgJiYgIV8uaXNBcnJheShhcmdzKSkge1xuICAgICAgICBsb2cuZXJyb3JBbmRUaHJvdygncHJvY2Vzc0FyZ3VtZW50cy5hcmdzIG11c3QgYmUgYW4gYXJyYXkgb2Ygc3RyaW5ncycpO1xuICAgICAgfVxuICAgICAgaWYgKCFfLmlzTmlsKGVudikgJiYgIV8uaXNQbGFpbk9iamVjdChlbnYpKSB7XG4gICAgICAgIGxvZy5lcnJvckFuZFRocm93KCdwcm9jZXNzQXJndW1lbnRzLmVudiBtdXN0IGJlIGFuIG9iamVjdCA8a2V5LHZhbHVlPiBwYWlyIHthOmIsIGM6ZH0nKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gYHByb2Nlc3NBcmd1bWVudHNgIHNob3VsZCBiZSBKU09OIHN0cmluZyBvciBhbiBvYmplY3Qgd2l0aCBhcmd1bWVudHMgYW5kLyBlbnZpcm9ubWVudCBkZXRhaWxzXG4gICAgaWYgKGNhcHMucHJvY2Vzc0FyZ3VtZW50cykge1xuICAgICAgaWYgKF8uaXNTdHJpbmcoY2Fwcy5wcm9jZXNzQXJndW1lbnRzKSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIHRyeSB0byBwYXJzZSB0aGUgc3RyaW5nIGFzIEpTT05cbiAgICAgICAgICBjYXBzLnByb2Nlc3NBcmd1bWVudHMgPSBKU09OLnBhcnNlKGNhcHMucHJvY2Vzc0FyZ3VtZW50cyk7XG4gICAgICAgICAgdmVyaWZ5UHJvY2Vzc0FyZ3VtZW50KGNhcHMucHJvY2Vzc0FyZ3VtZW50cyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGxvZy5lcnJvckFuZFRocm93KGBwcm9jZXNzQXJndW1lbnRzIG11c3QgYmUgYSBqc29uIGZvcm1hdCBvciBhbiBvYmplY3Qgd2l0aCBmb3JtYXQge2FyZ3MgOiBbXSwgZW52IDoge2E6YiwgYzpkfX0uIGAgK1xuICAgICAgICAgICAgYEJvdGggZW52aXJvbm1lbnQgYW5kIGFyZ3VtZW50IGNhbiBiZSBudWxsLiBFcnJvcjogJHtlcnJ9YCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoXy5pc1BsYWluT2JqZWN0KGNhcHMucHJvY2Vzc0FyZ3VtZW50cykpIHtcbiAgICAgICAgdmVyaWZ5UHJvY2Vzc0FyZ3VtZW50KGNhcHMucHJvY2Vzc0FyZ3VtZW50cyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuZXJyb3JBbmRUaHJvdyhgJ3Byb2Nlc3NBcmd1bWVudHMgbXVzdCBiZSBhbiBvYmplY3QsIG9yIGEgc3RyaW5nIEpTT04gb2JqZWN0IHdpdGggZm9ybWF0IHthcmdzIDogW10sIGVudiA6IHthOmIsIGM6ZH19LiBgICtcbiAgICAgICAgICBgQm90aCBlbnZpcm9ubWVudCBhbmQgYXJndW1lbnQgY2FuIGJlIG51bGwuYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gdGhlcmUgaXMgbm8gcG9pbnQgaW4gaGF2aW5nIGBrZXljaGFpblBhdGhgIHdpdGhvdXQgYGtleWNoYWluUGFzc3dvcmRgXG4gICAgaWYgKChjYXBzLmtleWNoYWluUGF0aCAmJiAhY2Fwcy5rZXljaGFpblBhc3N3b3JkKSB8fCAoIWNhcHMua2V5Y2hhaW5QYXRoICYmIGNhcHMua2V5Y2hhaW5QYXNzd29yZCkpIHtcbiAgICAgIGxvZy5lcnJvckFuZFRocm93KGBJZiAna2V5Y2hhaW5QYXRoJyBpcyBzZXQsICdrZXljaGFpblBhc3N3b3JkJyBtdXN0IGFsc28gYmUgc2V0IChhbmQgdmljZSB2ZXJzYSkuYCk7XG4gICAgfVxuXG4gICAgLy8gYHJlc2V0T25TZXNzaW9uU3RhcnRPbmx5YCBzaG91bGQgYmUgc2V0IHRvIHRydWUgYnkgZGVmYXVsdFxuICAgIHRoaXMub3B0cy5yZXNldE9uU2Vzc2lvblN0YXJ0T25seSA9ICF1dGlsLmhhc1ZhbHVlKHRoaXMub3B0cy5yZXNldE9uU2Vzc2lvblN0YXJ0T25seSkgfHwgdGhpcy5vcHRzLnJlc2V0T25TZXNzaW9uU3RhcnRPbmx5O1xuICAgIHRoaXMub3B0cy51c2VOZXdXREEgPSB1dGlsLmhhc1ZhbHVlKHRoaXMub3B0cy51c2VOZXdXREEpID8gdGhpcy5vcHRzLnVzZU5ld1dEQSA6IGZhbHNlO1xuXG4gICAgaWYgKGNhcHMuY29tbWFuZFRpbWVvdXRzKSB7XG4gICAgICBjYXBzLmNvbW1hbmRUaW1lb3V0cyA9IG5vcm1hbGl6ZUNvbW1hbmRUaW1lb3V0cyhjYXBzLmNvbW1hbmRUaW1lb3V0cyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNTdHJpbmcoY2Fwcy53ZWJEcml2ZXJBZ2VudFVybCkpIHtcbiAgICAgIGNvbnN0IHtwcm90b2NvbCwgaG9zdH0gPSB1cmwucGFyc2UoY2Fwcy53ZWJEcml2ZXJBZ2VudFVybCk7XG4gICAgICBpZiAoXy5pc0VtcHR5KHByb3RvY29sKSB8fCBfLmlzRW1wdHkoaG9zdCkpIHtcbiAgICAgICAgbG9nLmVycm9yQW5kVGhyb3coYCd3ZWJEcml2ZXJBZ2VudFVybCcgY2FwYWJpbGl0eSBpcyBleHBlY3RlZCB0byBjb250YWluIGEgdmFsaWQgV2ViRHJpdmVyQWdlbnQgc2VydmVyIFVSTC4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGAnJHtjYXBzLndlYkRyaXZlckFnZW50VXJsfScgaXMgZ2l2ZW4gaW5zdGVhZGApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjYXBzLmJyb3dzZXJOYW1lKSB7XG4gICAgICBpZiAoY2Fwcy5idW5kbGVJZCkge1xuICAgICAgICBsb2cuZXJyb3JBbmRUaHJvdyhgJ2Jyb3dzZXJOYW1lJyBjYW5ub3QgYmUgc2V0IHRvZ2V0aGVyIHdpdGggJ2J1bmRsZUlkJyBjYXBhYmlsaXR5YCk7XG4gICAgICB9XG4gICAgICAvLyB3YXJuIGlmIHRoZSBjYXBhYmlsaXRpZXMgaGF2ZSBib3RoIGBhcHBgIGFuZCBgYnJvd3NlciwgYWx0aG91Z2ggdGhpc1xuICAgICAgLy8gaXMgY29tbW9uIHdpdGggc2VsZW5pdW0gZ3JpZFxuICAgICAgaWYgKGNhcHMuYXBwKSB7XG4gICAgICAgIGxvZy53YXJuKGBUaGUgY2FwYWJpbGl0aWVzIHNob3VsZCBnZW5lcmFsbHkgbm90IGluY2x1ZGUgYm90aCBhbiAnYXBwJyBhbmQgYSAnYnJvd3Nlck5hbWUnYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNhcHMucGVybWlzc2lvbnMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgW2J1bmRsZUlkLCBwZXJtc10gb2YgXy50b1BhaXJzKEpTT04ucGFyc2UoY2Fwcy5wZXJtaXNzaW9ucykpKSB7XG4gICAgICAgICAgaWYgKCFfLmlzU3RyaW5nKGJ1bmRsZUlkKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAnJHtKU09OLnN0cmluZ2lmeShidW5kbGVJZCl9JyBtdXN0IGJlIGEgc3RyaW5nYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghXy5pc1BsYWluT2JqZWN0KHBlcm1zKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAnJHtKU09OLnN0cmluZ2lmeShwZXJtcyl9JyBtdXN0IGJlIGEgSlNPTiBvYmplY3RgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nLmVycm9yQW5kVGhyb3coYCcke2NhcHMucGVybWlzc2lvbnN9JyBpcyBleHBlY3RlZCB0byBiZSBhIHZhbGlkIG9iamVjdCB3aXRoIGZvcm1hdCBgICtcbiAgICAgICAgICBge1wiPGJ1bmRsZUlkMT5cIjoge1wiPHNlcnZpY2VOYW1lMT5cIjogXCI8c2VydmljZVN0YXR1czE+XCIsIC4uLn0sIC4uLn0uIE9yaWdpbmFsIGVycm9yOiAke2UubWVzc2FnZX1gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBmaW5hbGx5LCByZXR1cm4gdHJ1ZSBzaW5jZSB0aGUgc3VwZXJjbGFzcyBjaGVjayBwYXNzZWQsIGFzIGRpZCB0aGlzXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBhc3luYyBpbnN0YWxsQVVUICgpIHtcbiAgICBpZiAodGhpcy5pc1NhZmFyaSgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIGlmIHVzZXIgaGFzIHBhc3NlZCBpbiBkZXNpcmVkQ2Fwcy5hdXRvTGF1bmNoID0gZmFsc2VcbiAgICAvLyBtZWFuaW5nIHRoZXkgd2lsbCBtYW5hZ2UgYXBwIGluc3RhbGwgLyBsYXVuY2hpbmdcbiAgICBpZiAodGhpcy5vcHRzLmF1dG9MYXVuY2ggPT09IGZhbHNlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHZlcmlmeUFwcGxpY2F0aW9uUGxhdGZvcm0odGhpcy5vcHRzLmFwcCwgdGhpcy5pc1NpbXVsYXRvcigpKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIC8vIFRPRE86IExldCBpdCB0aHJvdyBhZnRlciB3ZSBjb25maXJtIHRoZSBhcmNoaXRlY3R1cmUgdmVyaWZpY2F0aW9uIGFsZ29yaXRobSBpcyBzdGFibGVcbiAgICAgIGxvZy53YXJuKGAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipgKTtcbiAgICAgIGxvZy53YXJuKGAke3RoaXMuaXNTaW11bGF0b3IoKSA/ICdTaW11bGF0b3InIDogJ1JlYWwgZGV2aWNlJ30gYXJjaGl0ZWN0dXJlIGFwcGVhcnMgdG8gYmUgdW5zdXBwb3J0ZWQgYCArXG4gICAgICAgICAgICAgICBgYnkgdGhlICcke3RoaXMub3B0cy5hcHB9JyBhcHBsaWNhdGlvbi4gYCArXG4gICAgICAgICAgICAgICBgTWFrZSBzdXJlIHRoZSBjb3JyZWN0IGRlcGxveW1lbnQgdGFyZ2V0IGhhcyBiZWVuIHNlbGVjdGVkIGZvciBpdHMgY29tcGlsYXRpb24gaW4gWGNvZGUuYCk7XG4gICAgICBsb2cud2FybignRG9uXFwndCBiZSBzdXJwcmlzZWQgaWYgdGhlIGFwcGxpY2F0aW9uIGZhaWxzIHRvIGxhdW5jaC4nKTtcbiAgICAgIGxvZy53YXJuKGAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc1JlYWxEZXZpY2UoKSkge1xuICAgICAgYXdhaXQgaW5zdGFsbFRvUmVhbERldmljZSh0aGlzLm9wdHMuZGV2aWNlLCB0aGlzLm9wdHMuYXBwLCB0aGlzLm9wdHMuYnVuZGxlSWQsIHRoaXMub3B0cy5ub1Jlc2V0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgaW5zdGFsbFRvU2ltdWxhdG9yKHRoaXMub3B0cy5kZXZpY2UsIHRoaXMub3B0cy5hcHAsIHRoaXMub3B0cy5idW5kbGVJZCwgdGhpcy5vcHRzLm5vUmVzZXQpO1xuICAgIH1cblxuICAgIGlmICh1dGlsLmhhc1ZhbHVlKHRoaXMub3B0cy5pb3NJbnN0YWxsUGF1c2UpKSB7XG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYXBwaXVtL2FwcGl1bS9pc3N1ZXMvNjg4OVxuICAgICAgbGV0IHBhdXNlID0gcGFyc2VJbnQodGhpcy5vcHRzLmlvc0luc3RhbGxQYXVzZSwgMTApO1xuICAgICAgbG9nLmRlYnVnKGBpb3NJbnN0YWxsUGF1c2Ugc2V0LiBQYXVzaW5nICR7cGF1c2V9IG1zIGJlZm9yZSBjb250aW51aW5nYCk7XG4gICAgICBhd2FpdCBCLmRlbGF5KHBhdXNlKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzZXRJbml0aWFsT3JpZW50YXRpb24gKG9yaWVudGF0aW9uKSB7XG4gICAgaWYgKCFfLmlzU3RyaW5nKG9yaWVudGF0aW9uKSkge1xuICAgICAgbG9nLmluZm8oJ1NraXBwaW5nIHNldHRpbmcgb2YgdGhlIGluaXRpYWwgZGlzcGxheSBvcmllbnRhdGlvbi4gJyArXG4gICAgICAgICdTZXQgdGhlIFwib3JpZW50YXRpb25cIiBjYXBhYmlsaXR5IHRvIGVpdGhlciBcIkxBTkRTQ0FQRVwiIG9yIFwiUE9SVFJBSVRcIiwgaWYgdGhpcyBpcyBhbiB1bmRlc2lyZWQgYmVoYXZpb3IuJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG9yaWVudGF0aW9uID0gb3JpZW50YXRpb24udG9VcHBlckNhc2UoKTtcbiAgICBpZiAoIV8uaW5jbHVkZXMoWydMQU5EU0NBUEUnLCAnUE9SVFJBSVQnXSwgb3JpZW50YXRpb24pKSB7XG4gICAgICBsb2cuZGVidWcoYFVuYWJsZSB0byBzZXQgaW5pdGlhbCBvcmllbnRhdGlvbiB0byAnJHtvcmllbnRhdGlvbn0nYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxvZy5kZWJ1ZyhgU2V0dGluZyBpbml0aWFsIG9yaWVudGF0aW9uIHRvICcke29yaWVudGF0aW9ufSdgKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoJy9vcmllbnRhdGlvbicsICdQT1NUJywge29yaWVudGF0aW9ufSk7XG4gICAgICB0aGlzLm9wdHMuY3VyT3JpZW50YXRpb24gPSBvcmllbnRhdGlvbjtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy53YXJuKGBTZXR0aW5nIGluaXRpYWwgb3JpZW50YXRpb24gZmFpbGVkIHdpdGg6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgfVxuICB9XG5cbiAgX2dldENvbW1hbmRUaW1lb3V0IChjbWROYW1lKSB7XG4gICAgaWYgKHRoaXMub3B0cy5jb21tYW5kVGltZW91dHMpIHtcbiAgICAgIGlmIChjbWROYW1lICYmIF8uaGFzKHRoaXMub3B0cy5jb21tYW5kVGltZW91dHMsIGNtZE5hbWUpKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm9wdHMuY29tbWFuZFRpbWVvdXRzW2NtZE5hbWVdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMub3B0cy5jb21tYW5kVGltZW91dHNbREVGQVVMVF9USU1FT1VUX0tFWV07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCBzZXNzaW9uIGNhcGFiaWxpdGllcyBtZXJnZWQgd2l0aCB3aGF0IFdEQSByZXBvcnRzXG4gICAqIFRoaXMgaXMgYSBsaWJyYXJ5IGNvbW1hbmQgYnV0IG5lZWRzIHRvIGNhbGwgJ3N1cGVyJyBzbyBjYW4ndCBiZSBvblxuICAgKiBhIGhlbHBlciBvYmplY3RcbiAgICovXG4gIGFzeW5jIGdldFNlc3Npb24gKCkge1xuICAgIC8vIGNhbGwgc3VwZXIgdG8gZ2V0IGV2ZW50IHRpbWluZ3MsIGV0Yy4uLlxuICAgIGNvbnN0IGRyaXZlclNlc3Npb24gPSBhd2FpdCBzdXBlci5nZXRTZXNzaW9uKCk7XG4gICAgaWYgKCF0aGlzLndkYUNhcHMpIHtcbiAgICAgIHRoaXMud2RhQ2FwcyA9IGF3YWl0IHRoaXMucHJveHlDb21tYW5kKCcvJywgJ0dFVCcpO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuZGV2aWNlQ2Fwcykge1xuICAgICAgY29uc3Qge3N0YXR1c0JhclNpemUsIHNjYWxlfSA9IGF3YWl0IHRoaXMuZ2V0U2NyZWVuSW5mbygpO1xuICAgICAgdGhpcy5kZXZpY2VDYXBzID0ge1xuICAgICAgICBwaXhlbFJhdGlvOiBzY2FsZSxcbiAgICAgICAgc3RhdEJhckhlaWdodDogc3RhdHVzQmFyU2l6ZS5oZWlnaHQsXG4gICAgICAgIHZpZXdwb3J0UmVjdDogYXdhaXQgdGhpcy5nZXRWaWV3cG9ydFJlY3QoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGxvZy5pbmZvKFwiTWVyZ2luZyBXREEgY2FwcyBvdmVyIEFwcGl1bSBjYXBzIGZvciBzZXNzaW9uIGRldGFpbCByZXNwb25zZVwiKTtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7dWRpZDogdGhpcy5vcHRzLnVkaWR9LCBkcml2ZXJTZXNzaW9uLFxuICAgICAgdGhpcy53ZGFDYXBzLmNhcGFiaWxpdGllcywgdGhpcy5kZXZpY2VDYXBzKTtcbiAgfVxuXG4gIGFzeW5jIHN0YXJ0SVdEUCAoKSB7XG4gICAgdGhpcy5sb2dFdmVudCgnaXdkcFN0YXJ0aW5nJyk7XG4gICAgdGhpcy5pd2RwU2VydmVyID0gbmV3IElXRFAodGhpcy5vcHRzLndlYmtpdERlYnVnUHJveHlQb3J0LCB0aGlzLm9wdHMudWRpZCk7XG4gICAgYXdhaXQgdGhpcy5pd2RwU2VydmVyLnN0YXJ0KCk7XG4gICAgdGhpcy5sb2dFdmVudCgnaXdkcFN0YXJ0ZWQnKTtcbiAgfVxuXG4gIGFzeW5jIHN0b3BJV0RQICgpIHtcbiAgICBpZiAodGhpcy5pd2RwU2VydmVyKSB7XG4gICAgICBhd2FpdCB0aGlzLml3ZHBTZXJ2ZXIuc3RvcCgpO1xuICAgICAgZGVsZXRlIHRoaXMuaXdkcFNlcnZlcjtcbiAgICB9XG4gIH1cblxuICBhc3luYyByZXNldCAoKSB7XG4gICAgaWYgKHRoaXMub3B0cy5ub1Jlc2V0KSB7XG4gICAgICAvLyBUaGlzIGlzIHRvIG1ha2Ugc3VyZSByZXNldCBoYXBwZW5zIGV2ZW4gaWYgbm9SZXNldCBpcyBzZXQgdG8gdHJ1ZVxuICAgICAgbGV0IG9wdHMgPSBfLmNsb25lRGVlcCh0aGlzLm9wdHMpO1xuICAgICAgb3B0cy5ub1Jlc2V0ID0gZmFsc2U7XG4gICAgICBvcHRzLmZ1bGxSZXNldCA9IGZhbHNlO1xuICAgICAgY29uc3Qgc2h1dGRvd25IYW5kbGVyID0gdGhpcy5yZXNldE9uVW5leHBlY3RlZFNodXRkb3duO1xuICAgICAgdGhpcy5yZXNldE9uVW5leHBlY3RlZFNodXRkb3duID0gKCkgPT4ge307XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnJ1blJlc2V0KG9wdHMpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgdGhpcy5yZXNldE9uVW5leHBlY3RlZFNodXRkb3duID0gc2h1dGRvd25IYW5kbGVyO1xuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBzdXBlci5yZXNldCgpO1xuICB9XG59XG5cbk9iamVjdC5hc3NpZ24oWENVSVRlc3REcml2ZXIucHJvdG90eXBlLCBjb21tYW5kcyk7XG5cbmV4cG9ydCBkZWZhdWx0IFhDVUlUZXN0RHJpdmVyO1xuZXhwb3J0IHsgWENVSVRlc3REcml2ZXIgfTtcbiJdLCJmaWxlIjoibGliL2RyaXZlci5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLiJ9
