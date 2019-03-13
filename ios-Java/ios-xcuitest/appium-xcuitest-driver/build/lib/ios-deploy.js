"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

require("source-map-support/register");

var _teen_process = require("teen_process");

var _appiumSupport = require("appium-support");

var _logger = _interopRequireDefault(require("./logger"));

var _asyncbox = require("asyncbox");

const IOSDEPLOY_PATH = `ios-deploy`;

class IOSDeploy {
  constructor(udid) {
    this.udid = udid;
    this.cmd = IOSDEPLOY_PATH;
  }

  async checkStatus() {
    await _appiumSupport.fs.which(this.cmd);
  }

  async remove(bundleid) {
    let remove = [`--uninstall_only`, `--id`, this.udid, `--bundle_id`, bundleid];

    try {
      await (0, _teen_process.exec)(this.cmd, remove);
    } catch (err) {
      _logger.default.debug(`Stdout: '${err.stdout}'. Stderr: '${err.stderr}'.`);

      throw new Error(`Could not remove app: '${err.message}'`);
    }
  }

  async removeApp(bundleId) {
    await this.remove(bundleId);
  }

  async install(app) {
    const args = [`--id`, this.udid, `--bundle`, app];

    try {
      await (0, _asyncbox.retryInterval)(5, 500, _teen_process.exec, this.cmd, args);
    } catch (err) {
      _logger.default.debug(`Stdout: '${err.stdout}'. Stderr: '${err.stderr}'.`);

      throw new Error(`Could not install app: '${err.message}'`);
    }
  }

  async installApp(app) {
    await this.install(app);
  }

  async isAppInstalled(bundleid) {
    let isInstalled = [`--exists`, `--id`, this.udid, `--bundle_id`, bundleid];

    try {
      let {
        stdout
      } = await (0, _teen_process.exec)(this.cmd, isInstalled);
      return stdout && stdout.includes('true');
    } catch (err) {
      if (err.code !== 255) {
        _logger.default.debug(`Error checking install status: '${err.message}'`);
      }

      return false;
    }
  }

}

