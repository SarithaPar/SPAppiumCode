"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.commands = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _appiumSupport = require("appium-support");

var _teen_process = require("teen_process");

var _logger = _interopRequireDefault(require("../logger"));

var _utils = require("../utils");

var _iproxy = _interopRequireDefault(require("../wda/iproxy"));

let commands = {};
exports.commands = commands;
const MAX_RECORDING_TIME_SEC = 60 * 30;
const DEFAULT_RECORDING_TIME_SEC = 60 * 3;
const DEFAULT_MJPEG_SERVER_PORT = 9100;
const DEFAULT_FPS = 10;
const DEFAULT_QUALITY = 'medium';
const DEFAULT_VCODEC = 'mjpeg';
const MP4_EXT = '.mp4';
const FFMPEG_BINARY = 'ffmpeg';

const ffmpegLogger = _appiumSupport.logger.getLogger(FFMPEG_BINARY);

const QUALITY_MAPPING = {
  low: 10,
  medium: 25,
  high: 75,
  photo: 100
};

class ScreenRecorder {
  constructor(udid, videoPath, opts = {}) {
    this.videoPath = videoPath;
    this.opts = opts;
    this.udid = udid;
    this.mainProcess = null;
    this.iproxy = null;
    this.timeoutHandler = null;
  }

  async start(timeoutMs) {
    try {
      await _appiumSupport.fs.which(FFMPEG_BINARY);
    } catch (err) {
      throw new Error(`'${FFMPEG_BINARY}' binary is not found in PATH. Install it using 'brew install ffmpeg'. ` + `Check https://www.ffmpeg.org/download.html for more details.`);
    }

    const localPort = this.opts.remotePort;

    if (this.opts.usePortForwarding) {
      await this.startIproxy(localPort);
    }

    const args = ['-f', 'mjpeg', '-i', `http://localhost:${localPort}`];

    if (this.opts.videoScale) {
      args.push('-vf', `scale=${this.opts.videoScale}`);
    }

    args.push('-vcodec', this.opts.videoType, '-y', this.videoPath);
    this.mainProcess = new _teen_process.SubProcess(FFMPEG_BINARY, args);
    this.mainProcess.on('output', (stdout, stderr) => {
      if (stderr && !stderr.includes('frame=')) {
        ffmpegLogger.info(`${stderr}`);
      }
    });
    await this.mainProcess.start(5000);

    _logger.default.info(`Starting screen capture on the device '${this.udid}' with command: '${FFMPEG_BINARY} ${args.join(' ')}'. ` + `Will timeout in ${timeoutMs}ms`);

    this.timeoutHandler = setTimeout(async () => {
      if (!(await this.interrupt())) {
        _logger.default.warn(`Cannot finish the active screen recording on the device '${this.udid}' after ${timeoutMs}ms timeout`);
      }
    }, timeoutMs);
  }

  async startIproxy(localPort) {
    this.iproxy = new _iproxy.default(this.udid, localPort, this.opts.remotePort);

    try {
      await this.iproxy.start();
    } catch (err) {
      _logger.default.warn(`Cannot start iproxy. Assuming it is already forwarding the remote port ${this.opts.remotePort} to ${localPort} ` + `for the device ${this.udid}. Set the custom value to 'mjpegServerPort' capability if this is an undesired behavior. ` + `Original error: ${err.message}`);

      this.iproxy = null;
    }
  }

  async stopIproxy() {
    if (!this.iproxy) {
      return;
    }

    const quitPromise = this.iproxy.quit();
    this.iproxy = null;

    try {
      await quitPromise;
    } catch (err) {
      _logger.default.warn(`Cannot stop iproxy. Original error: ${err.message}`);
    }
  }

  async interrupt(force = false) {
    let result = true;

    if (this.timeoutHandler) {
      clearTimeout(this.timeoutHandler);
      this.timeoutHandler = null;
    }

    if (this.mainProcess && this.mainProcess.isRunning) {
      const interruptPromise = this.mainProcess.stop(force ? 'SIGTERM' : 'SIGINT');
      this.mainProcess = null;

      try {
        await interruptPromise;
      } catch (e) {
        _logger.default.warn(`Cannot ${force ? 'terminate' : 'interrupt'} ${FFMPEG_BINARY}. ` + `Original error: ${e.message}`);

        result = false;
      }
    }

    if (this.opts.usePortForwarding) {
      await this.stopIproxy();
    }

    return result;
  }

  async finish() {
    await this.interrupt();
    return this.videoPath;
  }

  async cleanup() {
    if (await _appiumSupport.fs.exists(this.videoPath)) {
      await _appiumSupport.fs.rimraf(this.videoPath);
    }
  }

}

