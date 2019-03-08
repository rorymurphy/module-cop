const Module = require('module');
const path = require('path');

const functionApplyMethod = Function.prototype.apply;

let proxyInstanceMethod = (func) => {
    return (that, ...rest) => {
        let tempApply = Function.prototype.apply;
        Function.prototype.apply = functionApplyMethod;
        let result = func.apply(that, rest);
        Function.prototype.apply = tempApply;
        return result;
    }
};

const arraySlice = proxyInstanceMethod(Array.prototype.slice);
const arraySplice = proxyInstanceMethod(Array.prototype.splice);
const arrayForEach = proxyInstanceMethod(Array.prototype.forEach);
var objectHasOwnProperty = proxyInstanceMethod(Object.hasOwnProperty);

const objectAssign = Object.assign;

const globals = require('./globals');

const EnforcementLevel = Object.freeze({
    WHITELIST_ONLY: 0,
    BLACKLIST_ONLY: 1,
    WHITELIST_PRECEDENCE: 2,
    WHITELIST_PRECEDENCE_INDIRECT: 3
});

const stateMap = new WeakMap();
function getMutableState(obj){
    let state = stateMap.get(obj);
    if(state.locked){
        throw new Error('Module Cop has been locked, no further modifications are allowed');
    }
    return state;
}

class ModuleCop {
    constructor() {
        let state = {
            locked: false,
            enforcementLevel: EnforcementLevel.BLACKLIST_ONLY,
            protectGlobals: true,
            blacklist: [],
            whitelist: [],
            substitute: {}
        };

        stateMap.set(this, state);
    }

    addToBlacklist(name){
        let state = getMutableState(this);
        state.blacklist.push(name);
    }

    removeFromBlacklist(name){
        let state = getMutableState(this);
        let index = state.blacklist.indexOf(name);
        if(index >= 0){
            arraySplice(state.blacklist, index, 1);
        }
    }

    addToWhitelist(name){
        let state = getMutableState(this);
        state.whitelist.push(name);
    }

    removeFromWhitelist(name){
        let state = getMutableState(this);
        let index = state.whitelist.indexOf(name);
        if(index >= 0){
            arraySplice(state.whitelist, index, 1);
        }
    }

    addModuleSubstitution(name, substitute){
        let state = getMutableState(this);
        state.substitute[name] = substitute;
    }

    removeModuleSubstitution(name){
        let state = getMutableState(this);
        delete state.substitute[name];
    }

    enforce (callback){
        let state = stateMap.get(this);
        state.locked = true;

        let enforcer = new Enforcer(this);
        try{
            enforcer.enforce(callback);
        } finally {
            state.locked = false;
        }
    }

    get enforcementLevel(){
        let state = stateMap.get(this);
        return state.enforcementLevel;
    }
    set enforcementLevel(value){
        let state = getMutableState(this);
        state.enforcementLevel = value;
    }

    get protectGlobals(){
        let state = stateMap.get(this);
        return state.protectGlobals;
    }

    set protectGlobals(value){
        let state = getMutableState(this);
        state.protectGlobals = value;
    }

    get whitelist() {
        let state = stateMap.get(this);
        return arraySlice(state.whitelist, 0);
    }

    get blacklist() {
        let state = stateMap.get(this);
        return arraySlice(state.blacklist, 0);
    }

    get substitutions(){
        let state = stateMap.get(this);
        return Object.assign({}, state.substitute);
    }
}

class Enforcer {

    constructor(cop){
        this.moduleStack = [];
        this.cop = cop;
    }

