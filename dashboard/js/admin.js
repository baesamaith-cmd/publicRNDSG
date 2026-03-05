// admin.js - Admin Dashboard Logic
(function() {
    'use strict';
    
    let charts = {};
    
    // Initialize
    async function init() {
        // Check admin
        const isAdmin = await window.isAdmin();
        if (!isAdmin) {
            alert('Access denied. Admin only.');
            window.location.href = 'index.html';
            return;
        }
        
        // Load data
        await loadUserOverview();
        await loadLoginChart();
        await loadSearchAnalytics();
        await loadFilterUsage();
        await loadOrgBreakdown();
        
        // Auto-refresh every 5 minutes
        setInterval(refreshData, 5 * 60 * 1000);
    }
    
    // Refresh all data
    window.refreshData = async function() {
        await loadUserOverview();
        await loadLoginChart();
        await loadSearchAnalytics();
        await loadFilterUsage();
        await loadOrgBreakdown();
    };
    
    // Load user overview
    async function loadUserOverview() {
        try {
            // Get all users
            const { data: users, error } = await window.supabaseClient
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // Get event counts per user
            const { data: eventCounts } = await window.supabaseClient
                .from('events')
                .select('user_id');
            
            const countsMap = {};
            eventCounts.forEach(e => {
                countsMap[e.user_id] = (countsMap[e.user_id] || 0) + 1;
            });
            
            // Calculate stats
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            const newThisWeek = users.filter(u => new Date(u.created_at) >= weekAgo).length;
            const activeToday = users.filter(u => u.last_login_at && new Date(u.last_login_at) >= todayStart).length;
            
            // Update DOM
            document.getElementById('totalUsers').textContent = users.length;
            document.getElementById('newThisWeek').textContent = newThisWeek;
            document.getElementById('activeToday').textContent = activeToday;
            document.getElementById('totalEvents').textContent = eventCounts.length;
            
            // Render table
            const tbody = document.getElementById('usersTableBody');
            tbody.innerHTML = users.map(u => `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                    <td class="px-4 py-2">${escapeHtml(u.name || '-')}</td>
                    <td class="px-4 py-2">${escapeHtml(u.email)}</td>
                    <td class="px-4 py-2">${escapeHtml(u.organization || '-')}</td>
                    <td class="px-4 py-2">${escapeHtml(u.department || '-')}</td>
                    <td class="px-4 py-2">${u.last_login_at ? formatDate(u.last_login_at) : '-'}</td>
                    <td class="px-4 py-2">${countsMap[u.id] || 0}</td>
                </tr>
            `).join('');
            
        } catch (e) {
            console.error('Error loading user overview:', e);
        }
    }
    
    // Load login frequency chart
    async function loadLoginChart() {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            
            const { data: events } = await window.supabaseClient
                .from('events')
                .select('created_at, user_id')
                .eq('event_type', 'page_view')
                .gte('created_at', thirtyDaysAgo);
            
            // Group by date
            const dateCounts = {};
            events.forEach(e => {
                const date = new Date(e.created_at).toISOString().split('T')[0];
                dateCounts[date] = (dateCounts[date] || 0) + 1;
            });
            
            // Generate last 30 days
            const labels = [];
            const data = [];
            for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                labels.push(dateStr);
                data.push(dateCounts[dateStr] || 0);
            }
            
            renderChart('loginChart', 'line', {
                labels,
                datasets: [{
                    label: 'Page Views',
                    data,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            });
            
        } catch (e) {
            console.error('Error loading login chart:', e);
        }
    }
    
    // Load search analytics
    async function loadSearchAnalytics() {
        try {
            // Get search events
            const { data: searchEvents } = await window.supabaseClient
                .from('events')
                .select('payload')
                .eq('event_type', 'search');
            
            // Extract queries
            const queryCounts = {};
            searchEvents.forEach(e => {
                const query = e.payload?.query || '(empty)';
                queryCounts[query] = (queryCounts[query] || 0) + 1;
            });
            
            // Sort and get top 20
            const topQueries = Object.entries(queryCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20);
            
            // Render top queries
            document.getElementById('topQueries').innerHTML = topQueries.map(([query, count]) => `
                <div class="flex justify-between items-center text-sm py-1 border-b border-slate-100">
                    <span class="truncate max-w-xs">${escapeHtml(query)}</span>
                    <span class="text-indigo-600 font-semibold">${count}</span>
                </div>
            `).join('');
            
            // Search volume chart (by day)
            const dateCounts = {};
            searchEvents.forEach(e => {
                const date = new Date(e.created_at).toISOString().split('T')[0];
                dateCounts[date] = (dateCounts[date] || 0) + 1;
            });
            
            const labels = [];
            const data = [];
            for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                labels.push(dateStr);
                data.push(dateCounts[dateStr] || 0);
            }
            
            renderChart('searchVolumeChart', 'bar', {
                labels,
                datasets: [{
                    label: 'Searches',
                    data,
                    backgroundColor: '#8b5cf6'
                }]
            });
            
        } catch (e) {
            console.error('Error loading search analytics:', e);
        }
    }
    
    // Load filter usage
    async function loadFilterUsage() {
        try {
            const { data: filterEvents } = await window.supabaseClient
                .from('events')
                .select('payload')
                .eq('event_type', 'search');
            
            // Extract institutions
            const instCounts = {};
            filterEvents.forEach(e => {
                const insts = e.payload?.filters?.institutions || [];
                insts.forEach(i => {
                    instCounts[i] = (instCounts[i] || 0) + 1;
                });
            });
            
            const topInsts = Object.entries(instCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            renderChart('institutionsChart', 'bar', {
                labels: topInsts.map(i => i[0].substring(0, 20)),
                datasets: [{
                    label: 'Filter Count',
                    data: topInsts.map(i => i[1]),
                    backgroundColor: '#06b6d4'
                }],
                indexAxis: 'y'
            });
            
            // Status counts
            const statusCounts = {};
            filterEvents.forEach(e => {
                const statuses = e.payload?.filters?.statuses || [];
                statuses.forEach(s => {
                    statusCounts[s] = (statusCounts[s] || 0) + 1;
                });
            });
            
            renderChart('statusChart', 'doughnut', {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444']
                }]
            });
            
        } catch (e) {
            console.error('Error loading filter usage:', e);
        }
    }
    
    // Load organization breakdown
    async function loadOrgBreakdown() {
        try {
            const { data: users } = await window.supabaseClient
                .from('users')
                .select('organization');
            
            const { data: events } = await window.supabaseClient
                .from('events')
                .select('user_id');
            
            // Users per org
            const orgUserCounts = {};
            users.forEach(u => {
                const org = u.organization || 'Unknown';
                orgUserCounts[org] = (orgUserCounts[org] || 0) + 1;
            });
            
            const topOrgs = Object.entries(orgUserCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            renderChart('orgUsersChart', 'bar', {
                labels: topOrgs.map(o => o[0].substring(0, 15)),
                datasets: [{
                    label: 'Users',
                    data: topOrgs.map(o => o[1]),
                    backgroundColor: '#f59e0b'
                }],
                indexAxis: 'y'
            });
            
            // Events per org (join needed - simplified approximation)
            const userOrgMap = {};
            users.forEach(u => {
                userOrgMap[u.id] = u.organization || 'Unknown';
            });
            
            const orgEventCounts = {};
            events.forEach(e => {
                const org = userOrgMap[e.user_id] || 'Unknown';
                orgEventCounts[org] = (orgEventCounts[org] || 0) + 1;
            });
            
            const topOrgEvents = Object.entries(orgEventCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            renderChart('orgEventsChart', 'bar', {
                labels: topOrgEvents.map(o => o[0].substring(0, 15)),
                datasets: [{
                    label: 'Events',
                    data: topOrgEvents.map(o => o[1]),
                    backgroundColor: '#ec4899'
                }],
                indexAxis: 'y'
            });
            
        } catch (e) {
            console.error('Error loading org breakdown:', e);
        }
    }
    
    // Helper: Render chart
    function renderChart(canvasId, type, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        if (charts[canvasId]) {
            charts[canvasId].destroy();
        }
        
        charts[canvasId] = new Chart(ctx, {
            type,
            data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
    
    // Helper: Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Helper: Format date
    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    
    // Start
    init();
    
})();
