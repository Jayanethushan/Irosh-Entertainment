// PWA Registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.error('Service Worker registration failed', err));
}

const firebaseConfig = {
  apiKey: "AIzaSyA1n8wRePqEdAiU3_VfqSFvYJ_k4Gfcp2U",
  authDomain: "irosh-entertainment.firebaseapp.com",
  databaseURL: "https://irosh-entertainment-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "irosh-entertainment",
  storageBucket: "irosh-entertainment.firebasestorage.app",
  messagingSenderId: "308550605993",
  appId: "1:308550605993:web:a732a3741542b883e61db8",
  measurementId: "G-P7Z60RKKPL"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Global State
let bookingsData = {};
let calendar;

// ==========================================
// GOOGLE CALENDAR API CONFIGURATION
// ==========================================
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'YOUR_GOOGLE_API_KEY_HERE';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

let tokenClient;
let gapiInited = false;
let gisInited = false;

document.addEventListener('DOMContentLoaded', () => {
    if (typeof gapi !== 'undefined') gapi.load('client', initializeGapiClient);
    if (typeof google !== 'undefined' && google.accounts) gisLoaded();
});

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
    } catch(e) { console.error('GAPI Error', e); }
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: '', 
    });
    gisInited = true;
}

async function authorizeGoogleCalendar() {
    return new Promise((resolve, reject) => {
        if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com') {
            return reject("NO_CLIENT_ID");
        }
        if (!gapiInited || !gisInited) return reject("API_NOT_LOADED");
        
        if (gapi.client.getToken() === null) {
            tokenClient.callback = async (resp) => {
                if (resp.error) reject(resp);
                else resolve(true);
            };
            tokenClient.requestAccessToken({prompt: 'consent'});
        } else {
            resolve(true); 
        }
    });
}

async function clearGoogleCalendarEvents() {
    try {
        await authorizeGoogleCalendar();
        showToast("Deleting Google Calendar events... Please wait.");
        
        let req = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'q': '[IROSH_POS_SYNC]', // Magic tag
            'showDeleted': false,
        });
        
        const events = req.result.items;
        for(let ev of events) {
            await gapi.client.calendar.events.delete({ 'calendarId': 'primary', 'eventId': ev.id });
        }
        alert("Google Calendar events cleared successfully!");
    } catch(err) {
        if(err !== "NO_CLIENT_ID") {
            console.error(err);
            alert("Failed to clear Google Calendar.");
        }
    }
}

async function syncAllBookingsToGoogle(dataObj) {
    try {
        await authorizeGoogleCalendar();
        showToast("Syncing data to Google Calendar... Please wait.");
        
        for(let id in dataObj) {
            await insertOrUpdateGoogleEvent(id, dataObj[id]);
        }
        alert("All bookings synced to Google Calendar!");
    } catch(err) {
        if(err !== "NO_CLIENT_ID") console.error("Sync Error", err);
    }
}

async function insertOrUpdateGoogleEvent(id, booking) {
    if(GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com') return false;
    try {
        // Quick check if API authorized silently
        if(gapi.client.getToken() === null) return false; 
        
        const dateObj = new Date(booking.eventDate);
        const endDate = new Date(dateObj.getTime() + 4 * 60 * 60 * 1000); // 4 hours later
        
        const event = {
            'summary': `Booking: ${booking.customerName}`,
            'description': `Services: ${booking.services.join(', ')}\nPhone: ${booking.customerPhone}\nTotal: Rs.${booking.totalAmount}\nAdvance: Rs.${booking.advanceAmount}\n\n[IROSH_POS_SYNC] [ID:${id}]`,
            'start': { 'dateTime': dateObj.toISOString(), 'timeZone': 'Asia/Colombo' },
            'end': { 'dateTime': endDate.toISOString(), 'timeZone': 'Asia/Colombo' },
            'colorId': booking.status === 'Confirmed' ? '11' : (booking.status === 'Completed' ? '10' : '5')
        };
        
        // Check if event already exists
        let req = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'q': `[ID:${id}]`,
            'showDeleted': false,
        });
        
        if(req.result.items && req.result.items.length > 0) {
            const existingId = req.result.items[0].id;
            await gapi.client.calendar.events.update({ 'calendarId': 'primary', 'eventId': existingId, 'resource': event });
        } else {
            await gapi.client.calendar.events.insert({ 'calendarId': 'primary', 'resource': event });
        }
        return true;
    } catch(e) {
        console.error("Google Event Error", e);
        return false;
    }
}
// ==========================================