commands.startRecordingScreen = async function (options = {}) {
  const {
    videoType = DEFAULT_VCODEC,
    timeLimit = DEFAULT_RECORDING_TIME_SEC,
    videoQuality = DEFAULT_QUALITY,
    videoFps = DEFAULT_FPS,
    videoScale,
    forceRestart
  } = options;
  let result = '';

  if (!forceRestart) {
    _logger.default.info(`Checking if there is/was a previous screen recording. ` + `Set 'forceRestart' option to 'true' if you'd like to skip this step.`);

    result = await this.stopRecordingScreen(options);
  }

  const videoPath = await _appiumSupport.tempDir.path({
    prefix: `appium_${Math.random().toString(16).substring(2, 8)}`,
    suffix: MP4_EXT
  });
  const screenRecorder = new ScreenRecorder(this.opts.device.udid, videoPath, {
    remotePort: this.opts.mjpegServerPort || DEFAULT_MJPEG_SERVER_PORT,
    usePortForwarding: this.isRealDevice(),
    videoType,
    videoScale
  });

  if (!(await screenRecorder.interrupt(true))) {
    _logger.default.errorAndThrow('Unable to stop screen recording process');
  }

  if (this._recentScreenRecorder) {
    await this._recentScreenRecorder.cleanup();
    this._recentScreenRecorder = null;
  }

  const timeoutSeconds = parseFloat(timeLimit);

  if (isNaN(timeoutSeconds) || timeoutSeconds > MAX_RECORDING_TIME_SEC || timeoutSeconds <= 0) {
    _logger.default.errorAndThrow(`The timeLimit value must be in range [1, ${MAX_RECORDING_TIME_SEC}] seconds. ` + `The value of '${timeLimit}' has been passed instead.`);
  }

  let {
    mjpegServerScreenshotQuality,
    mjpegServerFramerate
  } = await this.proxyCommand('/appium/settings', 'GET');

  if (videoQuality) {
    const quality = _lodash.default.isInteger(videoQuality) ? videoQuality : QUALITY_MAPPING[_lodash.default.toLower(videoQuality)];

    if (!quality) {
      throw new Error(`videoQuality value should be one of ${JSON.stringify(_lodash.default.keys(QUALITY_MAPPING))} or a number in range 1..100. ` + `'${videoQuality}' is given instead`);
    }

    mjpegServerScreenshotQuality = mjpegServerScreenshotQuality !== quality ? quality : undefined;
  } else {
    mjpegServerScreenshotQuality = undefined;
  }

  if (videoFps) {
    const fps = parseInt(videoFps, 10);

    if (isNaN(fps)) {
      throw new Error(`videoFps value should be a valid number in range 1..60. ` + `'${videoFps}' is given instead`);
    }

    mjpegServerFramerate = mjpegServerFramerate !== fps ? fps : undefined;
  } else {
    mjpegServerFramerate = undefined;
  }

  if (_appiumSupport.util.hasValue(mjpegServerScreenshotQuality) || _appiumSupport.util.hasValue(mjpegServerFramerate)) {
    await this.proxyCommand('/appium/settings', 'POST', {
      mjpegServerScreenshotQuality,
      mjpegServerFramerate
    });
  }

  try {
    await screenRecorder.start(timeoutSeconds * 1000);
  } catch (e) {
    await screenRecorder.interrupt(true);
    await screenRecorder.cleanup();
    throw e;
  }

  this._recentScreenRecorder = screenRecorder;
  return result;
};

commands.stopRecordingScreen = async function (options = {}) {
  const {
    remotePath,
    user,
    pass,
    method
  } = options;

  if (!this._recentScreenRecorder) {
    _logger.default.info('Screen recording is not running. There is nothing to stop.');

    return '';
  }

  try {
    const videoPath = await this._recentScreenRecorder.finish();

    if (!(await _appiumSupport.fs.exists(videoPath))) {
      _logger.default.errorAndThrow(`The screen recorder utility has failed ` + `to store the actual screen recording at '${videoPath}'`);
    }

    return await (0, _utils.encodeBase64OrUpload)(videoPath, remotePath, {
      user,
      pass,
      method
    });
  } finally {
    await this._recentScreenRecorder.interrupt(true);
    await this._recentScreenRecorder.cleanup();
    this._recentScreenRecorder = null;
  }
};

