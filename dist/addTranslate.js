/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./add-translate.js":
/*!**************************!*\
  !*** ./add-translate.js ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _vitalets_google_translate_api__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @vitalets/google-translate-api */ \"./node_modules/@vitalets/google-translate-api/dist/esm/index.js\");\n\r\n\r\n\r\nasync function addNoteWithTranslatedText(info) {\r\n  const { text } = await (0,_vitalets_google_translate_api__WEBPACK_IMPORTED_MODULE_0__.translate)(info.selectionText, { to: 'ja' });\r\n  console.log(text);\r\n  addNote(deckName, info.selectionText, text).then((result) => {\r\n    addNoteErrorHandler(result, info.selectionText, text);\r\n  });\r\n}\r\n\r\n// 右クリックメニュー作成\r\nchrome.contextMenus.create({\r\n  id: \"google-translate\",\r\n  title: \"Add selected text with Google Translation\",\r\n  contexts: [\"selection\"],\r\n  onclick: addNoteWithTranslatedText\r\n});\r\n\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./add-translate.js?");

/***/ }),

/***/ "./node_modules/depd/lib/browser/index.js":
/*!************************************************!*\
  !*** ./node_modules/depd/lib/browser/index.js ***!
  \************************************************/
/***/ ((module) => {

"use strict";
eval("/*!\n * depd\n * Copyright(c) 2015 Douglas Christopher Wilson\n * MIT Licensed\n */\n\n\n\n/**\n * Module exports.\n * @public\n */\n\nmodule.exports = depd\n\n/**\n * Create deprecate for namespace in caller.\n */\n\nfunction depd (namespace) {\n  if (!namespace) {\n    throw new TypeError('argument namespace is required')\n  }\n\n  function deprecate (message) {\n    // no-op in browser\n  }\n\n  deprecate._file = undefined\n  deprecate._ignored = true\n  deprecate._namespace = namespace\n  deprecate._traced = false\n  deprecate._warned = Object.create(null)\n\n  deprecate.function = wrapfunction\n  deprecate.property = wrapproperty\n\n  return deprecate\n}\n\n/**\n * Return a wrapped function in a deprecation message.\n *\n * This is a no-op version of the wrapper, which does nothing but call\n * validation.\n */\n\nfunction wrapfunction (fn, message) {\n  if (typeof fn !== 'function') {\n    throw new TypeError('argument fn must be a function')\n  }\n\n  return fn\n}\n\n/**\n * Wrap property in a deprecation message.\n *\n * This is a no-op version of the wrapper, which does nothing but call\n * validation.\n */\n\nfunction wrapproperty (obj, prop, message) {\n  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) {\n    throw new TypeError('argument obj must be object')\n  }\n\n  var descriptor = Object.getOwnPropertyDescriptor(obj, prop)\n\n  if (!descriptor) {\n    throw new TypeError('must call property on owner object')\n  }\n\n  if (!descriptor.configurable) {\n    throw new TypeError('property must be configurable')\n  }\n}\n\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/depd/lib/browser/index.js?");

/***/ }),