// Status Indicators Logic
function updateNetworkStatus() {
    const dot = document.getElementById('network-dot');
    if(!dot) return;
    if (navigator.onLine) {
        dot.className = 'status-dot online';
        dot.title = 'Network: Online';
    } else {
        dot.className = 'status-dot';
        dot.title = 'Network: Offline';
    }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
document.addEventListener('DOMContentLoaded', updateNetworkStatus);

function setSyncingState() {
    const dbDot = document.getElementById('db-dot');
    if(dbDot) {
        dbDot.className = 'status-dot syncing';
        dbDot.title = 'Database: Syncing...';
    }
}
function setSyncedState() {
    const dbDot = document.getElementById('db-dot');
    if(dbDot && dbDot.className.includes('syncing')) {
        setTimeout(() => {
            dbDot.className = 'status-dot online';
            dbDot.title = 'Database: Synced';
        }, 800);
    } else if (dbDot) {
        dbDot.className = 'status-dot online';
        dbDot.title = 'Database: Synced';
    }
}
function setOfflineDbState() {
    const dbDot = document.getElementById('db-dot');
    if(dbDot) {
        dbDot.className = 'status-dot';
        dbDot.title = 'Database: Offline/Local';
    }
}

// Monitor Firebase Connection
db.ref('.info/connected').on('value', function(snap) {
    if (snap.val() === true) {
        setSyncedState();
    } else {
        setOfflineDbState();
    }
});

// Hardware (HW) module for Printing
const HW = {
    usbDevice: null,
    btChar: null,
    
    async connectUSB() {
        try {
            this.usbDevice = await navigator.usb.requestDevice({ filters: [] });
            await this.usbDevice.open();
            await this.usbDevice.selectConfiguration(1);
            await this.usbDevice.claimInterface(0);
            document.getElementById('usb-status').innerText = "Connected ✅";
            document.getElementById('usb-status').style.color = "var(--success)";
            alert("USB Printer Connected successfully!");
        } catch(e) {
            console.error(e);
            alert("USB Connection Failed.");
        }
    },
    
    async connectBT() {
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{services: ['000018f0-0000-1000-8000-00805f9b34fb']}],
                optionalServices: ['0000e781-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
            });
            const server = await device.gatt.connect();
            const services = await server.getPrimaryServices();
            if(services.length > 0) {
                const chars = await services[0].getCharacteristics();
                if(chars.length > 0) this.btChar = chars[0];
            }
            document.getElementById('bt-status').innerText = `Connected: ${device.name} ✅`;
            document.getElementById('bt-status').style.color = "var(--success)";
            alert("Bluetooth Printer Connected successfully!");
        } catch(err) {
            console.error(err);
            alert("Bluetooth Connection Failed.");
        }
    },
    
    async printReceipt(booking, balance) {
        if(!this.usbDevice && !this.btChar) {
            alert("No hardware printer connected. Falling back to browser print.");
            window.print();
            return;
        }

        const ESC = 0x1B; const GS = 0x1D; const LF = 0x0A;
        const init = [ESC, 0x40];
        const alignCenter = [ESC, 0x61, 1];
        const alignLeft = [ESC, 0x61, 0];
        const cut = [LF, LF, LF, LF, GS, 0x56, 0x00];
        
        let text = "";
        text += "IROSH ENTERTAINMENT\n";
        text += "Galewela, Sri Lanka.\n";
        text += "Sound, Light & Photography\n";
        text += "--------------------------------\n";
        text += `Date: ${new Date().toLocaleDateString()}\n`;
        text += `Customer: ${booking.customerName}\n`;
        text += `Event: ${new Date(booking.eventDate).toLocaleDateString()}\n`;
        text += "--------------------------------\n";
        text += `Services:\n${booking.services.join(', ')}\n`;
        text += "--------------------------------\n";
        text += `Total:      Rs. ${booking.totalAmount.toLocaleString()}\n`;
        text += `Advance:    Rs. ${booking.advanceAmount.toLocaleString()}\n`;
        text += `Balance:    Rs. ${balance.toLocaleString()}\n`;
        text += "--------------------------------\n";
        text += "Thank you for choosing us!\n";
        text += "Tel: 0777-432573 / 077-9441340\n";

        const enc = new TextEncoder();
        const textBytes = enc.encode(text);
        
        const full = new Uint8Array(init.length + alignCenter.length + textBytes.length + cut.length);
        full.set(init, 0);
        full.set(alignCenter, init.length);
        full.set(textBytes, init.length + alignCenter.length);
        full.set(cut, init.length + alignCenter.length + textBytes.length);

        try {
            if(this.btChar) {
                for(let i=0; i<full.length; i+=512) {
                    await this.btChar.writeValue(full.slice(i, i+512));
                }
            } else if (this.usbDevice) {
                await this.usbDevice.transferOut(1, full);
            }
        } catch(e) {
            console.error("Print Error:", e);
            alert("Print failed. Please check printer connection.");
        }
    }
};

// DOM Elements
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const viewTitle = document.getElementById('view-title');

// Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        
        const viewId = item.getAttribute('data-view');
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');
        viewTitle.innerText = item.querySelector('span').innerText;

        if(viewId === 'calendar') {
            setTimeout(() => {
                initCalendar();
            }, 50);
        }
    });
});

