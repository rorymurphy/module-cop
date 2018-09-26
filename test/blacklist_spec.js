const mc = require('../index');
const ModuleCop = mc.ModuleCop;
const EnforcementLevel = mc.EnforcementLevel;
const Module = require('module');

const cop = new ModuleCop();

debugger;
describe('Module cop', function(){
    it('should prevent loading any non-whitelisted module in WHITELIST_ONLY modes', function(){
        cop.enforcementLevel = EnforcementLevel.WHITELIST_ONLY;
        cop.addToWhitelist('exit');

        cop.enforce( () => {
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
    

            expect(errorThrown).toBe(true);
        });

        cop.removeFromWhitelist('exit');
    }),
    it('should prevent modification when locked', function(){
        cop.addToBlacklist('jshint');
        cop.enforce(() => {
            let errorThrown = false;
            try{
                cop.addToBlacklist('console');
            }catch(err){
                errorThrown = true;
            }

            expect(errorThrown).toBe(true);
        });
        cop.removeFromBlacklist('jshint');        
    }),
    it('should prevent loading of a blacklisted module in WHITELIST_PRECEDENCE mode', function(){
        cop.enforcementLevel = EnforcementLevel.WHITELIST_PRECEDENCE;

        cop.enforce(() => {
            let jshint = require('jshint');
            expect(jshint).not.toBe(null);
        });



        cop.addToBlacklist('jshint');
        let errorThrown = false;
        cop.enforce(() => {
            try{
                require('jshint');
            }catch(err){
                errorThrown = true;
            }
        });

        cop.removeFromBlacklist('jshint');
        expect(errorThrown).toEqual(true);

        cop.addToBlacklist('module');
        errorThrown = false;
        cop.enforce(() => {
            try{
                require('module');
            }catch(err){
                errorThrown = true;
            }
        });
        cop.removeFromBlacklist('module');
        expect(errorThrown).toEqual(true);


        cop.addToBlacklist('console');
        errorThrown = false;
        cop.enforce(() => {
            try{
                require('console');
            }catch(err){
                errorThrown = true;
            }
        });        

        cop.removeFromBlacklist('console');
        expect(errorThrown).toEqual(true);
    });

    it('should return a cloned version of Module rather than the real one', function(){
        cop.enforce(() => {
            let mod = require('module');
            expect(mod).not.toEqual(Module);
            expect(intersect(Object.keys(mod), Object.keys(Module)).length).toEqual(Object.keys(Module).length);
        });
    });
    it('should return the specified object as a substitute', function(){
        let fakeJsHint = {
            this: 'is a test object'
        };
        cop.removeFromBlacklist('jshint');
        cop.addModuleSubstitution('jshint', fakeJsHint);
        cop.enforce(() => {
            let jsHint = require('jshint');
            expect(jsHint).toEqual(fakeJsHint);
        });
        cop.removeModuleSubstitution('jshint');
    });
});

function intersect(a, b) {
    var t;
    if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) {
        return b.indexOf(e) > -1;
    });
}
