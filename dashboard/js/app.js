// IGMS Awarded Projects Search Dashboard - Main Application

// Global State
let allProjects = [];
let filteredProjects = [];
let currentPage = 1;
const itemsPerPage = 10;

// Sort State
let currentSort = { field: 'date', order: 'desc' };

// UI Elements
let institutionSelect, piSelect;
let barChart, lineChart, pieChart;
let modalChart = null;

// Store original labels for bar chart click handling
let barChartOriginalLabels = [];

// Column mapping (short to full names)
const columnNames = {
    id: 'Project ID',
    title: 'Project Title',
    status: 'Status',
    pi: 'PI Name',
    inst: 'Host Institution',
    date: 'Start Date',
    dur: 'Duration',
    abs: 'Abstract',
    kw: 'Keywords',
    url: 'Detail URL'
};

// Institution abbreviation mapping
const institutionAbbreviations = {
    'National University of Singapore': 'NUS',
    'Nanyang Technological University': 'NTU',
    'Singapore Management University': 'SMU',
    'Singapore University of Technology and Design': 'SUTD',
    'Singapore Institute of Technology': 'SIT',
    'Singapore University of Social Sciences': 'SUSS',
    'Duke-NUS Medical School': 'Duke-NUS',
    'Singapore General Hospital': 'SGH',
    'National University Hospital (NUH)': 'NUH',
    'Tan Tock Seng Hospital': 'TTSH',
    'Changi General Hospital': 'CGH',
    'KK Women\'s & Children\'s Hospital': 'KKH',
    'National Heart Centre Singapore': 'NHCS',
    'National Cancer Centre Singapore': 'NCCS',
    'Singapore National Eye Centre': 'SNEC',
    'National Neuroscience Institute of Singapore Pte Ltd': 'NNI',
    'National Skin Centre': 'NSC',
    'National Dental Centre Singapore': 'NDCS',
    'Institute of Mental Health': 'IMH',
    'Khoo Teck Puat Hospital Pte Ltd': 'KTPH',
    'Sengkang General Hospital': 'SKH',
    'Ng Teng Fong General Hospital': 'NTFGH',
    'Alexandra Hospital': 'AH',
    'Alexandra Hospital (NUHS)': 'AH (NUHS)',
    'Singapore Health Services': 'SingHealth',
    'National Healthcare Group': 'NHG',
    'National University Health System': 'NUHS',
    'Singapore Eye Research Institute': 'SERI',
    'Singapore Clinical Research Institute': 'SCRI',
    'Geriatric Education and Research Institute': 'GERI',
    'Singapore Polytechnic': 'SP',
    'Nanyang Polytechnic': 'NYP',
    'Ngee Ann Polytechnic': 'NP',
    'Republic Polytechnic': 'RP',
    'Temasek Polytechnic': 'TP',
    'Temasek Life Sciences Laboratory': 'TLL',
    'Housing & Development Board': 'HDB'
};

// --- Helper Functions (Hoisted) ---

// Debounce Utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Get abbreviated institution name for chart display
function getInstitutionAbbr(fullName) {
    if (!fullName) return '';
    if (institutionAbbreviations[fullName]) {
        return institutionAbbreviations[fullName];
    }
    const match = fullName.match(/^([A-Z0-9]+)\s*-\s*(.+)$/);
    if (match) {
        return match[1];
    }
    return fullName;
}

// Parse date string to Date object
function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        const day = parseInt(parts[0]);
        const month = months[parts[1]] || 0;
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
    }
    return new Date(dateStr);
}

// --- Main Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    if (allProjects.length === 0) {
        initApp();
    }
});

// Initialize Application - called from auth.js after login
async function initApp() {
    await loadData();
    initializeUI();
    applyFilters();
}

// API Configuration
const API_URL = 'https://searchsgpartners.netlify.app/.netlify/functions/data';

// Load Data
async function loadData() {
    try {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            const response = await fetch('/dashboard/data/projects.json');
            allProjects = await response.json();
        } else {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            allProjects = await response.json();
        }

        allProjects.forEach(p => {
            p.dateObj = parseDate(p.date);
            p.durNum = parseInt(p.dur) || 0;
        });

        sortProjects('date', 'desc');

        window.allProjects = allProjects;
        if (window.initMatcher) {
            window.initMatcher(allProjects);
        }

        document.getElementById('loadingOverlay').classList.add('hidden');
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loadingOverlay').innerHTML = '<p>데이터 로딩 오류. 페이지를 새로고침 해주세요.</p>';
    }
}

