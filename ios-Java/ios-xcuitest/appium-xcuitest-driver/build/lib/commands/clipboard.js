"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.commands = void 0;

require("source-map-support/register");

let extensions = {},
    commands = {};
exports.commands = commands;

commands.setClipboard = async function (content, contentType) {
  await this.proxyCommand('/wda/setPasteboard', 'POST', {
    content,
    contentType
  });
};

commands.getClipboard = async function (contentType) {
  return await this.proxyCommand('/wda/getPasteboard', 'POST', {
    contentType
  });
};

Object.assign(extensions, commands);
var _default = extensions;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jb21tYW5kcy9jbGlwYm9hcmQuanMiXSwibmFtZXMiOlsiZXh0ZW5zaW9ucyIsImNvbW1hbmRzIiwic2V0Q2xpcGJvYXJkIiwiY29udGVudCIsImNvbnRlbnRUeXBlIiwicHJveHlDb21tYW5kIiwiZ2V0Q2xpcGJvYXJkIiwiT2JqZWN0IiwiYXNzaWduIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSxJQUFJQSxVQUFVLEdBQUcsRUFBakI7QUFBQSxJQUFxQkMsUUFBUSxHQUFHLEVBQWhDOzs7QUFVQUEsUUFBUSxDQUFDQyxZQUFULEdBQXdCLGdCQUFnQkMsT0FBaEIsRUFBeUJDLFdBQXpCLEVBQXNDO0FBQzVELFFBQU0sS0FBS0MsWUFBTCxDQUFrQixvQkFBbEIsRUFBd0MsTUFBeEMsRUFBZ0Q7QUFDcERGLElBQUFBLE9BRG9EO0FBRXBEQyxJQUFBQTtBQUZvRCxHQUFoRCxDQUFOO0FBSUQsQ0FMRDs7QUFlQUgsUUFBUSxDQUFDSyxZQUFULEdBQXdCLGdCQUFnQkYsV0FBaEIsRUFBNkI7QUFDbkQsU0FBTyxNQUFNLEtBQUtDLFlBQUwsQ0FBa0Isb0JBQWxCLEVBQXdDLE1BQXhDLEVBQWdEO0FBQzNERCxJQUFBQTtBQUQyRCxHQUFoRCxDQUFiO0FBR0QsQ0FKRDs7QUFPQUcsTUFBTSxDQUFDQyxNQUFQLENBQWNSLFVBQWQsRUFBMEJDLFFBQTFCO2VBRWVELFUiLCJzb3VyY2VzQ29udGVudCI6WyJsZXQgZXh0ZW5zaW9ucyA9IHt9LCBjb21tYW5kcyA9IHt9O1xuXG5cbi8qKlxuICogU2V0cyB0aGUgcHJpbWFyeSBjbGlwYm9hcmQncyBjb250ZW50IG9uIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqXG4gKiBAcGFyYW0geyFzdHJpbmd9IGNvbnRlbnQgLSBUaGUgY29udGVudCB0byBiZSBzZXQgYXMgYmFzZTY0IGVuY29kZWQgc3RyaW5nLlxuICogQHBhcmFtIHs/c3RyaW5nfSBjb250ZW50VHlwZSBbcGxhaW50ZXh0XSAtIFRoZSB0eXBlIG9mIHRoZSBjb250ZW50IHRvIHNldC5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBPbmx5IGBwbGFpbnRleHRgLCAnaW1hZ2UgYW5kICd1cmwnIGFyZSBzdXBwb3J0ZWQuXG4gKi9cbmNvbW1hbmRzLnNldENsaXBib2FyZCA9IGFzeW5jIGZ1bmN0aW9uIChjb250ZW50LCBjb250ZW50VHlwZSkge1xuICBhd2FpdCB0aGlzLnByb3h5Q29tbWFuZCgnL3dkYS9zZXRQYXN0ZWJvYXJkJywgJ1BPU1QnLCB7XG4gICAgY29udGVudCxcbiAgICBjb250ZW50VHlwZSxcbiAgfSk7XG59O1xuXG4vKipcbiAqIEdldHMgdGhlIGNvbnRlbnQgb2YgdGhlIHByaW1hcnkgY2xpcGJvYXJkIG9uIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqXG4gKiBAcGFyYW0gez9zdHJpbmd9IGNvbnRlbnRUeXBlIFtwbGFpbnRleHRdIC0gVGhlIHR5cGUgb2YgdGhlIGNvbnRlbnQgdG8gZ2V0LlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE9ubHkgYHBsYWludGV4dGAsICdpbWFnZSBhbmQgJ3VybCcgYXJlIHN1cHBvcnRlZC5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSBhY3R1YWwgY2xpcGJvYXJkIGNvbnRlbnQgZW5jb2RlZCBpbnRvIGJhc2U2NCBzdHJpbmcuXG4gKiBBbiBlbXB0eSBzdHJpbmcgaXMgcmV0dXJuZWQgaWYgdGhlIGNsaXBib2FyZCBjb250YWlucyBubyBkYXRhLlxuICovXG5jb21tYW5kcy5nZXRDbGlwYm9hcmQgPSBhc3luYyBmdW5jdGlvbiAoY29udGVudFR5cGUpIHtcbiAgcmV0dXJuIGF3YWl0IHRoaXMucHJveHlDb21tYW5kKCcvd2RhL2dldFBhc3RlYm9hcmQnLCAnUE9TVCcsIHtcbiAgICBjb250ZW50VHlwZSxcbiAgfSk7XG59O1xuXG5cbk9iamVjdC5hc3NpZ24oZXh0ZW5zaW9ucywgY29tbWFuZHMpO1xuZXhwb3J0IHsgY29tbWFuZHMgfTtcbmV4cG9ydCBkZWZhdWx0IGV4dGVuc2lvbnM7XG4iXSwiZmlsZSI6ImxpYi9jb21tYW5kcy9jbGlwYm9hcmQuanMiLCJzb3VyY2VSb290IjoiLi4vLi4vLi4ifQ==