/***/ "./node_modules/http-errors/index.js":
/*!*******************************************!*\
  !*** ./node_modules/http-errors/index.js ***!
  \*******************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
eval("/*!\n * http-errors\n * Copyright(c) 2014 Jonathan Ong\n * Copyright(c) 2016 Douglas Christopher Wilson\n * MIT Licensed\n */\n\n\n\n/**\n * Module dependencies.\n * @private\n */\n\nvar deprecate = __webpack_require__(/*! depd */ \"./node_modules/depd/lib/browser/index.js\")('http-errors')\nvar setPrototypeOf = __webpack_require__(/*! setprototypeof */ \"./node_modules/setprototypeof/index.js\")\nvar statuses = __webpack_require__(/*! statuses */ \"./node_modules/statuses/index.js\")\nvar inherits = __webpack_require__(/*! inherits */ \"./node_modules/inherits/inherits_browser.js\")\nvar toIdentifier = __webpack_require__(/*! toidentifier */ \"./node_modules/toidentifier/index.js\")\n\n/**\n * Module exports.\n * @public\n */\n\nmodule.exports = createError\nmodule.exports.HttpError = createHttpErrorConstructor()\nmodule.exports.isHttpError = createIsHttpErrorFunction(module.exports.HttpError)\n\n// Populate exports for all constructors\npopulateConstructorExports(module.exports, statuses.codes, module.exports.HttpError)\n\n/**\n * Get the code class of a status code.\n * @private\n */\n\nfunction codeClass (status) {\n  return Number(String(status).charAt(0) + '00')\n}\n\n/**\n * Create a new HTTP Error.\n *\n * @returns {Error}\n * @public\n */\n\nfunction createError () {\n  // so much arity going on ~_~\n  var err\n  var msg\n  var status = 500\n  var props = {}\n  for (var i = 0; i < arguments.length; i++) {\n    var arg = arguments[i]\n    var type = typeof arg\n    if (type === 'object' && arg instanceof Error) {\n      err = arg\n      status = err.status || err.statusCode || status\n    } else if (type === 'number' && i === 0) {\n      status = arg\n    } else if (type === 'string') {\n      msg = arg\n    } else if (type === 'object') {\n      props = arg\n    } else {\n      throw new TypeError('argument #' + (i + 1) + ' unsupported type ' + type)\n    }\n  }\n\n  if (typeof status === 'number' && (status < 400 || status >= 600)) {\n    deprecate('non-error status code; use only 4xx or 5xx status codes')\n  }\n\n  if (typeof status !== 'number' ||\n    (!statuses.message[status] && (status < 400 || status >= 600))) {\n    status = 500\n  }\n\n  // constructor\n  var HttpError = createError[status] || createError[codeClass(status)]\n\n  if (!err) {\n    // create error\n    err = HttpError\n      ? new HttpError(msg)\n      : new Error(msg || statuses.message[status])\n    Error.captureStackTrace(err, createError)\n  }\n\n  if (!HttpError || !(err instanceof HttpError) || err.status !== status) {\n    // add properties to generic error\n    err.expose = status < 500\n    err.status = err.statusCode = status\n  }\n\n  for (var key in props) {\n    if (key !== 'status' && key !== 'statusCode') {\n      err[key] = props[key]\n    }\n  }\n\n  return err\n}\n\n/**\n * Create HTTP error abstract base class.\n * @private\n */\n\nfunction createHttpErrorConstructor () {\n  function HttpError () {\n    throw new TypeError('cannot construct abstract class')\n  }\n\n  inherits(HttpError, Error)\n\n  return HttpError\n}\n\n/**\n * Create a constructor for a client error.\n * @private\n */\n\nfunction createClientErrorConstructor (HttpError, name, code) {\n  var className = toClassName(name)\n\n  function ClientError (message) {\n    // create the error object\n    var msg = message != null ? message : statuses.message[code]\n    var err = new Error(msg)\n\n    // capture a stack trace to the construction point\n    Error.captureStackTrace(err, ClientError)\n\n    // adjust the [[Prototype]]\n    setPrototypeOf(err, ClientError.prototype)\n\n    // redefine the error message\n    Object.defineProperty(err, 'message', {\n      enumerable: true,\n      configurable: true,\n      value: msg,\n      writable: true\n    })\n\n    // redefine the error name\n    Object.defineProperty(err, 'name', {\n      enumerable: false,\n      configurable: true,\n      value: className,\n      writable: true\n    })\n\n    return err\n  }\n\n  inherits(ClientError, HttpError)\n  nameFunc(ClientError, className)\n\n  ClientError.prototype.status = code\n  ClientError.prototype.statusCode = code\n  ClientError.prototype.expose = true\n\n  return ClientError\n}\n\n/**\n * Create function to test is a value is a HttpError.\n * @private\n */\n\nfunction createIsHttpErrorFunction (HttpError) {\n  return function isHttpError (val) {\n    if (!val || typeof val !== 'object') {\n      return false\n    }\n\n    if (val instanceof HttpError) {\n      return true\n    }\n\n    return val instanceof Error &&\n      typeof val.expose === 'boolean' &&\n      typeof val.statusCode === 'number' && val.status === val.statusCode\n  }\n}\n\n/**\n * Create a constructor for a server error.\n * @private\n */\n\nfunction createServerErrorConstructor (HttpError, name, code) {\n  var className = toClassName(name)\n\n  function ServerError (message) {\n    // create the error object\n    var msg = message != null ? message : statuses.message[code]\n    var err = new Error(msg)\n\n    // capture a stack trace to the construction point\n    Error.captureStackTrace(err, ServerError)\n\n    // adjust the [[Prototype]]\n    setPrototypeOf(err, ServerError.prototype)\n\n    // redefine the error message\n    Object.defineProperty(err, 'message', {\n      enumerable: true,\n      configurable: true,\n      value: msg,\n      writable: true\n    })\n\n    // redefine the error name\n    Object.defineProperty(err, 'name', {\n      enumerable: false,\n      configurable: true,\n      value: className,\n      writable: true\n    })\n\n    return err\n  }\n\n  inherits(ServerError, HttpError)\n  nameFunc(ServerError, className)\n\n  ServerError.prototype.status = code\n  ServerError.prototype.statusCode = code\n  ServerError.prototype.expose = false\n\n  return ServerError\n}\n\n/**\n * Set the name of a function, if possible.\n * @private\n */\n\nfunction nameFunc (func, name) {\n  var desc = Object.getOwnPropertyDescriptor(func, 'name')\n\n  if (desc && desc.configurable) {\n    desc.value = name\n    Object.defineProperty(func, 'name', desc)\n  }\n}\n\n/**\n * Populate the exports object with constructors for every error class.\n * @private\n */\n\nfunction populateConstructorExports (exports, codes, HttpError) {\n  codes.forEach(function forEachCode (code) {\n    var CodeError\n    var name = toIdentifier(statuses.message[code])\n\n    switch (codeClass(code)) {\n      case 400:\n        CodeError = createClientErrorConstructor(HttpError, name, code)\n        break\n      case 500:\n        CodeError = createServerErrorConstructor(HttpError, name, code)\n        break\n    }\n\n    if (CodeError) {\n      // export the constructor\n      exports[code] = CodeError\n      exports[name] = CodeError\n    }\n  })\n}\n\n/**\n * Get a class name from a name identifier.\n * @private\n */\n\nfunction toClassName (name) {\n  return name.substr(-5) !== 'Error'\n    ? name + 'Error'\n    : name\n}\n\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/http-errors/index.js?");