// Initialize UI Components
function initializeUI() {
    initSelects();
    initStatusFilters();
    initDatePickers();
    initCharts(); // Initialize Charts specifically
    initEventListeners(); // Attach all listeners
    updateSortUI(currentSort.field, currentSort.order);
}

// Initialize Choices.js selects
function initSelects() {
    const institutions = [...new Set(allProjects.map(p => p.inst).filter(Boolean))].sort();
    const institutionOptions = institutions.map(i => ({ value: i, label: i }));

    institutionSelect = new Choices('#institutionSelect', {
        removeItemButton: true,
        placeholder: true,
        placeholderValue: '수행기관 선택...',
        searchPlaceholderValue: '기관명 검색...',
        choices: institutionOptions,
        shouldSort: false,
        allowHTML: true // Fix deprecation warning
    });

    const pis = [...new Set(allProjects.map(p => p.pi).filter(Boolean))].sort();
    const piOptions = pis.map(p => ({ value: p, label: p }));

    piSelect = new Choices('#piSelect', {
        removeItemButton: true,
        placeholder: true,
        placeholderValue: '과제책임자 선택...',
        searchPlaceholderValue: 'PI 검색...',
        choices: piOptions,
        shouldSort: false,
        allowHTML: true // Fix deprecation warning
    });
}

// Update PI Options
function updatePIOptions() {
    const selectedInstitutions = institutionSelect.getValue(true);
    const currentSelectedPIs = piSelect.getValue(true);

    let availablePIs;
    if (selectedInstitutions.length === 0) {
        availablePIs = [...new Set(allProjects.map(p => p.pi).filter(Boolean))].sort();
    } else {
        availablePIs = [...new Set(
            allProjects
                .filter(p => selectedInstitutions.includes(p.inst))
                .map(p => p.pi)
                .filter(Boolean)
        )].sort();
    }

    piSelect.clearStore();
    piSelect.setChoices(
        availablePIs.map(p => ({ value: p, label: p })),
        'value',
        'label',
        true
    );

    const validSelectedPIs = currentSelectedPIs.filter(pi => availablePIs.includes(pi));
    validSelectedPIs.forEach(pi => {
        piSelect.setChoiceByValue(pi);
    });
}

// Initialize Status Filters
function initStatusFilters() {
    const statuses = [...new Set(allProjects.map(p => p.status).filter(Boolean))].sort();
    const container = document.getElementById('statusFilters');
    container.innerHTML = ''; // Clear existing
    statuses.forEach(status => {
        const label = document.createElement('label');
        label.className = 'status-pill';
        label.innerHTML = `
            <input type="checkbox" value="${status}" checked>
            <span>${status}</span>
        `;
        container.appendChild(label);
    });
}

// Initialize Date Pickers
function initDatePickers() {
    flatpickr('#dateFrom', {
        dateFormat: 'Y-m-d',
        onChange: debounce(applyFilters, 300)
    });

    flatpickr('#dateTo', {
        dateFormat: 'Y-m-d',
        onChange: debounce(applyFilters, 300)
    });
}

// Initialize Charts
function initCharts() {
    const integerTicksConfig = {
        beginAtZero: true,
        ticks: {
            stepSize: 1,
            callback: function (value) {
                if (Number.isInteger(value)) {
                    return value;
                }
                return null;
            }
        }
    };

    const barCtx = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Projects', data: [], backgroundColor: '#2563eb' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: integerTicksConfig },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const originalLabel = barChartOriginalLabels[index];
                    if (originalLabel) {
                        filterByBarChart(originalLabel);
                    }
                }
            }
        }
    });

    const lineCtx = document.getElementById('lineChart').getContext('2d');
    lineChart = new Chart(lineCtx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Projects', data: [], borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: true, pointRadius: 5, pointHoverRadius: 8 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: integerTicksConfig },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const year = lineChart.data.labels[index];
                    if (year) {
                        filterByYear(year);
                    }
                }
            }
        }
    });

    const pieCtx = document.getElementById('pieChart').getContext('2d');
    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'] }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const status = pieChart.data.labels[index];
                    if (status) {
                        filterByStatus(status);
                    }
                }
            }
        }
    });

    // Chart Events - Click on container for modal
    document.querySelector('#barChart').closest('.chart-container').addEventListener('click', (e) => {
        const container = e.currentTarget;
        const title = container.querySelector('h3').textContent;
        // Check if NOT clicking on canvas (or if chart click didn't catch it)
        if (e.target.tagName !== 'CANVAS' || !barChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false).length) {
            if (e.target === container || e.target.tagName === 'H3' || e.target.tagName === 'CANVAS') {
                openChartModal('barChart', title);
            }
        }
    });

    // Line chart container
    document.querySelector('#lineChart').closest('.chart-container').addEventListener('click', (e) => {
        const container = e.currentTarget;
        const title = container.querySelector('h3').textContent;
        if (e.target.tagName !== 'CANVAS' || !lineChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false).length) {
            openChartModal('lineChart', title);
        }
    });

    // Pie chart container
    document.querySelector('#pieChart').closest('.chart-container').addEventListener('click', (e) => {
        const container = e.currentTarget;
        const title = container.querySelector('h3').textContent;
        if (e.target.tagName !== 'CANVAS' || !pieChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false).length) {
            openChartModal('pieChart', title);
        }
    });
}

