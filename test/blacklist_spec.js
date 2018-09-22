const Module = require('module');
const moduleCop = require('../index');
const cop = moduleCop.default;
const EnforcementLevel = moduleCop.EnforcementLevel;

describe('Module cop', function(){
    it('should prevent loading any non-whitelisted module in WHITELIST_ONLY modes', function(){
        cop.enforcementLevel = EnforcementLevel.WHITELIST_ONLY;
        cop.addToWhitelist('exit');

        let errorThrown = false;
        try{
            require('exit');
        }catch(err){
            errorThrown = true;
        }

        expect(errorThrown).toBe(false);
        try{
            require('console');
        }catch(err){
            errorThrown = true;
        }

        cop.removeFromWhitelist('exit');
        expect(errorThrown).toBe(true);
    }),
    it('should prevent modification when locked', function(){
        cop.addToBlacklist('jshint');
        let lock = cop.lock();
        
        let errorThrown = false;
        try{
            cop.addToBlacklist('console');
        }catch(err){
            errorThrown = true;
        }
        lock.unlock();
        cop.removeFromBlacklist('jshint');
        expect(errorThrown).toBe(true);
    }),
    it('should prevent loading of a blacklisted module in WHITELIST_PRECEDENCE mode', function(){
        cop.enforcementLevel = EnforcementLevel.WHITELIST_PRECEDENCE;

        let jshint = require('jshint');
        expect(jshint).not.toBe(null);


        cop.addToBlacklist('jshint');
        let errorThrown = false;
        try{
            require('jshint');
        }catch(err){
            errorThrown = true;
        }
        cop.removeFromBlacklist('jshint');
        expect(errorThrown).toEqual(true);

        cop.addToBlacklist('module');
        errorThrown = false;
        try{
            require('module');
        }catch(err){
            errorThrown = true;
        }
        cop.removeFromBlacklist('module');
        expect(errorThrown).toEqual(true);


        cop.addToBlacklist('console');
        errorThrown = false;
        try{
            require('console');
        }catch(err){
            errorThrown = true;
        }
        cop.removeFromBlacklist('console');
        expect(errorThrown).toEqual(true);
    });

    it('should return a cloned version of Module rather than the real one', function(){

    });
    it('should return the specified object as a substitute', function(){
        let fakeJsHint = {
            this: 'is a test object'
        };
        cop.removeFromBlacklist('jshint');
        cop.addModuleSubstitution('jshint', fakeJsHint);
        let jsHint = require('jshint');
        cop.removeModuleSubstitution('jshint');
        expect(jsHint).toEqual(fakeJsHint);

    });
});
