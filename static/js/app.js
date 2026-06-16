// --- STATE MANAGEMENT ---
let state = {
    releases: [],
    selectedIds: new Set(),
    currentCategory: 'all',
    searchQuery: '',
    lastUpdated: null
};

// --- DOM ELEMENTS ---
const elements = {
    timelineWrapper: document.getElementById('timeline-wrapper'),
    loadingState: document.getElementById('loading-state'),
    emptyState: document.getElementById('empty-state'),
    refreshBtn: document.getElementById('refresh-btn'),
    btnText: document.getElementById('btn-text'),
    btnRefreshIcon: document.getElementById('btn-refresh-icon'),
    statusPill: document.getElementById('status-pill'),
    lastUpdated: document.getElementById('last-updated'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    timelineSubtitle: document.getElementById('timeline-subtitle-text'),
    btnSelectAll: document.getElementById('btn-select-all'),
    btnClearAll: document.getElementById('btn-clear-all'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    
    // Stats
    statTotalCount: document.getElementById('stat-total-count'),
    statRecentCount: document.getElementById('stat-recent-count'),
    
    // Category Badge Counts
    countAll: document.getElementById('count-all'),
    countFeature: document.getElementById('count-feature'),
    countIssue: document.getElementById('count-issue'),
    countChanged: document.getElementById('count-changed'),
    countDeprecated: document.getElementById('count-deprecated'),
    
    // Floating Dock
    floatingDock: document.getElementById('floating-dock'),
    selectedCountBadge: document.getElementById('selected-count-badge'),
    dockBtnClear: document.getElementById('dock-btn-clear'),
    dockBtnTweet: document.getElementById('dock-btn-tweet'),
    
    // Modal Composer
    tweetModal: document.getElementById('tweet-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalSendBtn: document.getElementById('modal-send-btn'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    tweetWarning: document.getElementById('tweet-warning'),
    tweetPreviewUrl: document.getElementById('tweet-preview-url'),
    
    // Filter buttons
    filterAll: document.getElementById('btn-filter-all'),
    filterFeature: document.getElementById('btn-filter-feature'),
    filterIssue: document.getElementById('btn-filter-issue'),
    filterChanged: document.getElementById('btn-filter-changed'),
    filterDeprecated: document.getElementById('btn-filter-deprecated')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchReleases(false);
    setupEventListeners();
});

// --- API FETCH ---
async function fetchReleases(forceRefresh = false) {
    showLoading(true);
    
    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        state.releases = data.releases || [];
        state.lastUpdated = data.updated_at;
        
        // Clear selection on full refresh
        state.selectedIds.clear();
        updateFloatingDock();
        
        // Update headers/indicators
        elements.lastUpdated.textContent = `Last checked: ${state.lastUpdated || 'Just now'}`;
        if (data.status === 'fallback') {
            elements.statusPill.className = 'status-indicator offline';
            elements.statusPill.querySelector('.indicator-text').textContent = 'Offline Fallback';
        } else {
            elements.statusPill.className = 'status-indicator';
            elements.statusPill.querySelector('.indicator-text').textContent = 'Live Syncing';
        }
        
        // Render Dashboard
        calculateCategoryCounts();
        renderDashboard();
        
    } catch (error) {
        console.error('Failed to load release notes:', error);
        showErrorState(error.message);
    } finally {
        showLoading(false);
    }
}

// --- LOADING & ERROR UI ---
function showLoading(isLoading) {
    if (isLoading) {
        elements.loadingState.style.display = 'flex';
        elements.timelineWrapper.style.display = 'none';
        elements.emptyState.style.display = 'none';
        elements.btnRefreshIcon.classList.add('spinning');
        elements.btnText.textContent = 'Updating...';
        elements.refreshBtn.disabled = true;
    } else {
        elements.loadingState.style.display = 'none';
        elements.btnRefreshIcon.classList.remove('spinning');
        elements.btnText.textContent = 'Refresh Feed';
        elements.refreshBtn.disabled = false;
    }
}

function showErrorState(message) {
    elements.timelineWrapper.style.display = 'none';
    elements.emptyState.style.display = 'flex';
    elements.emptyState.querySelector('h3').textContent = 'Failed to fetch release notes';
    elements.emptyState.querySelector('p').textContent = `Check your server connection. Details: ${message}`;
}

// --- STATS & COUNT CALCULATIONS ---
function calculateCategoryCounts() {
    let counts = { all: state.releases.length, Feature: 0, Issue: 0, Changed: 0, Deprecated: 0 };
    let currentMonthCount = 0;
    
    // Get current month details for stats
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    
    state.releases.forEach(rel => {
        // Category counting
        const category = rel.type;
        if (counts.hasOwnProperty(category)) {
            counts[category]++;
        } else {
            // General or other tags
            counts['all']++;
        }
        
        // Date parsing for month count
        try {
            if (rel.timestamp) {
                const date = new Date(rel.timestamp);
                if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) {
                    currentMonthCount++;
                }
            }
        } catch (e) {
            console.error(e);
        }
    });
    
    // Update badge values in DOM
    elements.countAll.textContent = counts.all;
    elements.countFeature.textContent = counts.Feature;
    elements.countIssue.textContent = counts.Issue;
    elements.countChanged.textContent = counts.Changed;
    elements.countDeprecated.textContent = counts.Deprecated;
    
    // Update Left Stats cards
    elements.statTotalCount.textContent = counts.all;
    elements.statRecentCount.textContent = currentMonthCount;
}