// Initialize Event Listeners
function initEventListeners() {
    const debouncedApplyFilters = debounce(applyFilters, 300);

    // Select changes
    document.getElementById('institutionSelect').addEventListener('change', () => {
        updatePIOptions();
        applyFilters();
    });
    document.getElementById('piSelect').addEventListener('change', debouncedApplyFilters);

    // Keyword input
    document.getElementById('keywordInput').addEventListener('input', debounce(applyFilters, 500));

    // AI Toggle
    document.getElementById('aiSearchToggle').addEventListener('change', async (e) => {
        if (e.target.checked) {
            if (window.initAISearch) {
                const success = await window.initAISearch('dashboard');
                if (!success) {
                    e.target.checked = false;
                    alert('AI 모델 로드에 실패했습니다.');
                    return;
                }
                applyFilters();
            }
        } else {
            document.getElementById('aiProgress').classList.add('hidden');
            applyFilters();
        }
    });

    // Status checkboxes
    document.getElementById('statusFilters').addEventListener('change', applyFilters);

    // Duration inputs
    document.getElementById('durationMin').addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('durationMax').addEventListener('input', debounce(applyFilters, 300));

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetFilters);

    // Sort Dropdown
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        const [field, order] = e.target.value.split('-');
        sortProjects(field, order);
        renderCards();
    });

    // Modals
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById('chartModalClose').addEventListener('click', closeChartModal);
    document.getElementById('chartModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeChartModal();
    });

    document.getElementById('wordCloudModalClose').addEventListener('click', closeWordCloudModal);
    document.getElementById('wordCloudModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeWordCloudModal();
    });

    // Word Cloud Container
    document.getElementById('wordCloudContainer').addEventListener('click', (e) => {
        if (e.target.tagName !== 'text' && !e.target.closest('text')) {
            openWordCloudModal();
        }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeChartModal();
            closeWordCloudModal();
        }
    });
}

// Apply Filters
async function applyFilters() {
    const selectedInstitutions = institutionSelect.getValue(true);
    const selectedPIs = piSelect.getValue(true);
    const keywords = document.getElementById('keywordInput').value.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const selectedStatuses = [...document.querySelectorAll('#statusFilters input:checked')].map(cb => cb.value);
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const durationMin = parseInt(document.getElementById('durationMin').value) || 0;
    const durationMax = parseInt(document.getElementById('durationMax').value) || Infinity;

    // AI Search Check
    const isAIEnabled = document.getElementById('aiSearchToggle').checked;
    let semanticScores = {};

    if (isAIEnabled && keywords.length > 0) {
        const query = document.getElementById('keywordInput').value;
        if (window.searchSemantic) {
            const results = await window.searchSemantic(query, allProjects, allProjects.length, 'dashboard');
            results.filter(r => r.score > 0).forEach(r => semanticScores[r.id] = r.score);
        }
    }

    filteredProjects = allProjects.filter(p => {
        if (selectedInstitutions.length > 0 && !selectedInstitutions.includes(p.inst)) return false;
        if (selectedPIs.length > 0 && !selectedPIs.includes(p.pi)) return false;

        if (keywords.length > 0) {
            if (isAIEnabled && Object.keys(semanticScores).length > 0) {
                if (!semanticScores[p.id]) return false;
                p._aiScore = semanticScores[p.id];
            } else {
                const searchText = `${p.abs || ''} ${p.kw || ''} ${p.title || ''}`.toLowerCase();
                if (!keywords.every(kw => searchText.includes(kw))) return false;
            }
        }

        if (selectedStatuses.length > 0 && !selectedStatuses.includes(p.status)) return false;
        if (dateFrom && p.dateObj < new Date(dateFrom)) return false;
        if (dateTo && p.dateObj > new Date(dateTo)) return false;
        if (p.durNum < durationMin || p.durNum > durationMax) return false;

        return true;
    });

    if (isAIEnabled && keywords.length > 0) {
        filteredProjects.sort((a, b) => (b._aiScore || 0) - (a._aiScore || 0));
    } else {
        sortProjects('date', 'desc');
    }

    currentPage = 1;
    renderCards();
    // Track search/filter event
    window.trackEvent('search', { query: keywords.join(' '), ai_enabled: isAIEnabled, results_count: filteredProjects.length, filters: { institutions: selectedInstitutions, statuses: selectedStatuses, dateFrom, dateTo } });
    renderCards();
    updateCharts();
    updateResultsCount();

    // Update dashboard network graph
    if (typeof updateDashboardGraph === 'function') updateDashboardGraph(filteredProjects);
}