// Real-time listener for Bookings
const bookingsRef = db.ref('bookings');
bookingsRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if(data) {
        bookingsData = data;
        localStorage.setItem('irosh_bookings', JSON.stringify(data));
    } else {
        bookingsData = {};
    }
    const syncStatus = document.getElementById('sync-status');
    const syncDot = document.getElementById('sync-dot');
    if(syncStatus) syncStatus.innerText = "Online Sync";
    if(syncDot) syncDot.style.background = "var(--success)";
    updateAllViews();
}, (error) => {
    // Offline mode fallback
    const localData = localStorage.getItem('irosh_bookings');
    if(localData) {
        bookingsData = JSON.parse(localData);
    }
    const syncStatus = document.getElementById('sync-status');
    const syncDot = document.getElementById('sync-dot');
    if(syncStatus) syncStatus.innerText = "Offline (Local)";
    if(syncDot) syncDot.style.background = "var(--danger)";
    updateAllViews();
});

function printBrowserReceipt(booking, balance) {
    const paper = document.getElementById('receipt-paper-content');
    const printArea = document.getElementById('receipt-print-area');

    // Build payment history
    let paymentItemsHtml = '';
    if (booking.paymentHistory && booking.paymentHistory.length > 0) {
        paymentItemsHtml = booking.paymentHistory.map((p, i) => {
            const dt = new Date(p.date);
            return `<div class="rp-payment-item">
                <span>${i === 0 ? '📌 Advance' : `💳 ${dt.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}`}</span>
                <span>Rs. ${(p.amount || 0).toLocaleString()}</span>
            </div>`;
        }).join('');
    } else if ((booking.advanceAmount || 0) > 0) {
        paymentItemsHtml = `<div class="rp-payment-item"><span>📌 Advance</span><span>Rs. ${booking.advanceAmount.toLocaleString()}</span></div>`;
    }

    const evDate = booking.eventDate 
        ? new Date(booking.eventDate).toLocaleDateString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric' })
        : 'N/A';
    const printDate = new Date().toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });

    // On-screen preview (new styled classes)
    paper.innerHTML = `
        <div class="rp-header">
            <img src="logo.svg" alt="Irosh Entertainment" onerror="this.style.display='none'">
            <h2>IROSH ENT.</h2>
            <p>Galewela, Sri Lanka</p>
            <p>Sound · Light · Photography</p>
        </div>

        <div class="rp-row"><span>Date:</span><span>${printDate}</span></div>
        <div class="rp-row bold"><span>Customer:</span><span>${booking.customerName}</span></div>
        <div class="rp-row"><span>Phone:</span><span>${booking.customerPhone || 'N/A'}</span></div>
        <div class="rp-row"><span>Event:</span><span>${evDate}</span></div>

        <hr class="rp-divider">
        <div class="rp-section-title">── Services ──</div>
        ${(booking.services || []).map(s => `<div class="rp-service">• ${s}</div>`).join('')}

        <div class="rp-totals">
            <div class="rp-total-row"><span>Total Amount:</span><span>Rs. ${(booking.totalAmount || 0).toLocaleString()}</span></div>
            ${paymentItemsHtml ? `
            <hr class="rp-divider" style="margin:4px 0;">
            <div class="rp-section-title">── Payments ──</div>
            <div class="rp-payments">${paymentItemsHtml}</div>
            ` : ''}
            <div class="rp-total-row"><span>Total Paid:</span><span>Rs. ${(booking.advanceAmount || 0).toLocaleString()}</span></div>
            ${balance > 0
                ? `<div class="rp-balance"><span>Balance Due:</span><span>Rs. ${balance.toLocaleString()}</span></div>`
                : `<div class="rp-cleared">✅ PAYMENT CLEARED</div>`
            }
        </div>

        <div class="rp-footer">
            Thank You For Choosing Us!
            <strong>📞 0777-432573 · 077-9441340</strong>
        </div>
    `;

    // Also populate hidden print area (for actual printing)
    printArea.innerHTML = paper.innerHTML;

    // Show preview modal
    document.getElementById('receipt-preview-modal').classList.add('active');

    // Wire Print Now button
    const btnPrint = document.getElementById('btn-print-now');
    const newBtn = btnPrint.cloneNode(true); // remove old listeners
    btnPrint.replaceWith(newBtn);
    newBtn.addEventListener('click', () => {
        window.print();
    });
}

// Receipt preview modal close handlers
document.addEventListener('DOMContentLoaded', () => {
    const closePreview = () => document.getElementById('receipt-preview-modal').classList.remove('active');
    document.getElementById('close-receipt-preview').addEventListener('click', closePreview);
    document.getElementById('btn-close-preview').addEventListener('click', closePreview);
});


function updateAllViews() {
    try {
        updateDashboard();
        updateBookingsView();
        updateCalendar();
        updatePendingBalances();
        updateAdminStats();
    } catch (e) {
        alert("UI Update Error: " + e.message + "\nStack: " + e.stack);
    }
}