// --- RENDERING WORKFLOW ---
function getFilteredReleases() {
    return state.releases.filter(rel => {
        // Filter by category
        const matchesCategory = state.currentCategory === 'all' || rel.type === state.currentCategory;
        
        // Filter by search text
        let matchesSearch = true;
        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            const inDate = rel.date.toLowerCase().includes(query);
            const inType = rel.type.toLowerCase().includes(query);
            const inHtml = rel.content_html.toLowerCase().includes(query);
            const inText = rel.content_text.toLowerCase().includes(query);
            matchesSearch = inDate || inType || inHtml || inText;
        }
        
        return matchesCategory && matchesSearch;
    });
}

function renderDashboard() {
    const filtered = getFilteredReleases();
    
    // Update subtitle text
    let catText = state.currentCategory === 'all' ? 'updates' : `${state.currentCategory}s`;
    if (state.searchQuery) {
        elements.timelineSubtitle.textContent = `Found ${filtered.length} ${catText} matching "${state.searchQuery}"`;
    } else {
        elements.timelineSubtitle.textContent = `Showing ${filtered.length} ${catText}`;
    }
    
    // Toggle Select All / Deselect All headers
    const visibleSelectedCount = filtered.filter(rel => state.selectedIds.has(rel.id)).length;
    if (filtered.length > 0) {
        elements.timelineWrapper.style.display = 'flex';
        elements.emptyState.style.display = 'none';
        
        if (visibleSelectedCount === filtered.length) {
            elements.btnSelectAll.style.display = 'none';
            elements.btnClearAll.style.display = 'inline-block';
        } else {
            elements.btnSelectAll.style.display = 'inline-block';
            elements.btnClearAll.style.display = 'none';
        }
    } else {
        elements.timelineWrapper.style.display = 'none';
        elements.emptyState.style.display = 'flex';
        elements.btnSelectAll.style.display = 'none';
        elements.btnClearAll.style.display = 'none';
    }
    
    // Render the cards
    elements.timelineWrapper.innerHTML = '';
    
    filtered.forEach(rel => {
        const isSelected = state.selectedIds.has(rel.id);
        const cardHtml = createReleaseCardHtml(rel, isSelected);
        elements.timelineWrapper.appendChild(cardHtml);
    });
}

function createReleaseCardHtml(rel, isSelected) {
    const itemDiv = document.createElement('div');
    itemDiv.className = `timeline-item${isSelected ? ' selected' : ''}`;
    itemDiv.dataset.id = rel.id;
    itemDiv.dataset.category = rel.type;
    
    const badgeClass = rel.type.toLowerCase();
    
    itemDiv.innerHTML = `
        <div class="timeline-marker"></div>
        <article class="release-card" id="card-${rel.id}">
            <div class="card-header">
                <div class="card-header-left">
                    <span class="badge ${badgeClass}">${rel.type}</span>
                    <span class="card-date">${rel.date}</span>
                </div>
                <div class="card-header-right">
                    <div class="card-select-checkbox" title="Select update for Tweeting"></div>
                </div>
            </div>
            <div class="card-body">
                ${rel.content_html}
            </div>
            <div class="card-footer">
                <button class="card-action-btn btn-copy-link" data-url="${rel.link}" title="Copy link to this release note">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    Copy Link
                </button>
                <button class="card-action-btn btn-copy-content" title="Copy text content to clipboard">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy Text
                </button>
                <button class="card-action-btn btn-tweet" title="Share this update on Twitter">
                    <svg viewBox="0 0 24 24" class="card-btn-icon">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    Tweet
                </button>
            </div>
        </article>
    `;
    
    // --- EVENT ATTACHMENTS ---
    const card = itemDiv.querySelector('.release-card');
    const checkbox = itemDiv.querySelector('.card-select-checkbox');
    
    // Toggle select when clicking card (ignoring buttons, links, etc.)
    card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-btn') || e.target.closest('a') || e.target.closest('code')) {
            return; // Don't toggle selection if clicking buttons or links
        }
        toggleSelect(rel.id);
    });
    
    // Specific checkbox toggle
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelect(rel.id);
    });
    
    // Action Buttons
    itemDiv.querySelector('.btn-copy-link').addEventListener('click', (e) => {
        e.stopPropagation();
        const url = e.currentTarget.dataset.url;
        copyToClipboard(url, e.currentTarget, 'Link Copied!');
    });
    
    itemDiv.querySelector('.btn-copy-content').addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(rel.content_text, e.currentTarget, 'Text Copied!');
    });
    
    itemDiv.querySelector('.btn-tweet').addEventListener('click', (e) => {
        e.stopPropagation();
        openTweetComposer([rel]);
    });
    
    return itemDiv;
}