// Sort Projects
function sortProjects(field, order) {
    currentSort = { field, order };

    filteredProjects.sort((a, b) => {
        let valA, valB;
        if (field === 'date') {
            valA = a.dateObj;
            valB = b.dateObj;
        } else if (field === 'dur') {
            valA = a.durNum;
            valB = b.durNum;
        } else {
            valA = (a[field] || '').toLowerCase();
            valB = (b[field] || '').toLowerCase();
        }
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });

    // Also sort allProjects if it's the initial sort
    if (filteredProjects === allProjects || filteredProjects.length === allProjects.length) {
        allProjects.sort((a, b) => {
            // ... same logic for allProjects ...
            let valA, valB;
            if (field === 'date') {
                valA = a.dateObj;
                valB = b.dateObj;
            } else if (field === 'dur') {
                valA = a.durNum;
                valB = b.durNum;
            } else {
                valA = (a[field] || '').toLowerCase();
                valB = (b[field] || '').toLowerCase();
            }
            if (valA < valB) return order === 'asc' ? -1 : 1;
            if (valA > valB) return order === 'asc' ? 1 : -1;
            return 0;
        });
    }
}

// Update Sort UI
function updateSortUI(field, order) {
    const select = document.getElementById('sortSelect');
    if (select) {
        select.value = `${field}-${order}`;
    }
}

// Render Cards
function renderCards() {
    const grid = document.getElementById('resultsGrid');
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = filteredProjects.slice(start, end);

    grid.innerHTML = pageData.map(p => `
    <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-all cursor-pointer group flex flex-col h-full relative" data-id="${p.id}">
        <div class="flex justify-between items-start mb-3">
            <span class="status-badge ${getStatusClass(p.status)} text-xs">${p.status || ''}</span>
            <span class="text-xs text-slate-400 font-mono">#${p.id}</span>
        </div>
        
        <h3 class="text-slate-800 font-bold text-lg mb-3 line-clamp-2 group-hover:text-indigo-600 transition-colors" title="${escapeHtml(p.title || '')}">
            ${escapeHtml(p.title || 'No Title')}
        </h3>
        
        <div class="mt-auto space-y-2.5 text-sm text-slate-600">
            <div class="flex items-center gap-2 text-xs">
                <span class="font-semibold text-slate-700 truncate max-w-[60%]" title="${escapeHtml(p.inst || '')}">${escapeHtml(p.inst || '')}</span>
                <span class="text-slate-300">|</span>
                <span class="text-indigo-600 hover:text-indigo-800 transition-colors font-medium truncate flex-1 pi-link" data-pi="${escapeHtml(p.pi || '')}" title="${escapeHtml(p.pi || '')}">
                    ${escapeHtml(p.pi || 'Unknown')}
                </span>
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-500 pt-3 border-t border-slate-50 mt-1">
               <div class="flex items-center gap-1.5">
                   <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                   <span>${p.date || 'N/A'}</span>
               </div>
               <div class="flex items-center gap-1.5 ml-auto">
                   <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                   <span>${(p.dur || '0').toString().toLowerCase().match(/mo|non/) ? p.dur : (p.dur || '0') + 'mo'}</span>
               </div>
            </div>
        </div>
    </div>
`).join('');

    // Add Click Listeners
    grid.querySelectorAll('.group[data-id]').forEach(card => {
        card.addEventListener('click', (e) => {
            // Prevent if clicking PI link
            if (!e.target.closest('.pi-link')) {
                showDetail(card.dataset.id);
            }
        });
    });

    // PI Link Listeners
    grid.querySelectorAll('.pi-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            const piName = link.dataset.pi;
            if (piName) {
                filterByPI(piName);
            }
        });
    });

    renderPagination();
}

function getStatusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('progress')) return 'in-progress';
    if (s.includes('complete')) return 'completed';
    return '';
}

function renderPagination() {
    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const pagination = document.getElementById('pagination');

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">이전</button>`;

    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        html += `<button onclick="goToPage(1)">1</button>`;
        if (startPage > 2) html += '<span>...</span>';
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += '<span>...</span>';
        html += `<button onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">다음</button>`;
    pagination.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    renderCards();
    window.scrollTo({ top: document.querySelector('#resultsGrid').offsetTop - 100, behavior: 'smooth' });
}

// Window Globals
window.goToPage = goToPage;

// Update Results Count
function updateResultsCount() {
    document.getElementById('resultsCount').textContent = `전체 ${allProjects.length.toLocaleString()}개 중 ${filteredProjects.length.toLocaleString()}개 표시`;
}

// Update Charts
function updateCharts() {
    // Bar Chart - by Institution or PI
    const selectedInstitutions = institutionSelect.getValue(true);
    const selectedPIs = piSelect.getValue(true);

    let barLabels, barData, barChartTitle;

    if (selectedPIs.length > 0) {
        // Show by PI
        barChartTitle = 'PI별 과제 수';
        const piCounts = {};
        filteredProjects.forEach(p => {
            piCounts[p.pi] = (piCounts[p.pi] || 0) + 1;
        });
        const sorted = Object.entries(piCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        barLabels = sorted.map(s => s[0].length > 20 ? s[0].substring(0, 20) + '...' : s[0]);
        barData = sorted.map(s => s[1]);
        // Store original PI names for click handling
        barChartOriginalLabels = sorted.map(s => ({ type: 'pi', value: s[0] }));
    } else {
        // Show top institutions
        barChartTitle = '기관별 과제 수';
        const instCounts = {};
        filteredProjects.forEach(p => {
            instCounts[p.inst] = (instCounts[p.inst] || 0) + 1;
        });
        const sorted = Object.entries(instCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        barLabels = sorted.map(s => {
            const abbr = getInstitutionAbbr(s[0]);
            return abbr.length > 35 ? abbr.substring(0, 35) + '...' : abbr;
        });
        barData = sorted.map(s => s[1]);
        // Store original institution names for click handling
        barChartOriginalLabels = sorted.map(s => ({ type: 'inst', value: s[0] }));
    }

    // Update bar chart title
    document.querySelector('#barChart').closest('.chart-container').querySelector('h3').textContent = barChartTitle;

    barChart.data.labels = barLabels;
    barChart.data.datasets[0].data = barData;
    barChart.update();

    // Line Chart - by Year
    const yearCounts = {};
    filteredProjects.forEach(p => {
        const year = p.dateObj.getFullYear();
        if (year > 1900) {
            yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
    });
    const sortedYears = Object.keys(yearCounts).sort();
    lineChart.data.labels = sortedYears;
    lineChart.data.datasets[0].data = sortedYears.map(y => yearCounts[y]);
    lineChart.update();

    // Pie Chart - by Status
    const statusCounts = {};
    filteredProjects.forEach(p => {
        statusCounts[p.status || 'Unknown'] = (statusCounts[p.status || 'Unknown'] || 0) + 1;
    });
    pieChart.data.labels = Object.keys(statusCounts);
    pieChart.data.datasets[0].data = Object.values(statusCounts);
    pieChart.update();

    // Word Cloud - Keywords
    updateWordCloud();
}

// Update Word Cloud
function updateWordCloud() {
    const container = document.getElementById('wordCloud');
    if (!container) return;

    // Clear previous content
    container.innerHTML = '';

    // Extract keywords from filtered projects
    const kwCount = {};
    const excludeWords = ['data access contact:', 'not applicable', 'na', 'n/a', 'nil', 'none'];

    filteredProjects.forEach(p => {
        const kw = p.kw || '';
        if (kw) {
            const keywords = kw.replace(/;/g, ',').split(',').map(k => k.trim().toLowerCase());
            keywords.forEach(k => {
                if (k && k.length > 2 && !excludeWords.includes(k)) {
                    kwCount[k] = (kwCount[k] || 0) + 1;
                }
            });
        }
    });

    // Get top 50 keywords
    const sortedKw = Object.entries(kwCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);

    if (sortedKw.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">키워드 없음</p>';
        return;
    }

    const maxCount = sortedKw[0][1];
    const minCount = sortedKw[sortedKw.length - 1][1];

    // Create word data for d3-cloud
    const words = sortedKw.map(([text, count]) => ({
        text: text,
        size: 10 + ((count - minCount) / (maxCount - minCount || 1)) * 25,
        count: count
    }));

    const width = container.offsetWidth || 280;
    const height = 200;

    // Color palette
    const colors = ['#2563eb', '#7c3aed', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

    // Create word cloud layout
    const layout = d3.layout.cloud()
        .size([width, height])
        .words(words)
        .padding(3)
        .rotate(() => (Math.random() > 0.5 ? 0 : 90) * (Math.random() > 0.8 ? 1 : 0))
        .font('Arial')
        .fontSize(d => d.size)
        .on('end', draw);

    layout.start();

    function draw(words) {
        const svg = d3.select('#wordCloud')
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`);

        svg.selectAll('text')
            .data(words)
            .enter()
            .append('text')
            .style('font-size', d => `${d.size}px`)
            .style('font-family', 'Arial, sans-serif')
            .style('font-weight', '600')
            .style('fill', (d, i) => colors[i % colors.length])
            .attr('text-anchor', 'middle')
            .attr('transform', d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
            .text(d => d.text)
            .style('cursor', 'pointer')
            .on('click', function (event, d) {
                event.stopPropagation();
                // Click keyword to search
                document.getElementById('keywordInput').value = d.text;
                applyFilters();
            })
            .append('title')
            .text(d => `${d.text}: ${d.count}개 과제 (클릭하여 검색)`);
    }
}

// Open Word Cloud Modal
function openWordCloudModal() {
    const container = document.getElementById('modalWordCloud');
    container.innerHTML = '';

    // Extract keywords from filtered projects
    const kwCount = {};
    const excludeWords = ['data access contact:', 'not applicable', 'na', 'n/a', 'nil', 'none'];

    filteredProjects.forEach(p => {
        const kw = p.kw || '';
        if (kw) {
            const keywords = kw.replace(/;/g, ',').split(',').map(k => k.trim().toLowerCase());
            keywords.forEach(k => {
                if (k && k.length > 2 && !excludeWords.includes(k)) {
                    kwCount[k] = (kwCount[k] || 0) + 1;
                }
            });
        }
    });

    // Get top 80 keywords for modal (more than small view)
    const sortedKw = Object.entries(kwCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80);

    if (sortedKw.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 1rem; text-align: center; padding: 50px;">키워드 없음</p>';
        document.getElementById('wordCloudModal').classList.add('active');
        return;
    }

    const maxCount = sortedKw[0][1];
    const minCount = sortedKw[sortedKw.length - 1][1];

    // Create word data for d3-cloud (larger sizes for modal)
    const words = sortedKw.map(([text, count]) => ({
        text: text,
        size: 14 + ((count - minCount) / (maxCount - minCount || 1)) * 50,
        count: count
    }));

    const width = 750;
    const height = 450;

    // Color palette
    const colors = ['#2563eb', '#7c3aed', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

    // Create word cloud layout
    const layout = d3.layout.cloud()
        .size([width, height])
        .words(words)
        .padding(4)
        .rotate(() => (Math.random() > 0.6 ? 0 : 90) * (Math.random() > 0.7 ? 1 : 0))
        .font('Arial')
        .fontSize(d => d.size)
        .on('end', draw);

    layout.start();

    function draw(words) {
        const svg = d3.select('#modalWordCloud')
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`);

        svg.selectAll('text')
            .data(words)
            .enter()
            .append('text')
            .style('font-size', d => `${d.size}px`)
            .style('font-family', 'Arial, sans-serif')
            .style('font-weight', '600')
            .style('fill', (d, i) => colors[i % colors.length])
            .style('cursor', 'pointer')
            .attr('text-anchor', 'middle')
            .attr('transform', d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
            .text(d => d.text)
            .on('click', function (event, d) {
                event.stopPropagation();
                // Click keyword to search
                document.getElementById('keywordInput').value = d.text;
                closeWordCloudModal();
                applyFilters();
            })
            .append('title')
            .text(d => `${d.text}: ${d.count}개 과제 (클릭하여 검색)`);
    }

    document.getElementById('wordCloudModal').classList.add('active');
}

// Close Word Cloud Modal
function closeWordCloudModal() {
    document.getElementById('wordCloudModal').classList.remove('active');
}

// Show Detail Modal
function showDetail(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    // Track view_project event
    window.trackEvent('view_project', { project_id: project.id, title: project.title });

    const modalBody = document.getElementById('modalBody');

    // Helper to format date
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    modalBody.innerHTML = `
        <div class="space-y-6">
            <!-- Header Section -->
            <div class="border-b border-slate-100 pb-4">
                <div class="flex flex-wrap gap-2 mb-3">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        ${project.id || 'No ID'}
                    </span>
                    <span class="status-badge ${getStatusClass(project.status)}">
                        ${project.status || 'Unknown'}
                    </span>
                </div>
                <h2 class="text-xl md:text-2xl font-bold text-slate-900 leading-tight">
                    ${escapeHtml(project.title || 'Untitled Project')}
                </h2>
            </div>

            <!-- Key Details Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <!-- Left Column -->
                <div class="space-y-4">
                    <div>
                        <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Principal Investigator</h4>
                        <div class="flex items-center gap-2">
                             <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                ${(project.pi || '?').charAt(0)}
                            </div>
                            <span class="font-medium text-slate-900">${escapeHtml(project.pi || '-')}</span>
                        </div>
                    </div>
                    
                    <div>
                        <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Host Institution</h4>
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m8-2a2 2 0 01-2-2h-4a2 2 0 01-2 2v2m2-2v-5m6 0v5" />
                                </svg>
                            </div>
                            <span class="font-medium text-slate-900">${escapeHtml(project.inst || '-')}</span>
                        </div>
                    </div>
                </div>

                <!-- Right Column -->
                <div class="space-y-4">
                     <div>
                        <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Project Period</h4>
                        <div class="text-sm font-medium text-slate-900">
                            ${formatDate(project.date)}
                            <span class="text-slate-400 mx-1">•</span>
                            ${project.dur || '-'}
                        </div>
                    </div>

                    ${project.url ? `
                    <div>
                        <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Links</h4>
                        <a href="${project.url}" target="_blank" class="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                            View on IGMS
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    </div>
                    ` : ''}
                </div>
            </div>

            ${project.kw ? `
            <!-- Keywords -->
            <div>
                <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Keywords</h4>
                <div class="flex flex-wrap gap-2">
                    ${project.kw.split(/[;,]/).filter(k => k.trim().length > 0).map(k => `
                        <span class="px-2.5 py-1 rounded-md bg-slate-50 text-slate-600 text-xs font-medium border border-slate-100">
                            ${k.trim()}
                        </span>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            ${project.abs ? `
            <!-- Abstract -->
            <div class="pt-4 border-t border-slate-100">
                <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Abstract</h4>
                <div class="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-60 overflow-y-auto">
                    ${escapeHtml(project.abs)}
                </div>
            </div>
            ` : ''}
        </div>
    `;

    document.getElementById('detailModal').classList.add('active');
}

// Close Modal
function closeModal() {
    document.getElementById('detailModal').classList.remove('active');
}

// Open Chart Modal
function openChartModal(chartId, title) {
    document.getElementById('chartModalTitle').textContent = title;

    // Destroy existing modal chart if exists
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }

    const modalCtx = document.getElementById('modalChart').getContext('2d');
    let sourceChart, chartType, chartConfig;

    const integerYAxis = {
        beginAtZero: true,
        ticks: {
            stepSize: 1,
            callback: function (value) {
                if (Number.isInteger(value)) {
                    return value;
                }
                return null;
            }
        }
    };

    if (chartId === 'barChart') {
        sourceChart = barChart;
        chartType = 'bar';
        chartConfig = {
            type: chartType,
            data: JSON.parse(JSON.stringify(sourceChart.data)),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: false }
                },
                scales: {
                    y: integerYAxis,
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const originalLabel = barChartOriginalLabels[index];
                        if (originalLabel) {
                            closeChartModal();
                            filterByBarChart(originalLabel);
                        }
                    }
                }
            }
        };
    } else if (chartId === 'lineChart') {
        sourceChart = lineChart;
        chartType = 'line';
        chartConfig = {
            type: chartType,
            data: JSON.parse(JSON.stringify(sourceChart.data)),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: false }
                },
                scales: { y: integerYAxis },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const year = modalChart.data.labels[index];
                        if (year) {
                            closeChartModal();
                            filterByYear(year);
                        }
                    }
                }
            }
        };
    } else if (chartId === 'pieChart') {
        sourceChart = pieChart;
        chartType = 'doughnut';
        chartConfig = {
            type: chartType,
            data: JSON.parse(JSON.stringify(sourceChart.data)),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { font: { size: 14 } }
                    },
                    title: { display: false }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const status = modalChart.data.labels[index];
                        if (status) {
                            closeChartModal();
                            filterByStatus(status);
                        }
                    }
                }
            }
        };
    }

    modalChart = new Chart(modalCtx, chartConfig);
    document.getElementById('chartModal').classList.add('active');
}

