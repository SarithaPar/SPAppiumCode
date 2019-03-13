"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.commands = void 0;

require("source-map-support/register");

var _bluebird = _interopRequireDefault(require("bluebird"));

let commands = {};
exports.commands = commands;

commands.lock = async function (seconds) {
  await this.proxyCommand('/wda/lock', 'POST');

  if (isNaN(seconds)) {
    return;
  }

  const floatSeconds = parseFloat(seconds);

  if (floatSeconds <= 0) {
    return;
  }

  await _bluebird.default.delay(floatSeconds * 1000);
  await this.proxyCommand('/wda/unlock', 'POST');
};

commands.unlock = async function () {
  await this.proxyCommand('/wda/unlock', 'POST');
};

commands.isLocked = async function () {
  return await this.proxyCommand('/wda/locked', 'GET');
};

var _default = commands;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jb21tYW5kcy9sb2NrLmpzIl0sIm5hbWVzIjpbImNvbW1hbmRzIiwibG9jayIsInNlY29uZHMiLCJwcm94eUNvbW1hbmQiLCJpc05hTiIsImZsb2F0U2Vjb25kcyIsInBhcnNlRmxvYXQiLCJCIiwiZGVsYXkiLCJ1bmxvY2siLCJpc0xvY2tlZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQTs7QUFFQSxJQUFJQSxRQUFRLEdBQUcsRUFBZjs7O0FBRUFBLFFBQVEsQ0FBQ0MsSUFBVCxHQUFnQixnQkFBZ0JDLE9BQWhCLEVBQXlCO0FBQ3ZDLFFBQU0sS0FBS0MsWUFBTCxDQUFrQixXQUFsQixFQUErQixNQUEvQixDQUFOOztBQUNBLE1BQUlDLEtBQUssQ0FBQ0YsT0FBRCxDQUFULEVBQW9CO0FBQ2xCO0FBQ0Q7O0FBRUQsUUFBTUcsWUFBWSxHQUFHQyxVQUFVLENBQUNKLE9BQUQsQ0FBL0I7O0FBQ0EsTUFBSUcsWUFBWSxJQUFJLENBQXBCLEVBQXVCO0FBQ3JCO0FBQ0Q7O0FBRUQsUUFBTUUsa0JBQUVDLEtBQUYsQ0FBUUgsWUFBWSxHQUFHLElBQXZCLENBQU47QUFDQSxRQUFNLEtBQUtGLFlBQUwsQ0FBa0IsYUFBbEIsRUFBaUMsTUFBakMsQ0FBTjtBQUNELENBYkQ7O0FBZUFILFFBQVEsQ0FBQ1MsTUFBVCxHQUFrQixrQkFBa0I7QUFDbEMsUUFBTSxLQUFLTixZQUFMLENBQWtCLGFBQWxCLEVBQWlDLE1BQWpDLENBQU47QUFDRCxDQUZEOztBQUlBSCxRQUFRLENBQUNVLFFBQVQsR0FBb0Isa0JBQWtCO0FBQ3BDLFNBQU8sTUFBTSxLQUFLUCxZQUFMLENBQWtCLGFBQWxCLEVBQWlDLEtBQWpDLENBQWI7QUFDRCxDQUZEOztlQUtlSCxRIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEIgZnJvbSAnYmx1ZWJpcmQnO1xuXG5sZXQgY29tbWFuZHMgPSB7fTtcblxuY29tbWFuZHMubG9jayA9IGFzeW5jIGZ1bmN0aW9uIChzZWNvbmRzKSB7XG4gIGF3YWl0IHRoaXMucHJveHlDb21tYW5kKCcvd2RhL2xvY2snLCAnUE9TVCcpO1xuICBpZiAoaXNOYU4oc2Vjb25kcykpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBmbG9hdFNlY29uZHMgPSBwYXJzZUZsb2F0KHNlY29uZHMpO1xuICBpZiAoZmxvYXRTZWNvbmRzIDw9IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBhd2FpdCBCLmRlbGF5KGZsb2F0U2Vjb25kcyAqIDEwMDApO1xuICBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZCgnL3dkYS91bmxvY2snLCAnUE9TVCcpO1xufTtcblxuY29tbWFuZHMudW5sb2NrID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZCgnL3dkYS91bmxvY2snLCAnUE9TVCcpO1xufTtcblxuY29tbWFuZHMuaXNMb2NrZWQgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZCgnL3dkYS9sb2NrZWQnLCAnR0VUJyk7XG59O1xuXG5leHBvcnQgeyBjb21tYW5kcyB9O1xuZXhwb3J0IGRlZmF1bHQgY29tbWFuZHM7XG4iXSwiZmlsZSI6ImxpYi9jb21tYW5kcy9sb2NrLmpzIiwic291cmNlUm9vdCI6Ii4uLy4uLy4uIn0=
