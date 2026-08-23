// tracking.js - Auth removed with login; kept as no-op so existing call sites don't break.
(function() {
    'use strict';

    window.trackEvent = async function(eventType) {
        if (window.console && console.debug) {
            console.debug('[tracking disabled]', eventType);
        }
    };

})();