// Close Chart Modal
function closeChartModal() {
    document.getElementById('chartModal').classList.remove('active');
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }
}

// Reset Filters
function resetFilters() {
    institutionSelect.removeActiveItems();
    piSelect.removeActiveItems();
    document.getElementById('keywordInput').value = '';
    document.querySelectorAll('#statusFilters input').forEach(cb => cb.checked = true);
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('durationMin').value = '';
    document.getElementById('durationMax').value = '';

    // Clear flatpickr
    document.getElementById('dateFrom')._flatpickr?.clear();
    document.getElementById('dateTo')._flatpickr?.clear();

    applyFilters();
}

// Filter by PI (reset all other filters and set only PI)
function filterByPI(piName) {
    // Reset all filters first
    institutionSelect.removeActiveItems();
    document.getElementById('keywordInput').value = '';
    document.querySelectorAll('#statusFilters input').forEach(cb => cb.checked = true);
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('durationMin').value = '';
    document.getElementById('durationMax').value = '';

    // Clear flatpickr
    document.getElementById('dateFrom')._flatpickr?.clear();
    document.getElementById('dateTo')._flatpickr?.clear();

    // Set PI filter
    piSelect.removeActiveItems();
    piSelect.setChoiceByValue(piName);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    applyFilters();
}

// Filter by Bar Chart click (institution or PI) - AND condition with existing filters
function filterByBarChart(labelData) {
    window.trackEvent('search', { query: labelData.value, source: 'chart_click', filter_type: labelData.type });
    // Add filter based on type (AND condition - don't reset other filters)
    if (labelData.type === 'inst') {
        // Check if already selected
        const currentInstitutions = institutionSelect.getValue(true);
        if (!currentInstitutions.includes(labelData.value)) {
            institutionSelect.setChoiceByValue(labelData.value);
        }
        updatePIOptions();
    } else if (labelData.type === 'pi') {
        // Check if already selected
        const currentPIs = piSelect.getValue(true);
        if (!currentPIs.includes(labelData.value)) {
            piSelect.setChoiceByValue(labelData.value);
        }
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    applyFilters();
}

// Filter by Year (from line chart click) - AND condition with existing filters
function filterByYear(year) {
    window.trackEvent('search', { query: year, source: 'chart_click', filter_type: 'year' });
    // Set date range for the selected year (AND condition - don't reset other filters)
    const dateFromInput = document.getElementById('dateFrom');
    const dateToInput = document.getElementById('dateTo');

    // Set flatpickr dates
    const dateFromFp = dateFromInput._flatpickr;
    const dateToFp = dateToInput._flatpickr;

    if (dateFromFp && dateToFp) {
        dateFromFp.setDate(`${year}-01-01`);
        dateToFp.setDate(`${year}-12-31`);
    } else {
        dateFromInput.value = `${year}-01-01`;
        dateToInput.value = `${year}-12-31`;
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    applyFilters();
}

// Filter by Status (from pie chart click) - AND condition with existing filters
function filterByStatus(status) {
    window.trackEvent('search', { query: status, source: 'chart_click', filter_type: 'status' });
    // Set only the selected status (AND condition - don't reset other filters)
    // Uncheck all statuses first, then check only the selected one
    document.querySelectorAll('#statusFilters input').forEach(cb => {
        cb.checked = (cb.value === status);
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    applyFilters();
}

// Export to CSV

// Export to Excel

// Download File Helper

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make goToPage global for pagination buttons
window.goToPage = goToPage;
