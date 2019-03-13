"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.helpers = exports.commands = void 0;

require("source-map-support/register");

let commands = {},
    helpers = {},
    extensions = {};
exports.helpers = helpers;
exports.commands = commands;

function assertIsSimulator(driver) {
  if (!driver.isSimulator()) {
    throw new Error('Keychains can only be controlled on Simulator');
  }
}

commands.mobileClearKeychains = async function () {
  assertIsSimulator(this);
  await this.opts.device.clearKeychains();
};

Object.assign(extensions, commands, helpers);
var _default = extensions;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jb21tYW5kcy9rZXljaGFpbnMuanMiXSwibmFtZXMiOlsiY29tbWFuZHMiLCJoZWxwZXJzIiwiZXh0ZW5zaW9ucyIsImFzc2VydElzU2ltdWxhdG9yIiwiZHJpdmVyIiwiaXNTaW11bGF0b3IiLCJFcnJvciIsIm1vYmlsZUNsZWFyS2V5Y2hhaW5zIiwib3B0cyIsImRldmljZSIsImNsZWFyS2V5Y2hhaW5zIiwiT2JqZWN0IiwiYXNzaWduIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSxJQUFJQSxRQUFRLEdBQUcsRUFBZjtBQUFBLElBQW1CQyxPQUFPLEdBQUcsRUFBN0I7QUFBQSxJQUFpQ0MsVUFBVSxHQUFHLEVBQTlDOzs7O0FBRUEsU0FBU0MsaUJBQVQsQ0FBNEJDLE1BQTVCLEVBQW9DO0FBQ2xDLE1BQUksQ0FBQ0EsTUFBTSxDQUFDQyxXQUFQLEVBQUwsRUFBMkI7QUFDekIsVUFBTSxJQUFJQyxLQUFKLENBQVUsK0NBQVYsQ0FBTjtBQUNEO0FBQ0Y7O0FBUUROLFFBQVEsQ0FBQ08sb0JBQVQsR0FBZ0Msa0JBQWtCO0FBQ2hESixFQUFBQSxpQkFBaUIsQ0FBQyxJQUFELENBQWpCO0FBRUEsUUFBTSxLQUFLSyxJQUFMLENBQVVDLE1BQVYsQ0FBaUJDLGNBQWpCLEVBQU47QUFDRCxDQUpEOztBQU1BQyxNQUFNLENBQUNDLE1BQVAsQ0FBY1YsVUFBZCxFQUEwQkYsUUFBMUIsRUFBb0NDLE9BQXBDO2VBRWVDLFUiLCJzb3VyY2VzQ29udGVudCI6WyJsZXQgY29tbWFuZHMgPSB7fSwgaGVscGVycyA9IHt9LCBleHRlbnNpb25zID0ge307XG5cbmZ1bmN0aW9uIGFzc2VydElzU2ltdWxhdG9yIChkcml2ZXIpIHtcbiAgaWYgKCFkcml2ZXIuaXNTaW11bGF0b3IoKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignS2V5Y2hhaW5zIGNhbiBvbmx5IGJlIGNvbnRyb2xsZWQgb24gU2ltdWxhdG9yJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBDbGVhcnMga2V5Y2hhaW5zIG9uIFNpbXVsYXRvci5cbiAqXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgY3VycmVudCBkZXZpY2UgaXMgbm90IGEgU2ltdWxhdG9yIG9yIHRoZXJlIHdhcyBhbiBlcnJvclxuICogd2hpbGUgY2xlYXJpbmcga2V5Y2hhaW5zLlxuICovXG5jb21tYW5kcy5tb2JpbGVDbGVhcktleWNoYWlucyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgYXNzZXJ0SXNTaW11bGF0b3IodGhpcyk7XG5cbiAgYXdhaXQgdGhpcy5vcHRzLmRldmljZS5jbGVhcktleWNoYWlucygpO1xufTtcblxuT2JqZWN0LmFzc2lnbihleHRlbnNpb25zLCBjb21tYW5kcywgaGVscGVycyk7XG5leHBvcnQgeyBjb21tYW5kcywgaGVscGVycyB9O1xuZXhwb3J0IGRlZmF1bHQgZXh0ZW5zaW9ucztcbiJdLCJmaWxlIjoibGliL2NvbW1hbmRzL2tleWNoYWlucy5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLi8uLiJ9