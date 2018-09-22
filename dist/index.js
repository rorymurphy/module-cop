'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

debugger;
var Module = require('module');
var path = require('path');

var stateMap = new WeakMap();
function getMutableState(obj) {
    var state = stateMap.get(obj);
    if (state.locked) {
        throw new Exception('Module Cop has been locked, no further modifications are allowed');
    }
    return state;
}

if (!Module._load) {
    throw new Error('This version of Node JS is not supported. Unable to locate Module.resolveFilename.');
}

if (!Module._resolveFilename) {
    throw new Error('This version of Node JS is not supported. Unable to locate Module.resolveFilename.');
}

if (!Module._findPath) {
    throw new Error('This version of Node JS is not supported. Unable to locate Module._findPath.');
}

var originalModulePrototype = Object.assign(Object.create(Module.prototype.prototype || Object), Module.prototype);
var originalModule = Object.assign(Object.create(originalModulePrototype), Module);

var originalLoad = Module._load;
var originalPrototypeLoad = Module.prototype.load;
var originalResolveFilename = Module._resolveFilename;
var originalFindPath = Module._findPath;

function intersect(a, b) {
    var t;
    if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) {
        return b.indexOf(e) > -1;
    });
}

var EnforcementLevel = Object.freeze({
    WHITELIST_ONLY: 0,
    BLACKLIST_ONLY: 1,
    WHITELIST_PRECEDENCE: 2,
    WHITELIST_PRECEDENCE_INDIRECT: 3
});

var ModuleCop = function () {
    function ModuleCop() {
        _classCallCheck(this, ModuleCop);

        var state = {
            locked: false,
            enforcementLevel: EnforcementLevel.WHITELIST_ONLY,
            blacklist: [],
            whitelist: [],
            substitute: {}
        };

        stateMap.set(this, state);
    }

    _createClass(ModuleCop, [{
        key: 'addToBlacklist',
        value: function addToBlacklist(name) {
            var state = getMutableState(this);
            state.blacklist.push(name);
        }
    }, {
        key: 'removeFromBlacklist',
        value: function removeFromBlacklist(name) {
            var state = getMutableState(this);
            var index = state.blacklist.indexOf(name);
            if (index >= 0) {
                state.blacklist.splice(index, 1);
            }
        }
    }, {
        key: 'addToWhitelist',
        value: function addToWhitelist(name) {
            var state = getMutableState(this);
            state.whitelist.push(name);
        }
    }, {
        key: 'removeFromWhitelist',
        value: function removeFromWhitelist(name) {
            var state = getMutableState(this);
            var index = state.whitelist.indexOf(name);
            if (index >= 0) {
                state.whitelist.splice(index, 1);
            }
        }
    }, {
        key: 'addModuleSubstitution',
        value: function addModuleSubstitution(name, substitute) {
            var state = getMutableState(this);
            state.substitute[name] = substitute;
        }
    }, {
        key: 'removeModuleSubstitution',
        value: function removeModuleSubstitution(name) {
            var state = getMutableState(this);
            delete state.substitute[name];
        }
    }, {
        key: 'lock',
        value: function lock() {
            var _this = this;

            var state = stateMap.get(this);
            state.locked = true;

            return {
                unlock: function unlock() {
                    var state = stateMap.get(_this);
                    state.locked = false;
                }
            };
        }
    }, {
        key: 'enforcementLevel',
        get: function get() {
            var state = stateMap.get(this);
            return state.enforcementLevel;
        },
        set: function set(value) {
            var state = getMutableState(this);
            state.enforcementLevel = value;
        }
    }, {
        key: 'whitelist',
        get: function get() {
            var state = stateMap.get(this);
            return state.whitelist.slice(0);
        }
    }, {
        key: 'blacklist',
        get: function get() {
            var state = stateMap.get(this);
            return state.blacklist.slice(0);
        }
    }, {
        key: 'substitutions',
        get: function get() {
            var state = stateMap.get(this);
            return Object.assign({}, state.substitute);
        }
    }]);

    return ModuleCop;
}();

var cop = new ModuleCop();

function isModuleReference(name) {
    return typeof name === 'string' && !name.match(/^\.|^[a-zA-Z]:|[/\\]/);
}

function isRequestedByWhitelistedModule(request) {
    var result = false;
    var name = request.name;
    while (!result && request) {
        if (isModuleReference(name) && cop.whitelist.includes(name)) {
            result = true;
        }

        request = request.parent;
    }

    return result;
}