/***/ }),

/***/ "./node_modules/inherits/inherits_browser.js":
/*!***************************************************!*\
  !*** ./node_modules/inherits/inherits_browser.js ***!
  \***************************************************/
/***/ ((module) => {

eval("if (typeof Object.create === 'function') {\n  // implementation from standard node.js 'util' module\n  module.exports = function inherits(ctor, superCtor) {\n    if (superCtor) {\n      ctor.super_ = superCtor\n      ctor.prototype = Object.create(superCtor.prototype, {\n        constructor: {\n          value: ctor,\n          enumerable: false,\n          writable: true,\n          configurable: true\n        }\n      })\n    }\n  };\n} else {\n  // old school shim for old browsers\n  module.exports = function inherits(ctor, superCtor) {\n    if (superCtor) {\n      ctor.super_ = superCtor\n      var TempCtor = function () {}\n      TempCtor.prototype = superCtor.prototype\n      ctor.prototype = new TempCtor()\n      ctor.prototype.constructor = ctor\n    }\n  }\n}\n\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/inherits/inherits_browser.js?");

/***/ }),

/***/ "./node_modules/node-fetch/browser.js":
/*!********************************************!*\
  !*** ./node_modules/node-fetch/browser.js ***!
  \********************************************/
/***/ ((module, exports, __webpack_require__) => {

"use strict";
eval("\n\n// ref: https://github.com/tc39/proposal-global\nvar getGlobal = function () {\n\t// the only reliable means to get the global object is\n\t// `Function('return this')()`\n\t// However, this causes CSP violations in Chrome apps.\n\tif (typeof self !== 'undefined') { return self; }\n\tif (typeof window !== 'undefined') { return window; }\n\tif (typeof __webpack_require__.g !== 'undefined') { return __webpack_require__.g; }\n\tthrow new Error('unable to locate global object');\n}\n\nvar globalObject = getGlobal();\n\nmodule.exports = exports = globalObject.fetch;\n\n// Needed for TypeScript and Webpack.\nif (globalObject.fetch) {\n\texports[\"default\"] = globalObject.fetch.bind(globalObject);\n}\n\nexports.Headers = globalObject.Headers;\nexports.Request = globalObject.Request;\nexports.Response = globalObject.Response;\n\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/node-fetch/browser.js?");

/***/ }),

