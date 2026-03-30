// =============================================
// Harvest App - Backend Logic (IndexedDB)
// =============================================

const DB_NAME = 'harvest_db';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

let dbPromise;

function initDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = e => reject(e.target.error);
            request.onsuccess = e => resolve(e.target.result);
            request.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }
    return dbPromise;
}

async function getTransactions() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.id - a.id));
        request.onerror = () => reject(request.error);
    });
}

async function saveTransaction(txn) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(txn);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function deleteTransactionFromDB(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function clearAllTransactionsDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function migrateLocalStorage() {
    const oldData = localStorage.getItem('harvest_transactions');
    if (oldData) {
        try {
            const transactions = JSON.parse(oldData);
            if (transactions.length > 0) {
                for (const txn of transactions) {
                    await saveTransaction(txn);
                }
                console.log(`Migrated ${transactions.length} items from localStorage to IndexedDB.`);
            }
            localStorage.removeItem('harvest_transactions');
        } catch (e) {
            console.error("Migration failed", e);
        }
    }
}

function getTodayKey() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // "2026-03-25"
}

// ---- Add Transaction ----
async function addTransaction(e) {
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

    await saveTransaction(txn);

    // Reset form
    descEl.value = '';
    amountEl.value = '';
    categoryEl.value = 'Sale';

    showToast(`Added: ${description} — Rs ${amount.toLocaleString()}`);
    switchTab('activity');
    await refreshUI();
}

// ---- Delete Transaction ----
async function deleteTransaction(id) {
    await deleteTransactionFromDB(id);
    showToast('Transaction deleted.');
    await refreshUI();
}

// ---- Clear All Data ----
async function clearAllData() {
    if (confirm('Are you sure you want to clear ALL transactions?')) {
        await clearAllTransactionsDB();
        showToast('All data cleared.');
        await refreshUI();
    }
}

// ---- UI Rendering ----
async function refreshUI() {
    const transactions = await getTransactions();
    const todayKey = getTodayKey();
    
    const todayTxns = transactions.filter(t => t.date === todayKey);
    const todayAmount = todayTxns.reduce((sum, t) => sum + t.amount, 0);

    // Activity Tab Stats
    document.getElementById('today-volume').textContent = formatCurrency(todayAmount);
    document.getElementById('today-count').textContent = todayTxns.length;

    // Activity Tab - Recent Transactions (show last 5)
    renderTransactionList('recent-transactions', todayTxns.slice(0, 5), true);

    // Summary Tab Stats based on filter
    const filter = document.getElementById('summary-filter')?.value || 'today';
    let summaryTxns = [];
    let summaryTitle = "TOTAL EARNINGS TODAY";

    if (filter === 'today') {
        summaryTxns = todayTxns;
    } else if (filter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoKey = weekAgo.toISOString().split('T')[0];
        summaryTxns = transactions.filter(t => t.date >= weekAgoKey);
        summaryTitle = "EARNINGS LAST 7 DAYS";
    } else if (filter === 'month') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        const monthAgoKey = monthAgo.toISOString().split('T')[0];
        summaryTxns = transactions.filter(t => t.date >= monthAgoKey);
        summaryTitle = "EARNINGS LAST 30 DAYS";
    } else {
        summaryTxns = transactions;
        summaryTitle = "ALL TIME EARNINGS";
    }

    const summaryAmount = summaryTxns.reduce((sum, t) => sum + t.amount, 0);
    const summaryCount = summaryTxns.length;

    const summaryLabelEl = document.querySelector('.summary-total-label');
    if (summaryLabelEl) summaryLabelEl.textContent = summaryTitle;

    document.getElementById('summary-total').textContent = formatCurrency(summaryAmount);
    document.getElementById('summary-count').textContent = `${summaryCount} transaction${summaryCount !== 1 ? 's' : ''}`;
    renderTransactionList('summary-transactions', summaryTxns, false);
}

function renderTransactionList(containerId, transactions, showLimit) {
    const container = document.getElementById(containerId);

    if (transactions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-receipt"></i>
                <p>No transactions found.</p>
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
        // Add date if it's not today (for week/month/all history)
        const dateStr = t.date !== getTodayKey() ? `<div class="txn-date" style="font-size: 10px; color: var(--primary-light); margin-top: 2px;">${t.date}</div>` : '';

        return `
            <div class="txn-item">
                <div class="txn-icon">
                    <i class="ph-bold ${icon}"></i>
                </div>
                <div class="txn-info">
                    <div class="txn-desc">${escapeHtml(t.description)}</div>
                    <div class="txn-meta">${t.category} • ${t.time}</div>
                    ${dateStr}
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
document.addEventListener('DOMContentLoaded', async () => {
    setGreeting();
    await migrateLocalStorage();
    await refreshUI();
});

// ---- Register Service Worker ----
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {
            // Service worker registration failed, app still works
        });
    });
}
