"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

require("source-map-support/register");

var _asyncbox = require("asyncbox");

var _lodash = _interopRequireDefault(require("lodash"));

var _nodeSimctl = require("node-simctl");

var _teen_process = require("teen_process");

var _logger = _interopRequireDefault(require("../logger"));

var _appiumSupport = require("appium-support");

let commands = {};

async function getScreenshotWithIdevicelib(udid, isLandscape) {
  const pathToScreenshotTiff = await _appiumSupport.tempDir.path({
    prefix: `screenshot-${udid}`,
    suffix: '.tiff'
  });
  await _appiumSupport.fs.rimraf(pathToScreenshotTiff);
  const pathToResultPng = await _appiumSupport.tempDir.path({
    prefix: `screenshot-${udid}`,
    suffix: '.png'
  });
  await _appiumSupport.fs.rimraf(pathToResultPng);

  try {
    try {
      await (0, _teen_process.exec)('idevicescreenshot', ['-u', udid, pathToScreenshotTiff]);
    } catch (e) {
      throw new Error(`Cannot take a screenshot from the device '${udid}' using ` + `idevicescreenshot. Original error: ${e.message}`);
    }

    let sipsArgs = ['-s', 'format', 'png', pathToScreenshotTiff, '--out', pathToResultPng];

    if (isLandscape) {
      sipsArgs = ['-r', '-90', ...sipsArgs];
    }

    try {
      await (0, _teen_process.exec)('sips', sipsArgs);
    } catch (e) {
      throw new Error(`Cannot convert a screenshot from TIFF to PNG using sips tool. ` + `Original error: ${e.message}`);
    }

    if (!(await _appiumSupport.fs.exists(pathToResultPng))) {
      throw new Error(`Cannot convert a screenshot from TIFF to PNG. The conversion ` + `result does not exist at '${pathToResultPng}'`);
    }

    return (await _appiumSupport.fs.readFile(pathToResultPng)).toString('base64');
  } finally {
    await _appiumSupport.fs.rimraf(pathToScreenshotTiff);
    await _appiumSupport.fs.rimraf(pathToResultPng);
  }
}

async function verifyIdeviceScreenshotAvailable() {
  try {
    await _appiumSupport.fs.which('idevicescreenshot');
  } catch (err) {
    throw new Error(`No 'idevicescreenshot' program found. To use, install ` + `using 'brew install --HEAD libimobiledevice'`);
  }
}

commands.getScreenshot = async function () {
  const getScreenshotFromIDS = async () => {
    _logger.default.debug(`Taking screenshot with 'idevicescreenshot'`);

    await verifyIdeviceScreenshotAvailable();
    const orientation = await this.proxyCommand('/orientation', 'GET');
    return await getScreenshotWithIdevicelib(this.opts.udid, orientation === 'LANDSCAPE');
  };

  const getScreenshotFromWDA = async () => {
    _logger.default.debug(`Taking screenshot with WDA`);

    const data = await this.proxyCommand('/screenshot', 'GET');

    if (!_lodash.default.isString(data)) {
      throw new Error(`Unable to take screenshot. WDA returned '${JSON.stringify(data)}'`);
    }

    return data;
  };

  if (this.opts.realDeviceScreenshotter && this.mjpegStream) {
    _logger.default.warn("You've specified screenshot retrieval via both MJpeg server " + "and a real device screenshot utility. Please use one or the " + "other! Choosing MJPEG server");
  }

  if (this.mjpegStrem) {
    const data = await this.mjpegStream.lastChunkPNGBase64();

    if (data) {
      return data;
    }

    _logger.default.warn("Tried to get screenshot from active MJPEG stream, but there " + "was no data yet. Falling back to regular screenshot methods.");
  }

  const useIdeviceScreenshot = _lodash.default.lowerCase(this.opts.realDeviceScreenshotter) === 'idevicescreenshot';

  if (useIdeviceScreenshot) {
    return await getScreenshotFromIDS();
  }

  try {
    return await getScreenshotFromWDA();
  } catch (err) {
    _logger.default.warn(`Error getting screenshot: ${err.message}`);
  }

  if (this.isSimulator()) {
    if (this.xcodeVersion.versionFloat < 8.1) {
      _logger.default.errorAndThrow(`No command line screenshot ability with Xcode ` + `${this.xcodeVersion.versionFloat}. Please upgrade to ` + `at least Xcode 8.1`);
    }

    _logger.default.info(`Falling back to 'simctl io screenshot' API`);

    return await (0, _nodeSimctl.getScreenshot)(this.opts.udid);
  }

  try {
    return await getScreenshotFromIDS();
  } catch (err) {
    _logger.default.warn(`Error getting screenshot through 'idevicescreenshot': ${err.message}`);
  }

  return await (0, _asyncbox.retryInterval)(2, 1000, getScreenshotFromWDA);
};

