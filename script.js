// =============================================
// Harvest App - Backend Logic (localStorage)
// =============================================

// ---- Data Layer ----
const STORAGE_KEY = 'harvest_transactions';

function getTransactions() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

function saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function getTodayKey() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // "2026-03-25"
}

function getTodayTransactions() {
    const todayKey = getTodayKey();
    return getTransactions().filter(t => t.date === todayKey);
}

// ---- Add Transaction ----
function addTransaction(e) {
    e.preventDefault();

    const descEl = document.getElementById('txn-description');
    const amountEl = document.getElementById('txn-amount');
    const categoryEl = document.getElementById('txn-category');

    const description = descEl.value.trim();
    const amount = parseFloat(amountEl.value);
    const category = categoryEl.value;

    if (!description || isNaN(amount) || amount <= 0) {
        showToast('Please fill in all fields correctly.');
        return;
    }

    const now = new Date();
    const txn = {
        id: Date.now().toString(),
        description,
        amount,
        category,
        date: getTodayKey(),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    const transactions = getTransactions();
    transactions.unshift(txn); // newest first
    saveTransactions(transactions);

    // Reset form
    descEl.value = '';
    amountEl.value = '';
    categoryEl.value = 'Sale';

    showToast(`Added: ${description} — Rs ${amount.toLocaleString()}`);
    switchTab('activity');
    refreshUI();
}

// ---- Delete Transaction ----
function deleteTransaction(id) {
    let transactions = getTransactions();
    transactions = transactions.filter(t => t.id !== id);
    saveTransactions(transactions);
    showToast('Transaction deleted.');
    refreshUI();
}

// ---- Clear All Data ----
function clearAllData() {
    if (confirm('Are you sure you want to clear ALL transactions?')) {
        localStorage.removeItem(STORAGE_KEY);
        showToast('All data cleared.');
        refreshUI();
    }
}

// ---- UI Rendering ----
function refreshUI() {
    const todayTxns = getTodayTransactions();
    const totalAmount = todayTxns.reduce((sum, t) => sum + t.amount, 0);
    const count = todayTxns.length;

    // Activity Tab Stats
    document.getElementById('today-volume').textContent = formatCurrency(totalAmount);
    document.getElementById('today-count').textContent = count;

    // Activity Tab - Recent Transactions (show last 5)
    renderTransactionList('recent-transactions', todayTxns.slice(0, 5), true);

    // Summary Tab
    document.getElementById('summary-total').textContent = formatCurrency(totalAmount);
    document.getElementById('summary-count').textContent = `${count} transaction${count !== 1 ? 's' : ''}`;
    renderTransactionList('summary-transactions', todayTxns, false);
}

function renderTransactionList(containerId, transactions, showLimit) {
    const container = document.getElementById(containerId);

    if (transactions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-receipt"></i>
                <p>No transactions yet today.<br>Tap "New Sale" to get started!</p>
            </div>
        `;
        return;
    }

    const categoryIcons = {
        'Sale': 'ph-shopping-cart',
        'Food': 'ph-fork-knife',
        'Transport': 'ph-car',
        'Shopping': 'ph-bag',
        'Bills': 'ph-lightning',
        'Other': 'ph-dots-three'
    };

    let html = transactions.map(t => {
        const icon = categoryIcons[t.category] || 'ph-receipt';
        return `
            <div class="txn-item">
                <div class="txn-icon">
                    <i class="ph-bold ${icon}"></i>
                </div>
                <div class="txn-info">
                    <div class="txn-desc">${escapeHtml(t.description)}</div>
                    <div class="txn-meta">${t.category} • ${t.time}</div>
                </div>
                <div class="txn-amount">Rs ${t.amount.toLocaleString()}</div>
                <button class="txn-delete" onclick="deleteTransaction('${t.id}')" aria-label="Delete">
                    <i class="ph-bold ph-x"></i>
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// ---- Tab Switching ----
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    // Show selected tab
    const target = document.getElementById('tab-' + tabName);
    if (target) {
        target.classList.add('active');
        // Re-trigger animation
        target.style.animation = 'none';
        target.offsetHeight; // reflow
        target.style.animation = '';
    }

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Focus first input on add tab
    if (tabName === 'add-transaction') {
        setTimeout(() => document.getElementById('txn-description').focus(), 300);
    }
}

// ---- Toast Notification ----
function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 2500);
}

// ---- Helpers ----
function formatCurrency(amount) {
    return 'Rs ' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---- Greeting Based on Time ----
function setGreeting() {
    const hour = new Date().getHours();
    let greeting;
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    else greeting = 'Good evening';

    const el = document.querySelector('#tab-activity .greeting-title');
    if (el) el.textContent = `${greeting}, Store 402`;
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    setGreeting();
    refreshUI();
});

// ---- Register Service Worker ----
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {
            // Service worker registration failed, app still works
        });
    });
}
