// IGMS Awarded Projects Search Dashboard - Main Application

// Global State
let allProjects = [];
let filteredProjects = [];
let currentPage = 1;
const itemsPerPage = 30;

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

// Get abbreviated institution name for chart display
function getInstitutionAbbr(fullName) {
    if (!fullName) return '';

    // Check if abbreviation exists in mapping
    if (institutionAbbreviations[fullName]) {
        return institutionAbbreviations[fullName];
    }

    // Check if name already contains abbreviation pattern (e.g., "GIS - Genome Institute of Singapore")
    const match = fullName.match(/^([A-Z0-9]+)\s*-\s*(.+)$/);
    if (match) {
        return match[1];
    }

    // Return original name if no abbreviation
    return fullName;
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initializeUI();
    applyFilters();
});

// API Configuration
const API_URL = 'https://searchsgpartners.netlify.app/.netlify/functions/data';

// Load Data from Netlify API (production) or local JSON (development)
async function loadData() {
    try {
        // Get password from sessionStorage (set by auth.js)
        const password = sessionStorage.getItem('igms_password');

        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // Local development - use JSON file
            const response = await fetch('data/projects.json');
            allProjects = await response.json();
        } else {
            // Production - fetch from Vercel API with password
            const response = await fetch(API_URL, {
                headers: {
                    'Authorization': `Bearer ${password}`
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            allProjects = await response.json();
        }

        // Parse dates for sorting
        allProjects.forEach(p => {
            p.dateObj = parseDate(p.date);
            p.durNum = parseInt(p.dur) || 0;
        });

        // Sort by date descending (default)
        sortProjects('date', 'desc');

        document.getElementById('loadingOverlay').classList.add('hidden');
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loadingOverlay').innerHTML = '<p>데이터 로딩 오류. 페이지를 새로고침 해주세요.</p>';
    }
}

// Parse date string to Date object
function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    // Format: "21-Feb-2026" or similar
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

// Initialize UI Components
function initializeUI() {
    initSelects();
    initStatusFilters();
    initDatePickers();
    initEventListeners();
    initCharts();

    // Set initial sort UI (default: date descending)
    updateSortUI(currentSort.field, currentSort.order);
}

// Initialize Choices.js selects
function initSelects() {
    // Get unique institutions
    const institutions = [...new Set(allProjects.map(p => p.inst).filter(Boolean))].sort();
    const institutionOptions = institutions.map(i => ({ value: i, label: i }));

    institutionSelect = new Choices('#institutionSelect', {
        removeItemButton: true,
        placeholder: true,
        placeholderValue: '수행기관 선택...',
        searchPlaceholderValue: '기관명 검색...',
        choices: institutionOptions,
        shouldSort: false
    });

    // Get unique PIs
    const pis = [...new Set(allProjects.map(p => p.pi).filter(Boolean))].sort();
    const piOptions = pis.map(p => ({ value: p, label: p }));

    piSelect = new Choices('#piSelect', {
        removeItemButton: true,
        placeholder: true,
        placeholderValue: '과제책임자 선택...',
        searchPlaceholderValue: 'PI 검색...',
        choices: piOptions,
        shouldSort: false
    });
}

// Update PI Options based on selected institutions
function updatePIOptions() {
    const selectedInstitutions = institutionSelect.getValue(true);
    const currentSelectedPIs = piSelect.getValue(true);

    let availablePIs;
    if (selectedInstitutions.length === 0) {
        // No institution selected - show all PIs
        availablePIs = [...new Set(allProjects.map(p => p.pi).filter(Boolean))].sort();
    } else {
        // Filter PIs by selected institutions
        availablePIs = [...new Set(
            allProjects
                .filter(p => selectedInstitutions.includes(p.inst))
                .map(p => p.pi)
                .filter(Boolean)
        )].sort();
    }

    // Clear and rebuild PI choices
    piSelect.clearStore();
    piSelect.setChoices(
        availablePIs.map(p => ({ value: p, label: p })),
        'value',
        'label',
        true
    );

    // Restore previously selected PIs that are still valid
    const validSelectedPIs = currentSelectedPIs.filter(pi => availablePIs.includes(pi));
    validSelectedPIs.forEach(pi => {
        piSelect.setChoiceByValue(pi);
    });
}

// Initialize Status Filters
function initStatusFilters() {
    const statuses = [...new Set(allProjects.map(p => p.status).filter(Boolean))].sort();
    const container = document.getElementById('statusFilters');

    statuses.forEach(status => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" value="${status}" checked>
            ${status}
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

// Initialize Event Listeners
function initEventListeners() {
    // Debounced filter function
    const debouncedApplyFilters = debounce(applyFilters, 300);

    // Select changes
    document.getElementById('institutionSelect').addEventListener('change', () => {
        updatePIOptions();
        applyFilters();
    });
    document.getElementById('piSelect').addEventListener('change', debouncedApplyFilters);

    // Keyword input
    document.getElementById('keywordInput').addEventListener('input', debounce(applyFilters, 300));

    // Status checkboxes
    document.getElementById('statusFilters').addEventListener('change', applyFilters);

    // Duration inputs
    document.getElementById('durationMin').addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('durationMax').addEventListener('input', debounce(applyFilters, 300));

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetFilters);

    // Export buttons
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);

    // Table header sort
    document.querySelectorAll('#resultsTable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            const order = currentSort.field === field && currentSort.order === 'asc' ? 'desc' : 'asc';
            sortProjects(field, order);
            updateSortUI(field, order);
            renderTable();
        });
    });

    // Modal close
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Chart modal close
    document.getElementById('chartModalClose').addEventListener('click', closeChartModal);
    document.getElementById('chartModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeChartModal();
    });

    // Word cloud modal close
    document.getElementById('wordCloudModalClose').addEventListener('click', closeWordCloudModal);
    document.getElementById('wordCloudModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeWordCloudModal();
    });

    // Chart containers: data click = filter, white space click = modal
    // Bar chart container
    document.querySelector('#barChart').closest('.chart-container').addEventListener('click', (e) => {
        const container = e.currentTarget;
        const title = container.querySelector('h3').textContent;

        // If clicking on canvas, check if bar was clicked
        if (e.target.tagName === 'CANVAS') {
            const chart = barChart;
            const elements = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
            if (elements.length === 0) {
                openChartModal('barChart', title);
            }
        }
        // If clicking on container itself (white space) or h3
        else if (e.target === container || e.target.tagName === 'H3') {
            openChartModal('barChart', title);
        }
    });

    // Line chart container
    document.querySelector('#lineChart').closest('.chart-container').addEventListener('click', (e) => {
        const container = e.currentTarget;
        const title = container.querySelector('h3').textContent;

        if (e.target.tagName === 'CANVAS') {
            const chart = lineChart;
            const elements = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
            if (elements.length === 0) {
                openChartModal('lineChart', title);
            }
        }
        else if (e.target === container || e.target.tagName === 'H3') {
            openChartModal('lineChart', title);
        }
    });

    // Pie chart container
    document.querySelector('#pieChart').closest('.chart-container').addEventListener('click', (e) => {
        const container = e.currentTarget;
        const title = container.querySelector('h3').textContent;

        if (e.target.tagName === 'CANVAS') {
            const chart = pieChart;
            const elements = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
            if (elements.length === 0) {
                openChartModal('pieChart', title);
            }
        }
        else if (e.target === container || e.target.tagName === 'H3') {
            openChartModal('pieChart', title);
        }
    });

    // Word cloud: keywords click = filter, white space/title click = modal
    document.getElementById('wordCloudContainer').addEventListener('click', (e) => {
        const container = e.currentTarget;
        // Open modal if clicking on white space, title, or container (not on a keyword)
        if (e.target.tagName !== 'text' && !e.target.closest('text')) {
            openWordCloudModal();
        }
    });

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeChartModal();
            closeWordCloudModal();
        }
    });
}

