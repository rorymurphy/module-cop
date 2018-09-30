const Module = require('module');
const path = require('path');

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
            state.blacklist.splice(index, 1);
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
            state.whitelist.splice(index, 1);
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

    get whitelist() {
        let state = stateMap.get(this);
        return state.whitelist.slice(0);
    }

    get blacklist() {
        let state = stateMap.get(this);
        return state.blacklist.slice(0);
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

        callback();

        this.moduleClone = null;
        Module._load = this.originalLoad;
        Module._resolveFilename = this.originalResolveFilename;
        Module._findPath = this.originalFindPath;
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
                this.moduleStack = this.moduleStack.slice(0, i);
                break;
            }

            if(parentIndex === -1 && parent.filename.startsWith(module.dirname)){
                parentIndex = i;
            }
        }

        //The requested file was not part of an allowed module, but the parent was, so update the module load stack
        if(!isWhitelisted && parentIndex >= 0){
            this.moduleStack = this.moduleStack.slice(0, parentIndex);
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