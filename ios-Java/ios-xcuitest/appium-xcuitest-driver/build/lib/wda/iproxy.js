"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.iProxy = void 0;

require("source-map-support/register");

var _logger = _interopRequireDefault(require("../logger"));

var _utils = require("./utils");

var _bluebird = _interopRequireDefault(require("bluebird"));

var _appiumSupport = require("appium-support");

var _teen_process = require("teen_process");

const IPROXY_TIMEOUT = 5000;

const iproxyLog = _appiumSupport.logger.getLogger('iProxy');

class iProxy {
  constructor(udid, localport, deviceport) {
    _logger.default.debug(`Starting iproxy to forward traffic from local port ${localport} to device port ${deviceport} over USB ` + `for the device ${udid}`);

    this.expectIProxyErrors = true;
    this.iproxy = new _teen_process.SubProcess('iproxy', [localport, deviceport, udid], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  async start() {
    this.expectIProxyErrors = true;
    return await new _bluebird.default((resolve, reject) => {
      this.iproxy.on('exit', code => {
        _logger.default.debug(`iproxy exited with code '${code}'`);

        if (code) {
          return reject(new Error(`iproxy exited with code '${code}'`));
        }
      });
      this.iproxy.on('output', (stdout, stderr) => {
        if (this.expectIProxyErrors) {
          return;
        }

        let out = stdout || stderr;

        for (let line of out.split('\n')) {
          if (!line.length) {
            continue;
          }

          if (line.includes('Resource temporarily unavailable')) {
            _logger.default.debug('Connection to WDA timed out');
          } else {
            iproxyLog.debug(line);
          }
        }
      });
      return (async () => {
        try {
          await this.iproxy.start(IPROXY_TIMEOUT, true);
          resolve();
        } catch (err) {
          _logger.default.error(`Error starting iproxy: '${err.message}'`);

          reject(new Error('Unable to start iproxy. Is it installed?'));
        }
      })();
    });
  }

  async quit() {
    await (0, _utils.killProcess)('iproxy', this.iproxy);
    this.expectIProxyErrors = true;
  }

}

exports.iProxy = iProxy;
var _default = iProxy;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi93ZGEvaXByb3h5LmpzIl0sIm5hbWVzIjpbIklQUk9YWV9USU1FT1VUIiwiaXByb3h5TG9nIiwibG9nZ2VyIiwiZ2V0TG9nZ2VyIiwiaVByb3h5IiwiY29uc3RydWN0b3IiLCJ1ZGlkIiwibG9jYWxwb3J0IiwiZGV2aWNlcG9ydCIsImxvZyIsImRlYnVnIiwiZXhwZWN0SVByb3h5RXJyb3JzIiwiaXByb3h5IiwiU3ViUHJvY2VzcyIsImRldGFjaGVkIiwic3RkaW8iLCJzdGFydCIsIkIiLCJyZXNvbHZlIiwicmVqZWN0Iiwib24iLCJjb2RlIiwiRXJyb3IiLCJzdGRvdXQiLCJzdGRlcnIiLCJvdXQiLCJsaW5lIiwic3BsaXQiLCJsZW5ndGgiLCJpbmNsdWRlcyIsImVyciIsImVycm9yIiwibWVzc2FnZSIsInF1aXQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBR0EsTUFBTUEsY0FBYyxHQUFHLElBQXZCOztBQUVBLE1BQU1DLFNBQVMsR0FBR0Msc0JBQU9DLFNBQVAsQ0FBaUIsUUFBakIsQ0FBbEI7O0FBRUEsTUFBTUMsTUFBTixDQUFhO0FBQ1hDLEVBQUFBLFdBQVcsQ0FBRUMsSUFBRixFQUFRQyxTQUFSLEVBQW1CQyxVQUFuQixFQUErQjtBQUN4Q0Msb0JBQUlDLEtBQUosQ0FBVyxzREFBcURILFNBQVUsbUJBQWtCQyxVQUFXLFlBQTdGLEdBQ1Asa0JBQWlCRixJQUFLLEVBRHpCOztBQUVBLFNBQUtLLGtCQUFMLEdBQTBCLElBQTFCO0FBQ0EsU0FBS0MsTUFBTCxHQUFjLElBQUlDLHdCQUFKLENBQWUsUUFBZixFQUF5QixDQUFDTixTQUFELEVBQVlDLFVBQVosRUFBd0JGLElBQXhCLENBQXpCLEVBQXdEO0FBQ3BFUSxNQUFBQSxRQUFRLEVBQUUsSUFEMEQ7QUFFcEVDLE1BQUFBLEtBQUssRUFBRSxDQUFDLFFBQUQsRUFBVyxNQUFYLEVBQW1CLE1BQW5CO0FBRjZELEtBQXhELENBQWQ7QUFJRDs7QUFFRCxRQUFNQyxLQUFOLEdBQWU7QUFDYixTQUFLTCxrQkFBTCxHQUEwQixJQUExQjtBQUVBLFdBQU8sTUFBTSxJQUFJTSxpQkFBSixDQUFNLENBQUNDLE9BQUQsRUFBVUMsTUFBVixLQUFxQjtBQUN0QyxXQUFLUCxNQUFMLENBQVlRLEVBQVosQ0FBZSxNQUFmLEVBQXdCQyxJQUFELElBQVU7QUFDL0JaLHdCQUFJQyxLQUFKLENBQVcsNEJBQTJCVyxJQUFLLEdBQTNDOztBQUNBLFlBQUlBLElBQUosRUFBVTtBQUNSLGlCQUFPRixNQUFNLENBQUMsSUFBSUcsS0FBSixDQUFXLDRCQUEyQkQsSUFBSyxHQUEzQyxDQUFELENBQWI7QUFDRDtBQUNGLE9BTEQ7QUFNQSxXQUFLVCxNQUFMLENBQVlRLEVBQVosQ0FBZSxRQUFmLEVBQXlCLENBQUNHLE1BQUQsRUFBU0MsTUFBVCxLQUFvQjtBQUUzQyxZQUFJLEtBQUtiLGtCQUFULEVBQTZCO0FBQzNCO0FBQ0Q7O0FBRUQsWUFBSWMsR0FBRyxHQUFHRixNQUFNLElBQUlDLE1BQXBCOztBQUNBLGFBQUssSUFBSUUsSUFBVCxJQUFpQkQsR0FBRyxDQUFDRSxLQUFKLENBQVUsSUFBVixDQUFqQixFQUFrQztBQUNoQyxjQUFJLENBQUNELElBQUksQ0FBQ0UsTUFBVixFQUFrQjtBQUNoQjtBQUNEOztBQUVELGNBQUlGLElBQUksQ0FBQ0csUUFBTCxDQUFjLGtDQUFkLENBQUosRUFBdUQ7QUFHckRwQiw0QkFBSUMsS0FBSixDQUFVLDZCQUFWO0FBQ0QsV0FKRCxNQUlPO0FBQ0xULFlBQUFBLFNBQVMsQ0FBQ1MsS0FBVixDQUFnQmdCLElBQWhCO0FBQ0Q7QUFDRjtBQUNGLE9BcEJEO0FBc0JBLGFBQU8sQ0FBQyxZQUFZO0FBQ2xCLFlBQUk7QUFDRixnQkFBTSxLQUFLZCxNQUFMLENBQVlJLEtBQVosQ0FBa0JoQixjQUFsQixFQUFrQyxJQUFsQyxDQUFOO0FBQ0FrQixVQUFBQSxPQUFPO0FBQ1IsU0FIRCxDQUdFLE9BQU9ZLEdBQVAsRUFBWTtBQUNackIsMEJBQUlzQixLQUFKLENBQVcsMkJBQTBCRCxHQUFHLENBQUNFLE9BQVEsR0FBakQ7O0FBQ0FiLFVBQUFBLE1BQU0sQ0FBQyxJQUFJRyxLQUFKLENBQVUsMENBQVYsQ0FBRCxDQUFOO0FBQ0Q7QUFDRixPQVJNLEdBQVA7QUFTRCxLQXRDWSxDQUFiO0FBdUNEOztBQUVELFFBQU1XLElBQU4sR0FBYztBQUNaLFVBQU0sd0JBQVksUUFBWixFQUFzQixLQUFLckIsTUFBM0IsQ0FBTjtBQUNBLFNBQUtELGtCQUFMLEdBQTBCLElBQTFCO0FBQ0Q7O0FBMURVOzs7ZUE4REVQLE0iLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgeyBraWxsUHJvY2VzcyB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IEIgZnJvbSAnYmx1ZWJpcmQnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IHsgU3ViUHJvY2VzcyB9IGZyb20gJ3RlZW5fcHJvY2Vzcyc7XG5cblxuY29uc3QgSVBST1hZX1RJTUVPVVQgPSA1MDAwO1xuXG5jb25zdCBpcHJveHlMb2cgPSBsb2dnZXIuZ2V0TG9nZ2VyKCdpUHJveHknKTtcblxuY2xhc3MgaVByb3h5IHtcbiAgY29uc3RydWN0b3IgKHVkaWQsIGxvY2FscG9ydCwgZGV2aWNlcG9ydCkge1xuICAgIGxvZy5kZWJ1ZyhgU3RhcnRpbmcgaXByb3h5IHRvIGZvcndhcmQgdHJhZmZpYyBmcm9tIGxvY2FsIHBvcnQgJHtsb2NhbHBvcnR9IHRvIGRldmljZSBwb3J0ICR7ZGV2aWNlcG9ydH0gb3ZlciBVU0IgYCArXG4gICAgICBgZm9yIHRoZSBkZXZpY2UgJHt1ZGlkfWApO1xuICAgIHRoaXMuZXhwZWN0SVByb3h5RXJyb3JzID0gdHJ1ZTtcbiAgICB0aGlzLmlwcm94eSA9IG5ldyBTdWJQcm9jZXNzKCdpcHJveHknLCBbbG9jYWxwb3J0LCBkZXZpY2Vwb3J0LCB1ZGlkXSwge1xuICAgICAgZGV0YWNoZWQ6IHRydWUsXG4gICAgICBzdGRpbzogWydpZ25vcmUnLCAncGlwZScsICdwaXBlJ10sXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzdGFydCAoKSB7XG4gICAgdGhpcy5leHBlY3RJUHJveHlFcnJvcnMgPSB0cnVlO1xuXG4gICAgcmV0dXJuIGF3YWl0IG5ldyBCKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHRoaXMuaXByb3h5Lm9uKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgICAgbG9nLmRlYnVnKGBpcHJveHkgZXhpdGVkIHdpdGggY29kZSAnJHtjb2RlfSdgKTtcbiAgICAgICAgaWYgKGNvZGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBFcnJvcihgaXByb3h5IGV4aXRlZCB3aXRoIGNvZGUgJyR7Y29kZX0nYCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHRoaXMuaXByb3h5Lm9uKCdvdXRwdXQnLCAoc3Rkb3V0LCBzdGRlcnIpID0+IHtcbiAgICAgICAgLy8gZG8gbm90aGluZyBpZiB3ZSBleHBlY3QgZXJyb3JzXG4gICAgICAgIGlmICh0aGlzLmV4cGVjdElQcm94eUVycm9ycykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBvdXQgPSBzdGRvdXQgfHwgc3RkZXJyO1xuICAgICAgICBmb3IgKGxldCBsaW5lIG9mIG91dC5zcGxpdCgnXFxuJykpIHtcbiAgICAgICAgICBpZiAoIWxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobGluZS5pbmNsdWRlcygnUmVzb3VyY2UgdGVtcG9yYXJpbHkgdW5hdmFpbGFibGUnKSkge1xuICAgICAgICAgICAgLy8gdGhpcyBnZW5lcmFsbHkgaGFwcGVucyB3aGVuIFdEQSBkb2VzIG5vdCByZXNwb25kLFxuICAgICAgICAgICAgLy8gc28gcHJpbnQgYSBtb3JlIHVzZWZ1bCBtZXNzYWdlXG4gICAgICAgICAgICBsb2cuZGVidWcoJ0Nvbm5lY3Rpb24gdG8gV0RBIHRpbWVkIG91dCcpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpcHJveHlMb2cuZGVidWcobGluZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5pcHJveHkuc3RhcnQoSVBST1hZX1RJTUVPVVQsIHRydWUpO1xuICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgbG9nLmVycm9yKGBFcnJvciBzdGFydGluZyBpcHJveHk6ICcke2Vyci5tZXNzYWdlfSdgKTtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdVbmFibGUgdG8gc3RhcnQgaXByb3h5LiBJcyBpdCBpbnN0YWxsZWQ/JykpO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgcXVpdCAoKSB7XG4gICAgYXdhaXQga2lsbFByb2Nlc3MoJ2lwcm94eScsIHRoaXMuaXByb3h5KTtcbiAgICB0aGlzLmV4cGVjdElQcm94eUVycm9ycyA9IHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IHsgaVByb3h5IH07XG5leHBvcnQgZGVmYXVsdCBpUHJveHk7XG4iXSwiZmlsZSI6ImxpYi93ZGEvaXByb3h5LmpzIiwic291cmNlUm9vdCI6Ii4uLy4uLy4uIn0=