commands.getElementScreenshot = async function (el) {
  el = _appiumSupport.util.unwrapElement(el);

  if (this.isWebContext()) {
    const atomsElement = this.useAtomsElement(el);
    return await this.executeAtom('getElementScreenshot', [atomsElement]);
  }

  if (this.xcodeVersion.major < 9) {
    _logger.default.errorAndThrow(`Element screenshots are only available since Xcode 9. ` + `The current Xcode version is ${this.xcodeVersion.major}.${this.xcodeVersion.minor}`);
  }

  const data = await this.proxyCommand(`/element/${el}/screenshot`, 'GET');

  if (!_lodash.default.isString(data)) {
    _logger.default.errorAndThrow(`Unable to take a screenshot of the element ${el}. WDA returned '${JSON.stringify(data)}'`);
  }

  return data;
};

commands.getViewportScreenshot = async function () {
  let statusBarHeight = await this.getStatusBarHeight();
  const screenshot = await this.getScreenshot();

  if (statusBarHeight === 0) {
    return screenshot;
  }

  const scale = await this.getDevicePixelRatio();
  statusBarHeight = Math.round(statusBarHeight * scale);
  const windowSize = await this.getWindowSize();
  let rect = {
    left: 0,
    top: statusBarHeight,
    width: windowSize.width * scale,
    height: windowSize.height * scale - statusBarHeight
  };
  let newScreenshot = await _appiumSupport.imageUtil.cropBase64Image(screenshot, rect);
  return newScreenshot;
};

