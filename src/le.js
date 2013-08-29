/**
* @license Copyright 2013 Logentries.
* Please view license at https://raw.github.com/logentries/le_js/master/LICENSE
*/

var LE = (function(window) {
  "use strict";

  /**
   * A single log event stream.
   * @constructor
   * @param {Object} options
   */
  function LogStream(options) {
    /**
     * @const
     * @type {string} */
    var _traceCode = (Math.random() + Math.PI).toString(36).substring(2,10);
    /** @type {number} */
    var _sendInfo = options.page_info;
    /** @type {boolean} */
    var _doTrace = options.trace;
    /** @type {string} */
    var _pageInfo = options.page_info;
    /** @type {string} */
    var _token = options.token;
    /**
     * @const
     * @type {string} */
    var _endpoint = "localhost:8080";

    /**
     * Flag to prevent further invocations on network err
     ** @type {boolean} */
    var _shouldCall = true;
    /** @type {boolean} */
    var _SSL = options.ssl;
    /** @type {Array.<string>} */
    var _backlog = [];
    /** @type {boolean} */
    var _active = false;
    /** @type {boolean} */
    var _sentPageInfo = false;

    if (options.catchall) {
      var oldHandler = window.onerror;
      var newHandler = function(msg, url, line) {
        _rawLog({error: msg, line: line, url: url});
        if (oldHandler) oldHandler(msg, url, line);
      }
      window.onerror = newHandler;
    }

    var _agentInfo = function() {
      var nav = window.navigator || {userAgent: "unknown"};
      var screen = window.screen || {width: "unknown", height: "unknown"};

      return {
        name: nav.userAgent,
        screenWidth: screen.width,
        screenHeight: screen.height
      };
    }

    var _isComplex = function(obj) {
      return (typeof obj === "object" || Array.isArray(obj)) && obj !== null;
    }

    var _prettyPrint = function(obj) {
      if (typeof obj === "undefined") {
        return "undefined";
      } else if (obj === null) {
        return "null";
      } else {
        return obj;
      }
    }

    var _serialize = function(obj) {
      if (_isComplex(obj)) {
        for (var o in obj) {
          obj[o] = _serialize(obj[o]);
        }
        return obj;
      } else {
        return _prettyPrint(obj);
      }
    }

    // Single param stops the compiler
    // complaining about wrong arity.
    var _rawLog = function(msg) {
      var raw = null;
      var args = Array.prototype.slice.call(arguments);

      if (args.length === 0) {
        throw new Error("No arguments!");
      } else if (args.length === 1) {
        raw = args[0];
      } else {
        // Handle a variadic overload,
        // e.g. _rawLog("some text ", x, " ...", 1);
        raw = _serialize(args).join(" ");
      }

      var data = {event: raw};

      // Add agent info if required
      if (_pageInfo !== 'never') {
        if (_pageInfo === 'per-entry' || !_sentPageInfo) {
          data.agent = _agentInfo();
          _sentPageInfo = true;
        }
      }

      // Add trace code if required
      if (_doTrace) {
        data.tracecode = _traceCode;
      }

      var serialized = JSON.stringify(_serialize(data));

      if (_active) {
        _backlog.push(serialized);
      } else {
        _apiCall(_token, serialized);
      }
    }

    /** @expose */
    this.log = _rawLog;

    var _apiCall = function(token, data) {
      _active = true;

      // Obtain a browser-specific XHR object
      var _getAjaxObject = function() {
        if (window.ActiveXObject) {
          window.XMLHttpRequest = function() {
            // IE6 compat
            return new ActiveXObject('Microsoft.XMLHTTP');
          }
        }
        return new XMLHttpRequest();
      }

      var request = _getAjaxObject();

      if (_shouldCall) {
        request.onreadystatechange = function() {
          if (request.readyState === 4) {
            if (request.status >= 400) {
              console.warn("Couldn't submit events.");
            } else {
              if (_backlog.length > 0) {
                // Submit the next event in the backlog
                _apiCall(token, _backlog.shift());
              } else {
                _active = false;
              }
            }
          }

        }
        var uri = (_SSL ? "https://" : "http://") + _endpoint + "/logs/" + _token;
        request.open("POST", uri, true);
        request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        request.setRequestHeader('Content-type', 'text/json');
        request.send(data);
      }
    }
  }

  var logger;

  var _init = function(options) {
    var dict = {ssl: true};
    if (typeof options === "object")
      for (var k in options)
        dict[k] = options[k];
    else if (typeof options === "string")
      dict.token = options;

    dict.catchall = dict.catchall || false;
    dict.trace = dict.trace || false;
    dict.page_info = dict.page_info || 'never';

    if (dict.token === undefined) {
      throw new Error("Token not present.");
    } else {
      logger = new LogStream(dict);
    }

    return true;
  };

  var _log = function() {
    if (logger) {
      logger.log.apply(this, arguments);
    } else
      throw new Error("You must call LE.init(...) first.");
  }

  return {
    init: _init,
    log: _log
  };
} (this));