var _default = commands;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jb21tYW5kcy9yZWNvcmRzY3JlZW4uanMiXSwibmFtZXMiOlsiY29tbWFuZHMiLCJNQVhfUkVDT1JESU5HX1RJTUVfU0VDIiwiREVGQVVMVF9SRUNPUkRJTkdfVElNRV9TRUMiLCJERUZBVUxUX01KUEVHX1NFUlZFUl9QT1JUIiwiREVGQVVMVF9GUFMiLCJERUZBVUxUX1FVQUxJVFkiLCJERUZBVUxUX1ZDT0RFQyIsIk1QNF9FWFQiLCJGRk1QRUdfQklOQVJZIiwiZmZtcGVnTG9nZ2VyIiwibG9nZ2VyIiwiZ2V0TG9nZ2VyIiwiUVVBTElUWV9NQVBQSU5HIiwibG93IiwibWVkaXVtIiwiaGlnaCIsInBob3RvIiwiU2NyZWVuUmVjb3JkZXIiLCJjb25zdHJ1Y3RvciIsInVkaWQiLCJ2aWRlb1BhdGgiLCJvcHRzIiwibWFpblByb2Nlc3MiLCJpcHJveHkiLCJ0aW1lb3V0SGFuZGxlciIsInN0YXJ0IiwidGltZW91dE1zIiwiZnMiLCJ3aGljaCIsImVyciIsIkVycm9yIiwibG9jYWxQb3J0IiwicmVtb3RlUG9ydCIsInVzZVBvcnRGb3J3YXJkaW5nIiwic3RhcnRJcHJveHkiLCJhcmdzIiwidmlkZW9TY2FsZSIsInB1c2giLCJ2aWRlb1R5cGUiLCJTdWJQcm9jZXNzIiwib24iLCJzdGRvdXQiLCJzdGRlcnIiLCJpbmNsdWRlcyIsImluZm8iLCJsb2ciLCJqb2luIiwic2V0VGltZW91dCIsImludGVycnVwdCIsIndhcm4iLCJpUHJveHkiLCJtZXNzYWdlIiwic3RvcElwcm94eSIsInF1aXRQcm9taXNlIiwicXVpdCIsImZvcmNlIiwicmVzdWx0IiwiY2xlYXJUaW1lb3V0IiwiaXNSdW5uaW5nIiwiaW50ZXJydXB0UHJvbWlzZSIsInN0b3AiLCJlIiwiZmluaXNoIiwiY2xlYW51cCIsImV4aXN0cyIsInJpbXJhZiIsInN0YXJ0UmVjb3JkaW5nU2NyZWVuIiwib3B0aW9ucyIsInRpbWVMaW1pdCIsInZpZGVvUXVhbGl0eSIsInZpZGVvRnBzIiwiZm9yY2VSZXN0YXJ0Iiwic3RvcFJlY29yZGluZ1NjcmVlbiIsInRlbXBEaXIiLCJwYXRoIiwicHJlZml4IiwiTWF0aCIsInJhbmRvbSIsInRvU3RyaW5nIiwic3Vic3RyaW5nIiwic3VmZml4Iiwic2NyZWVuUmVjb3JkZXIiLCJkZXZpY2UiLCJtanBlZ1NlcnZlclBvcnQiLCJpc1JlYWxEZXZpY2UiLCJlcnJvckFuZFRocm93IiwiX3JlY2VudFNjcmVlblJlY29yZGVyIiwidGltZW91dFNlY29uZHMiLCJwYXJzZUZsb2F0IiwiaXNOYU4iLCJtanBlZ1NlcnZlclNjcmVlbnNob3RRdWFsaXR5IiwibWpwZWdTZXJ2ZXJGcmFtZXJhdGUiLCJwcm94eUNvbW1hbmQiLCJxdWFsaXR5IiwiXyIsImlzSW50ZWdlciIsInRvTG93ZXIiLCJKU09OIiwic3RyaW5naWZ5Iiwia2V5cyIsInVuZGVmaW5lZCIsImZwcyIsInBhcnNlSW50IiwidXRpbCIsImhhc1ZhbHVlIiwicmVtb3RlUGF0aCIsInVzZXIiLCJwYXNzIiwibWV0aG9kIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUVBLElBQUlBLFFBQVEsR0FBRyxFQUFmOztBQUVBLE1BQU1DLHNCQUFzQixHQUFHLEtBQUssRUFBcEM7QUFDQSxNQUFNQywwQkFBMEIsR0FBRyxLQUFLLENBQXhDO0FBQ0EsTUFBTUMseUJBQXlCLEdBQUcsSUFBbEM7QUFDQSxNQUFNQyxXQUFXLEdBQUcsRUFBcEI7QUFDQSxNQUFNQyxlQUFlLEdBQUcsUUFBeEI7QUFDQSxNQUFNQyxjQUFjLEdBQUcsT0FBdkI7QUFDQSxNQUFNQyxPQUFPLEdBQUcsTUFBaEI7QUFDQSxNQUFNQyxhQUFhLEdBQUcsUUFBdEI7O0FBQ0EsTUFBTUMsWUFBWSxHQUFHQyxzQkFBT0MsU0FBUCxDQUFpQkgsYUFBakIsQ0FBckI7O0FBQ0EsTUFBTUksZUFBZSxHQUFHO0FBQ3RCQyxFQUFBQSxHQUFHLEVBQUUsRUFEaUI7QUFFdEJDLEVBQUFBLE1BQU0sRUFB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QUEyQnRDLFNBQTNCLENBQXFDLElBQXJDLENBQU47QUFDQSxVQUFNLEtBQUtzQyxxQkFBTCxDQUEyQnZCLE9BQTNCLEVBQU47QUFDQSxTQUFLdUIscUJBQUwsR0FBNkIsSUFBN0I7QUFDRDtBQUNGLENBN0JEOztlQWlDZXRGLFEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgZnMsIHRlbXBEaXIsIGxvZ2dlciwgdXRpbCB9IGZyb20gJ2FwcGl1bS1zdXBwb3J0JztcbmltcG9ydCB7IFN1YlByb2Nlc3MgfSBmcm9tICd0ZWVuX3Byb2Nlc3MnO1xuaW1wb3J0IGxvZyBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0T3JVcGxvYWQgfSBmcm9tICcuLi91dGlscyc7XG5pbXBvcnQgaVByb3h5IGZyb20gJy4uL3dkYS9pcHJveHknO1xuXG5sZXQgY29tbWFuZHMgPSB7fTtcblxuY29uc3QgTUFYX1JFQ09SRElOR19USU1FX1NFQyA9IDYwICogMzA7XG5jb25zdCBERUZBVUxUX1JFQ09SRElOR19USU1FX1NFQyA9IDYwICogMztcbmNvbnN0IERFRkFVTFRfTUpQRUdfU0VSVkVSX1BPUlQgPSA5MTAwO1xuY29uc3QgREVGQVVMVF9GUFMgPSAxMDtcbmNvbnN0IERFRkFVTFRfUVVBTElUWSA9ICdtZWRpdW0nO1xuY29uc3QgREVGQVVMVF9WQ09ERUMgPSAnbWpwZWcnO1xuY29uc3QgTVA0X0VYVCA9ICcubXA0JztcbmNvbnN0IEZGTVBFR19CSU5BUlkgPSAnZmZtcGVnJztcbmNvbnN0IGZmbXBlZ0xvZ2dlciA9IGxvZ2dlci5nZXRMb2dnZXIoRkZNUEVHX0JJTkFSWSk7XG5jb25zdCBRVUFMSVRZX01BUFBJTkcgPSB7XG4gIGxvdzogMTAsXG4gIG1lZGl1bTogMjUsXG4gIGhpZ2g6IDc1LFxuICBwaG90bzogMTAwLFxufTtcblxuXG5jbGFzcyBTY3JlZW5SZWNvcmRlciB7XG4gIGNvbnN0cnVjdG9yICh1ZGlkLCB2aWRlb1BhdGgsIG9wdHMgPSB7fSkge1xuICAgIHRoaXMudmlkZW9QYXRoID0gdmlkZW9QYXRoO1xuICAgIHRoaXMub3B0cyA9IG9wdHM7XG4gICAgdGhpcy51ZGlkID0gdWRpZDtcbiAgICB0aGlzLm1haW5Qcm9jZXNzID0gbnVsbDtcbiAgICB0aGlzLmlwcm94eSA9IG51bGw7XG4gICAgdGhpcy50aW1lb3V0SGFuZGxlciA9IG51bGw7XG4gIH1cblxuICBhc3luYyBzdGFydCAodGltZW91dE1zKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLndoaWNoKEZGTVBFR19CSU5BUlkpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAnJHtGRk1QRUdfQklOQVJZfScgYmluYXJ5IGlzIG5vdCBmb3VuZCBpbiBQQVRILiBJbnN0YWxsIGl0IHVzaW5nICdicmV3IGluc3RhbGwgZmZtcGVnJy4gYCArXG4gICAgICAgIGBDaGVjayBodHRwczovL3d3dy5mZm1wZWcub3JnL2Rvd25sb2FkLmh0bWwgZm9yIG1vcmUgZGV0YWlscy5gKTtcbiAgICB9XG5cbiAgICBjb25zdCBsb2NhbFBvcnQgPSB0aGlzLm9wdHMucmVtb3RlUG9ydDtcbiAgICBpZiAodGhpcy5vcHRzLnVzZVBvcnRGb3J3YXJkaW5nKSB7XG4gICAgICBhd2FpdCB0aGlzLnN0YXJ0SXByb3h5KGxvY2FsUG9ydCk7XG4gICAgfVxuXG4gICAgY29uc3QgYXJncyA9IFtcbiAgICAgICctZicsICdtanBlZycsXG4gICAgICAnLWknLCBgaHR0cDovL2xvY2FsaG9zdDoke2xvY2FsUG9ydH1gLFxuICAgIF07XG4gICAgaWYgKHRoaXMub3B0cy52aWRlb1NjYWxlKSB7XG4gICAgICBhcmdzLnB1c2goJy12ZicsIGBzY2FsZT0ke3RoaXMub3B0cy52aWRlb1NjYWxlfWApO1xuICAgIH1cbiAgICBhcmdzLnB1c2goXG4gICAgICAnLXZjb2RlYycsIHRoaXMub3B0cy52aWRlb1R5cGUsXG4gICAgICAnLXknLCB0aGlzLnZpZGVvUGF0aFxuICAgICk7XG4gICAgdGhpcy5tYWluUHJvY2VzcyA9IG5ldyBTdWJQcm9jZXNzKEZGTVBFR19CSU5BUlksIGFyZ3MpO1xuICAgIHRoaXMubWFpblByb2Nlc3Mub24oJ291dHB1dCcsIChzdGRvdXQsIHN0ZGVycikgPT4ge1xuICAgICAgaWYgKHN0ZGVyciAmJiAhc3RkZXJyLmluY2x1ZGVzKCdmcmFtZT0nKSkge1xuICAgICAgICBmZm1wZWdMb2dnZXIuaW5mbyhgJHtzdGRlcnJ9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgLy8gR2l2ZSBmZm1wZWcgc29tZSB0aW1lIGZvciBpbml0XG4gICAgYXdhaXQgdGhpcy5tYWluUHJvY2Vzcy5zdGFydCg1MDAwKTtcbiAgICBsb2cuaW5mbyhgU3RhcnRpbmcgc2NyZWVuIGNhcHR1cmUgb24gdGhlIGRldmljZSAnJHt0aGlzLnVkaWR9JyB3aXRoIGNvbW1hbmQ6ICcke0ZGTVBFR19CSU5BUll9ICR7YXJncy5qb2luKCcgJyl9Jy4gYCArXG4gICAgICBgV2lsbCB0aW1lb3V0IGluICR7dGltZW91dE1zfW1zYCk7XG5cbiAgICB0aGlzLnRpbWVvdXRIYW5kbGVyID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoIWF3YWl0IHRoaXMuaW50ZXJydXB0KCkpIHtcbiAgICAgICAgbG9nLndhcm4oYENhbm5vdCBmaW5pc2ggdGhlIGFjdGl2ZSBzY3JlZW4gcmVjb3JkaW5nIG9uIHRoZSBkZXZpY2UgJyR7dGhpcy51ZGlkfScgYWZ0ZXIgJHt0aW1lb3V0TXN9bXMgdGltZW91dGApO1xuICAgICAgfVxuICAgIH0sIHRpbWVvdXRNcyk7XG4gIH1cblxuICBhc3luYyBzdGFydElwcm94eSAobG9jYWxQb3J0KSB7XG4gICAgdGhpcy5pcHJveHkgPSBuZXcgaVByb3h5KHRoaXMudWRpZCwgbG9jYWxQb3J0LCB0aGlzLm9wdHMucmVtb3RlUG9ydCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuaXByb3h5LnN0YXJ0KCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsb2cud2FybihgQ2Fubm90IHN0YXJ0IGlwcm94eS4gQXNzdW1pbmcgaXQgaXMgYWxyZWFkeSBmb3J3YXJkaW5nIHRoZSByZW1vdGUgcG9ydCAke3RoaXMub3B0cy5yZW1vdGVQb3J0fSB0byAke2xvY2FsUG9ydH0gYCArXG4gICAgICAgIGBmb3IgdGhlIGRldmljZSAke3RoaXMudWRpZH0uIFNldCB0aGUgY3VzdG9tIHZhbHVlIHRvICdtanBlZ1NlcnZlclBvcnQnIGNhcGFiaWxpdHkgaWYgdGhpcyBpcyBhbiB1bmRlc2lyZWQgYmVoYXZpb3IuIGAgK1xuICAgICAgICBgT3JpZ2luYWwgZXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICB0aGlzLmlwcm94eSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3RvcElwcm94eSAoKSB7XG4gICAgaWYgKCF0aGlzLmlwcm94eSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHF1aXRQcm9taXNlID0gdGhpcy5pcHJveHkucXVpdCgpO1xuICAgIHRoaXMuaXByb3h5ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgcXVpdFByb21pc2U7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsb2cud2FybihgQ2Fubm90IHN0b3AgaXByb3h5LiBPcmlnaW5hbCBlcnJvcjogJHtlcnIubWVzc2FnZX1gKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBpbnRlcnJ1cHQgKGZvcmNlID0gZmFsc2UpIHtcbiAgICBsZXQgcmVzdWx0ID0gdHJ1ZTtcblxuICAgIGlmICh0aGlzLnRpbWVvdXRIYW5kbGVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SGFuZGxlcik7XG4gICAgICB0aGlzLnRpbWVvdXRIYW5kbGVyID0gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5tYWluUHJvY2VzcyAmJiB0aGlzLm1haW5Qcm9jZXNzLmlzUnVubmluZykge1xuICAgICAgY29uc3QgaW50ZXJydXB0UHJvbWlzZSA9IHRoaXMubWFpblByb2Nlc3Muc3RvcChmb3JjZSA/ICdTSUdURVJNJyA6ICdTSUdJTlQnKTtcbiAgICAgIHRoaXMubWFpblByb2Nlc3MgPSBudWxsO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgaW50ZXJydXB0UHJvbWlzZTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nLndhcm4oYENhbm5vdCAke2ZvcmNlID8gJ3Rlcm1pbmF0ZScgOiAnaW50ZXJydXB0J30gJHtGRk1QRUdfQklOQVJZfS4gYCArXG4gICAgICAgICAgYE9yaWdpbmFsIGVycm9yOiAke2UubWVzc2FnZX1gKTtcbiAgICAgICAgcmVzdWx0ID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMub3B0cy51c2VQb3J0Rm9yd2FyZGluZykge1xuICAgICAgYXdhaXQgdGhpcy5zdG9wSXByb3h5KCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGZpbmlzaCAoKSB7XG4gICAgYXdhaXQgdGhpcy5pbnRlcnJ1cHQoKTtcbiAgICByZXR1cm4gdGhpcy52aWRlb1BhdGg7XG4gIH1cblxuICBhc3luYyBjbGVhbnVwICgpIHtcbiAgICBpZiAoYXdhaXQgZnMuZXhpc3RzKHRoaXMudmlkZW9QYXRoKSkge1xuICAgICAgYXdhaXQgZnMucmltcmFmKHRoaXMudmlkZW9QYXRoKTtcbiAgICB9XG4gIH1cbn1cblxuXG4vKipcbiAqIEB0eXBlZGVmIHtPYmplY3R9IFN0YXJ0UmVjb3JkaW5nT3B0aW9uc1xuICpcbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gcmVtb3RlUGF0aCAtIFRoZSBwYXRoIHRvIHRoZSByZW1vdGUgbG9jYXRpb24sIHdoZXJlIHRoZSByZXN1bHRpbmcgdmlkZW8gc2hvdWxkIGJlIHVwbG9hZGVkLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVGhlIGZvbGxvd2luZyBwcm90b2NvbHMgYXJlIHN1cHBvcnRlZDogaHR0cC9odHRwcywgZnRwLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTnVsbCBvciBlbXB0eSBzdHJpbmcgdmFsdWUgKHRoZSBkZWZhdWx0IHNldHRpbmcpIG1lYW5zIHRoZSBjb250ZW50IG9mIHJlc3VsdGluZ1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsZSBzaG91bGQgYmUgZW5jb2RlZCBhcyBCYXNlNjQgYW5kIHBhc3NlZCBhcyB0aGUgZW5kcG9pbnQgcmVzcG9uc2UgdmFsdWUuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBBbiBleGNlcHRpb24gd2lsbCBiZSB0aHJvd24gaWYgdGhlIGdlbmVyYXRlZCBtZWRpYSBmaWxlIGlzIHRvbyBiaWcgdG9cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpdCBpbnRvIHRoZSBhdmFpbGFibGUgcHJvY2VzcyBtZW1vcnkuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBUaGlzIG9wdGlvbiBvbmx5IGhhcyBhbiBlZmZlY3QgaWYgdGhlcmUgaXMgc2NyZWVuIHJlY29yZGluZyBwcm9jZXNzIGluIHByb2dyZXNzXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbmQgYGZvcmNlUmVzdGFydGAgcGFyYW1ldGVyIGlzIG5vdCBzZXQgdG8gYHRydWVgLlxuICogQHByb3BlcnR5IHs/c3RyaW5nfSB1c2VyIC0gVGhlIG5hbWUgb2YgdGhlIHVzZXIgZm9yIHRoZSByZW1vdGUgYXV0aGVudGljYXRpb24uIE9ubHkgd29ya3MgaWYgYHJlbW90ZVBhdGhgIGlzIHByb3ZpZGVkLlxuICogQHByb3BlcnR5IHs/c3RyaW5nfSBwYXNzIC0gVGhlIHBhc3N3b3JkIGZvciB0aGUgcmVtb3RlIGF1dGhlbnRpY2F0aW9uLiBPbmx5IHdvcmtzIGlmIGByZW1vdGVQYXRoYCBpcyBwcm92aWRlZC5cbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gbWV0aG9kIC0gVGhlIGh0dHAgbXVsdGlwYXJ0IHVwbG9hZCBtZXRob2QgbmFtZS4gVGhlICdQVVQnIG9uZSBpcyB1c2VkIGJ5IGRlZmF1bHQuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE9ubHkgd29ya3MgaWYgYHJlbW90ZVBhdGhgIGlzIHByb3ZpZGVkLlxuICogQHByb3BlcnR5IHs/c3RyaW5nfSB2aWRlb1R5cGUgLSBUaGUgdmlkZW8gY29kZWMgdHlwZSB1c2VkIGZvciBlbmNvZGluZyBvZiB0aGUgYmUgcmVjb3JkZWQgc2NyZWVuIGNhcHR1cmUuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEV4ZWN1dGUgYGZmbXBlZyAtY29kZWNzYCBpbiB0aGUgdGVybWluYWwgdG8gc2VlIHRoZSBsaXN0IG9mIHN1cHBvcnRlZCB2aWRlbyBjb2RlY3MuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdtanBlZycgYnkgZGVmYXVsdC5cbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ3xudW1iZXJ9IHZpZGVvUXVhbGl0eSAtIFRoZSB2aWRlbyBlbmNvZGluZyBxdWFsaXR5IChsb3csIG1lZGl1bSwgaGlnaCwgcGhvdG8gLSBkZWZhdWx0cyB0byBtZWRpdW0pLlxuICogQHByb3BlcnR5IHs/c3RyaW5nfG51bWJlcn0gdmlkZW9GcHMgLSBUaGUgRnJhbWVzIFBlciBTZWNvbmQgcmF0ZSBvZiB0aGUgcmVjb3JkZWQgdmlkZW8uIENoYW5nZSB0aGlzIHZhbHVlIGlmIHRoZSByZXN1bHRpbmcgdmlkZW9cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpcyB0b28gc2xvdyBvciB0b28gZmFzdC4gRGVmYXVsdHMgdG8gMTAuXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IHZpZGVvU2NhbGUgLSBUaGUgc2NhbGluZyB2YWx1ZSB0byBhcHBseS4gUmVhZCBodHRwczovL3RyYWMuZmZtcGVnLm9yZy93aWtpL1NjYWxpbmcgZm9yIHBvc3NpYmxlIHZhbHVlcy5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE5vIHNjYWxlIGlzIGFwcGxpZWQgYnkgZGVmYXVsdC5cbiAqIEBwcm9wZXJ0eSB7P2Jvb2xlYW59IGZvcmNlUmVzdGFydCAtIFdoZXRoZXIgdG8gdHJ5IHRvIGNhdGNoIGFuZCB1cGxvYWQvcmV0dXJuIHRoZSBjdXJyZW50bHkgcnVubmluZyBzY3JlZW4gcmVjb3JkaW5nXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoYGZhbHNlYCwgdGhlIGRlZmF1bHQgc2V0dGluZykgb3IgaWdub3JlIHRoZSByZXN1bHQgb2YgaXQgYW5kIHN0YXJ0IGEgbmV3IHJlY29yZGluZ1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW1tZWRpYXRlbHkuXG4gKiBAcHJvcGVydHkgez9zdHJpbmd8bnVtYmVyfSB0aW1lTGltaXQgLSBUaGUgbWF4aW11bSByZWNvcmRpbmcgdGltZSwgaW4gc2Vjb25kcy5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFRoZSBkZWZhdWx0IHZhbHVlIGlzIDE4MCwgdGhlIG1heGltdW0gdmFsdWUgaXMgNjAwICgxMCBtaW51dGVzKS5cbiAqL1xuXG4vKipcbiAqIFJlY29yZCB0aGUgZGlzcGxheSBvZiBkZXZpY2VzIHJ1bm5pbmcgaU9TIFNpbXVsYXRvciBzaW5jZSBYY29kZSA5IG9yIHJlYWwgZGV2aWNlcyBzaW5jZSBpT1MgMTFcbiAqIChmZm1wZWcgdXRpbGl0eSBpcyByZXF1aXJlZDogJ2JyZXcgaW5zdGFsbCBmZm1wZWcnKS5cbiAqIEl0IHJlY29yZHMgc2NyZWVuIGFjdGl2aXR5IHRvIGEgTVBFRy00IGZpbGUuIEF1ZGlvIGlzIG5vdCByZWNvcmRlZCB3aXRoIHRoZSB2aWRlbyBmaWxlLlxuICogSWYgc2NyZWVuIHJlY29yZGluZyBoYXMgYmVlbiBhbHJlYWR5IHN0YXJ0ZWQgdGhlbiB0aGUgY29tbWFuZCB3aWxsIHN0b3AgaXQgZm9yY2VmdWxseSBhbmQgc3RhcnQgYSBuZXcgb25lLlxuICogVGhlIHByZXZpb3VzbHkgcmVjb3JkZWQgdmlkZW8gZmlsZSB3aWxsIGJlIGRlbGV0ZWQuXG4gKlxuICogQHBhcmFtIHs/U3RhcnRSZWNvcmRpbmdPcHRpb25zfSBvcHRpb25zIC0gVGhlIGF2YWlsYWJsZSBvcHRpb25zLlxuICogQHJldHVybnMge3N0cmluZ30gQmFzZTY0LWVuY29kZWQgY29udGVudCBvZiB0aGUgcmVjb3JkZWQgbWVkaWEgZmlsZSBpZlxuICogICAgICAgICAgICAgICAgICAgYW55IHNjcmVlbiByZWNvcmRpbmcgaXMgY3VycmVudGx5IHJ1bm5pbmcgb3IgYW4gZW1wdHkgc3RyaW5nLlxuICogQHRocm93cyB7RXJyb3J9IElmIHNjcmVlbiByZWNvcmRpbmcgaGFzIGZhaWxlZCB0byBzdGFydC5cbiAqL1xuY29tbWFuZHMuc3RhcnRSZWNvcmRpbmdTY3JlZW4gPSBhc3luYyBmdW5jdGlvbiAob3B0aW9ucyA9IHt9KSB7XG4gIGNvbnN0IHtcbiAgICB2aWRlb1R5cGUgPSBERUZBVUxUX1ZDT0RFQyxcbiAgICB0aW1lTGltaXQgPSBERUZBVUxUX1JFQ09SRElOR19USU1FX1NFQyxcbiAgICB2aWRlb1F1YWxpdHkgPSBERUZBVUxUX1FVQUxJVFksXG4gICAgdmlkZW9GcHMgPSBERUZBVUxUX0ZQUyxcbiAgICB2aWRlb1NjYWxlLFxuICAgIGZvcmNlUmVzdGFydCxcbiAgfSA9IG9wdGlvbnM7XG5cbiAgbGV0IHJlc3VsdCA9ICcnO1xuICBpZiAoIWZvcmNlUmVzdGFydCkge1xuICAgIGxvZy5pbmZvKGBDaGVja2luZyBpZiB0aGVyZSBpcy93YXMgYSBwcmV2aW91cyBzY3JlZW4gcmVjb3JkaW5nLiBgICtcbiAgICAgIGBTZXQgJ2ZvcmNlUmVzdGFydCcgb3B0aW9uIHRvICd0cnVlJyBpZiB5b3UnZCBsaWtlIHRvIHNraXAgdGhpcyBzdGVwLmApO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc3RvcFJlY29yZGluZ1NjcmVlbihvcHRpb25zKTtcbiAgfVxuXG4gIGNvbnN0IHZpZGVvUGF0aCA9IGF3YWl0IHRlbXBEaXIucGF0aCh7XG4gICAgcHJlZml4OiBgYXBwaXVtXyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygxNikuc3Vic3RyaW5nKDIsIDgpfWAsXG4gICAgc3VmZml4OiBNUDRfRVhULFxuICB9KTtcblxuICBjb25zdCBzY3JlZW5SZWNvcmRlciA9IG5ldyBTY3JlZW5SZWNvcmRlcih0aGlzLm9wdHMuZGV2aWNlLnVkaWQsIHZpZGVvUGF0aCwge1xuICAgIHJlbW90ZVBvcnQ6IHRoaXMub3B0cy5tanBlZ1NlcnZlclBvcnQgfHwgREVGQVVMVF9NSlBFR19TRVJWRVJfUE9SVCxcbiAgICB1c2VQb3J0Rm9yd2FyZGluZzogdGhpcy5pc1JlYWxEZXZpY2UoKSxcbiAgICB2aWRlb1R5cGUsXG4gICAgdmlkZW9TY2FsZSxcbiAgfSk7XG4gIGlmICghYXdhaXQgc2NyZWVuUmVjb3JkZXIuaW50ZXJydXB0KHRydWUpKSB7XG4gICAgbG9nLmVycm9yQW5kVGhyb3coJ1VuYWJsZSB0byBzdG9wIHNjcmVlbiByZWNvcmRpbmcgcHJvY2VzcycpO1xuICB9XG4gIGlmICh0aGlzLl9yZWNlbnRTY3JlZW5SZWNvcmRlcikge1xuICAgIGF3YWl0IHRoaXMuX3JlY2VudFNjcmVlblJlY29yZGVyLmNsZWFudXAoKTtcbiAgICB0aGlzLl9yZWNlbnRTY3JlZW5SZWNvcmRlciA9IG51bGw7XG4gIH1cblxuICBjb25zdCB0aW1lb3V0U2Vjb25kcyA9IHBhcnNlRmxvYXQodGltZUxpbWl0KTtcbiAgaWYgKGlzTmFOKHRpbWVvdXRTZWNvbmRzKSB8fCB0aW1lb3V0U2Vjb25kcyA+IE1BWF9SRUNPUkRJTkdfVElNRV9TRUMgfHwgdGltZW91dFNlY29uZHMgPD0gMCkge1xuICAgIGxvZy5lcnJvckFuZFRocm93KGBUaGUgdGltZUxpbWl0IHZhbHVlIG11c3QgYmUgaW4gcmFuZ2UgWzEsICR7TUFYX1JFQ09SRElOR19USU1FX1NFQ31dIHNlY29uZHMuIGAgK1xuICAgICAgYFRoZSB2YWx1ZSBvZiAnJHt0aW1lTGltaXR9JyBoYXMgYmVlbiBwYXNzZWQgaW5zdGVhZC5gKTtcbiAgfVxuXG4gIGxldCB7XG4gICAgbWpwZWdTZXJ2ZXJTY3JlZW5zaG90UXVhbGl0eSxcbiAgICBtanBlZ1NlcnZlckZyYW1lcmF0ZSxcbiAgfSA9IGF3YWl0IHRoaXMucHJveHlDb21tYW5kKCcvYXBwaXVtL3NldHRpbmdzJywgJ0dFVCcpO1xuICBpZiAodmlkZW9RdWFsaXR5KSB7XG4gICAgY29uc3QgcXVhbGl0eSA9IF8uaXNJbnRlZ2VyKHZpZGVvUXVhbGl0eSkgPyB2aWRlb1F1YWxpdHkgOiBRVUFMSVRZX01BUFBJTkdbXy50b0xvd2VyKHZpZGVvUXVhbGl0eSldO1xuICAgIGlmICghcXVhbGl0eSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGB2aWRlb1F1YWxpdHkgdmFsdWUgc2hvdWxkIGJlIG9uZSBvZiAke0pTT04uc3RyaW5naWZ5KF8ua2V5cyhRVUFMSVRZX01BUFBJTkcpKX0gb3IgYSBudW1iZXIgaW4gcmFuZ2UgMS4uMTAwLiBgICtcbiAgICAgICAgYCcke3ZpZGVvUXVhbGl0eX0nIGlzIGdpdmVuIGluc3RlYWRgKTtcbiAgICB9XG4gICAgbWpwZWdTZXJ2ZXJTY3JlZW5zaG90UXVhbGl0eSA9IG1qcGVnU2VydmVyU2NyZWVuc2hvdFF1YWxpdHkgIT09IHF1YWxpdHkgPyBxdWFsaXR5IDogdW5kZWZpbmVkO1xuICB9IGVsc2Uge1xuICAgIG1qcGVnU2VydmVyU2NyZWVuc2hvdFF1YWxpdHkgPSB1bmRlZmluZWQ7XG4gIH1cbiAgaWYgKHZpZGVvRnBzKSB7XG4gICAgY29uc3QgZnBzID0gcGFyc2VJbnQodmlkZW9GcHMsIDEwKTtcbiAgICBpZiAoaXNOYU4oZnBzKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGB2aWRlb0ZwcyB2YWx1ZSBzaG91bGQgYmUgYSB2YWxpZCBudW1iZXIgaW4gcmFuZ2UgMS4uNjAuIGAgK1xuICAgICAgICBgJyR7dmlkZW9GcHN9JyBpcyBnaXZlbiBpbnN0ZWFkYCk7XG4gICAgfVxuICAgIG1qcGVnU2VydmVyRnJhbWVyYXRlID0gbWpwZWdTZXJ2ZXJGcmFtZXJhdGUgIT09IGZwcyA/IGZwcyA6IHVuZGVmaW5lZDtcbiAgfSBlbHNlIHtcbiAgICBtanBlZ1NlcnZlckZyYW1lcmF0ZSA9IHVuZGVmaW5lZDtcbiAgfVxuICBpZiAodXRpbC5oYXNWYWx1ZShtanBlZ1NlcnZlclNjcmVlbnNob3RRdWFsaXR5KSB8fCB1dGlsLmhhc1ZhbHVlKG1qcGVnU2VydmVyRnJhbWVyYXRlKSkge1xuICAgIGF3YWl0IHRoaXMucHJveHlDb21tYW5kKCcvYXBwaXVtL3NldHRpbmdzJywgJ1BPU1QnLCB7XG4gICAgICBtanBlZ1NlcnZlclNjcmVlbnNob3RRdWFsaXR5LFxuICAgICAgbWpwZWdTZXJ2ZXJGcmFtZXJhdGUsXG4gICAgfSk7XG4gIH1cblxuICB0cnkge1xuICAgIGF3YWl0IHNjcmVlblJlY29yZGVyLnN0YXJ0KHRpbWVvdXRTZWNvbmRzICogMTAwMCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBhd2FpdCBzY3JlZW5SZWNvcmRlci5pbnRlcnJ1cHQodHJ1ZSk7XG4gICAgYXdhaXQgc2NyZWVuUmVjb3JkZXIuY2xlYW51cCgpO1xuICAgIHRocm93IGU7XG4gIH1cbiAgdGhpcy5fcmVjZW50U2NyZWVuUmVjb3JkZXIgPSBzY3JlZW5SZWNvcmRlcjtcblxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBTdG9wUmVjb3JkaW5nT3B0aW9uc1xuICpcbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gcmVtb3RlUGF0aCAtIFRoZSBwYXRoIHRvIHRoZSByZW1vdGUgbG9jYXRpb24sIHdoZXJlIHRoZSByZXN1bHRpbmcgdmlkZW8gc2hvdWxkIGJlIHVwbG9hZGVkLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVGhlIGZvbGxvd2luZyBwcm90b2NvbHMgYXJlIHN1cHBvcnRlZDogaHR0cC9odHRwcywgZnRwLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTnVsbCBvciBlbXB0eSBzdHJpbmcgdmFsdWUgKHRoZSBkZWZhdWx0IHNldHRpbmcpIG1lYW5zIHRoZSBjb250ZW50IG9mIHJlc3VsdGluZ1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsZSBzaG91bGQgYmUgZW5jb2RlZCBhcyBCYXNlNjQgYW5kIHBhc3NlZCBhcyB0aGUgZW5kcG9pbnQgcmVzcG9uc2UgdmFsdWUuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBBbiBleGNlcHRpb24gd2lsbCBiZSB0aHJvd24gaWYgdGhlIGdlbmVyYXRlZCBtZWRpYSBmaWxlIGlzIHRvbyBiaWcgdG9cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpdCBpbnRvIHRoZSBhdmFpbGFibGUgcHJvY2VzcyBtZW1vcnkuXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IHVzZXIgLSBUaGUgbmFtZSBvZiB0aGUgdXNlciBmb3IgdGhlIHJlbW90ZSBhdXRoZW50aWNhdGlvbi4gT25seSB3b3JrcyBpZiBgcmVtb3RlUGF0aGAgaXMgcHJvdmlkZWQuXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IHBhc3MgLSBUaGUgcGFzc3dvcmQgZm9yIHRoZSByZW1vdGUgYXV0aGVudGljYXRpb24uIE9ubHkgd29ya3MgaWYgYHJlbW90ZVBhdGhgIGlzIHByb3ZpZGVkLlxuICogQHByb3BlcnR5IHs/c3RyaW5nfSBtZXRob2QgLSBUaGUgaHR0cCBtdWx0aXBhcnQgdXBsb2FkIG1ldGhvZCBuYW1lLiBUaGUgJ1BVVCcgb25lIGlzIHVzZWQgYnkgZGVmYXVsdC5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgT25seSB3b3JrcyBpZiBgcmVtb3RlUGF0aGAgaXMgcHJvdmlkZWQuXG4gKi9cblxuLyoqXG4gKiBTdG9wIHJlY29yZGluZyB0aGUgc2NyZWVuLiBJZiBubyBzY3JlZW4gcmVjb3JkaW5nIHByb2Nlc3MgaXMgcnVubmluZyB0aGVuXG4gKiB0aGUgZW5kcG9pbnQgd2lsbCB0cnkgdG8gZ2V0IHRoZSByZWNlbnRseSByZWNvcmRlZCBmaWxlLlxuICogSWYgbm8gcHJldmlvdXNseSByZWNvcmRlZCBmaWxlIGlzIGZvdW5kIGFuZCBubyBhY3RpdmUgc2NyZWVuIHJlY29yZGluZ1xuICogcHJvY2Vzc2VzIGFyZSBydW5uaW5nIHRoZW4gdGhlIG1ldGhvZCByZXR1cm5zIGFuIGVtcHR5IHN0cmluZy5cbiAqXG4gKiBAcGFyYW0gez9TdG9wUmVjb3JkaW5nT3B0aW9uc30gb3B0aW9ucyAtIFRoZSBhdmFpbGFibGUgb3B0aW9ucy5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IEJhc2U2NC1lbmNvZGVkIGNvbnRlbnQgb2YgdGhlIHJlY29yZGVkIG1lZGlhIGZpbGUgaWYgJ3JlbW90ZVBhdGgnXG4gKiAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIgaXMgZW1wdHkgb3IgbnVsbCBvciBhbiBlbXB0eSBzdHJpbmcuXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlcmUgd2FzIGFuIGVycm9yIHdoaWxlIGdldHRpbmcgdGhlIG5hbWUgb2YgYSBtZWRpYSBmaWxlXG4gKiAgICAgICAgICAgICAgICAgb3IgdGhlIGZpbGUgY29udGVudCBjYW5ub3QgYmUgdXBsb2FkZWQgdG8gdGhlIHJlbW90ZSBsb2NhdGlvbi5cbiAqL1xuY29tbWFuZHMuc3RvcFJlY29yZGluZ1NjcmVlbiA9IGFzeW5jIGZ1bmN0aW9uIChvcHRpb25zID0ge30pIHtcbiAgY29uc3Qge1xuICAgIHJlbW90ZVBhdGgsXG4gICAgdXNlcixcbiAgICBwYXNzLFxuICAgIG1ldGhvZCxcbiAgfSA9IG9wdGlvbnM7XG5cbiAgaWYgKCF0aGlzLl9yZWNlbnRTY3JlZW5SZWNvcmRlcikge1xuICAgIGxvZy5pbmZvKCdTY3JlZW4gcmVjb3JkaW5nIGlzIG5vdCBydW5uaW5nLiBUaGVyZSBpcyBub3RoaW5nIHRvIHN0b3AuJyk7XG4gICAgcmV0dXJuICcnO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zdCB2aWRlb1BhdGggPSBhd2FpdCB0aGlzLl9yZWNlbnRTY3JlZW5SZWNvcmRlci5maW5pc2goKTtcbiAgICBpZiAoIWF3YWl0IGZzLmV4aXN0cyh2aWRlb1BhdGgpKSB7XG4gICAgICBsb2cuZXJyb3JBbmRUaHJvdyhgVGhlIHNjcmVlbiByZWNvcmRlciB1dGlsaXR5IGhhcyBmYWlsZWQgYCArXG4gICAgICAgIGB0byBzdG9yZSB0aGUgYWN0dWFsIHNjcmVlbiByZWNvcmRpbmcgYXQgJyR7dmlkZW9QYXRofSdgKTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IGVuY29kZUJhc2U2NE9yVXBsb2FkKHZpZGVvUGF0aCwgcmVtb3RlUGF0aCwge1xuICAgICAgdXNlcixcbiAgICAgIHBhc3MsXG4gICAgICBtZXRob2RcbiAgICB9KTtcbiAgfSBmaW5hbGx5IHtcbiAgICBhd2FpdCB0aGlzLl9yZWNlbnRTY3JlZW5SZWNvcmRlci5pbnRlcnJ1cHQodHJ1ZSk7XG4gICAgYXdhaXQgdGhpcy5fcmVjZW50U2NyZWVuUmVjb3JkZXIuY2xlYW51cCgpO1xuICAgIHRoaXMuX3JlY2VudFNjcmVlblJlY29yZGVyID0gbnVsbDtcbiAgfVxufTtcblxuXG5leHBvcnQgeyBjb21tYW5kcyB9O1xuZXhwb3J0IGRlZmF1bHQgY29tbWFuZHM7XG4iXSwiZmlsZSI6ImxpYi9jb21tYW5kcy9yZWNvcmRzY3JlZW4uanMiLCJzb3VyY2VSb290IjoiLi4vLi4vLi4ifQ==
