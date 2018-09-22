debugger;
const Module = require('module');
const path = require('path');

const stateMap = new WeakMap();
function getMutableState(obj){
    let state = stateMap.get(obj);
    if(state.locked){
        throw new Exception('Module Cop has been locked, no further modifications are allowed');
    }
    return state;
}

if (!Module._load)
{
	throw new Error('This version of Node JS is not supported. Unable to locate Module._load.');
}

if (!Module._resolveFilename)
{
	throw new Error('This version of Node JS is not supported. Unable to locate Module.resolveFilename.');
}

if (!Module._findPath)
{
	throw new Error('This version of Node JS is not supported. Unable to locate Module._findPath.')
}

const originalModulePrototype = Object.assign(Object.create(Module.prototype.prototype || Object), Module.prototype);
const originalModule = Object.assign(Object.create(originalModulePrototype), Module);

const originalLoad = Module._load;
const originalPrototypeLoad = Module.prototype.load;
const originalResolveFilename = Module._resolveFilename;
const originalFindPath = Module._findPath

function intersect(a, b) {
    var t;
    if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) {
        return b.indexOf(e) > -1;
    });
}

const EnforcementLevel = Object.freeze({
    WHITELIST_ONLY: 0,
    BLACKLIST_ONLY: 1,
    WHITELIST_PRECEDENCE: 2,
    WHITELIST_PRECEDENCE_INDIRECT: 3
});

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

    lock (){
        let state = stateMap.get(this);
        state.locked = true;

        return {
            unlock: () => {
                let state = stateMap.get(this);
                state.locked = false;
            }
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

let cop = new ModuleCop();

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

//Don't assign it here, because we need to ensure that the methods are
//overridden before cloning.
let moduleClone = null;
let moduleStack = [];
Module._load = function(request, parent, isMain){
    let isModuleRequest = isModuleReference(request);
    switch(cop.enforcementLevel){
        case EnforcementLevel.WHITELIST_ONLY:
            let chain = [];
            let curr = parent;
            while(curr){
                if(curr.request){
                    chain.push(curr.request);
                }
                curr = curr.parent;
            }
            console.log('Requested: ' + request);
            console.log('Load chain: ' + JSON.stringify(chain));
            console.log('White list: ' + JSON.stringify(cop.whitelist));
            if(isModuleRequest && !cop.whitelist.includes(request) && intersect(cop.whitelist, chain).length < 1){
                throw new Error('The loading of module "' + request + '" was prevented due to security restrictions');
            }
            break; 
        case EnforcementLevel.BLACKLIST_ONLY:
            if(isModuleRequest && cop.blacklist.includes(request)){
                throw new Error('The loading of module "' + request + '" was prevented due to security restrictions');
            }
            break;
        case EnforcementLevel.WHITELIST_PRECEDENCE: {
            if(isModuleRequest && cop.blacklist.includes(request) && !isRequestedByWhitelistedModule(request)){
                throw new Error('The loading of module "' + request + '" was prevented due to security restrictions');
            }
            break;
        }


    }


    let substitutions = cop.substitutions;
    if(isModuleRequest && cop.substitutions.hasOwnProperty(request)){
        return substitutions[request];
    }

    moduleClone = moduleClone || Object.assign(Object.create(Module.prototype), Module);

    if('module' === request)
    {
        if(cop.whitelist.includes(request)){
            return originalModule;
        }else{
            return moduleClone
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
Module._resolveFilename = function(...parameters)
{
	const request = parameters[0];
	const parent = parameters[1];

    //console.log('Filename: ' + request);

	// take note of the require() caller
	// (the module in which this require() call originated)
    require_caller = parent;

    let result = originalModule._resolveFilename.apply(this, parameters);
    if(isModuleReference(request)){
        moduleStack.push({name: request, dirname: path.dirname(result), filename: path.basename(result)});
    }

    let isWhitelisted = false;
    let parentIndex = -1;
    for(let i = moduleStack.length - 1; i >= 0; i--){
        let module = moduleStack[i];
        if(result.startsWith(module.dirname)){
            isWhitelisted = true;
            moduleStack = moduleStack.slice(0, i);
            break;
        }

        if(parentIndex === -1 && parent.startsWith(module.dirname)){
            parentFound = true;
            parentIndex = i;
        }
    }

    //The requested file was not part of an allowed module, but the parent was, so update the module load stack
    if(!isWhitelisted && parentIndex >= 0){
        moduleStack = moduleStack.slice(0, parentIndex);
    }

     
    if(cop.enforcementLevel == EnforcementLevel.WHITELIST_ONLY && !isWhitelisted){
        throw new Error('Attempted to load file not part of a whitelisted module. File path: ' + result);
    }

    return result;
};

// instrument Module._findPath
// https://github.com/nodejs/node/blob/master/lib/module.js#L335-L341
//
// `arguments` would conflict with Babel, therefore `...parameters`
//
Module._findPath = (...parameters) =>
{
	const request = parameters[0];
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
	const filename = originalModule._findPath.apply(undefined, parameters);
	if (filename !== false)
	{
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

	return false
};

export {EnforcementLevel};
export default cop;