/***/ "./node_modules/setprototypeof/index.js":
/*!**********************************************!*\
  !*** ./node_modules/setprototypeof/index.js ***!
  \**********************************************/
/***/ ((module) => {

"use strict";
eval("\n/* eslint no-proto: 0 */\nmodule.exports = Object.setPrototypeOf || ({ __proto__: [] } instanceof Array ? setProtoOf : mixinProperties)\n\nfunction setProtoOf (obj, proto) {\n  obj.__proto__ = proto\n  return obj\n}\n\nfunction mixinProperties (obj, proto) {\n  for (var prop in proto) {\n    if (!Object.prototype.hasOwnProperty.call(obj, prop)) {\n      obj[prop] = proto[prop]\n    }\n  }\n  return obj\n}\n\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/setprototypeof/index.js?");

/***/ }),

/***/ "./node_modules/statuses/index.js":
/*!****************************************!*\
  !*** ./node_modules/statuses/index.js ***!
  \****************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
eval("/*!\n * statuses\n * Copyright(c) 2014 Jonathan Ong\n * Copyright(c) 2016 Douglas Christopher Wilson\n * MIT Licensed\n */\n\n\n\n/**\n * Module dependencies.\n * @private\n */\n\nvar codes = __webpack_require__(/*! ./codes.json */ \"./node_modules/statuses/codes.json\")\n\n/**\n * Module exports.\n * @public\n */\n\nmodule.exports = status\n\n// status code to message map\nstatus.message = codes\n\n// status message (lower-case) to code map\nstatus.code = createMessageToStatusCodeMap(codes)\n\n// array of status codes\nstatus.codes = createStatusCodeList(codes)\n\n// status codes for redirects\nstatus.redirect = {\n  300: true,\n  301: true,\n  302: true,\n  303: true,\n  305: true,\n  307: true,\n  308: true\n}\n\n// status codes for empty bodies\nstatus.empty = {\n  204: true,\n  205: true,\n  304: true\n}\n\n// status codes for when you should retry the request\nstatus.retry = {\n  502: true,\n  503: true,\n  504: true\n}\n\n/**\n * Create a map of message to status code.\n * @private\n */\n\nfunction createMessageToStatusCodeMap (codes) {\n  var map = {}\n\n  Object.keys(codes).forEach(function forEachCode (code) {\n    var message = codes[code]\n    var status = Number(code)\n\n    // populate map\n    map[message.toLowerCase()] = status\n  })\n\n  return map\n}\n\n/**\n * Create a list of all status codes.\n * @private\n */\n\nfunction createStatusCodeList (codes) {\n  return Object.keys(codes).map(function mapCode (code) {\n    return Number(code)\n  })\n}\n\n/**\n * Get the status code for given message.\n * @private\n */\n\nfunction getStatusCode (message) {\n  var msg = message.toLowerCase()\n\n  if (!Object.prototype.hasOwnProperty.call(status.code, msg)) {\n    throw new Error('invalid status message: \"' + message + '\"')\n  }\n\n  return status.code[msg]\n}\n\n/**\n * Get the status message for given code.\n * @private\n */\n\nfunction getStatusMessage (code) {\n  if (!Object.prototype.hasOwnProperty.call(status.message, code)) {\n    throw new Error('invalid status code: ' + code)\n  }\n\n  return status.message[code]\n}\n\n/**\n * Get the status code.\n *\n * Given a number, this will throw if it is not a known status\n * code, otherwise the code will be returned. Given a string,\n * the string will be parsed for a number and return the code\n * if valid, otherwise will lookup the code assuming this is\n * the status message.\n *\n * @param {string|number} code\n * @returns {number}\n * @public\n */\n\nfunction status (code) {\n  if (typeof code === 'number') {\n    return getStatusMessage(code)\n  }\n\n  if (typeof code !== 'string') {\n    throw new TypeError('code must be a number or string')\n  }\n\n  // '403'\n  var n = parseInt(code, 10)\n  if (!isNaN(n)) {\n    return getStatusMessage(n)\n  }\n\n  return getStatusCode(code)\n}\n\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/statuses/index.js?");