// --- CARD SELECTION DOCK LOGIC ---
function toggleSelect(id) {
    if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
    } else {
        state.selectedIds.add(id);
    }
    
    // Update active class on card without full re-render for smooth transition
    const cardItem = document.querySelector(`.timeline-item[data-id="${id}"]`);
    if (cardItem) {
        if (state.selectedIds.has(id)) {
            cardItem.classList.add('selected');
        } else {
            cardItem.classList.remove('selected');
        }
    }
    
    updateFloatingDock();
}

function updateFloatingDock() {
    const count = state.selectedIds.size;
    if (count > 0) {
        elements.selectedCountBadge.textContent = count;
        elements.floatingDock.style.display = 'flex';
    } else {
        elements.floatingDock.style.display = 'none';
    }
    
    // Toggle Select/Deselect visible buttons
    const filtered = getFilteredReleases();
    const visibleSelectedCount = filtered.filter(rel => state.selectedIds.has(rel.id)).length;
    if (filtered.length > 0) {
        if (visibleSelectedCount === filtered.length) {
            elements.btnSelectAll.style.display = 'none';
            elements.btnClearAll.style.display = 'inline-block';
        } else {
            elements.btnSelectAll.style.display = 'inline-block';
            elements.btnClearAll.style.display = 'none';
        }
    }
}

