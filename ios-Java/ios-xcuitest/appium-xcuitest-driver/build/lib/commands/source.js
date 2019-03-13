"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.helpers = exports.commands = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _xmldom = _interopRequireDefault(require("xmldom"));

var _js2xmlparser = _interopRequireDefault(require("js2xmlparser2"));

let commands = {},
    helpers = {},
    extensions = {};
exports.helpers = helpers;
exports.commands = commands;
const APPIUM_SRC_XML = '<?xml version="1.0" encoding="UTF-8"?><AppiumAUT/>';

commands.getPageSource = async function () {
  if (this.isWebContext()) {
    const script = 'return document.documentElement.outerHTML';
    return await this.executeAtom('execute_script', [script, []]);
  }

  if ((await this.settings.getSettings()).useJSONSource) {
    let srcTree = await this.mobileGetSource({
      format: 'json'
    });
    return getSourceXml(getTreeForXML(srcTree));
  }

  return await this.getNativePageSource();
};

helpers.getNativePageSource = async function () {
  let srcTree = await this.proxyCommand('/source', 'GET');
  let parser = new _xmldom.default.DOMParser();
  let tree = parser.parseFromString(srcTree);
  let doc = parser.parseFromString(APPIUM_SRC_XML);
  doc.documentElement.appendChild(tree.documentElement);
  return new _xmldom.default.XMLSerializer().serializeToString(doc);
};

helpers.mobileGetSource = async function (opts = {}) {
  if (!_lodash.default.isString(opts.format)) {
    return await this.getNativePageSource();
  }

  return await this.proxyCommand(`/source?format=${encodeURIComponent(opts.format)}`, 'GET');
};