/***/ }),

/***/ "./node_modules/toidentifier/index.js":
/*!********************************************!*\
  !*** ./node_modules/toidentifier/index.js ***!
  \********************************************/
/***/ ((module) => {

"use strict";
eval("/*!\n * toidentifier\n * Copyright(c) 2016 Douglas Christopher Wilson\n * MIT Licensed\n */\n\n\n\n/**\n * Module exports.\n * @public\n */\n\nmodule.exports = toIdentifier\n\n/**\n * Trasform the given string into a JavaScript identifier\n *\n * @param {string} str\n * @returns {string}\n * @public\n */\n\nfunction toIdentifier (str) {\n  return str\n    .split(' ')\n    .map(function (token) {\n      return token.slice(0, 1).toUpperCase() + token.slice(1)\n    })\n    .join('')\n    .replace(/[^ _0-9a-z]/gi, '')\n}\n\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/toidentifier/index.js?");

/***/ }),

/***/ "./node_modules/@vitalets/google-translate-api/dist/esm/helpers.js":
/*!*************************************************************************!*\
  !*** ./node_modules/@vitalets/google-translate-api/dist/esm/helpers.js ***!
  \*************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"extractTooManyRequestsInfo\": () => (/* binding */ extractTooManyRequestsInfo)\n/* harmony export */ });\nfunction extractTooManyRequestsInfo(html) {\n    const ip = html.match(/IP address: (.+?)<br>/)?.[1] || '';\n    const time = html.match(/Time: (.+?)<br>/)?.[1] || '';\n    const url = (html.match(/URL: (.+?)<br>/)?.[1] || '').replace(/&amp;/g, '&');\n    return { ip, time, url };\n}\n//# sourceMappingURL=helpers.js.map\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/@vitalets/google-translate-api/dist/esm/helpers.js?");

/***/ }),

/***/ "./node_modules/@vitalets/google-translate-api/dist/esm/index.js":
/*!***********************************************************************!*\
  !*** ./node_modules/@vitalets/google-translate-api/dist/esm/index.js ***!
  \***********************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"Translator\": () => (/* binding */ Translator),\n/* harmony export */   \"translate\": () => (/* binding */ translate)\n/* harmony export */ });\n/* harmony import */ var node_fetch__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! node-fetch */ \"./node_modules/node-fetch/browser.js\");\n/* harmony import */ var http_errors__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! http-errors */ \"./node_modules/http-errors/index.js\");\n/* harmony import */ var _helpers_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./helpers.js */ \"./node_modules/@vitalets/google-translate-api/dist/esm/helpers.js\");\n\n\n\nconst defaults = {\n    from: 'auto',\n    to: 'en',\n    host: 'translate.google.com',\n};\nasync function translate(inputText, options) {\n    return new Translator(inputText, options).translate();\n}\nclass Translator {\n    constructor(inputText, options) {\n        this.inputText = inputText;\n        this.options = Object.assign({}, defaults, options);\n    }\n    async translate() {\n        const url = this.buildUrl();\n        const fetchOptions = this.buildFetchOptions();\n        const res = await node_fetch__WEBPACK_IMPORTED_MODULE_0__(url, fetchOptions);\n        if (!res.ok)\n            throw await this.buildError(res);\n        const raw = await res.json();\n        const text = this.buildResText(raw);\n        return { text, raw };\n    }\n    buildUrl() {\n        const { host } = this.options;\n        return [\n            `https://${host}/translate_a/single`,\n            '?client=at',\n            '&dt=t',\n            '&dt=rm',\n            '&dj=1', // result as pretty json instead of deep nested arrays\n        ].join('');\n    }\n    buildBody() {\n        const { from, to } = this.options;\n        const params = {\n            sl: from,\n            tl: to,\n            q: this.inputText,\n        };\n        return new URLSearchParams(params).toString();\n    }\n    buildFetchOptions() {\n        const { fetchOptions } = this.options;\n        const res = Object.assign({}, fetchOptions);\n        res.method = 'POST';\n        res.headers = Object.assign({}, res.headers, {\n            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',\n        });\n        res.body = this.buildBody();\n        return res;\n    }\n    buildResText({ sentences }) {\n        return sentences\n            .filter((s) => 'trans' in s)\n            .map(s => s.trans)\n            .join('');\n    }\n    async buildError(res) {\n        if (res.status === 429) {\n            const text = await res.text();\n            const { ip, time, url } = (0,_helpers_js__WEBPACK_IMPORTED_MODULE_2__.extractTooManyRequestsInfo)(text);\n            const message = `${res.statusText} IP: ${ip}, Time: ${time}, Url: ${url}`;\n            return http_errors__WEBPACK_IMPORTED_MODULE_1__(res.status, message);\n        }\n        else {\n            return http_errors__WEBPACK_IMPORTED_MODULE_1__(res.status, res.statusText);\n        }\n    }\n}\n//# sourceMappingURL=index.js.map\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/@vitalets/google-translate-api/dist/esm/index.js?");

