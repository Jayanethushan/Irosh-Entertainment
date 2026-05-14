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
        text += "Contact: 07X XXX XXXX\n";

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
        document.getElementById('sync-status').innerText = "Online Sync";
        document.getElementById('sync-dot').style.background = "var(--success)";
    }
    updateAllViews();
}, (error) => {
    // Offline mode fallback
    const localData = localStorage.getItem('irosh_bookings');
    if(localData) {
        bookingsData = JSON.parse(localData);
        document.getElementById('sync-status').innerText = "Offline (Local)";
        document.getElementById('sync-dot').style.background = "var(--danger)";
        updateAllViews();
    }
});

function updateAllViews() {
    updateDashboard();
    updateBookingsView();
    updateCalendar();
    updatePendingBalances();
    updateAdminStats();
}

window.addEventListener('online', () => {
    document.getElementById('sync-status').innerText = "Online Sync";
    document.getElementById('sync-dot').style.background = "var(--success)";
});
window.addEventListener('offline', () => {
    document.getElementById('sync-status').innerText = "Offline (Local)";
    document.getElementById('sync-dot').style.background = "var(--danger)";
});

function updateDashboard() {
    const bookings = Object.values(bookingsData);
    document.getElementById('stat-total-bookings').innerText = bookings.length;
    document.getElementById('stat-pending').innerText = bookings.filter(b => b.status === 'Pending').length;
    document.getElementById('stat-confirmed').innerText = bookings.filter(b => b.status === 'Confirmed').length;

    // Recent Table
    const recentList = document.getElementById('recent-list');
    recentList.innerHTML = '';
    
    const recent = bookings.sort((a,b) => b.createdAt - a.createdAt).slice(0, 5);
    recent.forEach(b => {
        const div = document.createElement('div');
        div.className = 'booking-row';
        div.innerHTML = `
            <div>
                <div class="bk-title">${b.customerName}</div>
                <div class="bk-date">${new Date(b.eventDate).toLocaleDateString()}</div>
                <div class="bk-service">${b.services[0]}${b.services.length>1?' + more':''}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end;">
                <span class="badge ${b.status.toLowerCase()}">${b.status}</span>
                <div class="bk-amount" style="margin-top:auto;">Rs.${b.totalAmount}</div>
            </div>
        `;
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

// Save Booking
document.getElementById('booking-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('booking-id').value;
    
    const services = [];
    document.querySelectorAll('.service-cb:checked').forEach(cb => services.push(cb.value));

    if (services.length === 0) {
        alert("Please select at least one service.");
        return;
    }

    const booking = {
        customerName: document.getElementById('customer-name').value,
        customerPhone: document.getElementById('customer-phone').value,
        eventDate: document.getElementById('event-date').value,
        services: services,
        totalAmount: parseFloat(document.getElementById('total-amount').value),
        advanceAmount: parseFloat(document.getElementById('advance-amount').value || 0),
        status: id ? bookingsData[id].status : 'Pending',
        createdAt: id ? bookingsData[id].createdAt : Date.now()
    };

    if (id) {
        db.ref('bookings/' + id).update(booking);
    } else {
        const newRef = db.ref('bookings').push();
        newRef.set(booking);
        
        const title = encodeURIComponent(`Booking: ${booking.customerName}`);
        const details = encodeURIComponent(`Services: ${booking.services.join(', ')}\nPhone: ${booking.customerPhone}\nTotal: Rs.${booking.totalAmount}\nAdvance: Rs.${booking.advanceAmount}`);
        const dateObj = new Date(booking.eventDate);
        const isoDate = dateObj.toISOString().replace(/-|:|\.\d\d\d/g, "");
        const endDate = new Date(dateObj.getTime() + 4 * 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, ""); 
        
        const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${isoDate}/${endDate}&details=${details}`;
        
        if(confirm("Booking Saved! Do you want to add this event to your Google Calendar now?")) {
            window.open(gcalUrl, '_blank');
        }
    }
    
    bookingModal.classList.remove('active');
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
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span>Advance Paid:</span> <span style="color:var(--accent);">Rs. ${b.advanceAmount.toLocaleString()}</span></div>
            <div style="height:1px; background:var(--border); margin:10px 0;"></div>
            <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:bold;"><span>Balance Due:</span> <span style="color:var(--danger);">Rs. ${balance.toLocaleString()}</span></div>
        </div>
    `;

    footer.innerHTML = `
        ${b.status === 'Pending' ? `<button class="btn btn-primary" id="btn-confirm-booking"><i class="fa-brands fa-whatsapp"></i> Confirm (WA)</button>` : ''}
        ${b.status === 'Confirmed' ? `<button class="btn btn-success" id="btn-finalize"><i class="fa-solid fa-print"></i> Hardware Print Bill</button>
                                      <button class="btn btn-success" id="btn-complete-booking"><i class="fa-solid fa-check"></i> Complete Event</button>` : ''}
        <button class="btn btn-warning" id="btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-danger" id="btn-delete"><i class="fa-solid fa-trash"></i> Delete</button>
    `;

    if(b.status === 'Pending') {
        document.getElementById('btn-confirm-booking').addEventListener('click', () => {
            db.ref('bookings/' + id).update({ status: 'Confirmed' });
            
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

    if(b.status === 'Confirmed') {
        document.getElementById('btn-finalize').addEventListener('click', () => {
            actionModal.classList.remove('active');
            HW.printReceipt(b, balance);
        });
        
        document.getElementById('btn-complete-booking').onclick = () => {
            if(confirm("Are you sure you want to mark this event as Completed?")) {
                db.ref('bookings/' + id).update({ status: 'Completed' });
                actionModal.classList.remove('active');
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
            db.ref('bookings/' + id).remove();
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
                await db.ref('bookings').set(data);
                alert("Data restored successfully!");
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
            db.ref('bookings').remove();
            alert("Database cleared.");
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