function getTreeForXML(srcTree) {
  function getTree(element, elementIndex, parentPath) {
    let curPath = `${parentPath}/${elementIndex}`;
    let rect = element.rect || {};
    let subtree = {
      '@': {
        type: `XCUIElementType${element.type}`,
        enabled: parseInt(element.isEnabled, 10) === 1,
        visible: parseInt(element.isVisible, 10) === 1,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      '>': []
    };

    if (element.name !== null) {
      subtree['@'].name = element.name;
    }

    if (element.label !== null) {
      subtree['@'].label = element.label;
    }

    if (element.value !== null) {
      subtree['@'].value = element.value;
    }

    for (let i = 0; i < (element.children || []).length; i++) {
      subtree['>'].push(getTree(element.children[i], i, curPath));
    }

    return {
      [`XCUIElementType${element.type}`]: subtree
    };
  }

  let tree = getTree(srcTree, 0, '');
  return tree;
}

function getSourceXml(jsonSource) {
  return (0, _js2xmlparser.default)("AppiumAUT", jsonSource, {
    wrapArray: {
      enabled: false,
      elementName: 'element'
    },
    declaration: {
      include: true
    },
    prettyPrinting: {
      indentString: '  '
    }
  });
}

Object.assign(extensions, commands, helpers);
var _default = extensions;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9jb21tYW5kcy9zb3VyY2UuanMiXSwibmFtZXMiOlsiY29tbWFuZHMiLCJoZWxwZXJzIiwiZXh0ZW5zaW9ucyIsIkFQUElVTV9TUkNfWE1MIiwiZ2V0UGFnZVNvdXJjZSIsImlzV2ViQ29udGV4dCIsInNjcmlwdCIsImV4ZWN1dGVBdG9tIiwic2V0dGluZ3MiLCJnZXRTZXR0aW5ncyIsInVzZUpTT05Tb3VyY2UiLCJzcmNUcmVlIiwibW9iaWxlR2V0U291cmNlIiwiZm9ybWF0IiwiZ2V0U291cmNlWG1sIiwiZ2V0VHJlZUZvclhNTCIsImdldE5hdGl2ZVBhZ2VTb3VyY2UiLCJwcm94eUNvbW1hbmQiLCJwYXJzZXIiLCJ4bWxkb20iLCJET01QYXJzZXIiLCJ0cmVlIiwicGFyc2VGcm9tU3RyaW5nIiwiZG9jIiwiZG9jdW1lbnRFbGVtZW50IiwiYXBwZW5kQ2hpbGQiLCJYTUxTZXJpYWxpemVyIiwic2VyaWFsaXplVG9TdHJpbmciLCJvcHRzIiwiXyIsImlzU3RyaW5nIiwiZW5jb2RlVVJJQ29tcG9uZW50IiwiZ2V0VHJlZSIsImVsZW1lbnQiLCJlbGVtZW50SW5kZXgiLCJwYXJlbnRQYXRoIiwiY3VyUGF0aCIsInJlY3QiLCJzdWJ0cmVlIiwidHlwZSIsImVuYWJsZWQiLCJwYXJzZUludCIsImlzRW5hYmxlZCIsInZpc2libGUiLCJpc1Zpc2libGUiLCJ4IiwieSIsIndpZHRoIiwiaGVpZ2h0IiwibmFtZSIsImxhYmVsIiwidmFsdWUiLCJpIiwiY2hpbGRyZW4iLCJsZW5ndGgiLCJwdXNoIiwianNvblNvdXJjZSIsIndyYXBBcnJheSIsImVsZW1lbnROYW1lIiwiZGVjbGFyYXRpb24iLCJpbmNsdWRlIiwicHJldHR5UHJpbnRpbmciLCJpbmRlbnRTdHJpbmciLCJPYmplY3QiLCJhc3NpZ24iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBR0EsSUFBSUEsUUFBUSxHQUFHLEVBQWY7QUFBQSxJQUFtQkMsT0FBTyxHQUFH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QUFpQmtCLE1BQUFBLFdBQVcsRUFBRTtBQUE5QixLQUQwQjtBQUVyQ0MsSUFBQUEsV0FBVyxFQUFFO0FBQUNDLE1BQUFBLE9BQU8sRUFBRTtBQUFWLEtBRndCO0FBR3JDQyxJQUFBQSxjQUFjLEVBQUU7QUFBQ0MsTUFBQUEsWUFBWSxFQUFFO0FBQWY7QUFIcUIsR0FBaEMsQ0FBUDtBQUtEOztBQUdEQyxNQUFNLENBQUNDLE1BQVAsQ0FBYzlELFVBQWQsRUFBMEJGLFFBQTFCLEVBQW9DQyxPQUFwQztlQUVlQyxVIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB4bWxkb20gZnJvbSAneG1sZG9tJztcbmltcG9ydCBqczJ4bWwgZnJvbSBcImpzMnhtbHBhcnNlcjJcIjtcblxuXG5sZXQgY29tbWFuZHMgPSB7fSwgaGVscGVycyA9IHt9LCBleHRlbnNpb25zID0ge307XG5cbmNvbnN0IEFQUElVTV9TUkNfWE1MID0gJzw/eG1sIHZlcnNpb249XCIxLjBcIiBlbmNvZGluZz1cIlVURi04XCI/PjxBcHBpdW1BVVQvPic7XG5cblxuY29tbWFuZHMuZ2V0UGFnZVNvdXJjZSA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNXZWJDb250ZXh0KCkpIHtcbiAgICBjb25zdCBzY3JpcHQgPSAncmV0dXJuIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5vdXRlckhUTUwnO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVBdG9tKCdleGVjdXRlX3NjcmlwdCcsIFtzY3JpcHQsIFtdXSk7XG4gIH1cblxuICBpZiAoKGF3YWl0IHRoaXMuc2V0dGluZ3MuZ2V0U2V0dGluZ3MoKSkudXNlSlNPTlNvdXJjZSkge1xuICAgIGxldCBzcmNUcmVlID0gYXdhaXQgdGhpcy5tb2JpbGVHZXRTb3VyY2Uoe2Zvcm1hdDogJ2pzb24nfSk7XG4gICAgcmV0dXJuIGdldFNvdXJjZVhtbChnZXRUcmVlRm9yWE1MKHNyY1RyZWUpKTtcbiAgfVxuICByZXR1cm4gYXdhaXQgdGhpcy5nZXROYXRpdmVQYWdlU291cmNlKCk7XG59O1xuXG5oZWxwZXJzLmdldE5hdGl2ZVBhZ2VTb3VyY2UgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGxldCBzcmNUcmVlID0gYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoJy9zb3VyY2UnLCAnR0VUJyk7XG5cbiAgbGV0IHBhcnNlciA9IG5ldyB4bWxkb20uRE9NUGFyc2VyKCk7XG5cbiAgbGV0IHRyZWUgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKHNyY1RyZWUpO1xuXG4gIGxldCBkb2MgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKEFQUElVTV9TUkNfWE1MKTtcbiAgZG9jLmRvY3VtZW50RWxlbWVudC5hcHBlbmRDaGlsZCh0cmVlLmRvY3VtZW50RWxlbWVudCk7XG5cbiAgcmV0dXJuIG5ldyB4bWxkb20uWE1MU2VyaWFsaXplcigpLnNlcmlhbGl6ZVRvU3RyaW5nKGRvYyk7XG59O1xuXG5oZWxwZXJzLm1vYmlsZUdldFNvdXJjZSA9IGFzeW5jIGZ1bmN0aW9uIChvcHRzID0ge30pIHtcbiAgaWYgKCFfLmlzU3RyaW5nKG9wdHMuZm9ybWF0KSkge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmdldE5hdGl2ZVBhZ2VTb3VyY2UoKTtcbiAgfVxuICByZXR1cm4gYXdhaXQgdGhpcy5wcm94eUNvbW1hbmQoYC9zb3VyY2U/Zm9ybWF0PSR7ZW5jb2RlVVJJQ29tcG9uZW50KG9wdHMuZm9ybWF0KX1gLCAnR0VUJyk7XG59O1xuXG4vKiBXaWxsIGdldCBKU09OIG9mIHRoZSBmb3JtOlxuICogICB7IGlzRW5hYmxlZDogJzEnLFxuICogICAgIGlzVmlzaWJsZTogJzEnLFxuICogICAgIGZyYW1lOiAne3swLCAwfSwgezM3NSwgNjY3fX0nLFxuICogICAgIGNoaWxkcmVuOlxuICogICAgICBbIHsgaXNFbmFibGVkOiAnMScsXG4gKiAgICAgICAgICBpc1Zpc2libGU6ICcxJyxcbiAqICAgICAgICAgIGZyYW1lOiAne3swLCAwfSwgezM3NSwgNjY3fX0nLFxuICogICAgICAgICAgY2hpbGRyZW46IFtdLFxuICogICAgICAgICAgcmVjdDogeyB4OiAwLCB5OiAwLCB3aWR0aDogMzc1LCBoZWlnaHQ6IDY2NyB9LFxuICogICAgICAgICAgdmFsdWU6IG51bGwsXG4gKiAgICAgICAgICBsYWJlbDogbnVsbCxcbiAqICAgICAgICAgIHR5cGU6ICdPdGhlcicsXG4gKiAgICAgICAgICBuYW1lOiBudWxsLFxuICogICAgICAgICAgcmF3SWRlbnRpZmllcjogbnVsbCB9LFxuICogICAgIHJlY3Q6IHsgb3JpZ2luOiB7IHg6IDAsIHk6IDAgfSwgc2l6ZTogeyB3aWR0aDogMzc1LCBoZWlnaHQ6IDY2NyB9IH0sXG4gKiAgICAgdmFsdWU6IG51bGwsXG4gKiAgICAgbGFiZWw6ICdVSUNhdGFsb2cnLFxuICogICAgIHR5cGU6ICdBcHBsaWNhdGlvbicsXG4gKiAgICAgbmFtZTogJ1VJQ2F0YWxvZycsXG4gKiAgICAgcmF3SWRlbnRpZmllcjogbnVsbCB9XG4gKi9cbmZ1bmN0aW9uIGdldFRyZWVGb3JYTUwgKHNyY1RyZWUpIHtcbiAgZnVuY3Rpb24gZ2V0VHJlZSAoZWxlbWVudCwgZWxlbWVudEluZGV4LCBwYXJlbnRQYXRoKSB7XG4gICAgbGV0IGN1clBhdGggPSBgJHtwYXJlbnRQYXRofS8ke2VsZW1lbnRJbmRleH1gO1xuICAgIGxldCByZWN0ID0gZWxlbWVudC5yZWN0IHx8IHt9O1xuICAgIGxldCBzdWJ0cmVlID0ge1xuICAgICAgJ0AnOiB7XG4gICAgICAgIHR5cGU6IGBYQ1VJRWxlbWVudFR5cGUke2VsZW1lbnQudHlwZX1gLFxuICAgICAgICBlbmFibGVkOiBwYXJzZUludChlbGVtZW50LmlzRW5hYmxlZCwgMTApID09PSAxLFxuICAgICAgICB2aXNpYmxlOiBwYXJzZUludChlbGVtZW50LmlzVmlzaWJsZSwgMTApID09PSAxLFxuICAgICAgICB4OiByZWN0LngsXG4gICAgICAgIHk6IHJlY3QueSxcbiAgICAgICAgd2lkdGg6IHJlY3Qud2lkdGgsXG4gICAgICAgIGhlaWdodDogcmVjdC5oZWlnaHQsXG4gICAgICB9LFxuICAgICAgJz4nOiBbXVxuICAgIH07XG4gICAgaWYgKGVsZW1lbnQubmFtZSAhPT0gbnVsbCkge1xuICAgICAgc3VidHJlZVsnQCddLm5hbWUgPSBlbGVtZW50Lm5hbWU7XG4gICAgfVxuICAgIGlmIChlbGVtZW50LmxhYmVsICE9PSBudWxsKSB7XG4gICAgICBzdWJ0cmVlWydAJ10ubGFiZWwgPSBlbGVtZW50LmxhYmVsO1xuICAgIH1cbiAgICBpZiAoZWxlbWVudC52YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgc3VidHJlZVsnQCddLnZhbHVlID0gZWxlbWVudC52YWx1ZTtcbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCAoZWxlbWVudC5jaGlsZHJlbiB8fCBbXSkubGVuZ3RoOyBpKyspIHtcbiAgICAgIHN1YnRyZWVbJz4nXS5wdXNoKGdldFRyZWUoZWxlbWVudC5jaGlsZHJlbltpXSwgaSwgY3VyUGF0aCkpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgW2BYQ1VJRWxlbWVudFR5cGUke2VsZW1lbnQudHlwZX1gXTogc3VidHJlZVxuICAgIH07XG4gIH1cbiAgbGV0IHRyZWUgPSBnZXRUcmVlKHNyY1RyZWUsIDAsICcnKTtcbiAgcmV0dXJuIHRyZWU7XG59XG5cbmZ1bmN0aW9uIGdldFNvdXJjZVhtbCAoanNvblNvdXJjZSkge1xuICByZXR1cm4ganMyeG1sKFwiQXBwaXVtQVVUXCIsIGpzb25Tb3VyY2UsIHtcbiAgICB3cmFwQXJyYXk6IHtlbmFibGVkOiBmYWxzZSwgZWxlbWVudE5hbWU6ICdlbGVtZW50J30sXG4gICAgZGVjbGFyYXRpb246IHtpbmNsdWRlOiB0cnVlfSxcbiAgICBwcmV0dHlQcmludGluZzoge2luZGVudFN0cmluZzogJyAgJ31cbiAgfSk7XG59XG5cblxuT2JqZWN0LmFzc2lnbihleHRlbnNpb25zLCBjb21tYW5kcywgaGVscGVycyk7XG5leHBvcnQgeyBjb21tYW5kcywgaGVscGVycyB9O1xuZXhwb3J0IGRlZmF1bHQgZXh0ZW5zaW9ucztcbiJdLCJmaWxlIjoibGliL2NvbW1hbmRzL3NvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLi8uLiJ9