/***/ }),

/***/ "./node_modules/statuses/codes.json":
/*!******************************************!*\
  !*** ./node_modules/statuses/codes.json ***!
  \******************************************/
/***/ ((module) => {

"use strict";
eval("module.exports = JSON.parse('{\"100\":\"Continue\",\"101\":\"Switching Protocols\",\"102\":\"Processing\",\"103\":\"Early Hints\",\"200\":\"OK\",\"201\":\"Created\",\"202\":\"Accepted\",\"203\":\"Non-Authoritative Information\",\"204\":\"No Content\",\"205\":\"Reset Content\",\"206\":\"Partial Content\",\"207\":\"Multi-Status\",\"208\":\"Already Reported\",\"226\":\"IM Used\",\"300\":\"Multiple Choices\",\"301\":\"Moved Permanently\",\"302\":\"Found\",\"303\":\"See Other\",\"304\":\"Not Modified\",\"305\":\"Use Proxy\",\"307\":\"Temporary Redirect\",\"308\":\"Permanent Redirect\",\"400\":\"Bad Request\",\"401\":\"Unauthorized\",\"402\":\"Payment Required\",\"403\":\"Forbidden\",\"404\":\"Not Found\",\"405\":\"Method Not Allowed\",\"406\":\"Not Acceptable\",\"407\":\"Proxy Authentication Required\",\"408\":\"Request Timeout\",\"409\":\"Conflict\",\"410\":\"Gone\",\"411\":\"Length Required\",\"412\":\"Precondition Failed\",\"413\":\"Payload Too Large\",\"414\":\"URI Too Long\",\"415\":\"Unsupported Media Type\",\"416\":\"Range Not Satisfiable\",\"417\":\"Expectation Failed\",\"418\":\"I\\'m a Teapot\",\"421\":\"Misdirected Request\",\"422\":\"Unprocessable Entity\",\"423\":\"Locked\",\"424\":\"Failed Dependency\",\"425\":\"Too Early\",\"426\":\"Upgrade Required\",\"428\":\"Precondition Required\",\"429\":\"Too Many Requests\",\"431\":\"Request Header Fields Too Large\",\"451\":\"Unavailable For Legal Reasons\",\"500\":\"Internal Server Error\",\"501\":\"Not Implemented\",\"502\":\"Bad Gateway\",\"503\":\"Service Unavailable\",\"504\":\"Gateway Timeout\",\"505\":\"HTTP Version Not Supported\",\"506\":\"Variant Also Negotiates\",\"507\":\"Insufficient Storage\",\"508\":\"Loop Detected\",\"509\":\"Bandwidth Limit Exceeded\",\"510\":\"Not Extended\",\"511\":\"Network Authentication Required\"}');\n\n//# sourceURL=webpack://Weblio-Anki-Interceptor/./node_modules/statuses/codes.json?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./add-translate.js");
/******/ 	
/******/ })()
;