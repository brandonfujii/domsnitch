/**
 * Copyright 2012 Google Inc. All Rights Reserved.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *    http://www.apache.org/licenses/LICENSE-2.0
 *  
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

DOMSnitch.UI.ConfigManager = function(parent) {
  this._parent = parent;
  this._defaultMode = undefined;
  
  this._heuristicsTable = {
    "httpheaders": "HTTP headers",
    "invalidjson": "Invalid JSON",
    "mixedcontent": "Mixed content",
    "reflectedinput": "Reflected input",
    "untrustedcode": "Untrusted code",
    "scriptinclusion": "Script inclusion",
    "xpcmonitor": "XPC monitor",
    "plugins": "Plug-ins",
    "externalui": "External UI"
  };
}

DOMSnitch.UI.ConfigManager.prototype = {
  get defaultMode() {
    return this._defaultMode;
  },
  
  set defaultMode(value) {
    this._defaultMode = value;
  },
  
  get useDebugging() {
    return window.localStorage["ds-debug"] == "true";
  },
  
  _exportExtendedConfig: function(config) {
    // This is a stub method for extensibility purposes.
    
    return config;
  },
  
  _getConfigData: function(callback) {
    // Attempt 1: Get stored config data
    var configData = window.localStorage["ds-config-data"];
    if(configData) {
      try {
        configData = JSON.parse(configData);

        if(callback) {
          window.setTimeout(callback, 10, configData);
        }
        
        return configData;
      } catch (e) {
        delete window.localStorage["ds-config-data"];
      }
    }
    
    // Attempt 2: Get config data from a file
    var url = window.localStorage["ds-config-url"];
    if(!url) {
      url = chrome.extension.getURL("/ui/config/defaultConfig.json");
    }
    
    var handleResponse = function(event) {
      var config = null;
      var xhr = event.target;
      if(xhr.readyState == 4) {
        try {
          config = xhr.responseText.replace(/\n/g, "");
          
          // Strip leading comments from the config file.
          var idx = config.indexOf("/*");
          if(idx == 0) {
            idx = config.indexOf("*/") + 2;
            if(idx > 1) {
              config = config.substring(idx);
            }
          }
          config = JSON.parse(config);

        } catch(e) {
          var errMsg = "The specified configuration could not be loaded!"
              + " Reverting to previous configuration.";
          window.alert(errMsg);
          config = false;
        }
        
        if(callback) {
          window.setTimeout(callback, 10, config);
        }
        
        this._loadConfig(config);
      }
    };

    var timestamp = new Date(0);
    var xhr = new XMLHttpRequest;
    xhr.open("GET", url, true);
    xhr.setRequestHeader("If-Modified-Since", timestamp.toUTCString());
    xhr.addEventListener("readystatechange", handleResponse.bind(this), true);
    xhr.send();

  },
  
  _isTypeInScope: function(type) {
    var selected = JSON.parse(window.localStorage["ds-opt-config"]);
    
    var inScope = selected[type];
    if(inScope == undefined) {
      selected[type] = 0;
      window.localStorage["ds-opt-config"] = JSON.stringify(selected);
    }
    
    return !!inScope;
  },
  
  _loadConfig: function(config) {
    if(config.heuristics) {
      // Set the list of available heuristics and indicate the heuristics that
      // have been applied.
      var availHeuristics = {};
      
      for(var i = 0; i < config.heuristics.length; i++) {
        var heuristic = config.heuristics[i].toLowerCase();
        heuristic = heuristic.replace(/[\s-]/g, "");
        heuristic = this._heuristicsTable[heuristic];
        availHeuristics[heuristic] = 1;
      }
      
      window.localStorage["ds-opt-config"] = JSON.stringify(availHeuristics);
    }
    
    if(config.ignoreRules) {
      // Set the ignore rules that need to be enabled.
      
      for(var i = 0; i < config.ignoreRules.length; i++) {
        var heuristic = config.ignoreRules[i].heuristic.toLowerCase();
        heuristic = heuristic.replace(/\s/g, "");
        config.ignoreRules[i].heuristic = this._heuristicsTable[heuristic];
      }
      
      window.localStorage["ds-ignoreRules"] = JSON.stringify(config.ignoreRules);
    }
    
    if(config.safeOrigins) {
      // Set the list of safe origins.
      window.localStorage["ds-origins"] = JSON.stringify(config.safeOrigins);
    }
    
    if(config.scope) {
      // Define the scope for testing.
      window.localStorage["ds-scope"] = JSON.stringify(config.scope);
    }
    
    if(config.components) {
      this._defaultMode = 0;
      for(var i = 0; i < config.components.length; i++) {
        var component = config.components[i]
        if(component == "DOMSnitch") {
          this._defaultMode += DOMSnitch.UI.TabManager.MODES.Passive;
        }
      }
    }
    
    this._loadExtendedConfig(config);
  },
  
  _loadExtendedConfig: function(config) {
    // This is a stub method for extensibility purposes.
  },
  
  applyConfig: function(config, callback) {
    var enableFlag = window.localStorage["ds-config-enable"];
    if(enableFlag && enableFlag != "true") {
      return;
    }

    if(config) {
      this._loadConfig(config);
    } else {
      this._getConfigData(callback);
    }
  },
  
  exportConfig: function() {
    //TODO
    var config = {};
    
    config.profile = "<Enter profile name>";
    config.components = [];
    if(this._defaultMode) {
      if(this._defaultMode & DOMSnitch.UI.TabManager.MODES.Passive) {
        config.components.push("DOMSnitch");
      }
    }
    
    config.scope = JSON.parse(window.localStorage["ds-scope"]);
    var heuristics = JSON.parse(window.localStorage["ds-opt-config"]);
    var hList = Object.getOwnPropertyNames(heuristics);
    for(var i = 0; i < hList.length; i++) {
      if(heuristics[hList[i]] == 0) {
        hList.splice(i, 1);
        i--;
      }
    }
    config.heuristics = hList;

    config.safeOrigins = JSON.parse(window.localStorage["ds-origins"]);
    config.ignoreRules = JSON.parse(window.localStorage["ds-ignoreRules"]);

    
    config = this._exportExtendedConfig(config);
    
    return config;
  },
  
  isInScope: function(url, type, ignoreType) {
    return this.isUrlInScope(url) && (ignoreType || this._isTypeInScope(type));
  },
  
  isUrlInScope: function(url) {
    var scope = JSON.parse(window.localStorage["ds-scope"]);
    
    if(scope.length == 0) {
      return true;
    }
    
    // Remove location.search and location.hash.
    url = url.replace(/[?#].*$/i, "");
    
    for(var i = 0; i < scope.length; i++) {
      var regexStr = scope[i];
      regexStr = regexStr.replace(/\/$/, "");
      regexStr = regexStr.replace(/\\/g, "\\\\");
      regexStr = regexStr.replace(/\*/g, "[\\w\\.-]*");
      var regex = new RegExp("^https{0,1}://" + regexStr, "i");
      if(regex.test(url)) {
        return true;
      }
    }
    
    return false;
  },
  
  setConfigUrl: function(configUrl) {
    window.localStorage["ds-config-url"] = configUrl;
  }
}