    enforce(callback){
        this.originalModulePrototype = Object.assign(Object.create(Module.prototype.prototype || Object), Module.prototype);
        this.originalModule = Object.assign(Object.create(this.originalModulePrototype), Module);
        
        this.originalLoad = Module._load;
        this.originalPrototypeLoad = Module.prototype.load;
        this.originalResolveFilename = Module._resolveFilename;
        this.originalFindPath = Module._findPath;

        Module._load = this.moduleLoad.bind(this);
        Module._resolveFilename = this.resolveFilename.bind(this);
        Module._findPath = this.findPath.bind(this);

        this.moduleClone = Object.assign(Object.create(Module.prototype), Module);
        let globalState = null;
        if(this.cop.protectGlobals){
            globalState = this.captureGlobalState();
        }
        callback();
        if(this.cop.protectGlobals){
            this.restoreGlobalState(globalState);
        }

        this.moduleClone = null;
        Module._load = this.originalLoad;
        Module._resolveFilename = this.originalResolveFilename;
        Module._findPath = this.originalFindPath;
    }

    captureGlobalState(){
        let state = {};
        
        state.global = global;
        globals.fundamentalValues.forEach((name) => {
            state[name] = global[name];
        });

        globals.globalFunctions.forEach((name) => {
            state[name] = global[name];
        });

        globals.globalObjects.forEach((name) => {
            let g = global[name];
            if(g){
                let clone = {};
                if(g.prototype){
                    clone.prototype = {}
                    arrayForEach(Object.getOwnPropertyNames(g.prototype), (key) => {
                        let clonedDescriptor = objectAssign({}, Object.getOwnPropertyDescriptor(g.prototype, key));
                        Object.defineProperty(clone.prototype, key, clonedDescriptor);
                    });
                    //Object.defineProperties(clone.prototype, Object.getOwnPropertyDescriptors(g.prototype));
                }

                arrayForEach(Object.getOwnPropertyNames(g), (key) => {
                    if(key === 'prototype'){return;}
                    let clonedDescriptor = objectAssign({}, Object.getOwnPropertyDescriptor(g, key));
                    Object.defineProperty(clone, key, clonedDescriptor);
                });
                clone.__protoObject = g.prototype;
                state[name] = clone;
            }
        });

        return state;
    }

    restoreGlobalState(state){
        let global = state.global;

        arrayForEach(globals.fundamentalValues, (name) => {
            global[name] = state[name];
        });

        arrayForEach(globals.globalFunctions, (name) => {
            global[name] = state[name];
        });

        arrayForEach(globals.globalObjects, (name) => {
            if(!state[name]){
                delete global[name];
                return;
            }

            let gObj = global[name];
            let sObj = state[name];

            arrayForEach(Object.getOwnPropertyNames(gObj), (key) => {
                if(!objectHasOwnProperty(sObj, key)){
                    delete gObj[key];
                }
            });

            arrayForEach(Object.getOwnPropertyNames(sObj), (key) => {
                if(key == 'prototype' || key == '__protoObject'){return;}
                if(gObj[key] !== sObj[key] && !(isNaN(gObj[key]) && isNaN(sObj[key]))){
                    Object.defineProperty(gObj, Object.getOwnPropertyDescriptor(sObj, key));
                }
            });

            //Have to check first to account for some classes whose prorotypes are readonly (e.g. Object)
            if(global[name].prototype !== state[name].__protoObject){
                global[name].prototype = state[name].__protoObject;
            }

            if(state[name].__protoObject){
                arrayForEach(Object.getOwnPropertyNames(gObj.prototype), (key) => {
                    if(!objectHasOwnProperty(sObj.prototype, key)){
                        delete gObj.prototype[key];
                    }
                });

                arrayForEach(Object.getOwnPropertyNames(sObj.prototype), (key) => {
                    //Have to check first to account for readonly methods/properties, which will not have changed.
                    if(name == 'Function' && (key == 'arguments' || key == 'caller' || key == 'callee')){return;}
                        let gDesc = Object.getOwnPropertyDescriptor(gObj.prototype, key);
                        let sDesc = Object.getOwnPropertyDescriptor(sObj.prototype, key);
                        if(gDesc.value !== sDesc.value || gDesc.get !== sDesc.get || gDesc.set !== sDesc.set || gDesc.writable !== sDesc.writable
                            || gDesc.configurable !== sDesc.configurable || gDesc.enumerable !== sDesc.enumerable){
                                delete gObj.prototype[key];
                                Object.defineProperty(gObj.prototype, key, Object.getOwnPropertyDescriptor(sObj.prototype, key));                                
                            }
                        // if(gObj.prototype[key] !== sObj.prototype[key]){
                        //     delete gObj.prototype[key];
                        //     Object.defineProperty(gObj.prototype, Object.getOwnPropertyDescriptor(sObj.prototype, key));
                        // }
                });
            }
        });        
    }

