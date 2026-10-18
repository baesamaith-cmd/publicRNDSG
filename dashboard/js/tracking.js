// Only consented, allowlisted aggregates leave this page.
(function () {
    'use strict';
    const measurementId = document.currentScript?.dataset.measurementId || '';
    const enabled = /^G-[A-Z0-9]+$/.test(measurementId) && location.hostname === 'techpartners.site';
    const consentKey = 'techpartners-analytics-consent-v1';
    const panel = document.getElementById('analytics-consent');
    const status = document.getElementById('analytics-status');
    let initialized = false;
    let active = false;

    function consent() {
        try { return localStorage.getItem(consentKey); } catch { return null; }
    }
    function page() {
        let referrer = '';
        try {
            const url = new URL(document.referrer);
            if (url.protocol === 'https:' || url.protocol === 'http:') referrer = url.origin;
        } catch { /* Empty or invalid referrer. */ }
        return { page_location: 'https://techpartners.site/dashboard/', page_title: 'Techpartners Dashboard', page_referrer: referrer };
    }
    function start() {
        active = enabled && consent() === 'granted';
        if (!enabled) return;
        window['ga-disable-' + measurementId] = !active;
        if (!active || initialized) return;
        initialized = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
        window.gtag('js', new Date());
        window.gtag('config', measurementId, { ...page(), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 60 * 60 * 24 * 30 });
        window.gtag('event', 'page_view', { ...page(), send_to: measurementId });
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
        script.onerror = function () { active = false; window['ga-disable-' + measurementId] = true; if (status) status.textContent = '통계 스크립트를 불러오지 못했습니다. 검색은 계속 사용할 수 있습니다.'; };
        document.head.appendChild(script);
    }
    function choose(value) {
        try { localStorage.setItem(consentKey, value); } catch { return; }
        start();
        if (panel) panel.hidden = true;
        if (status) status.textContent = active ? '방문 통계: 허용' : '방문 통계: 거절';
    }
    window.trackEvent = function (name, params) {
        if (!active || consent() !== 'granted' || name !== 'search_complete') return;
        if (!params || !['keyword', 'semantic'].includes(params.search_mode) || !Number.isInteger(params.result_count) || params.result_count < 0) return;
        const count = params.result_count;
        window.gtag('event', 'search_complete', { ...page(), send_to: measurementId, search_mode: params.search_mode, result_count_bucket: count === 0 ? '0' : count <= 10 ? '1-10' : count <= 50 ? '11-50' : '51+' });
    };
    if (!enabled) return;
    document.getElementById('analytics-allow')?.addEventListener('click', function () { choose('granted'); });
    document.getElementById('analytics-deny')?.addEventListener('click', function () { choose('denied'); });
    document.getElementById('analytics-settings')?.addEventListener('click', function () { if (panel) panel.hidden = false; });
    window.addEventListener('storage', function (event) {
        if (event.key !== consentKey) return;
        start();
        if (status) status.textContent = active ? '방문 통계: 허용' : '방문 통계: 거절';
    });
    if (panel) panel.hidden = consent() === 'granted' || consent() === 'denied';
    if (status) status.textContent = consent() === 'granted' ? '방문 통계: 허용' : consent() === 'denied' ? '방문 통계: 거절' : '방문 통계: 선택 전';
    start();
})();
