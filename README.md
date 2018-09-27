Node Module Cop
==========

**Project Url:** https://github.com/rorymurphy/module-cop

## About

When building an application that allows any code to be executed that comes from an untrusted source (e.g. a plugin, or user code submitted by a user),
it becomes a difficult problem to limit the set of things that the untrusted code can do. Luckily, to do almost anything in JavaScript a module must be
loaded via _require_ statement. Node Module Cop takes advantage of this to enable code sandboxing by controlling which modules it is allowed to load. The set of modules permissible to load can be controlled through whitelist/blacklist and, additionally, substitutions can be specified to return an alternate object when a given module is required.

## vs. Other Solutions

The distinguishing factor of Node Module Cop is its unobtrusiveness. Where other solutions are implemented in ways that make them incompatible with other
plugins that hook into the Module loading system, Node Module Cop maintains compatibility.

## Usage

Using Node Module Cop is a breeze - simply create your cop, configure the whitelist and/or blacklist, and call enforce passing in the code block you want sandboxed.

```
import {ModuleCop, EnforcementLevel} from 'module-cop';

var cop = new ModuleCop();
cop.enforcementLevel = EnforcementLevel.WHITELIST_ONLY;
cop.addToWhitelist('events');
cop.enforce( () => require('untrusted.js'));
```

## Properties

| Name | Type | Description |
| ---- | ---- | ----------- |
| enforcementLevel | int (enumerated by EnforcementLevel) | Determines the method of enforcement: |
| | | WHITELIST_ONLY: Strictly limits module loading to those specified in the whitelist, ignoring the blacklist |
| | | BLACKLIST_ONLY: Allows loading of any module except those specified on the blacklist, ignoring the whitelist |
| | | WHITELIST_PRECEDENCE: Blocks all modules on the blacklist, unless referenced by a whitelisted module. This is useful when you want to permit a module that internally requires access to a lower-level sensitive module (e.g. the 'fs' module). |
| whitelist | Array of strings | A read-only view into the current items on the whitelist |
| blacklist | Array of strings | A read-only view into the current items on the blacklist |
| substitutions | Object | A read-only key-value map representing any module substitutions |

## Methods

| Name | Arguments | Description |
| ---- | --------- | ----------- |
| addToBlacklist | moduleName | Adds a module to the blacklist. |
| removeFromBlacklist | moduleName | Removes a module from the blacklist. |
| addToWhitelist | moduleName | Adds a module to the whitelist |
| removeFromWhitelist | moduleName | Removes a module from the whitelist |
| addModuleSubstitution | moduleName, substitute | Adds a module to the set of substitutions |
| removeModuleSubstitution | moduleName | Removes a module from the set of substitutions |
| enforce | callback | Enforces the rules defined for the Module Cop instance for the block of code passed in through the callback argument |