// --- UTILITY: CLIPBOARD COPY ---
function copyToClipboard(text, btnElement, successMsg) {
    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="#10b981" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            ${successMsg}
        `;
        btnElement.style.borderColor = '#10b981';
        btnElement.style.color = '#34d399';
        
        setTimeout(() => {
            btnElement.innerHTML = originalHtml;
            btnElement.style.borderColor = '';
            btnElement.style.color = '';
        }, 1800);
    }).catch(err => {
        console.error('Could not copy text: ', err);
    });
}

// --- TWEET COMPOSING & MODAL ---
function openTweetComposer(items) {
    if (items.length === 0) return;
    
    let tweetText = "";
    let attachUrl = "";
    
    if (items.length === 1) {
        // Single release note tweet composition
        const rel = items[0];
        const category = rel.type.toUpperCase();
        
        // Build base text: "BigQuery Update [FEATURE] (June 15): Use Gemini..."
        const shortDate = rel.date.replace(/, \d{4}/, ''); // Strip year to save chars
        const header = `BigQuery [${category}] (${shortDate}): `;
        const content = rel.content_text;
        attachUrl = rel.link || "https://docs.cloud.google.com/bigquery/docs/release-notes";
        
        // We have 280 characters limit.
        // Link takes 23 characters on X. Let's keep 40 chars safety budget.
        const maxContentLength = 280 - header.length - 27; 
        
        let displayContent = content;
        if (content.length > maxContentLength) {
            displayContent = content.substring(0, maxContentLength - 3) + "...";
        }
        
        tweetText = `${header}${displayContent}`;
        
    } else {
        // Combined tweet composition
        // Sort items by date descending
        items.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const mainHeader = `Google BigQuery Updates Timeline 🚀\n\n`;
        attachUrl = "https://docs.cloud.google.com/bigquery/docs/release-notes";
        
        // Build bullet points
        let bullets = "";
        items.forEach((item, index) => {
            const shortDate = item.date.replace(/, \d{4}/, '');
            const category = item.type;
            const text = item.content_text;
            bullets += `• [${category}] ${text}\n`;
        });
        
        // Truncate bullet points combined to fit
        const maxBulletsLength = 280 - mainHeader.length - 27; // 27 for spacing + url
        
        if (bullets.length > maxBulletsLength) {
            bullets = bullets.substring(0, maxBulletsLength - 30) + "\n...and other updates.";
        }
        
        tweetText = `${mainHeader}${bullets}`;
    }
    
    // Load into modal composer
    elements.tweetTextarea.value = tweetText;
    elements.tweetPreviewUrl.textContent = attachUrl;
    elements.tweetPreviewUrl.href = attachUrl;
    
    // Set up counter
    updateCharCounter();
    
    // Display Modal
    elements.tweetModal.style.display = 'flex';
    elements.tweetTextarea.focus();
}

function updateCharCounter() {
    const textLength = elements.tweetTextarea.value.length;
    
    // Add extra 23 characters for the URL preview attachment on Twitter (standard count)
    const totalLength = textLength;
    elements.charCounter.textContent = `${totalLength} / 280`;
    
    if (totalLength > 280) {
        elements.charCounter.className = 'char-counter limit-exceeded';
        elements.tweetWarning.style.display = 'block';
        elements.tweetWarning.textContent = "Your text exceeds 280 characters! Twitter will truncate the post.";
        elements.modalSendBtn.disabled = false; // Twitter intent handles it, but nice to let them know
    } else {
        elements.charCounter.className = 'char-counter';
        elements.tweetWarning.style.display = 'none';
        elements.modalSendBtn.disabled = false;
    }
}

function sendTweet() {
    const text = encodeURIComponent(elements.tweetTextarea.value);
    const url = encodeURIComponent(elements.tweetPreviewUrl.textContent);
    
    // Construct intent link
    const xIntentUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    
    // Open in a new tab
    window.open(xIntentUrl, '_blank');
    
    // Close modal
    elements.tweetModal.style.display = 'none';
}

// --- EVENT HANDLERS SETUP ---
function setupEventListeners() {
    // Refresh Button
    elements.refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });
    
    // Search Box Input
    let searchTimeout;
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        
        // Show/hide clear search button
        if (state.searchQuery) {
            elements.clearSearchBtn.style.display = 'block';
        } else {
            elements.clearSearchBtn.style.display = 'none';
        }
        
        // Debounce render
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderDashboard();
        }, 150);
    });
    
    // Clear Search Button
    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchQuery = '';
        elements.clearSearchBtn.style.display = 'none';
        renderDashboard();
    });
    
    // Category Filter Buttons
    const filterButtons = [
        elements.filterAll,
        elements.filterFeature,
        elements.filterIssue,
        elements.filterChanged,
        elements.filterDeprecated
    ];
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.currentTarget;
            
            // Remove active classes
            filterButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            
            state.currentCategory = button.dataset.category;
            renderDashboard();
        });
    });
    
    // Reset Filters Button
    elements.resetFiltersBtn.addEventListener('click', resetAllFilters);
    elements.resetFiltersBtn.addEventListener('click', resetAllFilters);
    
    // Select All / Deselect All
    elements.btnSelectAll.addEventListener('click', () => {
        const visible = getFilteredReleases();
        visible.forEach(rel => state.selectedIds.add(rel.id));
        renderDashboard();
        updateFloatingDock();
    });
    
    elements.btnClearAll.addEventListener('click', () => {
        const visible = getFilteredReleases();
        visible.forEach(rel => state.selectedIds.delete(rel.id));
        renderDashboard();
        updateFloatingDock();
    });
    
    // Dock Actions
    elements.dockBtnClear.addEventListener('click', () => {
        state.selectedIds.clear();
        renderDashboard();
        updateFloatingDock();
    });
    
    elements.dockBtnTweet.addEventListener('click', () => {
        // Collect selected items
        const selectedItems = state.releases.filter(rel => state.selectedIds.has(rel.id));
        openTweetComposer(selectedItems);
    });
    
    // Modal Actions
    elements.modalCloseBtn.addEventListener('click', () => {
        elements.tweetModal.style.display = 'none';
    });
    
    elements.modalCancelBtn.addEventListener('click', () => {
        elements.tweetModal.style.display = 'none';
    });
    
    elements.tweetTextarea.addEventListener('input', updateCharCounter);
    
    elements.modalSendBtn.addEventListener('click', sendTweet);
    
    // Close modal if clicked outside of card
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) {
            elements.tweetModal.style.display = 'none';
        }
    });
}

function resetAllFilters() {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.clearSearchBtn.style.display = 'none';
    
    const filterButtons = [
        elements.filterAll,
        elements.filterFeature,
        elements.filterIssue,
        elements.filterChanged,
        elements.filterDeprecated
    ];
    filterButtons.forEach(b => b.classList.remove('active'));
    elements.filterAll.classList.add('active');
    
    state.currentCategory = 'all';
    renderDashboard();
}