    moduleLoad (request, parent, isMain){
        let isModuleRequest = isModuleReference(request);
        switch(this.cop.enforcementLevel){
            case EnforcementLevel.WHITELIST_ONLY:
                let chain = [];
                let curr = parent;
                while(curr){
                    if(curr.request){
                        chain.push(curr.request);
                    }
                    curr = curr.parent;
                }

                if(isModuleRequest && !this.cop.whitelist.includes(request) && intersect(this.cop.whitelist, chain).length < 1){
                    throw new Error('The loading of module "' + request + '" was prevented due to security restrictions');
                }
                break; 
            case EnforcementLevel.BLACKLIST_ONLY:
                if(isModuleRequest && this.cop.blacklist.includes(request)){
                    throw new Error('The loading of module "' + request + '" was prevented due to security restrictions');
                }
                break;
            case EnforcementLevel.WHITELIST_PRECEDENCE: {
                if(isModuleRequest && this.cop.blacklist.includes(request) && !isRequestedByWhitelistedModule(request)){
                    throw new Error('The loading of module "' + request + '" was prevented due to security restrictions');
                }
                break;
            }
        }

        if(isModuleRequest && this.cop.substitutions.hasOwnProperty(request)){
            return this.cop.substitutions[request];
        }
    
        if('module' === request)
        {
            if(this.cop.whitelist.includes(request)){
                return originalModule;
            }else{
                return this.moduleClone
            }
        }
    
        return this.originalModule._load.apply(this.originalModule, [request, parent, isMain]);
    }

    resolveFilename(...parameters) {
        const request = parameters[0];
        const parent = parameters[1];

        // take note of the require() caller
        // (the module in which this require() call originated)
        this.require_caller = parent;

        let result = this.originalModule._resolveFilename.apply(this.originalModule, parameters);
        if(isModuleReference(request)){
            //Special case where the module is a NodeJS built-in
            if(isModuleReference(result)){
                return result;
            }
            this.moduleStack.push({name: request, dirname: path.dirname(result), filename: path.basename(result)});
        }

        let isWhitelisted = false;
        let parentIndex = -1;
        for(let i = this.moduleStack.length - 1; i >= 0; i--){
            let module = this.moduleStack[i];
            if(result.startsWith(module.dirname)){
                isWhitelisted = true;
                this.moduleStack = arraySlice(this.moduleStack, 0, i);
                break;
            }

            if(parentIndex === -1 && parent.filename.startsWith(module.dirname)){
                parentIndex = i;
            }
        }

        //The requested file was not part of an allowed module, but the parent was, so update the module load stack
        if(!isWhitelisted && parentIndex >= 0){
            this.moduleStack = arraySlice(this.moduleStack, 0, parentIndex);
        }

        if(this.cop.enforcementLevel == EnforcementLevel.WHITELIST_ONLY && !isWhitelisted){
            throw new Error('Attempted to load file not part of a whitelisted module. File path: ' + result);
        }

        return result;
    }

    findPath (...parameters){
        const request = parameters[0];

        // call the original loader
        const filename = this.originalModule._findPath.apply(undefined, parameters);
        if (filename !== false)
        {
            return filename;
        }

        return false
    }
}

function intersect(a, b) {
    var t;
    if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) {
        return b.indexOf(e) > -1;
    });
}

function isModuleReference(name){
    return (typeof name === 'string' && !name.match(/^\.|^[a-zA-Z]:|[/\\]/));
}

function isRequestedByWhitelistedModule(request){
    let result = false;
    let name = request.name;
    while(!result && request){
        if(isModuleReference(name) && cop.whitelist.includes(name)){
            result = true;
        }

        request = request.parent;
    }

    return result;
}

export {ModuleCop, EnforcementLevel};