// Initialize Charts
function initCharts() {
    const integerTicksConfig = {
        beginAtZero: true,
        ticks: {
            stepSize: 1,
            callback: function(value) {
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
}

// Apply Filters
function applyFilters() {
    const selectedInstitutions = institutionSelect.getValue(true);
    const selectedPIs = piSelect.getValue(true);
    const keywords = document.getElementById('keywordInput').value.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const selectedStatuses = [...document.querySelectorAll('#statusFilters input:checked')].map(cb => cb.value);
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const durationMin = parseInt(document.getElementById('durationMin').value) || 0;
    const durationMax = parseInt(document.getElementById('durationMax').value) || Infinity;

    filteredProjects = allProjects.filter(p => {
        // Institution filter
        if (selectedInstitutions.length > 0 && !selectedInstitutions.includes(p.inst)) {
            return false;
        }

        // PI filter
        if (selectedPIs.length > 0 && !selectedPIs.includes(p.pi)) {
            return false;
        }

        // Keyword filter (AND logic)
        if (keywords.length > 0) {
            const searchText = `${p.abs || ''} ${p.kw || ''}`.toLowerCase();
            if (!keywords.every(kw => searchText.includes(kw))) {
                return false;
            }
        }

        // Status filter
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(p.status)) {
            return false;
        }

        // Date filter
        if (dateFrom && p.dateObj < new Date(dateFrom)) {
            return false;
        }
        if (dateTo && p.dateObj > new Date(dateTo)) {
            return false;
        }

        // Duration filter
        if (p.durNum < durationMin || p.durNum > durationMax) {
            return false;
        }

        return true;
    });

    currentPage = 1;
    renderTable();
    updateCharts();
    updateResultsCount();
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
    document.querySelectorAll('#resultsTable th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    const th = document.querySelector(`#resultsTable th[data-sort="${field}"]`);
    if (th) {
        th.classList.add(order === 'asc' ? 'sort-asc' : 'sort-desc');
    }
}

// Render Table
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = filteredProjects.slice(start, end);

    tbody.innerHTML = pageData.map(p => `
        <tr data-id="${p.id}">
            <td>${p.id || ''}</td>
            <td class="title-cell" title="${escapeHtml(p.title || '')}">${escapeHtml(p.title || '')}</td>
            <td><span class="status-badge ${getStatusClass(p.status)}">${p.status || ''}</span></td>
            <td class="pi-cell clickable" data-pi="${escapeHtml(p.pi || '')}">${escapeHtml(p.pi || '')}</td>
            <td>${escapeHtml(p.inst || '')}</td>
            <td>${p.date || ''}</td>
        </tr>
    `).join('');

    // Add click handlers for row (detail modal)
    tbody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', (e) => {
            // PI 셀 클릭이 아닌 경우에만 상세 모달 표시
            if (!e.target.classList.contains('pi-cell')) {
                showDetail(tr.dataset.id);
            }
        });
    });

    // Add click handlers for PI name (filter by PI)
    tbody.querySelectorAll('.pi-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const piName = cell.dataset.pi;
            if (piName) {
                filterByPI(piName);
            }
        });
    });

    renderPagination();
}