function updateDashboard() {
    const bookings = Object.values(bookingsData);
    document.getElementById('stat-total-bookings').innerText = bookings.length;
    document.getElementById('stat-pending').innerText = bookings.filter(b => b.status === 'Pending').length;
    document.getElementById('stat-confirmed').innerText = bookings.filter(b => b.status === 'Confirmed').length;

    // Recent Table
    const recentList = document.getElementById('recent-list');
    recentList.innerHTML = '';
    
    const recent = bookings.filter(b => b.status !== 'Completed').sort((a,b) => b.createdAt - a.createdAt).slice(0, 5);
    if(recent.length === 0) {
        recentList.innerHTML = '<div style="padding:15px; text-align:center; color:var(--text-muted);">No recent pending bookings.</div>';
    }
    
    // Find booking ID function
    const findId = (bObj) => Object.keys(bookingsData).find(key => bookingsData[key] === bObj);

    recent.forEach(b => {
        const balance = b.totalAmount - b.advanceAmount;
        const div = document.createElement('div');
        div.className = 'booking-row';
        div.style.cursor = 'pointer';
        
        if (balance <= 0) {
            div.style.borderLeft = '5px solid var(--success)';
            div.style.backgroundColor = 'rgba(39, 174, 96, 0.15)';
        }
        
        div.innerHTML = `
            <div>
                <div class="bk-title">${b.customerName}</div>
                <div class="bk-date">${new Date(b.eventDate).toLocaleDateString()}</div>
                <div class="bk-service">${b.services[0]}${b.services.length>1?' + more':''}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end;">
                <span class="badge ${b.status.toLowerCase()}">${b.status}</span>
                <div class="bk-amount" style="margin-top:auto; font-size:0.8rem; color:var(--text-muted);">Total: Rs.${b.totalAmount}</div>
                <div class="bk-amount" style="${balance <= 0 ? 'color:var(--success);' : 'color:var(--danger);'} font-weight:bold;">Bal: Rs.${balance}</div>
            </div>
        `;
        div.onclick = () => openActionModal(findId(b), b);
        recentList.appendChild(div);
    });
}

function updateBookingsView() {
    const grid = document.getElementById('bookings-grid');
    grid.innerHTML = '';
    
    const filterStatus = document.getElementById('filter-status').value;
    const search = document.getElementById('search-booking').value.toLowerCase();

    const sortedEntries = Object.entries(bookingsData).sort((a, b) => new Date(a[1].eventDate) - new Date(b[1].eventDate));

    sortedEntries.forEach(([id, b]) => {
        // Completed bookings live in Admin Panel only — hide from All Bookings
        if (b.status === 'Completed') return;
        if (filterStatus !== 'all' && b.status !== filterStatus) return;
        if (search && !b.customerName.toLowerCase().includes(search) && !b.customerPhone.includes(search)) return;

        const card = document.createElement('div');
        card.className = 'panel';
        card.innerHTML = `
            <div class="panel-header" style="border-bottom:none; padding-bottom:0;">
                <span class="bk-title">${b.customerName}</span>
                <span class="badge ${b.status.toLowerCase()}">${b.status}</span>
            </div>
            <div class="panel-body" style="padding-top:10px;">
                <div class="bk-date" style="margin-bottom:8px;"><i class="fa-regular fa-calendar"></i> ${new Date(b.eventDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                <div class="bk-service" style="margin-bottom:12px;"><i class="fa-solid fa-layer-group"></i> ${b.services.join(', ')}</div>
                <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:15px;"><i class="fa-brands fa-whatsapp"></i> ${b.customerPhone}</div>
                <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:10px;">
                    <div><div style="font-size:0.7rem; color:var(--text-muted);">TOTAL</div><div class="bk-amount">Rs.${b.totalAmount.toLocaleString()}</div></div>
                    <div style="text-align:right;"><div style="font-size:0.7rem; color:var(--text-muted);">BALANCE</div><div class="bk-amount" style="color:var(--danger);">Rs.${(b.totalAmount - b.advanceAmount).toLocaleString()}</div></div>
                </div>
            </div>
        `;
        card.style.cursor = "pointer";
        card.addEventListener('click', () => openActionModal(id, b));
        grid.appendChild(card);
    });
}

document.getElementById('filter-status').addEventListener('change', updateBookingsView);
document.getElementById('search-booking').addEventListener('input', updateBookingsView);

// Close admin detail modal
document.getElementById('close-admin-detail-modal').addEventListener('click', () => {
    document.getElementById('admin-detail-modal').classList.remove('active');
});

// Calendar Initialization
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (calendar) {
        calendar.destroy();
    }
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        height: 600,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: [],
        eventClick: function(info) {
            const id = info.event.id;
            const b = bookingsData[id];
            if(b) openActionModal(id, b);
        }
    });
    calendar.render();
    updateCalendar();
}

document.addEventListener('DOMContentLoaded', function() {
    // We do not init calendar here anymore to avoid the hidden div bug.
    // It will be initialized when the Calendar tab is clicked.
});

function updateCalendar() {
    if (!calendar) return;
    calendar.removeAllEvents();
    Object.entries(bookingsData).forEach(([id, b]) => {
        calendar.addEvent({
            id: id,
            title: `${b.customerName} - ${b.services[0]}`,
            start: b.eventDate,
            backgroundColor: b.status === 'Confirmed' ? 'var(--accent)' : (b.status === 'Completed' ? 'var(--success)' : 'var(--warning)'),
            borderColor: 'transparent'
        });
    });
}