//Don't assign it here, because we need to ensure that the methods are
//overridden before cloning.
var moduleClone = null;
var moduleStack = [];
Module._load = function (request, parent, isMain) {
    var isModuleRequest = isModuleReference(request);
    switch (cop.enforcementLevel) {
        case EnforcementLevel.WHITELIST_ONLY:
            var chain = [];
            var curr = parent;
            while (curr) {
                if (curr.request) {
                    chain.push(curr.request);
                }
                curr = curr.parent;
            }
            console.log('Requested: ' + request);
            console.log('Load chain: ' + JSON.stringify(chain));
            console.log('White list: ' + JSON.stringify(cop.whitelist));
            if (isModuleRequest && !cop.whitelist.includes(request) && intersect(cop.whitelist, chain).length < 1) {
                throw new Error('The loading of the module was prevented due to security restrictions');
            }
            break;
        case EnforcementLevel.BLACKLIST_ONLY:
            if (isModuleRequest && cop.blacklist.includes(request)) {
                throw new Error('The loading of the module was prevented due to security restrictions');
            }
            break;
        case EnforcementLevel.WHITELIST_PRECEDENCE:
            {
                var isParentWhitelisted = void 0;
                if (isModuleRequest && cop.blacklist.includes(request) && !isRequestedByWhitelistedModule(request)) {
                    throw new Error('The loading of the module was prevented due to security restrictions');
                }
                break;
            }

    }

    var substitutions = cop.substitutions;
    if (isModuleRequest && cop.substitutions.hasOwnProperty(request)) {
        return substitutions[request];
    }

    moduleClone = moduleClone || Object.assign(Object.create(Module.prototype), Module);

    if ('module' === request) {
        if (cop.whitelist.includes(request)) {
            return originalModule;
        } else {
            return moduleClone;
        }
    }

    return originalModule._load.apply(this, [request, parent, isMain]);
};

var require_caller = null;
// instrument Module._resolveFilename
// https://github.com/nodejs/node/blob/master/lib/module.js#L322
//
// `arguments` would conflict with Babel, therefore `...parameters`
//
// const native_module = require('native_module')
Module._resolveFilename = function () {
    for (var _len = arguments.length, parameters = Array(_len), _key = 0; _key < _len; _key++) {
        parameters[_key] = arguments[_key];
    }

    var request = parameters[0];
    var parent = parameters[1];

    //console.log('Filename: ' + request);

    // take note of the require() caller
    // (the module in which this require() call originated)
    require_caller = parent;

    var result = originalModule._resolveFilename.apply(this, parameters);
    if (isModuleReference(request)) {
        moduleStack.push({ name: request, dirname: path.dirname(result), filename: path.basename(result) });
    }

    var isWhitelisted = false;
    for (var i = moduleStack.length - 1; i >= 0; i--) {
        var module = moduleStack[i];
        if (result.startsWith(module.dirname)) {
            isWhitelisted = true;
            moduleStack = moduleStack.slice(0, i);
            break;
        }
    }

    if (cop.enforcementLevel == EnforcementLevel.WHITELIST_ONLY && !isWhitelisted) {
        throw new Error('Attempted to load file not part of a whitelisted module. File path: ' + result);
    }

    return result;
};

// instrument Module._findPath
// https://github.com/nodejs/node/blob/master/lib/module.js#L335-L341
//
// `arguments` would conflict with Babel, therefore `...parameters`
//
Module._findPath = function () {
    for (var _len2 = arguments.length, parameters = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        parameters[_key2] = arguments[_key2];
    }

    var request = parameters[0];
    // const paths = parameters[1]

    // preceeding resolvers
    console.log('Request: ' + request);
    // if (require_hacker.global_hooks_enabled)
    // {
    // 	for (let resolver of require_hacker.preceding_path_resolvers)
    // 	{
    // 		const resolved_path = resolver(request, require_caller)
    // 		if (exists(resolved_path))
    // 		{
    // 			return resolved_path
    // 		}
    // 	}
    // }

    // original Node.js loader
    var filename = originalModule._findPath.apply(undefined, parameters);
    if (filename !== false) {
        return filename;
    }

    // rest resolvers
    // if (require_hacker.global_hooks_enabled)
    // {
    // 	for (let resolver of require_hacker.path_resolvers)
    // 	{
    // 		const resolved = resolver.resolve(request, require_caller)
    // 		if (exists(resolved))
    // 		{
    // 			return resolved
    // 		}
    // 	}
    // }

    return false;
};

exports.EnforcementLevel = EnforcementLevel;
exports.default = cop;
//# sourceMappingURL=index.js.map