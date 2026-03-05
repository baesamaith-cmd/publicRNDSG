// tracking.js - Event tracking module
// Fire-and-forget event tracking to Supabase

(function() {
    'use strict';

    // Throttle map for rapid events
    var throttleMap = {};
    var THROTTLE_MS = 2000; // 2 seconds between same event type

    // Track event function
    window.trackEvent = async function(eventType, payload) {
        try {
            // Throttle: don't log more than 1 event per type per 2 seconds
            var now = Date.now();
            var lastTime = throttleMap[eventType] || 0;
            if (now - lastTime < THROTTLE_MS) {
                return; // Skip - too soon
            }
            throttleMap[eventType] = now;

            // Get current user
            var user = await window.getUser();
            if (!user) {
                return; // No user session, skip tracking
            }

            // Insert event
            await window.supabaseClient.from('events').insert({
                user_id: user.id,
                event_type: eventType,
                payload: payload || {}
            });

        } catch (e) {
            // Silently fail - tracking should never break the app
            console.warn('Tracking error:', e);
        }
    };

    console.log('Tracking module loaded');

})();