// Modal Logics
const bookingModal = document.getElementById('booking-modal');
const actionModal = document.getElementById('action-modal');
const settingsModal = document.getElementById('settings-modal');

document.getElementById('btn-new-booking').addEventListener('click', () => {
    document.getElementById('booking-form').reset();
    document.getElementById('booking-id').value = '';
    
    // Set default date to now (rounded to hour)
    const now = new Date();
    now.setMinutes(0);
    const localISO = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    document.getElementById('event-date').value = localISO;
    
    document.getElementById('modal-title').innerText = 'New Booking';
    bookingModal.classList.add('active');
});

document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        bookingModal.classList.remove('active');
        actionModal.classList.remove('active');
        settingsModal.classList.remove('active');
    });
});

// Save Booking Logic
document.getElementById('booking-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
        const id = document.getElementById('booking-id').value;
        
        const services = [];
        document.querySelectorAll('.service-cb:checked').forEach(cb => services.push(cb.value));

        if (services.length === 0) {
            alert("Please select at least one service.");
            return;
        }
        
        const total = parseFloat(document.getElementById('total-amount').value) || 0;
        const advance = parseFloat(document.getElementById('advance-amount').value) || 0;

        const booking = {
            customerName: document.getElementById('customer-name').value,
            customerPhone: document.getElementById('customer-phone').value,
            eventDate: document.getElementById('event-date').value,
            services: services,
            totalAmount: total,
            advanceAmount: advance,
            status: id ? bookingsData[id].status : 'Pending',
            createdAt: id ? bookingsData[id].createdAt : Date.now(),
            paymentHistory: id && bookingsData[id].paymentHistory ? bookingsData[id].paymentHistory : (advance > 0 ? [{ amount: advance, date: Date.now() }] : [])
        };
        
        // Close modal immediately so dashboard refreshes feel instant
        bookingModal.classList.remove('active');
        
        setSyncingState();
        if (id) {
            db.ref('bookings/' + id).update(booking).then(() => {
                setSyncedState();
                insertOrUpdateGoogleEvent(id, booking);
            }).catch(err => { setSyncedState(); console.error("Firebase Update Error:", err); });
        } else {
            const newRef = db.ref('bookings').push();
            newRef.set(booking).then(async () => {
                setSyncedState();
                // Try Google Calendar Auto-sync (only if API is configured)
                await insertOrUpdateGoogleEvent(newRef.key, booking);
            }).catch(err => { setSyncedState(); console.error("Firebase Save Error:", err); });
        }
    } catch(err) {
        console.error("Form Save Error:", err);
        alert("Save Error: " + err.message);
    }
});