// Get Status Class
function getStatusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('progress')) return 'in-progress';
    if (s.includes('complete')) return 'completed';
    return '';
}

// Render Pagination
function renderPagination() {
    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const pagination = document.getElementById('pagination');

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">이전</button>`;

    // Page numbers
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

    // Next button
    html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">다음</button>`;

    pagination.innerHTML = html;
}

// Go to Page
function goToPage(page) {
    currentPage = page;
    renderTable();
    window.scrollTo({ top: document.querySelector('.table-section').offsetTop - 20, behavior: 'smooth' });
}

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
            .on('click', function(event, d) {
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
            .on('click', function(event, d) {
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

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>${escapeHtml(project.title || '')}</h2>
        <div class="detail-grid">
            <span class="detail-label">과제번호</span>
            <span class="detail-value">${project.id || ''}</span>

            <span class="detail-label">상태</span>
            <span class="detail-value"><span class="status-badge ${getStatusClass(project.status)}">${project.status || ''}</span></span>

            <span class="detail-label">과제책임자</span>
            <span class="detail-value">${escapeHtml(project.pi || '')}</span>

            <span class="detail-label">수행기관</span>
            <span class="detail-value">${escapeHtml(project.inst || '')}</span>

            <span class="detail-label">시작일</span>
            <span class="detail-value">${project.date || ''}</span>

            <span class="detail-label">수행기간</span>
            <span class="detail-value">${project.dur || ''}</span>

            <span class="detail-label">키워드</span>
            <span class="detail-value">${escapeHtml(project.kw || '')}</span>

            <span class="detail-label">상세 URL</span>
            <span class="detail-value">${project.url ? `<a href="${project.url}" target="_blank">IGMS에서 보기</a>` : ''}</span>
        </div>
        ${project.abs ? `
        <div class="abstract-section">
            <h3>초록 (Abstract)</h3>
            <p>${escapeHtml(project.abs)}</p>
        </div>
        ` : ''}
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
            callback: function(value) {
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
function exportToCSV() {
    const headers = ['Project ID', 'Title', 'Status', 'PI Name', 'Institution', 'Start Date', 'Duration', 'Keywords', 'Abstract', 'URL'];
    const rows = filteredProjects.map(p => [
        p.id, p.title, p.status, p.pi, p.inst, p.date, p.dur, p.kw, p.abs, p.url
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',') + '\n';
    });

    downloadFile(csv, 'igms_projects.csv', 'text/csv');
}

// Export to Excel
function exportToExcel() {
    const data = filteredProjects.map(p => ({
        'Project ID': p.id,
        'Title': p.title,
        'Status': p.status,
        'PI Name': p.pi,
        'Institution': p.inst,
        'Start Date': p.date,
        'Duration': p.dur,
        'Keywords': p.kw,
        'Abstract': p.abs,
        'URL': p.url
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projects');
    XLSX.writeFile(wb, 'igms_projects.xlsx');
}

// Download File Helper
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Debounce Helper
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

// Make goToPage global for pagination buttons
window.goToPage = goToPage;