var _default = IOSDeploy;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9pb3MtZGVwbG95LmpzIl0sIm5hbWVzIjpbIklPU0RFUExPWV9QQVRIIiwiSU9TRGVwbG95IiwiY29uc3RydWN0b3IiLCJ1ZGlkIiwiY21kIiwiY2hlY2tTdGF0dXMiLCJmcyIsIndoaWNoIiwicmVtb3ZlIiwiYnVuZGxlaWQiLCJlcnIiLCJsb2dnZXIiLCJkZWJ1ZyIsInN0ZG91dCIsInN0ZGVyciIsIkVycm9yIiwibWVzc2FnZSIsInJlbW92ZUFwcCIsImJ1bmRsZUlkIiwiaW5zdGFsbCIsImFwcCIsImFyZ3MiLCJleGVjIiwiaW5zdGFsbEFwcCIsImlzQXBwSW5zdGFsbGVkIiwiaXNJbnN0YWxsZWQiLCJpbmNsdWRlcyIsImNvZGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBRUEsTUFBTUEsY0FBYyxHQUFJLFlBQXhCOztBQUVBLE1BQU1DLFNBQU4sQ0FBZ0I7QUFFZEMsRUFBQUEsV0FBVyxDQUFFQyxJQUFGLEVBQVE7QUFDakIsU0FBS0EsSUFBTCxHQUFZQSxJQUFaO0FBQ0EsU0FBS0MsR0FBTCxHQUFXSixjQUFYO0FBQ0Q7O0FBRUQsUUFBTUssV0FBTixHQUFxQjtBQUVuQixVQUFNQyxrQkFBR0MsS0FBSCxDQUFTLEtBQUtILEdBQWQsQ0FBTjtBQUNEOztBQUVELFFBQU1JLE1BQU4sQ0FBY0MsUUFBZCxFQUF3QjtBQUN0QixRQUFJRCxNQUFNLEdBQUcsQ0FBRSxrQkFBRixFQUFzQixNQUF0QixFQUE2QixLQUFLTCxJQUFsQyxFQUF5QyxhQUF6QyxFQUF1RE0sUUFBdkQsQ0FBYjs7QUFDQSxRQUFJO0FBQ0YsWUFBTSx3QkFBSyxLQUFLTCxHQUFWLEVBQWVJLE1BQWYsQ0FBTjtBQUNELEtBRkQsQ0FFRSxPQUFPRSxHQUFQLEVBQVk7QUFDWkMsc0JBQU9DLEtBQVAsQ0FBYyxZQUFXRixHQUFHLENBQUNHLE1BQU8sZUFBY0gsR0FBRyxDQUFDSSxNQUFPLElBQTdEOztBQUNBLFlBQU0sSUFBSUMsS0FBSixDQUFXLDBCQUF5QkwsR0FBRyxDQUFDTSxPQUFRLEdBQWhELENBQU47QUFDRDtBQUNGOztBQUVELFFBQU1DLFNBQU4sQ0FBaUJDLFFBQWpCLEVBQTJCO0FBQ3pCLFVBQU0sS0FBS1YsTUFBTCxDQUFZVSxRQUFaLENBQU47QUFDRDs7QUFFRCxRQUFNQyxPQUFOLENBQWVDLEdBQWYsRUFBb0I7QUFDbEIsVUFBTUMsSUFBSSxHQUFHLENBQUUsTUFBRixFQUFTLEtBQUtsQixJQUFkLEVBQXFCLFVBQXJCLEVBQWdDaUIsR0FBaEMsQ0FBYjs7QUFDQSxRQUFJO0FBQ0YsWUFBTSw2QkFBYyxDQUFkLEVBQWlCLEdBQWpCLEVBQXNCRSxrQkFBdEIsRUFBNEIsS0FBS2xCLEdBQWpDLEVBQXNDaUIsSUFBdEMsQ0FBTjtBQUNELEtBRkQsQ0FFRSxPQUFPWCxHQUFQLEVBQVk7QUFDWkMsc0JBQU9DLEtBQVAsQ0FBYyxZQUFXRixHQUFHLENBQUNHLE1BQU8sZUFBY0gsR0FBRyxDQUFDSSxNQUFPLElBQTdEOztBQUNBLFlBQU0sSUFBSUMsS0FBSixDQUFXLDJCQUEwQkwsR0FBRyxDQUFDTSxPQUFRLEdBQWpELENBQU47QUFDRDtBQUNGOztBQUVELFFBQU1PLFVBQU4sQ0FBa0JILEdBQWxCLEVBQXVCO0FBQ3JCLFVBQU0sS0FBS0QsT0FBTCxDQUFhQyxHQUFiLENBQU47QUFDRDs7QUFFRCxRQUFNSSxjQUFOLENBQXNCZixRQUF0QixFQUFnQztBQUM5QixRQUFJZ0IsV0FBVyxHQUFHLENBQUUsVUFBRixFQUFjLE1BQWQsRUFBcUIsS0FBS3RCLElBQTFCLEVBQWlDLGFBQWpDLEVBQStDTSxRQUEvQyxDQUFsQjs7QUFDQSxRQUFJO0FBQ0YsVUFBSTtBQUFDSSxRQUFBQTtBQUFELFVBQVcsTUFBTSx3QkFBSyxLQUFLVCxHQUFWLEVBQWVxQixXQUFmLENBQXJCO0FBQ0EsYUFBUVosTUFBTSxJQUFLQSxNQUFNLENBQUNhLFFBQVAsQ0FBZ0IsTUFBaEIsQ0FBbkI7QUFDRCxLQUhELENBR0UsT0FBT2hCLEdBQVAsRUFBWTtBQUVaLFVBQUlBLEdBQUcsQ0FBQ2lCLElBQUosS0FBYSxHQUFqQixFQUFzQjtBQUNwQmhCLHdCQUFPQyxLQUFQLENBQWMsbUNBQWtDRixHQUFHLENBQUNNLE9BQVEsR0FBNUQ7QUFDRDs7QUFDRCxhQUFPLEtBQVA7QUFDRDtBQUNGOztBQXBEYTs7ZUF1RERmLFMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBleGVjIH0gZnJvbSAndGVlbl9wcm9jZXNzJztcbmltcG9ydCB7IGZzIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyByZXRyeUludGVydmFsIH0gZnJvbSAnYXN5bmNib3gnO1xuXG5jb25zdCBJT1NERVBMT1lfUEFUSCA9IGBpb3MtZGVwbG95YDtcblxuY2xhc3MgSU9TRGVwbG95IHtcblxuICBjb25zdHJ1Y3RvciAodWRpZCkge1xuICAgIHRoaXMudWRpZCA9IHVkaWQ7XG4gICAgdGhpcy5jbWQgPSBJT1NERVBMT1lfUEFUSDsgLy8gdGhpcy5jbWQgaXMgaW4gYWNjb3JkYW5jZSB3aXRoIGlEZXZpY2VcbiAgfVxuXG4gIGFzeW5jIGNoZWNrU3RhdHVzICgpIHtcbiAgICAvLyBtYWtlIHN1cmUgd2UgYWN0dWFsbHkgaGF2ZSB0aGUgcHJvZ3JhbVxuICAgIGF3YWl0IGZzLndoaWNoKHRoaXMuY21kKTtcbiAgfVxuXG4gIGFzeW5jIHJlbW92ZSAoYnVuZGxlaWQpIHtcbiAgICBsZXQgcmVtb3ZlID0gW2AtLXVuaW5zdGFsbF9vbmx5YCwgYC0taWRgLCB0aGlzLnVkaWQsIGAtLWJ1bmRsZV9pZGAsIGJ1bmRsZWlkXTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZXhlYyh0aGlzLmNtZCwgcmVtb3ZlKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgU3Rkb3V0OiAnJHtlcnIuc3Rkb3V0fScuIFN0ZGVycjogJyR7ZXJyLnN0ZGVycn0nLmApO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgcmVtb3ZlIGFwcDogJyR7ZXJyLm1lc3NhZ2V9J2ApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlbW92ZUFwcCAoYnVuZGxlSWQpIHtcbiAgICBhd2FpdCB0aGlzLnJlbW92ZShidW5kbGVJZCk7XG4gIH1cblxuICBhc3luYyBpbnN0YWxsIChhcHApIHtcbiAgICBjb25zdCBhcmdzID0gW2AtLWlkYCwgdGhpcy51ZGlkLCBgLS1idW5kbGVgLCBhcHBdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCByZXRyeUludGVydmFsKDUsIDUwMCwgZXhlYywgdGhpcy5jbWQsIGFyZ3MpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBTdGRvdXQ6ICcke2Vyci5zdGRvdXR9Jy4gU3RkZXJyOiAnJHtlcnIuc3RkZXJyfScuYCk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBpbnN0YWxsIGFwcDogJyR7ZXJyLm1lc3NhZ2V9J2ApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGluc3RhbGxBcHAgKGFwcCkge1xuICAgIGF3YWl0IHRoaXMuaW5zdGFsbChhcHApO1xuICB9XG5cbiAgYXN5bmMgaXNBcHBJbnN0YWxsZWQgKGJ1bmRsZWlkKSB7XG4gICAgbGV0IGlzSW5zdGFsbGVkID0gW2AtLWV4aXN0c2AsIGAtLWlkYCwgdGhpcy51ZGlkLCBgLS1idW5kbGVfaWRgLCBidW5kbGVpZF07XG4gICAgdHJ5IHtcbiAgICAgIGxldCB7c3Rkb3V0fSA9IGF3YWl0IGV4ZWModGhpcy5jbWQsIGlzSW5zdGFsbGVkKTtcbiAgICAgIHJldHVybiAoc3Rkb3V0ICYmIChzdGRvdXQuaW5jbHVkZXMoJ3RydWUnKSkpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgLy8gZXJyb3IgMjU1IGlzIGp1c3QgaW9zLWRlcGxveSdzIHdheSBvZiBzYXlpbmcgaXQgaXMgbm90IGluc3RhbGxlZFxuICAgICAgaWYgKGVyci5jb2RlICE9PSAyNTUpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBFcnJvciBjaGVja2luZyBpbnN0YWxsIHN0YXR1czogJyR7ZXJyLm1lc3NhZ2V9J2ApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBJT1NEZXBsb3k7XG4iXSwiZmlsZSI6ImxpYi9pb3MtZGVwbG95LmpzIiwic291cmNlUm9vdCI6Ii4uLy4uIn0=