var _default = commands;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jb21tYW5kcy9zY3JlZW5zaG90cy5qcyJdLCJuYW1lcyI6WyJjb21tYW5kcyIsImdldFNjcmVlbnNob3RXaXRoSWRldmljZWxpYiIsInVkaWQiLCJpc0xhbmRzY2FwZSIsInBhdGhUb1NjcmVlbnNob3RUaWZmIiwidGVtcERpciIsInBhdGgiLCJwcmVmaXgiLCJzdWZmaXgiLCJmcyIsInJpbXJhZiIsInBhdGhUb1Jlc3VsdFBuZyIsImUiLCJFcnJvciIsIm1lc3NhZ2UiLCJzaXBzQXJncyIsImV4aXN0cyIsInJlYWRGaWxlIiwidG9TdHJpbmciLCJ2ZXJpZnlJZGV2aWNlU2NyZWVuc2hvdEF2YWlsYWJsZSIsIndoaWNoIiwiZXJyIiwiZ2V0U2NyZWVuc2hvdCIsImdldFNjcmVlbnNob3RGcm9tSURTIiwibG9nIiwiZGVidWciLCJvcmllbnRhdGlvbiIsInByb3h5Q29tbWFuZCIsIm9wdHMiLCJnZXRTY3JlZW5zaG90RnJvbVdEQSIsImRhdGEiLCJfIiwiaXNTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwicmVhbERldmljZVNjcmVlbnNob3R0ZXIiLCJtanBlZ1N0cmVhbSIsIndhcm4iLCJtanBlZ1N0cmVtIiwibGFzdENodW5rUE5HQmFzZTY0IiwidXNlSWRldmljZVNjcmVlbnNob3QiLCJsb3dlckNhc2UiLCJpc1NpbXVsYXRvciIsInhjb2RlVmVyc2lvbiIsInZlcnNpb25GbG9hdCIsImVycm9yQW5kVGhyb3ciLCJpbmZvIiwiZ2V0RWxlbWVudFNjcmVlbnNob3QiLCJlbCIsInV0aWwiLCJ1bndyYXBFbGVtZW50IiwiaXNXZWJDb250ZXh0IiwiYXRvbXNFbGVtZW50IiwidXNlQXRvbXNFbGVtZW50IiwiZXhlY3V0ZUF0b20iLCJtYWpvciIsIm1pbm9yIiwiZ2V0Vmlld3BvcnRTY3JlZW5zaG90Iiwic3RhdHVzQmFySGVpZ2h0IiwiZ2V0U3RhdHVzQmFySGVpZ2h0Iiwic2NyZWVuc2hvdCIsInNjYWxlIiwiZ2V0RGV2aWNlUGl4ZWxSYXRpbyIsIk1hdGgiLCJyb3VuZCIsIndpbmRvd1NpemUiLCJnZXRXaW5kb3dTaXplIiwicmVjdCIsImxlZnQiLCJ0b3AiLCJ3aWR0aCIsImhlaWdodCIsIm5ld1NjcmVlbnNob3QiLCJpbWFnZVV0aWwiLCJjcm9wQmFzZTY0SW1hZ2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBRUEsSUFBSUEsUUFBUSxHQUFHLEVBQWY7O0FBRUEsZUFBZUMsMkJBQWYsQ0FBNENDLElBQTVDLEVBQWtEQyxXQUFsRCxFQUErRDtBQUM3RCxRQUFNQyxvQkFBb0IsR0FBRyxNQUFNQyx1QkFBUUMsSUFBUixDQUFhO0FBQUNDLElBQUFBLE1BQU0sRUFBRyxjQUFhTCxJQUFLLEVBQTVCO0FBQStCTSxJQUFBQSxNQUFNLEVBQUU7QUFBdkMsR0FBYixDQUFuQztBQUNBLFFBQU1DLGtCQUFHQyxNQUFILENBQVVOLG9CQUFWLENBQU47QUFDQSxRQUFNTyxlQUFlLEdBQUcsTUFBTU4sdUJBQVFDLElBQVIsQ0FBYTtBQUFDQyxJQUFBQSxNQUFNLEVBQUcsY0FBYUwsSUFBSyxFQUE1QjtBQUErQk0sSUFBQUEsTUFBTSxFQUFFO0FBQXZDLEdBQWIsQ0FBOUI7QUFDQSxRQUFNQyxrQkFBR0MsTUFBSCxDQUFVQyxlQUFWLENBQU47O0FBQ0EsTUFBSTtBQUNGLFFBQUk7QUFDRixZQUFNLHdCQUFLLG1CQUFMLEVBQTBCLENBQUMsSUFBRCxFQUFPVCxJQUFQLEVBQWFFLG9CQUFiLENBQTFCLENBQU47QUFDRCxLQUZELENBRUUsT0FBT1EsQ0FBUCxFQUFVO0FBQ1YsWUFBTSxJQUFJQyxLQUFKLENBQVcsNkNBQTRDWCxJQUFLLFVBQWxELEdBQ2Isc0NBQXFDVSxDQUFDLENBQUNFLE9BQVEsRUFENUMsQ0FBTjtBQUVEOztBQUNELFFBQUlDLFFBQVEsR0FBRyxDQUFDLElBQUQsRUFBTyxRQUFQLEVBQWlCLEtBQWpCLEVBQXdCWCxvQkFBeEIsRUFBOEMsT0FBOUMsRUFBdURPLGVBQXZELENB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QjtBQUNBLFNBQU9LLGFBQVA7QUFDRCxDQXRCRDs7ZUF3QmV4RSxRIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcmV0cnlJbnRlcnZhbCB9IGZyb20gJ2FzeW5jYm94JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyBnZXRTY3JlZW5zaG90IH0gZnJvbSAnbm9kZS1zaW1jdGwnO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gJ3RlZW5fcHJvY2Vzcyc7XG5pbXBvcnQgbG9nIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgeyBmcywgdGVtcERpciwgdXRpbCwgaW1hZ2VVdGlsIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuXG5sZXQgY29tbWFuZHMgPSB7fTtcblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2NyZWVuc2hvdFdpdGhJZGV2aWNlbGliICh1ZGlkLCBpc0xhbmRzY2FwZSkge1xuICBjb25zdCBwYXRoVG9TY3JlZW5zaG90VGlmZiA9IGF3YWl0IHRlbXBEaXIucGF0aCh7cHJlZml4OiBgc2NyZWVuc2hvdC0ke3VkaWR9YCwgc3VmZml4OiAnLnRpZmYnfSk7XG4gIGF3YWl0IGZzLnJpbXJhZihwYXRoVG9TY3JlZW5zaG90VGlmZik7XG4gIGNvbnN0IHBhdGhUb1Jlc3VsdFBuZyA9IGF3YWl0IHRlbXBEaXIucGF0aCh7cHJlZml4OiBgc2NyZWVuc2hvdC0ke3VkaWR9YCwgc3VmZml4OiAnLnBuZyd9KTtcbiAgYXdhaXQgZnMucmltcmFmKHBhdGhUb1Jlc3VsdFBuZyk7XG4gIHRyeSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGV4ZWMoJ2lkZXZpY2VzY3JlZW5zaG90JywgWyctdScsIHVkaWQsIHBhdGhUb1NjcmVlbnNob3RUaWZmXSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgdGFrZSBhIHNjcmVlbnNob3QgZnJvbSB0aGUgZGV2aWNlICcke3VkaWR9JyB1c2luZyBgICtcbiAgICAgICAgYGlkZXZpY2VzY3JlZW5zaG90LiBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gICAgfVxuICAgIGxldCBzaXBzQXJncyA9IFsnLXMnLCAnZm9ybWF0JywgJ3BuZycsIHBhdGhUb1NjcmVlbnNob3RUaWZmLCAnLS1vdXQnLCBwYXRoVG9SZXN1bHRQbmddO1xuICAgIGlmIChpc0xhbmRzY2FwZSkge1xuICAgICAgc2lwc0FyZ3MgPSBbJy1yJywgJy05MCcsIC4uLnNpcHNBcmdzXTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIC8vIFRoZSBzaXBzIHRvb2wgaXMgb25seSBwcmVzZW50IG9uIE1hYyBPU1xuICAgICAgYXdhaXQgZXhlYygnc2lwcycsIHNpcHNBcmdzKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjb252ZXJ0IGEgc2NyZWVuc2hvdCBmcm9tIFRJRkYgdG8gUE5HIHVzaW5nIHNpcHMgdG9vbC4gYCArXG4gICAgICAgIGBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gICAgfVxuICAgIGlmICghYXdhaXQgZnMuZXhpc3RzKHBhdGhUb1Jlc3VsdFBuZykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNvbnZlcnQgYSBzY3JlZW5zaG90IGZyb20gVElGRiB0byBQTkcuIFRoZSBjb252ZXJzaW9uIGAgK1xuICAgICAgICBgcmVzdWx0IGRvZXMgbm90IGV4aXN0IGF0ICcke3BhdGhUb1Jlc3VsdFBuZ30nYCk7XG4gICAgfVxuICAgIHJldHVybiAoYXdhaXQgZnMucmVhZEZpbGUocGF0aFRvUmVzdWx0UG5nKSkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICB9IGZpbmFsbHkge1xuICAgIGF3YWl0IGZzLnJpbXJhZihwYXRoVG9TY3JlZW5zaG90VGlmZik7XG4gICAgYXdhaXQgZnMucmltcmFmKHBhdGhUb1Jlc3VsdFBuZyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdmVyaWZ5SWRldmljZVNjcmVlbnNob3RBdmFpbGFibGUgKCkge1xuICB0cnkge1xuICAgIGF3YWl0IGZzLndoaWNoKCdpZGV2aWNlc2NyZWVuc2hvdCcpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE5vICdpZGV2aWNlc2NyZWVuc2hvdCcgcHJvZ3JhbSBmb3VuZC4gVG8gdXNlLCBpbnN0YWxsIGAgK1xuICAgICAgICAgICAgICAgICAgICBgdXNpbmcgJ2JyZXcgaW5zdGFsbCAtLUhFQUQgbGliaW1vYmlsZWRldmljZSdgKTtcbiAgfVxufVxuXG5jb21tYW5kcy5nZXRTY3JlZW5zaG90ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBjb25zdCBnZXRTY3JlZW5zaG90RnJvbUlEUyA9IGFzeW5jICgpID0+IHtcbiAgICBsb2cuZGVidWcoYFRha2luZyBzY3JlZW5zaG90IHdpdGggJ2lkZXZpY2VzY3JlZW5zaG90J2ApO1xuICAgIGF3YWl0IHZlcmlmeUlkZXZpY2VTY3JlZW5zaG90QXZhaWxhYmxlKCk7XG4gICAgY29uc3Qgb3JpZW50YXRpb24gPSBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZCgnL29yaWVudGF0aW9uJywgJ0dFVCcpO1xuICAgIHJldHVybiBhd2FpdCBnZXRTY3JlZW5zaG90V2l0aElkZXZpY2VsaWIodGhpcy5vcHRzLnVkaWQsIG9yaWVudGF0aW9uID09PSAnTEFORFNDQVBFJyk7XG4gIH07XG5cbiAgY29uc3QgZ2V0U2NyZWVuc2hvdEZyb21XREEgPSBhc3luYyAoKSA9PiB7XG4gICAgbG9nLmRlYnVnKGBUYWtpbmcgc2NyZWVuc2hvdCB3aXRoIFdEQWApO1xuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZCgnL3NjcmVlbnNob3QnLCAnR0VUJyk7XG4gICAgaWYgKCFfLmlzU3RyaW5nKGRhdGEpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byB0YWtlIHNjcmVlbnNob3QuIFdEQSByZXR1cm5lZCAnJHtKU09OLnN0cmluZ2lmeShkYXRhKX0nYCk7XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9O1xuXG4gIC8vIGVuc3VyZSB0aGUgdXNlciBkb2Vzbid0IHRyeSB0byB1c2UgMiBzcGVjaWFsdHkgc2NyZWVuc2hvdCBjYXBzXG4gIGlmICh0aGlzLm9wdHMucmVhbERldmljZVNjcmVlbnNob3R0ZXIgJiYgdGhpcy5tanBlZ1N0cmVhbSkge1xuICAgIGxvZy53YXJuKFwiWW91J3ZlIHNwZWNpZmllZCBzY3JlZW5zaG90IHJldHJpZXZhbCB2aWEgYm90aCBNSnBlZyBzZXJ2ZXIgXCIgK1xuICAgICAgICAgICAgIFwiYW5kIGEgcmVhbCBkZXZpY2Ugc2NyZWVuc2hvdCB1dGlsaXR5LiBQbGVhc2UgdXNlIG9uZSBvciB0aGUgXCIgK1xuICAgICAgICAgICAgIFwib3RoZXIhIENob29zaW5nIE1KUEVHIHNlcnZlclwiKTtcbiAgfVxuXG4gIC8vIGlmIHdlJ3ZlIHNwZWNpZmllZCBhbiBtanBlZyBzZXJ2ZXIsIHVzZSB0aGF0XG4gIGlmICh0aGlzLm1qcGVnU3RyZW0pIHtcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5tanBlZ1N0cmVhbS5sYXN0Q2h1bmtQTkdCYXNlNjQoKTtcbiAgICBpZiAoZGF0YSkge1xuICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfVxuICAgIGxvZy53YXJuKFwiVHJpZWQgdG8gZ2V0IHNjcmVlbnNob3QgZnJvbSBhY3RpdmUgTUpQRUcgc3RyZWFtLCBidXQgdGhlcmUgXCIgK1xuICAgICAgICAgICAgIFwid2FzIG5vIGRhdGEgeWV0LiBGYWxsaW5nIGJhY2sgdG8gcmVndWxhciBzY3JlZW5zaG90IG1ldGhvZHMuXCIpO1xuICB9XG5cbiAgLy8gb3RoZXJ3aXNlIHVzZSB0aGUgcmVhbCBkZXZpY2Ugc2NyZWVuc2hvdHRlciBhcyBzcGVjaWZpZWRcbiAgY29uc3QgdXNlSWRldmljZVNjcmVlbnNob3QgPSBfLmxvd2VyQ2FzZSh0aGlzLm9wdHMucmVhbERldmljZVNjcmVlbnNob3R0ZXIpID09PSAnaWRldmljZXNjcmVlbnNob3QnO1xuICBpZiAodXNlSWRldmljZVNjcmVlbnNob3QpIHtcbiAgICByZXR1cm4gYXdhaXQgZ2V0U2NyZWVuc2hvdEZyb21JRFMoKTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IGdldFNjcmVlbnNob3RGcm9tV0RBKCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGxvZy53YXJuKGBFcnJvciBnZXR0aW5nIHNjcmVlbnNob3Q6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gIH1cblxuICAvLyBzaW11bGF0b3IgYXR0ZW1wdFxuICBpZiAodGhpcy5pc1NpbXVsYXRvcigpKSB7XG4gICAgaWYgKHRoaXMueGNvZGVWZXJzaW9uLnZlcnNpb25GbG9hdCA8IDguMSkge1xuICAgICAgbG9nLmVycm9yQW5kVGhyb3coYE5vIGNvbW1hbmQgbGluZSBzY3JlZW5zaG90IGFiaWxpdHkgd2l0aCBYY29kZSBgICtcbiAgICAgICAgICAgICAgIGAke3RoaXMueGNvZGVWZXJzaW9uLnZlcnNpb25GbG9hdH0uIFBsZWFzZSB1cGdyYWRlIHRvIGAgK1xuICAgICAgICAgICAgICAgYGF0IGxlYXN0IFhjb2RlIDguMWApO1xuICAgIH1cbiAgICBsb2cuaW5mbyhgRmFsbGluZyBiYWNrIHRvICdzaW1jdGwgaW8gc2NyZWVuc2hvdCcgQVBJYCk7XG4gICAgcmV0dXJuIGF3YWl0IGdldFNjcmVlbnNob3QodGhpcy5vcHRzLnVkaWQpO1xuICB9XG5cbiAgLy8gYWxsIHNpbXVsYXRvciBzY2VuYXJpb3MgYXJlIGZpbmlzaGVkXG4gIC8vIHJlYWwgZGV2aWNlLCBzbyB0cnkgaWRldmljZXNjcmVlbnNob3QgaWYgcG9zc2libGVcbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgZ2V0U2NyZWVuc2hvdEZyb21JRFMoKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgbG9nLndhcm4oYEVycm9yIGdldHRpbmcgc2NyZWVuc2hvdCB0aHJvdWdoICdpZGV2aWNlc2NyZWVuc2hvdCc6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gIH1cblxuICAvLyBSZXRyeSBmb3IgcmVhbCBkZXZpY2VzIG9ubHkuIEZhaWwgZmFzdCBvbiBTaW11bGF0b3IgaWYgc2ltY3RsIGRvZXMgbm90IHdvcmsgYXMgZXhwZWN0ZWRcbiAgcmV0dXJuIGF3YWl0IHJldHJ5SW50ZXJ2YWwoMiwgMTAwMCwgZ2V0U2NyZWVuc2hvdEZyb21XREEpO1xufTtcblxuY29tbWFuZHMuZ2V0RWxlbWVudFNjcmVlbnNob3QgPSBhc3luYyBmdW5jdGlvbiAoZWwpIHtcbiAgZWwgPSB1dGlsLnVud3JhcEVsZW1lbnQoZWwpO1xuICBpZiAodGhpcy5pc1dlYkNvbnRleHQoKSkge1xuICAgIGNvbnN0IGF0b21zRWxlbWVudCA9IHRoaXMudXNlQXRvbXNFbGVtZW50KGVsKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlQXRvbSgnZ2V0RWxlbWVudFNjcmVlbnNob3QnLCBbYXRvbXNFbGVtZW50XSk7XG4gIH1cblxuICBpZiAodGhpcy54Y29kZVZlcnNpb24ubWFqb3IgPCA5KSB7XG4gICAgbG9nLmVycm9yQW5kVGhyb3coYEVsZW1lbnQgc2NyZWVuc2hvdHMgYXJlIG9ubHkgYXZhaWxhYmxlIHNpbmNlIFhjb2RlIDkuIGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBUaGUgY3VycmVudCBYY29kZSB2ZXJzaW9uIGlzICR7dGhpcy54Y29kZVZlcnNpb24ubWFqb3J9LiR7dGhpcy54Y29kZVZlcnNpb24ubWlub3J9YCk7XG4gIH1cbiAgY29uc3QgZGF0YSA9IGF3YWl0IHRoaXMucHJveHlDb21tYW5kKGAvZWxlbWVudC8ke2VsfS9zY3JlZW5zaG90YCwgJ0dFVCcpO1xuICBpZiAoIV8uaXNTdHJpbmcoZGF0YSkpIHtcbiAgICBsb2cuZXJyb3JBbmRUaHJvdyhgVW5hYmxlIHRvIHRha2UgYSBzY3JlZW5zaG90IG9mIHRoZSBlbGVtZW50ICR7ZWx9LiBXREEgcmV0dXJuZWQgJyR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9J2ApO1xuICB9XG4gIHJldHVybiBkYXRhO1xufTtcblxuY29tbWFuZHMuZ2V0Vmlld3BvcnRTY3JlZW5zaG90ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBsZXQgc3RhdHVzQmFySGVpZ2h0ID0gYXdhaXQgdGhpcy5nZXRTdGF0dXNCYXJIZWlnaHQoKTtcbiAgY29uc3Qgc2NyZWVuc2hvdCA9IGF3YWl0IHRoaXMuZ2V0U2NyZWVuc2hvdCgpO1xuXG4gIC8vIGlmIHdlIGRvbid0IGhhdmUgYSBzdGF0dXMgYmFyLCB0aGVyZSdzIG5vdGhpbmcgdG8gY3JvcCwgc28gd2UgY2FuIGF2b2lkXG4gIC8vIGV4dHJhIGNhbGxzIGFuZCByZXR1cm4gc3RyYWlnaHRhd2F5XG4gIGlmIChzdGF0dXNCYXJIZWlnaHQgPT09IDApIHtcbiAgICByZXR1cm4gc2NyZWVuc2hvdDtcbiAgfVxuXG4gIGNvbnN0IHNjYWxlID0gYXdhaXQgdGhpcy5nZXREZXZpY2VQaXhlbFJhdGlvKCk7XG4gIC8vIHN0YXR1cyBiYXIgaGVpZ2h0IGNvbWVzIGluIHVuc2NhbGVkLCBzbyBzY2FsZSBpdFxuICBzdGF0dXNCYXJIZWlnaHQgPSBNYXRoLnJvdW5kKHN0YXR1c0JhckhlaWdodCAqIHNjYWxlKTtcbiAgY29uc3Qgd2luZG93U2l6ZSA9IGF3YWl0IHRoaXMuZ2V0V2luZG93U2l6ZSgpO1xuICBsZXQgcmVjdCA9IHtcbiAgICBsZWZ0OiAwLFxuICAgIHRvcDogc3RhdHVzQmFySGVpZ2h0LFxuICAgIHdpZHRoOiB3aW5kb3dTaXplLndpZHRoICogc2NhbGUsXG4gICAgaGVpZ2h0OiAoKHdpbmRvd1NpemUuaGVpZ2h0ICogc2NhbGUpIC0gc3RhdHVzQmFySGVpZ2h0KVxuICB9O1xuICBsZXQgbmV3U2NyZWVuc2hvdCA9IGF3YWl0IGltYWdlVXRpbC5jcm9wQmFzZTY0SW1hZ2Uoc2NyZWVuc2hvdCwgcmVjdCk7XG4gIHJldHVybiBuZXdTY3JlZW5zaG90O1xufTtcblxuZXhwb3J0IGRlZmF1bHQgY29tbWFuZHM7XG4iXSwiZmlsZSI6ImxpYi9jb21tYW5kcy9zY3JlZW5zaG90cy5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLi8uLiJ9