function openActionModal(id, b) {
    const body = document.getElementById('action-modal-body');
    const footer = document.getElementById('action-modal-footer');
    
    const balance = b.totalAmount - b.advanceAmount;
    
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; align-items:center;">
            <h3 style="font-size:1.5rem;">${b.customerName}</h3>
            <span class="badge ${b.status.toLowerCase()}">${b.status}</span>
        </div>
        <div style="font-family:'JetBrains Mono'; font-size:0.9rem; line-height:1.6; color:var(--text-muted);">
            <p><i class="fa-brands fa-whatsapp"></i> ${b.customerPhone}</p>
            <p><i class="fa-regular fa-calendar"></i> ${new Date(b.eventDate).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short'})}</p>
            <p><i class="fa-solid fa-list"></i> ${b.services.join(', ')}</p>
        </div>
        
        <div style="margin-top:20px; background:var(--bg-sec); border:1px solid var(--border); border-radius:4px; padding:15px; font-family:'JetBrains Mono';">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span>Total Amount:</span> <span>Rs. ${b.totalAmount.toLocaleString()}</span></div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span>Total Paid:</span> <span style="color:var(--accent);">Rs. ${b.advanceAmount.toLocaleString()}</span></div>
            <div style="height:1px; background:var(--border); margin:10px 0;"></div>
            <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:bold;"><span>Balance Due:</span> <span style="color:var(--danger);">Rs. ${balance.toLocaleString()}</span></div>
        </div>

        ${balance > 0 ? `
            <div style="margin-top:20px; display:flex; gap:10px;">
                <input type="number" id="pay-amount-input" placeholder="Enter amount..." style="flex:1; padding:8px; border-radius:4px; border:1px solid var(--border); background:var(--bg-card); color:#fff;">
                <button class="btn btn-success" id="btn-add-payment">Add Payment</button>
            </div>
        ` : ''}
    `;

    footer.innerHTML = `
        <button class="btn btn-success" id="btn-print-receipt" style="margin-right:auto;"><i class="fa-solid fa-print"></i> Print Receipt</button>
        ${b.status === 'Pending' ? `<button class="btn btn-primary" id="btn-confirm-booking"><i class="fa-brands fa-whatsapp"></i> Confirm (WA)</button>` : ''}
        ${balance <= 0 ? `<button class="btn btn-success" id="btn-share-admin"><i class="fa-solid fa-share-nodes"></i> Share to Admin Panel</button>` : ''}
        <button class="btn btn-warning" id="btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-danger" id="btn-delete"><i class="fa-solid fa-trash"></i> Delete</button>
    `;

    // Add Payment Logic — uses live data to avoid stale balance
    if (balance > 0) {
        document.getElementById('btn-add-payment').addEventListener('click', () => {
            const payInput = document.getElementById('pay-amount-input');
            const amt = parseFloat(payInput.value);

            // Read live values from bookingsData (not stale closure)
            const liveBooking = bookingsData[id];
            if (!liveBooking) { alert("Booking not found."); return; }
            const livePaid = liveBooking.advanceAmount || 0;
            const liveBalance = liveBooking.totalAmount - livePaid;

            if(isNaN(amt) || amt <= 0) {
                alert("Please enter a valid payment amount.");
                return;
            }
            if(amt > liveBalance) {
                alert(`Amount too high. Max balance is Rs. ${liveBalance}`);
                return;
            }
            
            if(confirm(`Add payment of Rs.${amt.toLocaleString()}? Remaining balance will be Rs.${(liveBalance - amt).toLocaleString()}`)) {
                let history = liveBooking.paymentHistory ? [...liveBooking.paymentHistory] : [];
                if(livePaid > 0 && history.length === 0) {
                    history.push({ amount: livePaid, date: liveBooking.createdAt || Date.now() });
                }
                history.push({ amount: amt, date: Date.now() });
                
                const newPaid = livePaid + amt;
                
                setSyncingState();
                db.ref('bookings/' + id).update({ 
                    advanceAmount: newPaid, 
                    paymentHistory: history
                }).then(() => {
                    setSyncedState();
                    // Re-open modal with fresh data so balance updates immediately
                    const updatedBooking = bookingsData[id];
                    if (updatedBooking) {
                        openActionModal(id, updatedBooking);
                    } else {
                        actionModal.classList.remove('active');
                    }
                }).catch(err => {
                    setSyncedState();
                    alert("Error saving payment: " + err.message);
                });
            }
        });
    }

    // Print Receipt
    document.getElementById('btn-print-receipt').addEventListener('click', () => {
        printBrowserReceipt(b, balance);
    });

    const btnConfirm = document.getElementById('btn-confirm-booking');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            setSyncingState();
            db.ref('bookings/' + id).update({ status: 'Confirmed' }).then(setSyncedState);
            
            let msg = `Hello ${b.customerName},%0A%0AYour booking for *${b.services.join(', ')}* on ${new Date(b.eventDate).toLocaleDateString()} is *CONFIRMED*. ✅%0A%0A`;
            if(b.advanceAmount > 0) {
                msg += `Advance Received: Rs. ${b.advanceAmount.toLocaleString()}%0ABalance to Pay: Rs. ${balance.toLocaleString()}%0A%0A`;
            } else {
                msg += `Total Amount: Rs. ${b.totalAmount.toLocaleString()}%0A%0A`;
            }
            msg += `Thank you for choosing *Irosh Entertainment*! 🎵📸`;
            
            let phone = b.customerPhone.trim();
            if(phone.startsWith('0')) phone = '94' + phone.substring(1);
            else if (!phone.startsWith('94') && !phone.startsWith('+94')) phone = '94' + phone; 
            phone = phone.replace(/[^0-9]/g, '');

            window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
            actionModal.classList.remove('active');
        });
    }

    const btnShareAdmin = document.getElementById('btn-share-admin');
    if (btnShareAdmin) {
        btnShareAdmin.onclick = () => {
            if(confirm("Are you sure you want to share this fully paid booking to the Admin Panel? It will be removed from the dashboard.")) {
                setSyncingState();
                db.ref('bookings/' + id).update({ status: 'Completed' }).then(() => {
                    setSyncedState();
                    actionModal.classList.remove('active');
                });
            }
        };
    }

    document.getElementById('btn-edit').addEventListener('click', () => {
        document.getElementById('booking-id').value = id;
        document.getElementById('customer-name').value = b.customerName;
        document.getElementById('customer-phone').value = b.customerPhone;
        document.getElementById('event-date').value = b.eventDate;
        
        document.querySelectorAll('.service-cb').forEach(cb => {
            cb.checked = b.services.includes(cb.value);
        });

        document.getElementById('total-amount').value = b.totalAmount;
        document.getElementById('advance-amount').value = b.advanceAmount;
        
        document.getElementById('modal-title').innerText = 'Edit Booking';
        actionModal.classList.remove('active');
        bookingModal.classList.add('active');
    });

    document.getElementById('btn-delete').addEventListener('click', () => {
        if(confirm("Are you sure you want to delete this booking?")) {
            setSyncingState();
            db.ref('bookings/' + id).remove().then(setSyncedState);
            actionModal.classList.remove('active');
        }
    });

    actionModal.classList.add('active');
}
window.openActionModal = openActionModal;

// Pending Balances
function updatePendingBalances() {
    const tbody = document.querySelector('#balances-table tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const bookings = Object.entries(bookingsData).filter(([id, b]) => (b.totalAmount - b.advanceAmount) > 0 && b.status !== 'Completed');
    
    bookings.forEach(([id, b]) => {
        const balance = b.totalAmount - b.advanceAmount;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${b.customerName}</strong></td>
            <td>${b.customerPhone}</td>
            <td>${new Date(b.eventDate).toLocaleDateString()}</td>
            <td>Rs. ${b.totalAmount.toLocaleString()}</td>
            <td style="color:var(--danger); font-weight:bold;">Rs. ${balance.toLocaleString()}</td>
            <td style="text-align:right;"><button class="btn btn-primary btn-sm" onclick="openActionModal('${id}', ${JSON.stringify(b).replace(/"/g, '&quot;')})">View</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// Settings Logistics
function openSettings() {
    // Clear PIN inputs
    document.getElementById('pin-current').value = '';
    document.getElementById('pin-new').value = '';
    document.getElementById('pin-confirm').value = '';
    settingsModal.classList.add('active');
}

document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('btn-settings-mobile').addEventListener('click', openSettings);

// Hardware Connection Listeners
document.getElementById('btn-usb-connect').addEventListener('click', () => HW.connectUSB());
document.getElementById('btn-bt-connect').addEventListener('click', () => HW.connectBT());

// Change PIN Listener
document.getElementById('btn-change-pin').addEventListener('click', () => {
    const currentPin = document.getElementById('pin-current').value;
    const newPin = document.getElementById('pin-new').value;
    const confirmPin = document.getElementById('pin-confirm').value;
    const savedPin = localStorage.getItem('admin_pin') || '1234';

    if(currentPin !== savedPin) {
        alert("Incorrect Current PIN!");
        return;
    }
    if(!newPin || newPin.length < 4) {
        alert("New PIN must be at least 4 digits.");
        return;
    }
    if(newPin !== confirmPin) {
        alert("New PIN and Confirm PIN do not match.");
        return;
    }

    localStorage.setItem('admin_pin', newPin);
    alert("PIN changed successfully! ✅");
    
    document.getElementById('pin-current').value = '';
    document.getElementById('pin-new').value = '';
    document.getElementById('pin-confirm').value = '';
});

// Admin Dashboard Logics
document.getElementById('btn-unlock-admin').addEventListener('click', () => {
    const entered = document.getElementById('admin-pin').value;
    const saved = localStorage.getItem('admin_pin') || '1234';
    if(entered === saved) {
        document.getElementById('admin-lock').style.display = 'none';
        document.getElementById('admin-content').style.display = 'block';
    } else {
        alert("Incorrect PIN");
    }
});

function updateAdminStats() {
    let totalIncome = 0;
    let totalPending = 0;
    
    Object.values(bookingsData).forEach(b => {
        if(b.status === 'Completed') {
            totalIncome += b.totalAmount;
        } else {
            totalIncome += b.advanceAmount;
            totalPending += (b.totalAmount - b.advanceAmount);
        }
    });
    
    if(document.getElementById('admin-total-income')) {
        document.getElementById('admin-total-income').innerText = `Rs. ${totalIncome.toLocaleString()}`;
        document.getElementById('admin-total-pending').innerText = `Rs. ${totalPending.toLocaleString()}`;
    }

    const adminTable = document.querySelector('#admin-completed-table tbody');
    if(adminTable) {
        adminTable.innerHTML = '';
        Object.entries(bookingsData)
            .filter(([k, b]) => b.status === 'Completed')
            .sort(([,a],[,b]) => (b.eventDate || '').localeCompare(a.eventDate || ''))
            .forEach(([bookingId, b]) => {
                const tr = document.createElement('tr');
                const evDate = b.eventDate ? new Date(b.eventDate).toLocaleDateString() : 'Unknown';
                tr.innerHTML = `
                    <td><strong>${b.customerName}</strong><br><small style="color:var(--text-muted)">${b.customerPhone || ''}</small></td>
                    <td>${evDate}</td>
                    <td style="font-size:0.82rem;">${b.services ? b.services.join(', ') : ''}</td>
                    <td style="color:var(--success); font-weight:bold;">Rs. ${(b.totalAmount || 0).toLocaleString()}</td>
                    <td>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button class="btn btn-primary" style="padding:5px 10px; font-size:0.8rem;" onclick="openAdminDetailModal('${bookingId}')"><i class="fa-solid fa-eye"></i> View</button>
                            <button class="btn btn-success" style="padding:5px 10px; font-size:0.8rem;" onclick="printAdminReceipt('${bookingId}')"><i class="fa-solid fa-print"></i> Print</button>
                        </div>
                    </td>
                `;
                adminTable.appendChild(tr);
            });
    }
}

function openAdminDetailModal(bookingId) {
    const b = bookingsData[bookingId];
    if (!b) return;

    const balance = (b.totalAmount || 0) - (b.advanceAmount || 0);
    const evDate = b.eventDate ? new Date(b.eventDate).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' }) : 'Unknown';
    const modal = document.getElementById('admin-detail-modal');
    const body = document.getElementById('admin-detail-body');
    const footer = document.getElementById('admin-detail-footer');

    // Build payment history rows
    let historyHtml = '<p style="color:var(--text-muted); font-size:0.85rem;">No payment records.</p>';
    if (b.paymentHistory && b.paymentHistory.length > 0) {
        historyHtml = `
            <table style="width:100%; border-collapse:collapse; font-family:'JetBrains Mono'; font-size:0.85rem;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border);">
                        <th style="padding:6px; text-align:left;">#</th>
                        <th style="padding:6px; text-align:left;">Date & Time</th>
                        <th style="padding:6px; text-align:right;">Amount (Rs.)</th>
                    </tr>
                </thead>
                <tbody>
                    ${b.paymentHistory.map((p, i) => `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:6px;">${i + 1}</td>
                            <td style="padding:6px; color:var(--text-muted);">${new Date(p.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                            <td style="padding:6px; text-align:right; color:var(--success); font-weight:bold;">Rs. ${(p.amount || 0).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else if (b.advanceAmount > 0) {
        historyHtml = `<p style="color:var(--text-muted); font-size:0.85rem;">Full advance payment of Rs. ${b.advanceAmount.toLocaleString()} was made at booking.</p>`;
    }

    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h3 style="font-size:1.4rem;">${b.customerName}</h3>
            <span class="badge completed">Completed</span>
        </div>
        <div style="font-family:'JetBrains Mono'; font-size:0.88rem; line-height:1.8; color:var(--text-muted); margin-bottom:15px;">
            <div><i class="fa-brands fa-whatsapp"></i> ${b.customerPhone || 'N/A'}</div>
            <div><i class="fa-regular fa-calendar"></i> ${evDate}</div>
            <div><i class="fa-solid fa-list"></i> ${b.services ? b.services.join(', ') : 'N/A'}</div>
        </div>
        <div style="background:var(--bg-sec); border:1px solid var(--border); border-radius:6px; padding:12px; margin-bottom:15px; font-family:'JetBrains Mono';">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Total Amount:</span><span>Rs. ${(b.totalAmount || 0).toLocaleString()}</span></div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Total Paid:</span><span style="color:var(--success);">Rs. ${(b.advanceAmount || 0).toLocaleString()}</span></div>
            <div style="height:1px; background:var(--border); margin:8px 0;"></div>
            <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>Balance:</span><span style="color:${balance <= 0 ? 'var(--success)' : 'var(--danger)'};">Rs. ${balance.toLocaleString()} ${balance <= 0 ? '✅' : ''}</span></div>
        </div>
        <div style="margin-bottom:5px; font-size:0.9rem; font-weight:600; color:var(--accent);"><i class="fa-solid fa-clock"></i> Payment History</div>
        <div style="background:var(--bg-sec); border:1px solid var(--border); border-radius:6px; padding:10px;">
            ${historyHtml}
        </div>
    `;

    footer.innerHTML = `
        <button class="btn btn-success" id="btn-admin-print" style="margin-right:auto;"><i class="fa-solid fa-print"></i> Print Receipt</button>
        <button class="btn" style="background:var(--bg-sec);" onclick="document.getElementById('admin-detail-modal').classList.remove('active')">Close</button>
    `;

    document.getElementById('btn-admin-print').onclick = () => {
        printBrowserReceipt(b, balance);
    };

    modal.classList.add('active');
}

function printAdminReceipt(bookingId) {
    const b = bookingsData[bookingId];
    if (!b) return;
    const balance = (b.totalAmount || 0) - (b.advanceAmount || 0);
    printBrowserReceipt(b, balance);
}

document.getElementById('btn-export-db').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bookingsData));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "irosh_bookings_backup.json");
    dlAnchorElem.click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if(confirm("Are you sure you want to restore data? This will overwrite existing data.")) {
                setSyncingState();
                await db.ref('bookings').set(data).then(setSyncedState);
                if(confirm("Data restored successfully!\nDo you want to sync all these bookings to Google Calendar now? (Requires Google API configured)")) {
                    syncAllBookingsToGoogle(data);
                } else {
                    alert("Data restored successfully!");
                }
            }
        } catch(err) {
            alert("Invalid JSON file");
        }
    };
    reader.readAsText(file);
});

document.getElementById('btn-clear-db').addEventListener('click', () => {
    const pin = prompt("Enter Admin PIN to clear all data:");
    const saved = localStorage.getItem('admin_pin') || '1234';
    if(pin === saved) {
        if(confirm("WARNING: This will delete ALL bookings permanently. Are you sure?")) {
            setSyncingState();
            db.ref('bookings').remove().then(setSyncedState);
            
            if(confirm("Database cleared.\nDo you ALSO want to clear all Irosh POS events from your Google Calendar? (Requires Google API configured)")) {
                clearGoogleCalendarEvents();
            }
        }
    } else if (pin) {
        alert("Incorrect PIN");
    }
});

window.onclick = function(event) {
    if (event.target == bookingModal) bookingModal.classList.remove('active');
    if (event.target == actionModal) actionModal.classList.remove('active');
    if (event.target == settingsModal) settingsModal.classList.remove('active');
}
