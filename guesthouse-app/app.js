// app.js - Main application logic

document.addEventListener('DOMContentLoaded', () => {
    // --- State & DOM Elements ---
    const App = {
        currentView: 'dashboard',
        calendarStartDate: new Date(),
        container: document.getElementById('view-container'),
        pageTitle: document.getElementById('page-title'),
        navItems: document.querySelectorAll('.nav-item'),
        modalOverlay: document.getElementById('modal-overlay'),
        modalContainer: document.getElementById('modal-container'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        toastContainer: null, // Initialized in init

        getAppBaseUrl() {
            let origin = window.location.origin;
            if (!origin || origin === 'null' || origin === 'file://') {
                origin = 'http://localhost:5500';
            }
            const path = window.location.pathname.replace(/[^/]*$/, '');
            return `${origin}${path}`;
        },

        getPortalLink(token) {
            return `${this.getAppBaseUrl()}portal.html?token=${token}`;
        },

        async init() {
            // Initialize Toast Container
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            this.toastContainer.className = 'toast-container';
            document.body.appendChild(this.toastContainer);

            // Setup Login/Logout listeners immediately
            this.setupAuthHandlers();

            this.bindEvents();

            // Check if user is already logged in
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                this.userId = session.user.id;
                // Load User Profile
                this.userProfileData = await DataStore.getProfile(session.user.id);
                this.userRole = this.userProfileData ? this.userProfileData.role : 'Receptionist';

                document.getElementById('login-view').style.display = 'none';
                document.getElementById('app-view').style.display = 'flex';
                await DataStore.preloadCache();
                this.applyRBAC();
                this.setupRealtimeSubscriptions();
                await this.updateNotifications();
                await this.renderView('dashboard');
            }
        },

        canAccessView(role, viewName) {
            const permissions = {
                'Admin': ['dashboard', 'guests', 'bookings', 'rooms', 'calendar', 'housekeeping', 'invoices', 'performance', 'logs', 'messages'],
                'Receptionist': ['dashboard', 'guests', 'bookings', 'rooms', 'calendar', 'housekeeping', 'invoices', 'messages'],
                'Housekeeper': ['dashboard', 'housekeeping', 'messages']
            };

            const allowedViews = permissions[role] || permissions['Receptionist'];
            return allowedViews.includes(viewName);
        },

        applyRBAC() {
            const profile = this.userProfileData;
            const role = this.userRole || 'Receptionist';

            // 1. Update the Header Display
            const displayElement = document.querySelector('.user-profile span');
            if (displayElement) {
                const displayName = profile?.name || 'Staff Member';
                displayElement.textContent = `${displayName} (${role})`;
            }

            // 2. Apply Role-Specific Nav Visibility
            document.querySelectorAll('.nav-item').forEach(item => {
                const view = item.getAttribute('data-view');
                if (this.canAccessView(role, view)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });

            // 3. If they are currently on a forbidden view, kick them to Dashboard
            if (!this.canAccessView(role, this.currentView)) {
                console.warn(`Access denied for ${role} to ${this.currentView}. Redirecting to dashboard.`);
                this.renderView('dashboard');
            }

            console.log(`RBAC applied for: ${role}`);
        },



        setupRealtimeSubscriptions() {
            if (this.isSubscribed) return;
            this.isSubscribed = true;

            // Debounce function to prevent "lag" from multiple rapid changes
            let refreshTimeout;
            const debouncedRefresh = () => {
                if (this.isProcessingAction) return; // Skip background re-renders during heavy operations
                clearTimeout(refreshTimeout);
                refreshTimeout = setTimeout(() => {
                    console.log('Refreshing view due to background change...');
                    this.renderView(this.currentView);
                }, 300); // Wait 300ms for changes to settle
            };

            // Subscribe to all relevant tables
            const tables = ['rooms', 'bookings', 'guests', 'invoices', 'booking_add_ons'];
            tables.forEach(table => {
                DataStore.subscribeToChanges(table, (payload) => {
                    console.log(`Change detected in ${table}:`, payload);
                    DataStore.handleRealtimeUpdate(table, payload);
                    debouncedRefresh();
                });
            });

            // Specific subscription for notifications
            DataStore.subscribeToChanges('notifications', (payload) => {
                if (payload.eventType === 'INSERT') {
                    const newNotif = payload.new;
                    const role = this.userRole || 'Receptionist';
                    if (newNotif.target_role === role) {
                        console.log('New notification received:', newNotif);
                        this.updateNotifications();
                        // Optional: Show a toast or play a sound
                    }
                }
            });
        },

        setupAuthHandlers() {
            // Handle Login Form
            const loginForm = document.getElementById('login-form');
            if (loginForm) {
                loginForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('email').value;
                    const password = document.getElementById('password').value;
                    const btn = document.querySelector('.login-btn');
                    const originalText = btn.innerHTML;

                    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';
                    btn.disabled = true;

                    try {
                        const { data, error } = await supabaseClient.auth.signInWithPassword({
                            email,
                            password
                        });

                        if (error) throw error;

                        // Load User Profile after login
                        this.userId = data.user.id;
                        this.userProfileData = await DataStore.getProfile(data.user.id);
                        this.userRole = this.userProfileData ? this.userProfileData.role : 'Receptionist';

                        document.getElementById('login-view').style.display = 'none';
                        document.getElementById('app-view').style.display = 'flex';

                        await DataStore.preloadCache();
                        this.applyRBAC();
                        this.setupRealtimeSubscriptions();
                        await this.updateNotifications();
                        await this.renderView('dashboard');

                    } catch (err) {
                        console.error('Login error:', err);
                        this.showDialog({ title: 'Login Failed', message: err.message, type: 'error' });
                    } finally {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                });

                // Password Visibility Toggle
                const toggleBtn = document.getElementById('toggle-password');
                const passwordInput = document.getElementById('password');
                const eyeIcon = document.getElementById('eye-icon');

                if (toggleBtn && passwordInput) {
                    toggleBtn.addEventListener('click', () => {
                        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                        passwordInput.setAttribute('type', type);
                        eyeIcon.classList.toggle('fa-eye');
                        eyeIcon.classList.toggle('fa-eye-slash');
                    });
                }

                // Forgot Password Logic
                const forgotBtn = document.getElementById('btn-forgot-password');
                if (forgotBtn) {
                    forgotBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        const email = document.getElementById('email').value;

                        if (!email) {
                            this.showDialog({ title: 'Email Required', message: 'Please enter your email address first to receive reset instructions.', type: 'error' });
                            return;
                        }

                        const originalText = forgotBtn.innerHTML;
                        forgotBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...';
                        forgotBtn.style.pointerEvents = 'none';

                        try {
                            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                                redirectTo: window.location.href // Redirect back to this page
                            });

                            if (error) throw error;

                            this.showDialog({ title: 'Reset Link Sent', message: 'Reset instructions have been sent to ' + email + '. Please check your inbox.', type: 'success' });
                        } catch (err) {
                            console.error('Reset error:', err);
                            this.showDialog({ title: 'Error', message: err.message, type: 'error' });
                        } finally {
                            forgotBtn.innerHTML = originalText;
                            forgotBtn.style.pointerEvents = 'auto';
                        }
                    });
                }
            }

            // Handle Logout
            const logoutBtn = document.getElementById('btn-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async (e) => {
                    e.preventDefault();

                    // 1. Sign out of Auth
                    await supabaseClient.auth.signOut();

                    // 2. Kill all active database connections (Fixes the error!)
                    await supabaseClient.removeAllChannels();

                    // 3. Reset state
                    this.isSubscribed = false;

                    document.getElementById('app-view').style.display = 'none';
                    document.getElementById('login-view').style.display = 'flex';
                });
            }

        },

        bindEvents() {
            // Mobile Menu Toggle
            const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
            const sidebarOverlay = document.getElementById('sidebar-overlay');
            if (mobileMenuToggle && sidebarOverlay) {
                mobileMenuToggle.addEventListener('click', () => {
                    document.body.classList.toggle('sidebar-open');
                });
                sidebarOverlay.addEventListener('click', () => {
                    document.body.classList.remove('sidebar-open');
                });
            }

            // Navigation
            this.navItems.forEach(item => {
                item.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const view = item.getAttribute('data-view');
                    this.setActiveNav(item);
                    document.body.classList.remove('sidebar-open'); // Close on navigation
                    await this.renderView(view);
                });
            });

            // Modal
            this.btnCloseModal.addEventListener('click', () => this.closeModal());
            this.modalOverlay.addEventListener('click', (e) => {
                if (e.target === this.modalOverlay) this.closeModal();
            });

            // Notification Handlers
            const btnClearNotifs = document.getElementById('btn-clear-notifications');
            if (btnClearNotifs) {
                btnClearNotifs.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const role = this.userRole || 'Receptionist';
                    const unread = await DataStore.getNotifications(role);
                    await Promise.all(unread.map(n => DataStore.markNotificationAsRead(n.id)));
                    await this.updateNotifications();
                    this.showToast('All notifications cleared.');
                });
            }
        },

        setActiveNav(activeItem) {
            this.navItems.forEach(item => item.classList.remove('active'));
            activeItem.classList.add('active');
        },

        async updateNotifications() {
            const role = this.userRole || 'Receptionist';
            const notifications = await DataStore.getNotifications(role);
            const countLabel = document.getElementById('notification-count');
            const listContainer = document.getElementById('notifications-list');

            if (!countLabel || !listContainer) return;

            if (notifications.length > 0) {
                countLabel.textContent = notifications.length;
                countLabel.classList.remove('hidden');

                listContainer.innerHTML = notifications.map(n => `
                    <div class="notification-item unread" onclick="App.handleNotificationClick('${n.id}')">
                        <div class="notification-message">${n.message}</div>
                        <div class="notification-time">${this.formatTimeAgo(n.created_at)}</div>
                    </div>
                `).join('');
            } else {
                countLabel.classList.add('hidden');
                listContainer.innerHTML = '<div class="empty-state">No new notifications</div>';
            }
        },

        async handleNotificationClick(id) {
            await DataStore.markNotificationAsRead(id);
            await this.updateNotifications();
            this.showToast('Notification marked as read.');
        },

        formatTimeAgo(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMin = Math.floor(diffMs / 60000);

            if (diffMin < 1) return 'Just now';
            if (diffMin < 60) return `${diffMin}m ago`;
            const diffHrs = Math.floor(diffMin / 60);
            if (diffHrs < 24) return `${diffHrs}h ago`;
            return date.toLocaleDateString();
        },

        // --- View Rendering ---
        async renderView(viewName) {
            // Permission Check
            const role = this.userRole || 'Receptionist';
            if (!this.canAccessView(role, viewName)) {
                console.error(`Unauthorized access attempt to ${viewName} by role ${role}`);
                if (viewName !== 'dashboard') {
                    return this.renderView('dashboard');
                }
                return;
            }

            this.currentView = viewName;
            const template = document.getElementById(`tpl-${viewName}`);
            if (!template) return;

            // Update Header
            this.pageTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);

            // Inject Content
            this.container.innerHTML = template.innerHTML;

            // Initialize specific view logic
            const viewActions = {
                'dashboard': () => this.initDashboard(),
                'rooms': () => this.initRooms(),
                'bookings': () => this.initBookings(),
                'guests': () => this.initGuests(),
                'performance': () => this.initPerformance(),
                'calendar': () => this.initCalendar(),
                'housekeeping': () => this.initHousekeeping(),
                'invoices': () => this.initInvoicing(),
                'logs': () => this.initLogs(),
                'messages': () => this.initMessages()
            };

            if (viewActions[viewName]) {
                // Show a subtle loading state on the container
                this.container.style.opacity = '0.5';
                this.container.style.pointerEvents = 'none';

                await viewActions[viewName]();

                this.container.style.opacity = '1';
                this.container.style.pointerEvents = 'all';
            }

            // Global search listener for the view
            this.setupViewSearch(viewName);
        },

        setupViewSearch(viewName) {
            const searchInput = document.getElementById('view-search');
            if (!searchInput) return;

            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                this.filterViewData(viewName, term);
            });
        },

        filterViewData(viewName, term) {
            const rows = document.querySelectorAll('.data-table tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        },

        // --- Dashboard View ---
        async initDashboard() {
            const [rooms, bookings] = await Promise.all([
                DataStore.getRooms(),
                DataStore.getBookings()
            ]);

            const occupiedRooms = rooms.filter(r => r.status === 'Occupied').length;
            const activeBookings = bookings.filter(b => b.status === 'Active').length;
            const readyRooms = rooms.filter(r => r.status === 'Available' && r.cleanliness === 'Clean').length;

            document.getElementById('metric-occupied-rooms').textContent = occupiedRooms;
            document.getElementById('metric-active-bookings').textContent = activeBookings;
            document.getElementById('metric-ready-rooms').textContent = readyRooms;

            // Recent Bookings Table
            const tbody = document.getElementById('dashboard-recent-bookings');
            tbody.innerHTML = '';

            // Get top 5 most recent active bookings
            const recent = bookings.filter(b => b.status === 'Active').slice(0, 5);

            if (recent.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No recent bookings found.</td></tr>`;
            } else {
                recent.forEach(b => {
                    const room = rooms.find(r => r.id === b.roomId);
                    const roomNumber = room ? room.number : 'Unknown';
                    const tr = document.createElement('tr');
                    tr.style.cursor = 'pointer';
                    tr.onclick = () => App.showBookingDetailsModal(b.id);
                    tr.innerHTML = `
                        <td><strong>${b.guestName}</strong></td>
                        <td>Room ${roomNumber}</td>
                        <td>
                            <div>${this.formatDate(b.checkIn)}</div>
                            ${b.actualCheckIn ? `<div style="font-size:0.75rem; color:var(--accent-green); margin-top:2px;" title="Actual Check-in Time"><i class="fa-solid fa-clock"></i> ${this.formatDateTime(b.actualCheckIn)}</div>` : ''}
                        </td>
                        <td>
                            <div>${this.formatDate(b.checkOut)}</div>
                            ${b.actualCheckOut ? `<div style="font-size:0.75rem; color:var(--accent-red); margin-top:2px;" title="Actual Check-out Time"><i class="fa-solid fa-clock"></i> ${this.formatDateTime(b.actualCheckOut)}</div>` : ''}
                        </td>
                        <td><span class="badge badge-info">${b.status}</span></td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // --- Service Requests (Staff Management) ---
            const existingRequestsCard = document.getElementById('dashboard-service-requests-card');
            if (existingRequestsCard) {
                existingRequestsCard.remove();
            }

            const requestsContainer = document.createElement('div');
            requestsContainer.id = 'dashboard-service-requests-card';
            requestsContainer.className = 'dashboard-card';
            requestsContainer.innerHTML = `
                <div class="card-header">
                    <h3><i class="fa-solid fa-bell-concierge"></i> Service Requests</h3>
                </div>
                <div class="card-body">
                    <div class="data-table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Guest/Room</th>
                                    <th>Item</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="dashboard-service-requests">
                                <!-- Requests injected here -->
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            // Insert before recent bookings
            const recentBookingsCard = tbody.closest('.card');
            recentBookingsCard.parentElement.insertBefore(requestsContainer, recentBookingsCard);

            const reqTbody = document.getElementById('dashboard-service-requests');
            const pendingAddOns = [];
            bookings.forEach(b => {
                b.addOns.forEach(ao => {
                    if (ao.status === 'Requested') {
                        pendingAddOns.push({ bookingId: b.id, guestName: b.guestName, roomNumber: b.roomNumber, ...ao });
                    }
                });
            });

            if (pendingAddOns.length === 0) {
                reqTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-secondary);">No pending requests.</td></tr>`;
            } else {
                pendingAddOns.forEach(req => {
                    const tr = document.createElement('tr');
                    let actionHtml = '';
                    if (req.status === 'Requested') {
                        actionHtml = `<button class="btn btn-small btn-success" onclick="App.updateServiceStatus('${req.id}', 'Delivered')">Deliver</button>`;
                    } else if (req.status === 'Delivered') {
                        actionHtml = `<span style="font-size:0.8rem; color:var(--accent-primary);">Waiting for Guest...</span>`;
                    }

                    // Time logic
                    let timeHtml = '';
                    let badgeHtml = '';
                    if (req.createdAt) {
                        const diffMs = Date.now() - new Date(req.createdAt).getTime();
                        const diffMins = Math.floor(diffMs / 60000);

                        let timeStr = 'Just now';
                        if (diffMins >= 60) {
                            timeStr = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;
                        } else if (diffMins > 0) {
                            timeStr = `${diffMins}m ago`;
                        }

                        timeHtml = `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;"><i class="fa-regular fa-clock"></i> ${timeStr}</div>`;

                        if (diffMins < 5 && req.status === 'Requested') {
                            badgeHtml = `<span class="badge badge-success" style="font-size:0.6rem; margin-left:5px; padding:2px 6px;">NEW</span>`;
                        }
                    }

                    tr.innerHTML = `
                        <td><strong>${req.guestName}</strong> (Room ${req.roomNumber})</td>
                        <td>${req.name} x${req.quantity} ${badgeHtml} ${timeHtml}</td>
                        <td><span class="status-pill status-${req.status.toLowerCase()}">${req.status}</span></td>
                        <td>${actionHtml}</td>
                    `;
                    reqTbody.appendChild(tr);
                });
            }
            
            // Attach Quick Book listener
            const quickBookBtn = document.getElementById('btn-quick-book');
            if (quickBookBtn) {
                quickBookBtn.onclick = () => this.showQuickBookModal();
            }
        },

        // --- Rooms View ---
        async initRooms() {
            const grid = document.getElementById('rooms-grid');
            const rooms = await DataStore.getRooms();
            grid.innerHTML = '';

            rooms.forEach(room => {
                const isDirty = room.cleanliness === 'Dirty';
                const statusClass = `status-${room.status.toLowerCase()} ${isDirty ? 'room-dirty' : ''}`;

                let displayStatus = room.status;
                let badgeClass = room.status === 'Occupied' ? 'badge-danger' : (room.status === 'Maintenance' ? 'badge-warning' : 'badge-success');

                if (room.status === 'Available' && isDirty) {
                    displayStatus = 'Unavailable';
                    badgeClass = 'badge-warning';
                }

                const card = document.createElement('div');
                card.className = `room-card ${statusClass}`;
                card.innerHTML = `
                    <div class="room-header">
                        <span class="room-number">${room.number}</span>
                        <div style="display: flex; gap: 5px;">
                            ${isDirty ? `<span class="badge badge-dirty"><i class="fa-solid fa-broom"></i> DIRTY</span>` : ''}
                            <span class="badge ${badgeClass}">${displayStatus}</span>
                        </div>
                    </div>
                    <div class="room-type">${room.type} Room</div>
                    <div class="room-details">
                        <span class="room-price">E${room.price}/night</span>
                        <div style="display: flex; gap: 8px;">
                             <button class="btn btn-small" style="background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary);" onclick="App.showRoomQRCode('${room.id}', '${room.number}')" title="Guest Portal QR Code"><i class="fa-solid fa-qrcode"></i></button>
                            <button class="btn btn-small btn-primary" onclick="App.showChannelManager('${room.id}')" title="iCal Channel Sync"><i class="fa-solid fa-sync"></i></button>
                            ${room.status === 'Occupied' ? `<button class="btn btn-small btn-success" onclick="App.showAddServiceModalForRoom('${room.id}')" title="Add Service/Post Charge"><i class="fa-solid fa-cart-plus"></i></button>` : ''}
                            ${room.status !== 'Occupied' ? `<button class="btn btn-small btn-warning" onclick="App.toggleMaintenance('${room.id}')" title="${room.status === 'Maintenance' ? 'Mark Available' : 'Mark for Maintenance'}"><i class="fa-solid fa-wrench"></i></button>` : ''}
                            ${room.status === 'Available' ? `<button class="btn btn-small btn-danger" onclick="App.deleteRoom('${room.id}')" title="Delete Room"><i class="fa-solid fa-trash"></i></button>` : ''}
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });

            document.getElementById('btn-add-room').addEventListener('click', () => {
                this.showAddRoomModal();
            });
        },

        async showRoomQRCode(roomId, roomNumber) {
            const portalUrl = `${this.getAppBaseUrl()}portal.html?room=${roomId}`;

            const html = `
                <div id="qr-modal-content" style="text-align:center; padding: 1rem 0;">
                    <div style="margin-bottom:1rem;">
                        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:1.5rem;">
                            Place this QR code in <strong>Room ${roomNumber}</strong>. Guests can scan it to access their personal portal during their stay.
                        </p>
                        <div id="qr-code-container" style="display:inline-block; background:white; padding:20px; border-radius:16px;"></div>
                    </div>
                    <p style="font-size:0.75rem; color:var(--text-secondary); word-break:break-all; margin: 1rem 0;">${portalUrl}</p>
                    <div class="form-actions" style="margin-top:1.5rem;">
                        <button class="btn btn-secondary" onclick="window.print()">
                            <i class="fa-solid fa-print"></i> Print QR Code
                        </button>
                        <button class="btn btn-primary" onclick="App.downloadQRCode('${roomNumber}')">
                            <i class="fa-solid fa-download"></i> Download PNG
                        </button>
                    </div>
                </div>
            `;
            this.openModal(`Room ${roomNumber} — Guest Portal QR Code`, html);
            document.getElementById('modal-container').style.maxWidth = '500px';

            // Generate QR code using QRCode.js library
            try {
                new QRCode(document.getElementById('qr-code-container'), {
                    text: portalUrl,
                    width: 220,
                    height: 220,
                    colorDark: '#0f172a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (err) {
                document.getElementById('qr-code-container').innerHTML = `
                    <p style="color:var(--accent-red);">QR library not loaded. Ensure qrcode.min.js is included.</p>
                    <p style="word-break:break-all; color:var(--text-secondary); font-size:0.8rem;">${portalUrl}</p>
                `;
            }
        },

        downloadQRCode(roomNumber) {
            const canvas = document.querySelector('#qr-code-container canvas');
            if (!canvas) { this.showToast('QR code not ready yet.', 'error'); return; }
            const link = document.createElement('a');
            link.download = `room-${roomNumber}-qr.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        },

        async showAddRoomModal() {
            const html = `
                <form id="form-add-room">
                    <div class="form-group">
                        <label>Room Number</label>
                        <input type="text" id="input-room-number" class="form-control" required placeholder="e.g. 104">
                    </div>
                    <div class="form-group">
                        <label>Room Type</label>
                        <select id="input-room-type" class="form-control">
                            <option value="Single">Single</option>
                            <option value="Double">Double</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Price per Night (E)</label>
                        <input type="number" id="input-room-price" class="form-control" required min="1" value="50">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Room</button>
                    </div>
                </form>
            `;
            this.openModal('Add New Room', html);

            document.getElementById('form-add-room').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
                btn.disabled = true;

                try {
                    const newRoom = {
                        number: document.getElementById('input-room-number').value,
                        type: document.getElementById('input-room-type').value,
                        price: parseFloat(document.getElementById('input-room-price').value),
                        status: 'Available'
                    };
                    await DataStore.addRoom(newRoom);
                    this.closeModal();
                    await this.renderView('rooms');
                    this.showToast(`Room ${newRoom.number} added successfully.`);
                } catch (err) {
                    console.error('Error adding room:', err);
                    this.showDialog({ title: 'Error Saving Room', message: err.message || 'Unknown error', type: 'error' });
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        },

        // --- Bookings View ---
        async initBookings() {
            const tbody = document.getElementById('bookings-list');
            const bookings = await DataStore.getBookings();
            const rooms = await DataStore.getRooms();
            tbody.innerHTML = '';

            if (bookings.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No bookings found.</td></tr>`;
            }

            bookings.forEach(b => {
                const room = rooms.find(r => r.id === b.roomId);
                const roomNumber = room ? room.number : 'Unknown';
                const isComplete = b.status === 'Completed';
                const isCheckoutReq = b.status === 'Checkout Requested';
                const isConfirmed = b.status === 'Confirmed';

                let badgeClass = 'badge-info';
                if (isComplete) badgeClass = 'badge-success';
                else if (isCheckoutReq) badgeClass = 'badge-warning';
                else if (isConfirmed) badgeClass = 'badge-secondary'; // Confirmed/Reserved badge

                const tr = document.createElement('tr');
                let actionHtml = '';

                if (isComplete) {
                    actionHtml = `<button class="btn btn-small btn-secondary" onclick="App.generateInvoice('${b.id}')">Invoice</button>`;
                } else if (isCheckoutReq) {
                    actionHtml = `
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-small" style="background:#f59e0b; color:white; border:none;" onclick="App.completeBooking('${b.id}')">Complete Checkout</button>
                        </div>
                    `;
                } else if (isConfirmed) {
                    actionHtml = `
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-small btn-success" onclick="App.checkInBooking('${b.id}')">Check In</button>
                        </div>
                    `;
                } else {
                    actionHtml = `
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-small btn-primary" onclick="App.completeBooking('${b.id}')">Check Out</button>
                            <button class="btn btn-small btn-success" onclick="App.showAddServiceModal('${b.id}')" title="Add Service/Post Charge"><i class="fa-solid fa-cart-plus"></i></button>
                            <button class="btn btn-small btn-warning" onclick="App.extendBookingModal('${b.id}')" title="Extend Stay/Late Checkout"><i class="fa-solid fa-calendar-plus"></i></button>
                        </div>
                    `;
                }

                tr.innerHTML = `
                    <td><strong>${b.guestName}</strong></td>
                    <td>Room ${roomNumber}</td>
                    <td>
                        <div>${this.formatDate(b.checkIn)}</div>
                        ${b.actualCheckIn ? `<div style="font-size:0.75rem; color:var(--accent-green); margin-top:2px;" title="Actual Check-in Time"><i class="fa-solid fa-clock"></i> ${this.formatDateTime(b.actualCheckIn)}</div>` : ''}
                    </td>
                    <td>
                        <div>${this.formatDate(b.checkOut)}</div>
                        ${b.actualCheckOut ? `<div style="font-size:0.75rem; color:var(--accent-red); margin-top:2px;" title="Actual Check-out Time"><i class="fa-solid fa-clock"></i> ${this.formatDateTime(b.actualCheckOut)}</div>` : ''}
                    </td>
                    <td><span class="badge ${badgeClass}">${b.status}</span></td>
                    <td>${actionHtml}</td>
                `;
                tbody.appendChild(tr);
            });

            document.getElementById('btn-new-booking').addEventListener('click', () => {
                this.showNewBookingModal();
            });
        },

        // --- Guests View ---
        async initGuests() {
            const tbody = document.getElementById('guests-list');
            const [guests, bookings, rooms] = await Promise.all([
                DataStore.getGuests(),
                DataStore.getBookings(),
                DataStore.getRooms()
            ]);

            if (guests.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No guests found.</td></tr>`;
            }

            guests.reverse().forEach(g => {
                // Find current active booking for this guest
                const activeBooking = bookings.find(b => b.guestName === g.name && b.status === 'Active');
                let roomDisplay = '-';

                if (activeBooking) {
                    const room = rooms.find(r => r.id === activeBooking.roomId);
                    roomDisplay = room ? `Room ${room.number}` : '-';
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong>${g.name}</strong>
                        ${g.gender ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${g.gender}</div>` : ''}
                    </td>
                    <td>
                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;" title="${g.email || ''}">${g.email || '-'}</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px; white-space: nowrap;">${g.phone || '-'}</div>
                    </td>
                    <td><span class="badge ${activeBooking ? 'badge-info' : ''}">${roomDisplay}</span></td>
                    <td>${g.id_passport || '-'}</td>
                    <td>${g.car_plate || '-'}</td>
                    <td>${g.location || '-'}</td>
                    <td>${g.notes || '-'}</td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-small btn-primary" onclick="App.showEditGuestModal('${g.id}')" title="Edit Guest"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="btn btn-small btn-danger" onclick="App.deleteGuest('${g.id}')" title="Delete Guest"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.getElementById('btn-new-guest').addEventListener('click', () => {
                this.showAddGuestModal();
            });
        },

        // --- Performance View ---
        async initPerformance() {
            const [rooms, bookings] = await Promise.all([
                DataStore.getRooms(),
                DataStore.getBookings()
            ]);

            const totalRooms = rooms.length;
            const occupiedRooms = rooms.filter(r => r.status === 'Occupied');
            const availableRooms = rooms.filter(r => r.status === 'Available');
            const maintenanceRooms = rooms.filter(r => r.status === 'Maintenance');

            const occupancyRate = totalRooms === 0 ? 0 : Math.round((occupiedRooms.length / totalRooms) * 100);

            // Calculate estimated daily revenue from occupied rooms
            const dailyRevenue = occupiedRooms.reduce((sum, room) => sum + room.price, 0);

            document.getElementById('perf-occupancy').textContent = `${occupancyRate}%`;
            document.getElementById('perf-revenue').textContent = `E${dailyRevenue}`;
            document.getElementById('perf-total-bookings').textContent = bookings.length;

            document.getElementById('perf-occupied-count').textContent = occupiedRooms.length;
            document.getElementById('perf-available-count').textContent = availableRooms.length;
            document.getElementById('perf-maintenance-count').textContent = maintenanceRooms.length;

            if (totalRooms > 0) {
                document.getElementById('perf-occupied-bar').style.width = `${(occupiedRooms.length / totalRooms) * 100}%`;
                document.getElementById('perf-available-bar').style.width = `${(availableRooms.length / totalRooms) * 100}%`;
                document.getElementById('perf-maintenance-bar').style.width = `${(maintenanceRooms.length / totalRooms) * 100}%`;
            } else {
                document.getElementById('perf-occupied-bar').style.width = '0%';
                document.getElementById('perf-available-bar').style.width = '0%';
                document.getElementById('perf-maintenance-bar').style.width = '0%';
            }
        },

        // --- Calendar View ---
        async initCalendar() {
            const grid = document.getElementById('calendar-grid');
            const dateRangeLabel = document.getElementById('calendar-date-range');
            const [rooms, bookings] = await Promise.all([
                DataStore.getRooms(),
                DataStore.getBookings()
            ]);

            document.getElementById('btn-prev-week').onclick = () => {
                this.calendarStartDate.setDate(this.calendarStartDate.getDate() - 7);
                this.initCalendar();
            };
            document.getElementById('btn-next-week').onclick = () => {
                this.calendarStartDate.setDate(this.calendarStartDate.getDate() + 7);
                this.initCalendar();
            };

            const daysToShow = 14;
            const endDate = new Date(this.calendarStartDate);
            endDate.setDate(endDate.getDate() + daysToShow - 1);

            dateRangeLabel.textContent = `${this.formatDate(this.calendarStartDate)} - ${this.formatDate(endDate)}`;

            let html = '<div class="calendar-header-row"><div class="calendar-cell room-name">Room</div>';

            // Build header dates
            for (let i = 0; i < daysToShow; i++) {
                const d = new Date(this.calendarStartDate);
                d.setDate(d.getDate() + i);
                const isToday = d.toDateString() === new Date().toDateString();
                const dayStr = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
                html += `<div class="calendar-cell" style="${isToday ? 'color: var(--accent-primary);' : ''}">${dayStr}</div>`;
            }
            html += '</div>';

            // Build rows for each room
            rooms.forEach(room => {
                html += `<div class="calendar-room-row"><div class="calendar-cell room-name">Room ${room.number} <small>(${room.type})</small></div>`;

                // Track occupied days to render spanning blocks
                for (let i = 0; i < daysToShow; i++) {
                    const currentCellDate = new Date(this.calendarStartDate);
                    currentCellDate.setDate(currentCellDate.getDate() + i);

                    // Check if there is a booking that starts exactly on this day
                    const cellBookings = bookings.filter(b => b.roomId === room.id && new Date(b.checkIn).toDateString() === currentCellDate.toDateString());

                    let cellContent = '';

                    cellBookings.forEach(b => {
                        const checkInDate = new Date(b.checkIn);
                        const checkOutDate = new Date(b.checkOut);
                        const diffTime = Math.abs(checkOutDate - checkInDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        const visibleDaysLeft = daysToShow - i;
                        const spanDays = Math.min(diffDays, visibleDaysLeft);
                        const widthCalc = `calc(${spanDays * 100}% + ${(spanDays - 1)}px)`;

                        cellContent += `<div class="booking-bar status-${b.status}" style="width: ${widthCalc};" title="${b.guestName}">${b.guestName}</div>`;
                    });

                    // Bookings that started BEFORE the calendar start date but are active today
                    if (i === 0) {
                        const ongoingBookings = bookings.filter(b => {
                            return b.roomId === room.id &&
                                new Date(b.checkIn).getTime() < currentCellDate.getTime() &&
                                new Date(b.checkOut).getTime() > currentCellDate.getTime();
                        });
                        ongoingBookings.forEach(b => {
                            const checkOutDate = new Date(b.checkOut);
                            const diffTime = Math.abs(checkOutDate - currentCellDate);
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            const spanDays = Math.min(diffDays, daysToShow);
                            const widthCalc = `calc(${spanDays * 100}% + ${(spanDays - 1)}px)`;
                            cellContent += `<div class="booking-bar status-${b.status}" style="width: ${widthCalc};" title="${b.guestName}">${b.guestName}</div>`;
                        });
                    }

                    html += `<div class="calendar-cell">${cellContent}</div>`;
                }
                html += '</div>';
            });

            grid.innerHTML = html;
        },

        // --- Housekeeping View ---
        async initHousekeeping() {
            // Render Rooms
            const tbodyRooms = document.getElementById('housekeeping-list');
            const rooms = await DataStore.getRooms();
            tbodyRooms.innerHTML = '';

            if (rooms.length === 0) {
                tbodyRooms.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No rooms configured.</td></tr>`;
            } else {
                rooms.forEach(room => {
                    const isClean = room.cleanliness === 'Clean';
                    const tr = document.createElement('tr');
                    let displayStatus = room.status;
                    let badgeClass = room.status === 'Occupied' ? 'badge-danger' : (room.status === 'Maintenance' ? 'badge-warning' : 'badge-success');

                    if (room.status === 'Available') {
                        if (!isClean) {
                            displayStatus = 'Unavailable';
                            badgeClass = 'badge-warning';
                        } else {
                            displayStatus = 'Available';
                            badgeClass = 'badge-success';
                        }
                    }

                    tr.innerHTML = `
                        <td><strong>Room ${room.number}</strong></td>
                        <td>${room.type}</td>
                        <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
                        <td><span class="badge ${isClean ? 'badge-clean' : 'badge-dirty'}">${room.cleanliness || 'Clean'}</span></td>
                        <td>
                            <button class="btn btn-small ${isClean ? 'btn-danger' : 'btn-primary'}" onclick="App.toggleCleanliness('${room.id}')">
                                ${isClean ? 'Mark Dirty' : 'Mark Clean'}
                            </button>
                        </td>
                    `;
                    tbodyRooms.appendChild(tr);
                });
            }

            // Render Housekeepers
            const tbodyHK = document.getElementById('housekeepers-list');
            if (tbodyHK) {
                const housekeepers = await DataStore.getHousekeepers();
                tbodyHK.innerHTML = '';
                if (!housekeepers || housekeepers.length === 0) {
                    tbodyHK.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-secondary);">No housekeepers found in the system.</td></tr>`;
                } else {
                    housekeepers.forEach(hk => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><strong>${hk.name || 'Unnamed'}</strong></td>
                            <td>${hk.email || '-'}</td>
                            <td><span class="badge badge-success">Active</span></td>
                            <td>
                                <button class="btn btn-small btn-secondary" onclick="App.generateHousekeeperQR('${hk.id}', '${hk.name}')">
                                    <i class="fa-solid fa-qrcode"></i> Generate Login QR
                                </button>
                            </td>
                        `;
                        tbodyHK.appendChild(tr);
                    });
                }
            }
        },

        async generateHousekeeperQR(staffId, staffName) {
            try {
                // Generate a login token for this housekeeper
                const token = await DataStore.createHousekeeperLoginToken(staffId);
                const portalUrl = `${this.getAppBaseUrl()}housekeeping-login.html?token=${token}`;

                const html = `
                    <div id="qr-modal-content" style="text-align:center; padding: 1rem 0;">
                        <div style="margin-bottom:1rem;">
                            <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:1.5rem;">
                                Housekeeper <strong>${staffName}</strong> can scan this QR code to securely log into the housekeeping portal. This token is for their device.
                            </p>
                            <div id="qr-code-container" style="display:inline-block; background:white; padding:20px; border-radius:16px;"></div>
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-secondary); word-break:break-all; margin: 1rem 0;">${portalUrl}</p>
                        <div class="form-actions" style="margin-top:1.5rem;">
                            <button class="btn btn-secondary" onclick="window.print()">
                                <i class="fa-solid fa-print"></i> Print QR Code
                            </button>
                        </div>
                    </div>
                `;
                this.openModal(`Login QR: ${staffName}`, html);
                document.getElementById('modal-container').style.maxWidth = '500px';

                new QRCode(document.getElementById('qr-code-container'), {
                    text: portalUrl,
                    width: 220,
                    height: 220,
                    colorDark: '#0f172a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (err) {
                console.error('Error generating housekeeper QR:', err);
                this.showToast('Failed to generate login QR code.', 'error');
            }
        },

        async toggleCleanliness(id) {
            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === id);
            if (!room) return;

            const newCleanliness = room.cleanliness === 'Clean' ? 'Dirty' : 'Clean';
            await DataStore.updateRoomCleanliness(id, newCleanliness);

            // If room becomes clean, notify Receptionist
            if (newCleanliness === 'Clean') {
                await DataStore.addNotification('Receptionist', `Room ${room.number} is now Clean and ready for guests.`);
                await DataStore.addNotification('Admin', `Room ${room.number} has been cleaned.`);
                this.showToast(`Room ${room.number} marked as Clean.`);
            } else {
                this.showToast(`Room ${room.number} marked as Dirty.`);
            }

            if (this.currentView === 'housekeeping') await this.renderView('housekeeping');
            else if (this.currentView === 'rooms') await this.renderView('rooms');
        },

        // --- Invoicing View ---
        async initInvoicing() {
            const tbody = document.getElementById('invoices-list');
            const invoices = await DataStore.getInvoices();
            tbody.innerHTML = '';

            const exportBtn = document.getElementById('btn-export-financials');
            if (exportBtn) {
                exportBtn.onclick = () => this.exportFinancialData(invoices);
            }

            if (invoices.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No invoices generated yet.</td></tr>`;
                return;
            }

            invoices.reverse().forEach(inv => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${inv.id}</strong></td>
                    <td>${this.formatDate(inv.date)}</td>
                    <td>${inv.guestName}</td>
                    <td>Room ${inv.roomNumber}</td>
                    <td>E${inv.amount.toFixed(2)}</td>
                    <td><span class="badge badge-success">Paid</span></td>
                    <td>
                        <button class="btn btn-small btn-secondary" onclick="App.viewInvoiceDetail('${inv.id}')"><i class="fa-solid fa-eye"></i> View</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        },

        exportFinancialData(invoices) {
            if (!invoices || invoices.length === 0) {
                this.showToast('No data available to export.', 'error');
                return;
            }

            // Define CSV headers
            const headers = ['Invoice ID', 'Date', 'Guest Name', 'Room', 'Room Type', 'Nights', 'Price/Night', 'Total Amount', 'Payment Method', 'Status'];

            // Build CSV rows
            const rows = invoices.map(inv => [
                inv.id,
                new Date(inv.date).toLocaleDateString(),
                `"${(inv.guestName || '').replace(/"/g, '""')}"`,
                inv.roomNumber,
                inv.roomType,
                inv.nights,
                inv.pricePerNight,
                inv.amount,
                inv.paymentMethod,
                'Paid'
            ]);

            // Combine into CSV string
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');

            // Create download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `Financial_Report_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showToast('Financial report exported successfully.');
        },


        // --- Modals ---
        openModal(title, contentHTML) {
            this.modalTitle.textContent = title;
            this.modalBody.innerHTML = contentHTML;
            this.modalOverlay.classList.remove('hidden');
        },

        closeModal() {
            this.modalOverlay.classList.add('hidden');
        },



        async showAddServiceModalForRoom(roomId) {
            const bookings = await DataStore.getBookings();
            const activeBooking = bookings.find(b => b.roomId === roomId && b.status === 'Active');
            if (activeBooking) {
                this.showAddServiceModal(activeBooking.id);
            } else {
                this.showToast('No active booking found for this room.', 'error');
            }
        },

        async showAddServiceModal(bookingId) {
            const [booking, availableAddOns] = await Promise.all([
                DataStore.getBookings().then(list => list.find(b => b.id === bookingId)),
                DataStore.getAddOns()
            ]);

            if (!booking) return;

            const addOnHtml = availableAddOns.map(ao => `
                <option value="${ao.id}" data-price="${ao.price}">${ao.name} (E${ao.price})</option>
            `).join('');

            const html = `
                <form id="form-add-service">
                    <div style="margin-bottom: 1.5rem; color: var(--text-secondary);">
                        <p>Adding service for <strong>${booking.guestName}</strong> (Room ${booking.roomNumber || ''})</p>
                    </div>

                    <div class="form-group">
                        <label>Select Service/Item</label>
                        <select id="input-service-id" class="form-control" required>
                            ${addOnHtml}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Quantity</label>
                        <input type="number" id="input-service-qty" class="form-control" value="1" min="1" required>
                    </div>

                    <div class="form-actions" style="margin-top:2rem;">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Post Charge</button>
                    </div>
                </form>
            `;
            this.openModal('Post Charge / Add Service', html);

            document.getElementById('form-add-service').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Posting...';
                btn.disabled = true;

                try {
                    const serviceSelect = document.getElementById('input-service-id');
                    const addOnId = serviceSelect.value;
                    const quantity = parseInt(document.getElementById('input-service-qty').value);
                    const price = parseFloat(serviceSelect.options[serviceSelect.selectedIndex].getAttribute('data-price'));

                    await DataStore.addServiceToBooking(bookingId, addOnId, quantity, price, 'Requested');
                    this.closeModal();
                    this.showToast('Service requested. Guest must confirm via portal.');

                    // Refresh current view if needed
                    if (this.currentView === 'bookings') await this.initBookings();
                } catch (err) {
                    console.error('Error adding service:', err);
                    this.showDialog({ title: 'Error Posting Charge', message: err.message || 'Unknown error', type: 'error' });
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        },

        async copyPortalLink() {
            const input = document.getElementById('portal-link-input');
            if (!input?.value) return;
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(input.value);
                } else {
                    input.select();
                    document.execCommand('copy');
                }
                this.showToast('Portal link copied to clipboard!');
            } catch {
                this.showToast('Could not copy link. Please copy it manually.', 'error');
            }
        },

        async updateServiceStatus(addOnBookingId, status) {
            try {
                await DataStore.updateAddOnStatus(addOnBookingId, status);
                this.showToast(`Service marked as ${status}.`);
                await this.initDashboard(); // Refresh to update list
            } catch (err) {
                console.error('Error updating status:', err);
                this.showDialog({ title: 'Error Updating Status', message: 'Failed to update service status.', type: 'error' });
            }
        },

        async showBookingDetailsModal(bookingId) {
            const bookings = await DataStore.getBookings();
            const rooms = await DataStore.getRooms();
            const guests = await DataStore.getGuests();
            
            const booking = bookings.find(b => b.id === bookingId);
            if (!booking) return;
            
            const room = rooms.find(r => r.id === booking.roomId);
            const guest = guests.find(g => g.id === booking.guestId);
            
            const roomNumber = room ? room.number : 'Unknown';
            const guestName = guest ? guest.name : booking.guestName;
            const guestEmail = guest && guest.email ? guest.email : 'No email';
            const guestPhone = guest && guest.phone ? guest.phone : 'No phone';
            const guestNotes = guest && guest.notes ? guest.notes : 'No notes';

            let actionHtml = '';
            if (booking.status === 'Completed') {
                actionHtml = `<button class="btn btn-secondary" onclick="App.generateInvoice('${booking.id}')">View Invoice</button>`;
            } else if (booking.status === 'Checkout Requested') {
                actionHtml = `<button class="btn btn-warning" onclick="App.completeBooking('${booking.id}')">Complete Checkout</button>`;
            } else if (booking.status === 'Confirmed') {
                actionHtml = `<button class="btn btn-success" onclick="App.checkInBooking('${booking.id}')">Check In</button>`;
            } else {
                actionHtml = `
                    <button class="btn btn-primary" onclick="App.completeBooking('${booking.id}')">Check Out</button>
                    <button class="btn btn-success" onclick="App.showAddServiceModal('${booking.id}')">Add Service</button>
                    <button class="btn btn-warning" onclick="App.extendBookingModal('${booking.id}')">Extend/Late Checkout</button>
                `;
            }

            const html = `
                <div style="padding: 10px 0;">
                    <h3 style="margin-bottom: 10px; color: var(--accent-primary);"><i class="fa-solid fa-user"></i> Guest Information</h3>
                    <p><strong>Name:</strong> ${guestName}</p>
                    <p><strong>Email:</strong> ${guestEmail}</p>
                    <p><strong>Phone:</strong> ${guestPhone}</p>
                    <p><strong>Notes:</strong> ${guestNotes}</p>
                    
                    <h3 style="margin-top: 20px; margin-bottom: 10px; color: var(--accent-primary);"><i class="fa-solid fa-book"></i> Booking Details</h3>
                    <p><strong>Room:</strong> ${roomNumber} ${room ? '(' + room.type + ')' : ''}</p>
                    <p><strong>Status:</strong> <span class="badge badge-info">${booking.status}</span></p>
                    <p><strong>Check-in:</strong> ${this.formatDate(booking.checkIn)}</p>
                    <p><strong>Check-out:</strong> ${this.formatDate(booking.checkOut)}</p>
                    
                    <div style="margin-top: 25px; display: flex; gap: 10px; flex-wrap: wrap;">
                        ${actionHtml}
                        ${guest ? `<button class="btn btn-secondary" onclick="App.showEditGuestModal('${guest.id}')">Edit Guest Info</button>` : ''}
                    </div>
                </div>
            `;
            this.openModal('Booking Details', html);
        },

        async showQuickBookModal() {
            const allRooms = await DataStore.getRooms();
            const bookings = await DataStore.getBookings();

            let roomOptions = allRooms.map(r => {
                const roomBookings = bookings.filter(b => b.roomId === r.id && b.status !== 'Cancelled');
                let nextFreeInfo = '';
                if (roomBookings.length > 0) {
                    const latestBooking = [...roomBookings].sort((a, b) => new Date(b.checkOut) - new Date(a.checkOut))[0];
                    const checkOutDate = new Date(latestBooking.checkOut);
                    const now = new Date();
                    if (checkOutDate > now) {
                        nextFreeInfo = ` - Next Free: ${this.formatDate(latestBooking.checkOut)}`;
                    }
                }
                const isMaintenance = r.status === 'Maintenance';
                const maintenanceLabel = isMaintenance ? ' [MAINTENANCE]' : '';
                return `<option value="${r.id}">Room ${r.number} (${r.type}${maintenanceLabel})${nextFreeInfo}</option>`;
            }).join('');

            if (allRooms.length === 0) {
                roomOptions = `<option value="" disabled selected>No rooms available</option>`;
            }

            const html = `
                <form id="form-quick-book">
                    <h4 style="margin-bottom:10px; color:var(--text-secondary);">Guest Details</h4>
                    <div class="form-group">
                        <label>Guest Name</label>
                        <input type="text" id="qb-guest-name" class="form-control" required placeholder="John Doe">
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Email (Optional)</label>
                            <input type="email" id="qb-guest-email" class="form-control" placeholder="john@example.com">
                        </div>
                        <div class="form-group">
                            <label>Phone (Optional)</label>
                            <input type="tel" id="qb-guest-phone" class="form-control" placeholder="+1234567890">
                        </div>
                    </div>
                    
                    <h4 style="margin-top:15px; margin-bottom:10px; color:var(--text-secondary);">Booking Details</h4>
                    <div class="form-group">
                        <label>Select Room</label>
                        <select id="qb-room-id" class="form-control" required ${allRooms.length === 0 ? 'disabled' : ''}>
                            ${roomOptions}
                        </select>
                    </div>
                    <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div>
                            <label>Check-in Date</label>
                            <input type="date" id="qb-check-in" class="form-control" required>
                        </div>
                        <div>
                            <label>Check-out Date</label>
                            <input type="date" id="qb-check-out" class="form-control" required>
                        </div>
                    </div>
                    
                    <div id="qb-availability-status" style="margin-bottom: 15px; font-size: 0.85rem; font-weight: 500;"></div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" id="btn-submit-qb" class="btn btn-primary" ${allRooms.length === 0 ? 'disabled' : ''}>Complete Quick Book</button>
                    </div>
                </form>
            `;
            this.openModal('Fast Booking Flow', html);

            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const inputIn = document.getElementById('qb-check-in');
            const inputOut = document.getElementById('qb-check-out');
            const inputRoom = document.getElementById('qb-room-id');
            const statusDiv = document.getElementById('qb-availability-status');
            const btnSubmit = document.getElementById('btn-submit-qb');

            inputIn.valueAsDate = today;
            inputOut.valueAsDate = tomorrow;

            const checkAvailability = async () => {
                const roomId = inputRoom.value;
                const checkIn = inputIn.value;
                const checkOut = inputOut.value;

                if (!roomId || !checkIn || !checkOut) return;

                if (new Date(checkIn) >= new Date(checkOut)) {
                    statusDiv.innerHTML = '<span style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Check-out must be after check-in.</span>';
                    btnSubmit.disabled = true;
                    return;
                }

                statusDiv.innerHTML = '<span style="color: var(--text-secondary);"><i class="fa-solid fa-circle-notch fa-spin"></i> Checking availability...</span>';
                btnSubmit.disabled = true;

                try {
                    const isAvailable = await DataStore.isRoomAvailable(roomId, checkIn, checkOut);
                    if (isAvailable) {
                        statusDiv.innerHTML = '<span style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> Room is available!</span>';
                        btnSubmit.disabled = false;
                    } else {
                        statusDiv.innerHTML = '<span style="color: #ef4444;"><i class="fa-solid fa-circle-xmark"></i> Room is already booked for these dates.</span>';
                        btnSubmit.disabled = true;
                    }
                } catch (err) {
                    statusDiv.innerHTML = '<span style="color: #ef4444;">Error checking availability.</span>';
                }
            };

            inputIn.onchange = checkAvailability;
            inputOut.onchange = checkAvailability;
            inputRoom.onchange = checkAvailability;
            checkAvailability();

            document.getElementById('form-quick-book').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
                btn.disabled = true;

                try {
                    // 1. Add Guest
                    const newGuest = {
                        name: document.getElementById('qb-guest-name').value,
                        email: document.getElementById('qb-guest-email').value,
                        phone: document.getElementById('qb-guest-phone').value,
                    };
                    const createdGuest = await DataStore.addGuest(newGuest);

                    // 2. Add Booking
                    const newBooking = {
                        guestId: createdGuest.id,
                        roomId: inputRoom.value,
                        checkIn: inputIn.value,
                        checkOut: inputOut.value,
                        status: 'Active'
                    };
                    const savedBooking = await DataStore.addBooking(newBooking, []);
                    
                    const portalLink = this.getPortalLink(savedBooking.portal_token);

                    this.closeModal();
                    if (this.currentView === 'dashboard') await this.initDashboard();
                    else if (this.currentView === 'bookings') await this.initBookings();

                    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    const localhostWarning = isLocalhost ? `
                        <div class="alert alert-warning" style="margin-top: 15px; padding: 10px; border-radius: 8px; background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; color: #d97706; font-size: 0.8rem; text-align: left;">
                            <i class="fa-solid fa-triangle-exclamation"></i> <strong>Mobile Testing Notice:</strong> You are currently using localhost. To scan and test this link on your phone, you must access this dashboard via your computer's local Wi-Fi IP address (e.g. 192.168.1.x) instead of localhost before creating the booking.
                        </div>
                    ` : '';

                    // Show Success with Portal Link
                    const successHtml = `
                        <div style="text-align:center; padding:2rem;">
                            <div style="font-size:3rem; color:var(--accent-green); margin-bottom:1rem;"><i class="fa-solid fa-circle-check"></i></div>
                            <h3>Booking Confirmed!</h3>
                            <p>Guest is booked for Room ${savedBooking.roomNumber}.</p>
                            
                            <div style="margin-top:2rem; padding:1.5rem; background:var(--bg-secondary); border-radius:12px; border:1px solid var(--border-color);">
                                <h4 style="margin-bottom:10px;"><i class="fa-solid fa-qrcode"></i> Guest Portal Link</h4>
                                <p style="font-size:0.85rem; color:var(--text-secondary);">Share this link with the guest for self-service and billing confirmation:</p>
                                ${localhostWarning}
                                <div style="display:flex; justify-content:center; margin: 15px 0;">
                                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(portalLink)}" alt="QR Code" style="border-radius: 8px; border: 4px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                </div>
                                <div style="display:flex; gap:10px; margin-top:15px;">
                                    <input type="text" readonly class="form-control" value="${portalLink}" id="portal-link-input">
                                    <button class="btn btn-primary" onclick="App.copyPortalLink()">Copy</button>
                                </div>
                            </div>

                            <div style="margin-top:2rem; display:flex; justify-content:center; gap: 15px;">
                                <button class="btn btn-primary" onclick="App.generateInvoice('${savedBooking.id}')"><i class="fa-solid fa-file-invoice"></i> View Invoice</button>
                                <button class="btn btn-secondary" onclick="App.closeModal()">Done</button>
                            </div>
                        </div>
                    `;
                    this.openModal('Success', successHtml);

                    // Trigger booking confirmation email
                    const room = allRooms.find(r => r.id === newBooking.roomId);
                    const checkInDate = new Date(newBooking.checkIn);
                    const checkOutDate = new Date(newBooking.checkOut);
                    const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
                    const totalAmount = (room ? room.price * nights : 0);

                    if (createdGuest?.email) {
                        this.sendNotification('booking_confirmed', {
                            guestName: createdGuest.name,
                            guestEmail: createdGuest.email,
                            roomNumber: room ? room.number : 'Unknown',
                            roomType: room ? room.type : '',
                            checkIn: newBooking.checkIn,
                            checkOut: newBooking.checkOut,
                            nights,
                            totalAmount,
                            portalLink,
                        });
                        this.showToast(`Confirmation email sent to ${createdGuest.email}`);
                    }
                } catch (err) {
                    console.error('Quick book error:', err);
                    this.showDialog({ title: 'Error', message: err.message || 'Unknown error', type: 'error' });
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        },

        async showNewBookingModal() {
            // Get all rooms, guests, bookings, and add-ons
            const [allRooms, guests, bookings] = await Promise.all([
                DataStore.getRooms(),
                DataStore.getGuests(),
                DataStore.getBookings()
            ]);

            let availableAddOns = [];
            try {
                availableAddOns = await DataStore.getAddOns();
            } catch (err) {
                console.error('Failed to fetch add-ons:', err);
            }

            let roomOptions = allRooms.map(r => {
                // Find the latest check-out date for this room to show when it's next free
                const roomBookings = bookings.filter(b => b.roomId === r.id && b.status !== 'Cancelled');
                let nextFreeInfo = '';

                if (roomBookings.length > 0) {
                    // Sort bookings by check-out date descending to find the latest one
                    const latestBooking = [...roomBookings].sort((a, b) => new Date(b.checkOut) - new Date(a.checkOut))[0];
                    const checkOutDate = new Date(latestBooking.checkOut);
                    const now = new Date();

                    // If the latest booking is in the future or currently ongoing
                    if (checkOutDate > now) {
                        nextFreeInfo = ` - Next Free: ${this.formatDate(latestBooking.checkOut)}`;
                    }
                }

                const isMaintenance = r.status === 'Maintenance';
                const maintenanceLabel = isMaintenance ? ' [MAINTENANCE]' : '';

                return `<option value="${r.id}">
                    Room ${r.number} (${r.type}${maintenanceLabel})${nextFreeInfo}
                </option>`;
            }).join('');

            if (allRooms.length === 0) {
                roomOptions = `<option value="" disabled selected>No rooms available</option>`;
            }

            let guestOptions = guests.map(g =>
                `<option value="${g.id}">${g.name}</option>`
            ).join('');

            if (guests.length === 0) {
                guestOptions = `<option value="" disabled selected>No guests found. Please add a guest first.</option>`;
            }

            // Add-ons list
            const addOnHtml = availableAddOns.map(ao => `
                <div class="add-on-item" style="display:flex; justify-content:space-between; align-items:center; padding: 5px 0; border-bottom: 1px solid var(--border-color);">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <input type="checkbox" class="add-on-checkbox" data-id="${ao.id}" data-price="${ao.price}" data-name="${ao.name}">
                        <span>${ao.name} (E${ao.price})</span>
                    </label>
                    <input type="number" class="add-on-qty" value="1" min="1" style="width:50px; padding:2px; border-radius:4px; border:1px solid var(--border-color);">
                </div>
            `).join('');

            const html = `
                <form id="form-new-booking">
                    <div class="form-group">
                        <label>Select Guest</label>
                        <select id="input-guest-id" class="form-control" required ${guests.length === 0 ? 'disabled' : ''}>
                            ${guestOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Select Room</label>
                        <select id="input-book-room" class="form-control" required ${allRooms.length === 0 ? 'disabled' : ''}>
                            ${roomOptions}
                        </select>
                    </div>
                    <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div>
                            <label>Check-in Date</label>
                            <input type="date" id="input-check-in" class="form-control" required>
                        </div>
                        <div>
                            <label>Check-out Date</label>
                            <input type="date" id="input-check-out" class="form-control" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Booking Status</label>
                        <select id="input-booking-status" class="form-control">
                            <option value="Confirmed" selected>Confirmed (Reserved for later)</option>
                            <option value="Active">Active (Check in now)</option>
                        </select>
                    </div>
                    
                    <div id="availability-status" style="margin-top: -10px; margin-bottom: 15px; font-size: 0.85rem; font-weight: 500;">
                        <!-- Status will be injected here -->
                    </div>

                    <div class="form-group">
                        <label>Add-ons (Optional)</label>
                        <div class="add-ons-container" style="background: var(--bg-primary); padding: 10px; border-radius: 8px; max-height: 150px; overflow-y: auto; border: 1px solid var(--border-color);">
                            ${addOnHtml || '<p style="font-size:0.85rem; color:var(--text-secondary);">No add-ons available.</p>'}
                        </div>
                    </div>

                    <div class="booking-summary" style="margin: 1.5rem 0; padding: 1rem; background: var(--accent-light); border-radius: 8px; border: 1px solid var(--accent-primary);">
                        <div style="display:flex; justify-content:space-between; font-weight:600;">
                            <span>Estimated Total:</span>
                            <span id="booking-total-display">E0.00</span>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" id="btn-submit-booking" class="btn btn-primary" ${(allRooms.length === 0 || guests.length === 0) ? 'disabled' : ''}>Book Now</button>
                    </div>
                </form>
            `;
            this.openModal('New Booking', html);

            // Set default dates
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const inputIn = document.getElementById('input-check-in');
            const inputOut = document.getElementById('input-check-out');
            const inputRoom = document.getElementById('input-book-room');
            const statusDiv = document.getElementById('availability-status');
            const totalDisplay = document.getElementById('booking-total-display');
            const btnSubmit = document.getElementById('btn-submit-booking');

            inputIn.valueAsDate = today;
            inputOut.valueAsDate = tomorrow;

            const checkAvailability = async () => {
                const roomId = inputRoom.value;
                const checkIn = inputIn.value;
                const checkOut = inputOut.value;

                if (!roomId || !checkIn || !checkOut) return;

                if (new Date(checkIn) >= new Date(checkOut)) {
                    statusDiv.innerHTML = '<span style="color: #ef4444; font-size: 0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> Check-out must be after check-in.</span>';
                    btnSubmit.disabled = true;
                    return;
                }

                const guestId = document.getElementById('input-guest-id').value;
                if (guestId) {
                    const hasOverlappingBooking = bookings.some(b =>
                        b.guestId == guestId &&
                        b.status === 'Active' &&
                        new Date(b.checkIn) < new Date(checkOut) &&
                        new Date(b.checkOut) > new Date(checkIn)
                    );

                    if (hasOverlappingBooking) {
                        statusDiv.innerHTML = '<span style="color: #ef4444; font-size: 0.8rem;"><i class="fa-solid fa-user-clock"></i> Guest already has an active booking during these dates.</span>';
                        btnSubmit.disabled = true;
                        return;
                    }
                }

                statusDiv.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.8rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Checking availability...</span>';
                btnSubmit.disabled = true;

                try {
                    const isAvailable = await DataStore.isRoomAvailable(roomId, checkIn, checkOut);
                    if (isAvailable) {
                        statusDiv.innerHTML = '<span style="color: #10b981; font-size: 0.8rem;"><i class="fa-solid fa-circle-check"></i> Room is available!</span>';
                        btnSubmit.disabled = false;
                    } else {
                        statusDiv.innerHTML = '<span style="color: #ef4444; font-size: 0.8rem;"><i class="fa-solid fa-circle-xmark"></i> Room is already booked for these dates.</span>';
                        btnSubmit.disabled = true;
                    }
                } catch (err) {
                    statusDiv.innerHTML = '<span style="color: #ef4444; font-size: 0.8rem;">Error checking availability.</span>';
                }
            };

            const updateTotal = () => {
                const room = allRooms.find(r => r.id === inputRoom.value);
                if (!room) return;

                const d1 = new Date(inputIn.value);
                const d2 = new Date(inputOut.value);
                const nights = Math.max(1, Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));

                let total = room.price * nights;

                // Add-ons
                document.querySelectorAll('.add-on-checkbox:checked').forEach(cb => {
                    const price = parseFloat(cb.getAttribute('data-price'));
                    const qty = parseInt(cb.closest('.add-on-item').querySelector('.add-on-qty').value) || 1;
                    total += (price * qty);
                });

                totalDisplay.textContent = `E${total.toFixed(2)}`;
            };

            inputIn.onchange = () => { updateTotal(); checkAvailability(); };
            inputOut.onchange = () => { updateTotal(); checkAvailability(); };
            inputRoom.onchange = () => { updateTotal(); checkAvailability(); };
            document.getElementById('input-guest-id').onchange = () => { checkAvailability(); };
            document.querySelectorAll('.add-on-checkbox, .add-on-qty').forEach(el => el.onchange = updateTotal);

            updateTotal();
            checkAvailability();

            document.getElementById('form-new-booking').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Booking...';
                btn.disabled = true;

                try {
                    const selectedAddOns = [];
                    document.querySelectorAll('.add-on-checkbox:checked').forEach(cb => {
                        selectedAddOns.push({
                            id: cb.getAttribute('data-id'),
                            name: cb.getAttribute('data-name'),
                            price: parseFloat(cb.getAttribute('data-price')),
                            quantity: parseInt(cb.closest('.add-on-item').querySelector('.add-on-qty').value) || 1
                        });
                    });

                    const newBooking = {
                        guestId: document.getElementById('input-guest-id').value,
                        roomId: document.getElementById('input-book-room').value,
                        checkIn: document.getElementById('input-check-in').value,
                        checkOut: document.getElementById('input-check-out').value,
                        status: document.getElementById('input-booking-status').value
                    };
                    const savedBooking = await DataStore.addBooking(newBooking, selectedAddOns);

                    const portalLink = this.getPortalLink(savedBooking.portal_token);

                    this.closeModal();
                    await this.renderView('bookings');

                    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    const localhostWarning = isLocalhost ? `
                        <div class="alert alert-warning" style="margin-top: 15px; padding: 10px; border-radius: 8px; background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; color: #d97706; font-size: 0.8rem; text-align: left;">
                            <i class="fa-solid fa-triangle-exclamation"></i> <strong>Mobile Testing Notice:</strong> You are currently using localhost. To scan and test this link on your phone, you must access this dashboard via your computer's local Wi-Fi IP address (e.g. 192.168.1.x) instead of localhost before creating the booking.
                        </div>
                    ` : '';

                    // Show Success with Portal Link
                    const successHtml = `
                        <div style="text-align:center; padding:2rem;">
                            <div style="font-size:3rem; color:var(--accent-green); margin-bottom:1rem;"><i class="fa-solid fa-circle-check"></i></div>
                            <h3>Booking Confirmed!</h3>
                            <p>Guest is booked for Room ${savedBooking.roomNumber}.</p>
                            
                            <div style="margin-top:2rem; padding:1.5rem; background:var(--bg-secondary); border-radius:12px; border:1px solid var(--border-color);">
                                <h4 style="margin-bottom:10px;"><i class="fa-solid fa-qrcode"></i> Guest Portal Link</h4>
                                <p style="font-size:0.85rem; color:var(--text-secondary);">Share this link with the guest for self-service and billing confirmation:</p>
                                ${localhostWarning}
                                <div style="display:flex; justify-content:center; margin: 15px 0;">
                                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(portalLink)}" alt="QR Code" style="border-radius: 8px; border: 4px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                </div>
                                <div style="display:flex; gap:10px; margin-top:15px;">
                                    <input type="text" readonly class="form-control" value="${portalLink}" id="portal-link-input">
                                    <button class="btn btn-primary" onclick="App.copyPortalLink()">Copy</button>
                                </div>
                            </div>

                            <div style="margin-top:2rem; display:flex; justify-content:center; gap: 15px;">
                                <button class="btn btn-primary" onclick="App.generateInvoice('${savedBooking.id}')"><i class="fa-solid fa-file-invoice"></i> View Invoice</button>
                                <button class="btn btn-secondary" onclick="App.closeModal()">Done</button>
                            </div>
                        </div>
                    `;
                    this.openModal('Success', successHtml);

                    // Trigger booking confirmation email
                    const guest = guests.find(g => g.id === newBooking.guestId);
                    const room = allRooms.find(r => r.id === newBooking.roomId);

                    const checkInDate = new Date(newBooking.checkIn);
                    const checkOutDate = new Date(newBooking.checkOut);
                    const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
                    const addOnsTotal = selectedAddOns.reduce((sum, ao) => sum + ((ao.price || 0) * (ao.quantity || 1)), 0);
                    const totalAmount = (room ? room.price * nights : 0) + addOnsTotal;

                    // Only send email if guest has an address — skip silently otherwise
                    if (guest?.email) {
                        this.sendNotification('booking_confirmed', {
                            guestName: guest.name,
                            guestEmail: guest.email,
                            roomNumber: room ? room.number : 'Unknown',
                            roomType: room ? room.type : '',
                            checkIn: newBooking.checkIn,
                            checkOut: newBooking.checkOut,
                            nights,
                            totalAmount,
                            portalLink,  // ← guest gets the portal button in their email
                        });
                        this.showToast(`Confirmation email sent to ${guest.email}`);
                    }
                } catch (err) {
                    console.error('Error adding booking:', err);
                    this.showDialog({ title: 'Error Creating Booking', message: err.message || 'Unknown error', type: 'error' });
                    checkAvailability();
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        },

        async showAddGuestModal() {
            const html = `
                <form id="form-new-guest">
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" id="input-guest-name" class="form-control" required placeholder="John Doe">
                    </div>
                    <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div>
                            <label>Gender</label>
                            <select id="input-guest-gender" class="form-control" required>
                                <option value="" disabled selected>Select Gender</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                                <option value="Prefer not to say">Prefer not to say</option>
                            </select>
                        </div>
                        <div>
                            <label>ID or Passport Number</label>
                            <input type="text" id="input-guest-id-passport" class="form-control" required placeholder="Passport or National ID">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Car Registration Plate (Optional)</label>
                        <input type="text" id="input-guest-car-plate" class="form-control" placeholder="e.g. SD 123 XX">
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="input-guest-email" class="form-control" placeholder="john@example.com">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="input-guest-phone" class="form-control" placeholder="+1 555-0100">
                    </div>
                    <div class="form-group">
                        <label>Location (City, Country)</label>
                        <input type="text" id="input-guest-location" class="form-control" placeholder="New York, USA">
                    </div>
                    <div class="form-group">
                        <label>Additional Notes</label>
                        <input type="text" id="input-guest-notes" class="form-control" placeholder="VIP customer, dietary restrictions...">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Guest</button>
                    </div>
                </form>
            `;
            this.openModal('Add New Guest', html);

            document.getElementById('form-new-guest').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
                btn.disabled = true;

                try {
                    const newGuest = {
                        name: document.getElementById('input-guest-name').value,
                        email: document.getElementById('input-guest-email').value,
                        phone: document.getElementById('input-guest-phone').value,
                        gender: document.getElementById('input-guest-gender').value,
                        id_passport: document.getElementById('input-guest-id-passport').value,
                        car_plate: document.getElementById('input-guest-car-plate').value,
                        location: document.getElementById('input-guest-location').value,
                        notes: document.getElementById('input-guest-notes').value
                    };
                    await DataStore.addGuest(newGuest);
                    this.closeModal();
                    await this.renderView('guests');
                    this.showToast(`Guest ${newGuest.name} registered.`);
                } catch (err) {
                    console.error('Error adding guest:', err);
                    this.showDialog({ title: 'Error Saving Guest', message: err.message || 'Unknown error', type: 'error' });
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        },

        async showEditGuestModal(id) {
            const guests = await DataStore.getGuests();
            const g = guests.find(x => x.id === id);
            if (!g) return;

            const html = `
                <form id="form-edit-guest">
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" id="edit-guest-name" class="form-control" required value="${g.name || ''}">
                    </div>
                    <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div>
                            <label>Gender</label>
                            <select id="edit-guest-gender" class="form-control" required>
                                <option value="" disabled>Select Gender</option>
                                <option value="Male" ${g.gender === 'Male' ? 'selected' : ''}>Male</option>
                                <option value="Female" ${g.gender === 'Female' ? 'selected' : ''}>Female</option>
                                <option value="Other" ${g.gender === 'Other' ? 'selected' : ''}>Other</option>
                                <option value="Prefer not to say" ${g.gender === 'Prefer not to say' ? 'selected' : ''}>Prefer not to say</option>
                            </select>
                        </div>
                        <div>
                            <label>ID or Passport Number</label>
                            <input type="text" id="edit-guest-id-passport" class="form-control" required value="${g.id_passport || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Car Registration Plate (Optional)</label>
                        <input type="text" id="edit-guest-car-plate" class="form-control" value="${g.car_plate || ''}">
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="edit-guest-email" class="form-control" value="${g.email || ''}">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="edit-guest-phone" class="form-control" value="${g.phone || ''}">
                    </div>
                    <div class="form-group">
                        <label>Location (City, Country)</label>
                        <input type="text" id="edit-guest-location" class="form-control" value="${g.location || ''}">
                    </div>
                    <div class="form-group">
                        <label>Additional Notes</label>
                        <input type="text" id="edit-guest-notes" class="form-control" value="${g.notes || ''}">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </div>
                </form>
            `;
            this.openModal('Edit Guest Profile', html);

            document.getElementById('form-edit-guest').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
                btn.disabled = true;

                try {
                    const updatedGuest = {
                        name: document.getElementById('edit-guest-name').value,
                        email: document.getElementById('edit-guest-email').value,
                        phone: document.getElementById('edit-guest-phone').value,
                        gender: document.getElementById('edit-guest-gender').value,
                        id_passport: document.getElementById('edit-guest-id-passport').value,
                        car_plate: document.getElementById('edit-guest-car-plate').value,
                        location: document.getElementById('edit-guest-location').value,
                        notes: document.getElementById('edit-guest-notes').value
                    };
                    await DataStore.updateGuest(id, updatedGuest);
                    this.closeModal();
                    await this.renderView('guests');
                    this.showToast(`Guest profile updated.`);
                } catch (err) {
                    console.error('Error updating guest:', err);
                    this.showDialog({ title: 'Error Updating Guest', message: err.message || 'Unknown error', type: 'error' });
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        },


        // Add the initLogs function
        async initLogs() {
            const tbody = document.getElementById('logs-list');
            const logs = await DataStore.getLogs();
            tbody.innerHTML = '';

            logs.forEach(log => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
            <td><small>${this.formatDate(log.timestamp)} ${new Date(log.timestamp).toLocaleTimeString()}</small></td>
            <td><strong>${log.user_name}</strong></td>
            <td><span class="badge badge-info">${log.action}</span></td>
            <td>${log.entity} <small>(ID: ${log.entity_id})</small></td>
            <td>
                <div class="log-details">
                    ${log.old_value ? `<div class="log-old">OLD: ${JSON.stringify(log.old_value)}</div>` : ''}
                    ${log.new_value ? `<div class="log-new">NEW: ${JSON.stringify(log.new_value)}</div>` : ''}
                </div>
            </td>
        `;
                tbody.appendChild(tr);
            });
        },


        // --- Communication Hub (Messages) ---
        async initMessages() {
            const listContainer = document.getElementById('messages-full-list');
            const role = this.userRole || 'Receptionist';
            const notifications = await DataStore.getNotifications(role, false, this.userId); // Pass userId to get sent messages too

            listContainer.innerHTML = '';

            if (notifications.length === 0) {
                listContainer.innerHTML = '<div class="empty-state">No messages yet. Use the button above to start a conversation.</div>';
                return;
            }

            notifications.forEach(n => {
                const isSystem = n.sender_role === 'System';
                const isSentByMe = n.sender_id && this.userId && n.sender_id === this.userId;

                const card = document.createElement('div');
                card.className = `message-card ${n.is_read ? '' : 'unread'} ${isSystem ? 'system-msg' : 'staff-msg'} ${isSentByMe ? 'sent-msg' : 'received-msg'}`;

                card.innerHTML = `
                    <div class="message-meta">
                        <span class="sender">
                            <i class="fa-solid ${isSentByMe ? 'fa-paper-plane' : (isSystem ? 'fa-robot' : 'fa-user-tie')}"></i> 
                            ${isSentByMe ? 'Me (Sent)' : `${n.sender_name} <small>(${n.sender_role})</small>`}
                        </span>
                        <span class="time">${this.formatTimeAgo(n.created_at)}</span>
                    </div>
                    <div class="message-content">${n.message}</div>
                    ${(!n.is_read && !isSentByMe) ? `<button class="btn btn-small btn-text" onclick="App.handleNotificationClick('${n.id}'); App.initMessages()">Mark as Read</button>` : ''}
                `;
                listContainer.appendChild(card);
            });

            const newMsgBtn = document.getElementById('btn-new-staff-msg');
            if (newMsgBtn) {
                newMsgBtn.onclick = () => this.showNewMessageModal();
            }
        },

        async showNewMessageModal() {
            const html = `
                <form id="form-send-message">
                    <div class="form-group">
                        <label>To Role</label>
                        <select id="input-msg-target" class="form-control" required>
                            <option value="Admin">Admin</option>
                            <option value="Receptionist">Receptionist</option>
                            <option value="Housekeeper">Housekeeper</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Message</label>
                        <textarea id="input-msg-text" class="form-control" rows="4" placeholder="Type your message here..." required></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Send Message</button>
                    </div>
                </form>
            `;
            this.openModal('Send New Staff Message', html);

            document.getElementById('form-send-message').addEventListener('submit', async (e) => {
                e.preventDefault();
                const targetRole = document.getElementById('input-msg-target').value;
                const message = document.getElementById('input-msg-text').value;
                const senderName = this.userProfileData?.name || 'Staff';
                const senderRole = this.userRole || 'Receptionist';
                const senderId = this.userId;

                await DataStore.addNotification(targetRole, message, senderRole, senderName, senderId);
                this.closeModal();
                this.showToast('Message sent successfully!');
                if (this.currentView === 'messages') await this.initMessages();
                this.updateNotifications();
            });
        },


        // --- Channel Manager (iCal Sync) ---
        async showChannelManager(roomId) {
            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === roomId);
            if (!room) return;

            const exportUrl = `${window.location.origin}/ical/export/${room.ical_export_token}`;

            const html = `
                <div class="channel-manager-view">
                    <div style="margin-bottom: 2rem;">
                        <div class="alert alert-info" style="padding: 12px; background: rgba(14, 165, 233, 0.1); border: 1px solid var(--accent-blue); border-radius: 8px; color: var(--accent-blue); font-size: 0.9rem;">
                            <i class="fa-solid fa-circle-info"></i> Sync your calendar with Airbnb, Booking.com, or VRBO.
                        </div>
                    </div>
                    
                    <div class="card" style="margin-bottom: 1.5rem; background: var(--bg-primary);">
                        <h4 style="margin-bottom: 1rem;"><i class="fa-solid fa-cloud-arrow-down" style="color: var(--accent-blue);"></i> Import External Calendar</h4>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">Paste the iCal link from your external listing here.</p>
                        <div class="form-group">
                            <input type="url" id="input-ical-url" class="form-control" placeholder="https://www.airbnb.com/calendar/ical/..." value="${room.ical_import_url || ''}">
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 1rem;">
                            <button class="btn btn-primary btn-small" id="btn-save-ical"><i class="fa-solid fa-save"></i> Save Link</button>
                            <button class="btn btn-warning btn-small" id="btn-sync-ical"><i class="fa-solid fa-rotate"></i> Sync Now (Simulate)</button>
                        </div>
                    </div>

                    <div class="card" style="background: var(--bg-primary);">
                        <h4 style="margin-bottom: 1rem;"><i class="fa-solid fa-cloud-arrow-up" style="color: var(--accent-purple);"></i> Export This Room's Calendar</h4>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">Copy this link into your other booking sites.</p>
                        <div class="copy-link-container" style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid var(--border-color);">
                            <code style="font-size: 0.75rem; word-break: break-all; color: var(--accent-blue);">${exportUrl}</code>
                            <button class="btn btn-text btn-small" onclick="navigator.clipboard.writeText('${exportUrl}'); App.showToast('Link copied!')" title="Copy Link"><i class="fa-solid fa-copy"></i></button>
                        </div>
                    </div>
                </div>
            `;
            this.openModal(`Channel Manager: Room ${room.number}`, html);

            document.getElementById('btn-save-ical').onclick = async () => {
                const url = document.getElementById('input-ical-url').value;
                await DataStore.updateRoomICal(roomId, url);
                this.showToast('Channel link saved.');
            };

            document.getElementById('btn-sync-ical').onclick = async () => {
                const url = document.getElementById('input-ical-url').value;
                if (!url) {
                    this.showToast('Please add an iCal URL first!', 'error');
                    return;
                }
                this.showToast('Connecting to external channel...');
                setTimeout(async () => {
                    await this.simulateChannelSync(roomId);
                }, 1000);
            };
        },

        async simulateChannelSync(roomId) {
            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === roomId);

            // Block a 3-day window starting tomorrow
            const start = new Date();
            start.setDate(start.getDate() + 1);
            const end = new Date(start);
            end.setDate(start.getDate() + 3);

            const mockBooking = {
                roomId: roomId,
                guestId: null,
                guestName: 'Airbnb Guest (External Sync)',
                checkIn: start.toISOString().split('T')[0],
                checkOut: end.toISOString().split('T')[0],
                status: 'Confirmed',
                notes: 'Imported from external iCal channel.'
            };

            await DataStore.addBooking(mockBooking, []);
            this.showToast(`Sync complete! Room ${room.number} blocked for external dates.`);
            this.closeModal();
            if (this.currentView === 'calendar') await this.initCalendar();
            if (this.currentView === 'bookings') await this.initBookings();
            if (this.currentView === 'rooms') await this.initRooms();
        },


        // --- Actions exposed to window ---
        async deleteRoom(id) {
            const confirmed = await this.showDialog({
                title: 'Delete Room',
                message: 'Are you sure you want to delete this room? This action cannot be undone.',
                type: 'confirm'
            });
            if (confirmed) {
                await DataStore.deleteRoom(id);
                this.renderView('rooms');
                this.showToast('Room deleted successfully.');
            }
        },

        async toggleMaintenance(id) {
            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === id);
            if (room) {
                const newStatus = room.status === 'Maintenance' ? 'Available' : 'Maintenance';
                await DataStore.updateRoomStatus(id, newStatus);
                this.renderView('rooms');
                this.showToast(`Room ${room.number} status updated to ${newStatus}.`);
            }
        },

        async checkInBooking(id) {
            const bookings = await DataStore.getBookings();
            const booking = bookings.find(b => b.id === id);
            if (!booking) return;

            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === booking.roomId);
            const roomNumber = room ? room.number : 'Unknown';

            const checkInDate = new Date(booking.checkIn);
            const checkOutDate = new Date(booking.checkOut);
            const diffTime = Math.abs(checkOutDate - checkInDate);
            const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            const roomCharge = nights * room.price;

            const html = `
                <form id="form-checkin-booking">
                    <div style="margin-bottom: 1.5rem; color: var(--text-secondary); line-height: 1.5;">
                        <p>You are about to check in <strong>${booking.guestName}</strong> into Room <strong>${roomNumber}</strong>.</p>
                        <p>Duration: <strong>${nights} Night(s)</strong> (${booking.checkIn} to ${booking.checkOut})</p>
                        <p>Room Charge: <strong style="color:var(--accent-primary);">E${roomCharge.toFixed(2)}</strong> (E${room.price.toFixed(2)}/night)</p>
                    </div>

                    <div class="form-group">
                        <label>Payment Setting</label>
                        <select id="input-checkin-pay-now" class="form-control">
                            <option value="yes" selected>Collect Room Payment Now (Pre-paid / Hybrid Model)</option>
                            <option value="no">Post-pay (Settle Room Charge + Add-ons at Check-out)</option>
                        </select>
                    </div>

                    <div id="checkin-payment-details">
                        <div class="form-group">
                            <label>Payment Method</label>
                            <select id="input-checkin-payment-method" class="form-control">
                                <option value="Cash">Cash</option>
                                <option value="Card">Debit/Credit Card</option>
                                <option value="MTN MoMo">MTN Mobile Money (MoMo)</option>
                                <option value="Bank Transfer">Direct Bank Transfer</option>
                            </select>
                        </div>
                        <div id="checkin-momo-payment-extra" style="display:none; margin-top:10px; padding:15px; background:var(--bg-secondary); border-radius:12px; border: 1px solid var(--border-color);">
                            <label style="display:block; margin-bottom:10px;">MoMo Phone Number</label>
                            <div style="display:flex; gap:10px;">
                                <span style="background:var(--bg-tertiary); padding:10px; border-radius:8px; border:1px solid var(--border-color);">+268</span>
                                <input type="text" id="input-checkin-momo-phone" class="form-control" placeholder="76XXXXXX" maxlength="8">
                            </div>
                        </div>
                    </div>

                    <div class="form-actions" style="margin-top:20px;">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-success">Confirm Check-In</button>
                    </div>
                </form>
            `;
            this.openModal('Check-In & Payment Setup', html);

            const payNowSelect = document.getElementById('input-checkin-pay-now');
            const paymentDetails = document.getElementById('checkin-payment-details');
            const methodSelect = document.getElementById('input-checkin-payment-method');
            const momoExtra = document.getElementById('checkin-momo-payment-extra');
            const momoPhoneInput = document.getElementById('input-checkin-momo-phone');

            if (payNowSelect && paymentDetails) {
                payNowSelect.onchange = () => {
                    paymentDetails.style.display = payNowSelect.value === 'yes' ? 'block' : 'none';
                };
            }

            if (methodSelect && momoExtra) {
                methodSelect.onchange = () => {
                    momoExtra.style.display = methodSelect.value === 'MTN MoMo' ? 'block' : 'none';
                };
            }

            document.getElementById('form-checkin-booking').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ProcessingCheckIn...';
                btn.disabled = true;

                this.isProcessingAction = true;

                try {
                    const payNow = payNowSelect.value === 'yes';
                    if (!payNow) {
                        // Post-paid checkin (just check in)
                        await DataStore.checkInBooking(id, booking.roomId);
                        this.closeModal();
                        await this.renderView('bookings');
                        this.showToast(`Checked in ${booking.guestName} (Post-paid).`);
                    } else {
                        const paymentMethod = methodSelect.value;
                        const momoPhone = momoPhoneInput ? momoPhoneInput.value : '';

                        if (paymentMethod === 'MTN MoMo') {
                            await this.processCheckInMoMoPayment(id, booking.roomId, roomCharge, momoPhone);
                        } else if (paymentMethod === 'Bank Transfer') {
                            await this.processCheckInBankPayment(id, booking.roomId, roomCharge);
                        } else {
                            // Cash or Card payment
                            await DataStore.addTransaction({
                                booking_id: id,
                                amount: roomCharge,
                                payment_method: paymentMethod,
                                status: 'Success'
                            });
                            await DataStore.checkInBooking(id, booking.roomId);
                            this.closeModal();
                            await this.renderView('bookings');
                            this.showToast(`Checked in ${booking.guestName} (Paid room charge via ${paymentMethod}).`);
                            await this.showCheckInReceipt(id, roomCharge, paymentMethod);
                        }
                    }
                } catch (err) {
                    console.error('Check-in processing error:', err);
                    this.showDialog({ title: 'Check-In Error', message: err.message || 'Unknown error', type: 'error' });
                } finally {
                    this.isProcessingAction = false;
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        },

        async processCheckInMoMoPayment(bookingId, roomId, amount, phone) {
            const fullPhone = '268' + phone;

            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner"><i class="fa-solid fa-mobile-screen-button"></i></div>
                    <div class="payment-status-message">Initiating MoMo Request...</div>
                    <div class="payment-subtext">Sending E${amount.toFixed(2)} request to <strong>${fullPhone}</strong></div>
                </div>
            `;

            const result = await PaymentService.requestToPayMoMo(fullPhone, amount, bookingId);

            if (result.success) {
                this.modalBody.innerHTML = `
                    <div class="payment-processing">
                        <div class="payment-spinner"><i class="fa-solid fa-fingerprint"></i></div>
                        <div class="payment-status-message">Waiting for Authorization...</div>
                        <div class="payment-subtext">Please check your phone and enter your MoMo PIN to authorize the payment.</div>
                        <div style="margin-top:20px; font-size:0.8rem; color:var(--accent-primary);">Reference: ${result.transactionId}</div>
                    </div>
                `;

                let statusResult;
                try {
                    statusResult = await PaymentService.waitForMoMoCompletion(result.transactionId);
                } catch (err) {
                    console.error('MoMo Check-In Polling Error:', err);
                    this.showPaymentError('Connection Error', 'We lost connection while waiting for authorization. Please check the transaction status manually.');
                    return;
                }

                if (statusResult.status === 'Success') {
                    await DataStore.checkInBooking(bookingId, roomId);

                    this.modalBody.innerHTML = `
                        <div class="payment-processing">
                            <div class="payment-spinner" style="color:var(--accent-green);"><i class="fa-solid fa-circle-check"></i></div>
                            <div class="payment-status-message">Payment Successful!</div>
                            <p>Check-in complete. Generating receipt...</p>
                        </div>
                    `;
                    setTimeout(async () => {
                        this.closeModal();
                        await this.renderView('bookings');
                        this.showToast(`Checked in guest successfully.`);
                        await this.showCheckInReceipt(bookingId, amount, 'MTN MoMo');
                    }, 2000);
                } else {
                    this.showPaymentError('Payment Failed', 'The user declined the request or the session timed out.');
                }
            } else {
                this.showPaymentError('System Error', result.message);
            }
        },

        async processCheckInBankPayment(bookingId, roomId, amount) {
            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner"><i class="fa-solid fa-building-columns"></i></div>
                    <div class="payment-status-message">Connecting to Bank Gateway...</div>
                </div>
            `;

            const result = await PaymentService.initiateBankPayment(amount, bookingId);

            if (result.success) {
                this.modalBody.innerHTML = `
                    <div class="payment-processing">
                        <div class="payment-spinner"><i class="fa-solid fa-arrow-up-right-from-square"></i></div>
                        <div class="payment-status-message">Redirecting to Secure Bank Page...</div>
                        <p class="payment-subtext">You are being redirected to the bank's secure portal to complete the transfer.</p>
                        <div style="margin-top:2rem;">
                            <button class="btn btn-primary" onclick="window.open('${result.redirectUrl}', '_blank'); App.simulateCheckInBankReturn('${bookingId}', '${roomId}', '${result.transactionId}', ${amount})">Open Payment Page</button>
                        </div>
                    </div>
                `;
            }
        },

        async simulateCheckInBankReturn(bookingId, roomId, transactionId, amount) {
            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
                    <div class="payment-status-message">Verifying Transfer...</div>
                </div>
            `;

            await new Promise(resolve => setTimeout(resolve, 3000));
            await DataStore.updateTransactionStatus(transactionId, 'Success');
            await DataStore.checkInBooking(bookingId, roomId);

            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner" style="color:var(--accent-green);"><i class="fa-solid fa-circle-check"></i></div>
                    <div class="payment-status-message">Payment Verified!</div>
                    <p>Check-in complete. Generating receipt...</p>
                </div>
            `;

            setTimeout(async () => {
                this.closeModal();
                await this.renderView('bookings');
                this.showToast(`Checked in guest successfully.`);
                await this.showCheckInReceipt(bookingId, amount, 'Bank Transfer');
            }, 2000);
        },

        async showCheckInReceipt(bookingId, roomCharge, paymentMethod) {
            const bookings = await DataStore.getBookings();
            const booking = bookings.find(b => b.id === bookingId);
            if (!booking) return;

            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === booking.roomId);
            if (!room) return;

            const checkInDate = new Date(booking.checkIn);
            const checkOutDate = new Date(booking.checkOut);
            const diffTime = Math.abs(checkOutDate - checkInDate);
            const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            const html = `
                <div class="invoice-doc" id="invoice-printable">
                    <div class="invoice-header">
                        <div class="invoice-logo">
                            <i class="fa-solid fa-hotel"></i> Ndwandwe Estate
                        </div>
                        <div class="invoice-info">
                            <h1 style="color:var(--accent-green); font-size:1.4rem;">RECEIPT & CONFIRMATION</h1>
                            <p>Booking Ref: #${bookingId.substring(0, 8).toUpperCase()}</p>
                            <p>Date: ${this.formatDate(new Date().toISOString())}</p>
                        </div>
                    </div>
                    
                    <div class="invoice-details">
                        <div class="invoice-from">
                            <h4>From</h4>
                            <p><strong>Ndwandwe Estate</strong></p>
                            <p>Plot 42, Ezulwini</p>
                            <p>Eswatini</p>
                            <p>contact@ndwandwe.com</p>
                        </div>
                        <div class="invoice-to">
                            <h4>Bill To</h4>
                            <p><strong>${booking.guestName}</strong></p>
                            <p>Guest ID: ${booking.guestId.substring(0, 8).toUpperCase()}</p>
                            <p style="margin-top: 10px;"><strong>Payment Method:</strong> ${paymentMethod}</p>
                            <p style="margin-top: 10px; margin-bottom: 2px;"><strong>Stay Period:</strong></p>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">
                                <div>In: ${this.formatDate(booking.checkIn)}</div>
                                <div>Out: ${this.formatDate(booking.checkOut)}</div>
                            </div>
                        </div>
                    </div>

                    <table class="invoice-table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Qty</th>
                                <th>Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Pre-paid Room Stay: Room ${room.number} (${room.type})</td>
                                <td>${nights} Night(s)</td>
                                <td>E${room.price.toFixed(2)}</td>
                                <td>E${roomCharge.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="invoice-total">
                        <div class="total-box">
                            <div class="total-row">
                                <span>Room Subtotal</span>
                                <span>E${roomCharge.toFixed(2)}</span>
                            </div>
                            <div class="total-row grand-total">
                                <span>Total Paid Now</span>
                                <span>E${roomCharge.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="invoice-footer">
                        <p>This is a receipt for your pre-paid room charges.</p>
                        <p>Any additional services (add-ons) consumed during your stay will be billed at check-out.</p>
                        <p>Thank you for choosing Ndwandwe Estate!</p>
                    </div>
                </div>

                <div class="form-actions" style="margin-top: 2rem;">
                    <button class="btn btn-secondary" onclick="window.print()">
                        <i class="fa-solid fa-print"></i> Print Receipt
                    </button>
                    <button class="btn btn-primary" onclick="App.downloadInvoice('${bookingId}')">
                        <i class="fa-solid fa-download"></i> Download PDF
                    </button>
                </div>
            `;
            this.openModal(`Booking Confirmation Receipt`, html);
            document.getElementById('modal-container').style.maxWidth = '800px';

            try {
                const guests = await DataStore.getGuests();
                const guest = guests.find(g => g.id === booking.guestId);
                if (guest && guest.email) {
                    this.sendCheckInReceiptEmail(bookingId, roomCharge, paymentMethod, guest.email);
                    this.showToast(`Receipt emailed to ${guest.email}`);
                }
            } catch (err) {
                console.warn('[Email] Failed to send check-in receipt email:', err);
            }
        },

        async extendBookingModal(bookingId) {
        const bookings = await DataStore.getBookings();
        const booking = bookings.find(b => b.id === bookingId);
        if (!booking) return;

        const currentCheckOut = booking.checkOut;

        const html = `
            <form id="form-extend-booking">
                <p style="margin-bottom: 1rem; color: var(--text-secondary);">Current Check-out: <strong style="color: var(--text-primary);">${this.formatDate(currentCheckOut)}</strong></p>
                <div class="form-group">
                    <label>Action</label>
                    <select id="input-extension-type" class="form-control" onchange="document.getElementById('date-group').style.display = this.value === 'extend' ? 'block' : 'none'">
                        <option value="late_checkout">Late Checkout (Add fee to bill)</option>
                        <option value="extend">Extend Stay (Change Check-out Date)</option>
                    </select>
                </div>
                <div class="form-group" id="date-group" style="display:none;">
                    <label>New Check-out Date</label>
                    <input type="date" id="input-new-checkout" class="form-control" min="${currentCheckOut}">
                </div>
                <div class="form-actions" style="margin-top: 1.5rem;">
                    <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Confirm</button>
                </div>
            </form>
        `;
        this.openModal('Manage Stay', html);

        document.getElementById('form-extend-booking').addEventListener('submit', async (e) => {
            e.preventDefault();
            const type = document.getElementById('input-extension-type').value;

            try {
                if (type === 'late_checkout') {
                    const addOns = await DataStore.getAddOns();
                    let lateFeeAddOn = addOns.find(a => a.name.toLowerCase().includes('late checkout'));
                    
                    if (lateFeeAddOn) {
                        await DataStore.addServiceToBooking(booking.id, lateFeeAddOn.id, 1, lateFeeAddOn.price, 'Confirmed');
                        this.showToast('Late checkout fee added to bill.');
                        this.closeModal();
                    } else {
                        this.showDialog({title:'Notice', message:'Late Checkout add-on not found in system. Please manually add the charge or create the add-on in DB.', type:'error'});
                    }
                } else {
                    const newDate = document.getElementById('input-new-checkout').value;
                    if (!newDate || newDate <= currentCheckOut) {
                        this.showToast('Please select a valid future date.', 'error');
                        return;
                    }
                    
                    const isAvailable = await DataStore.isRoomAvailable(booking.roomId, currentCheckOut, newDate, booking.id);
                    if (!isAvailable) {
                        this.showDialog({title:'Unavailable', message:'Room is already booked during the extension period.', type:'error'});
                        return;
                    }

                    await DataStore.updateBookingCheckOut(booking.id, newDate);
                    this.showToast('Stay extended successfully.');
                    this.closeModal();
                }

                // Send email notification
                try {
                    const guests = await DataStore.getGuests();
                    const guest = guests.find(g => g.id === booking.guestId);
                    if (guest && guest.email) {
                        let updateDetails = '';
                        let updateType = '';
                        if (type === 'late_checkout') {
                            updateType = 'Late Checkout';
                            updateDetails = 'Your request for a late checkout has been approved. A late checkout fee has been added to your final bill.';
                        } else {
                            const newDate = document.getElementById('input-new-checkout').value;
                            updateType = 'Stay Extension';
                            updateDetails = `Your stay has been extended. Your new check-out date is ${this.formatDate(newDate)}.`;
                        }
                        
                        let roomNum = booking.roomNumber;
                        if (!roomNum) {
                            const rooms = await DataStore.getRooms();
                            roomNum = rooms.find(r => r.id === booking.roomId)?.number || 'Unknown';
                        }
                        
                        await this.sendNotification('stay_updated', {
                            guestEmail: guest.email,
                            guestName: guest.name || booking.guestName,
                            roomNumber: roomNum,
                            updateType: updateType,
                            updateDetails: updateDetails
                        });
                    }
                } catch (emailErr) {
                    console.warn('[Email] Failed to send stay update email:', emailErr);
                }

                await this.renderView('bookings');
            } catch (err) {
                console.error(err);
                this.showDialog({ title: 'Error', message: 'Failed to update booking.', type: 'error' });
            }
        });
    },

    async completeBooking(id) {
            this.currentBookingId = id; // Track for error recovery
            // Find booking and room to get current status
            const bookings = await DataStore.getBookings();
            const booking = bookings.find(b => b.id === id);
            if (!booking) return;

            // Calculate actual total based on current date (Early/Late Checkout)
            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === booking.roomId);

            const checkInDate = new Date(booking.checkIn);
            const actualCheckOutDate = new Date(); // Use today as actual check-out
            actualCheckOutDate.setHours(0, 0, 0, 0);

            const diffTime = Math.abs(actualCheckOutDate - checkInDate);
            const actualNights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            const addOnsTotal = booking.addOns?.reduce((sum, ao) => {
                if (ao.status === 'Confirmed' || ao.status === 'Delivered') return sum + (ao.price * ao.quantity);
                return sum;
            }, 0) || 0;
            const totalAmount = (actualNights * room.price) + addOnsTotal;

            let totalPaid = 0;
            if (booking.transactions) {
                booking.transactions.forEach(tx => {
                    if (tx.status === 'Success') {
                        totalPaid += tx.amount;
                    }
                });
            }
            const amountDue = Math.max(0, totalAmount - totalPaid);
            const isExpress = booking.status === 'Checkout Requested';

            const isEarly = new Date(booking.checkOut) > actualCheckOutDate;
            const isLate = new Date(booking.checkOut) < actualCheckOutDate;
            let statusNote = '';
            if (isEarly) statusNote = `<span style="color: var(--accent-blue); font-weight: 600;">(Early Check-out: ${actualNights} nights instead of original booking)</span>`;
            else if (isLate) statusNote = `<span style="color: var(--accent-red); font-weight: 600;">(Late Check-out: ${actualNights} nights)</span>`;

            const html = `
                <form id="form-complete-booking">
                    <div style="margin-bottom: 1.5rem; color: var(--text-secondary);">
                        <p>You are about to check out <strong>${booking.guestName}</strong>.</p>
                        <p>Stay Duration: <strong>${actualNights} Night(s)</strong> ${statusNote}</p>
                    </div>

                    ${(booking.addOns && booking.addOns.filter(ao => ao.status === 'Confirmed' || ao.status === 'Delivered').length > 0) ? `
                    <div class="checkout-add-ons" style="margin-bottom: 1.5rem; background: var(--bg-secondary); padding: 15px; border-radius: 12px; border: 1px solid var(--border-color);">
                        <h4 style="margin-bottom: 10px; font-size: 0.9rem;"><i class="fa-solid fa-cart-plus"></i> Verified Add-ons</h4>
                        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 10px;">Confirmed and delivered add-ons included in the final bill.</p>
                        <div id="addon-adjustment-list">
                            ${booking.addOns.filter(ao => ao.status === 'Confirmed' || ao.status === 'Delivered').map(ao => `
                                <div class="adjustment-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                                    <span style="font-size:0.85rem;">${ao.name} (E${ao.price}) x${ao.quantity} ${ao.status === 'Delivered' ? '<small style="color:var(--accent-blue);">(Delivered)</small>' : ''}</span>
                                    <span style="font-weight:600;">E${(ao.price * ao.quantity).toFixed(2)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--accent-light); border-radius: 8px; border: 1px solid var(--accent-primary);">
                        <div style="display:flex; justify-content:space-between; font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 5px;">
                            <span>Total Charges:</span>
                            <span>E${totalAmount.toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size: 0.9rem; color: #10b981; margin-bottom: 10px;">
                            <span>Total Paid:</span>
                            <span>-E${totalPaid.toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-weight:600; font-size: 1.1rem; border-top: 1px dashed var(--border-color); padding-top: 10px;">
                            <span>Balance Due:</span>
                            <span id="checkout-total-display">E${amountDue.toFixed(2)}</span>
                        </div>
                    </div>

                    ${amountDue > 0 ? `
                    <div class="form-group">
                        <label>Payment Method for Balance</label>
                        <select id="input-payment-method" class="form-control" required>
                            <option value="Cash">Cash</option>
                            <option value="Card">Debit/Credit Card</option>
                            <option value="MTN MoMo">MTN Mobile Money (MoMo)</option>
                            <option value="Bank Transfer">Direct Bank Transfer</option>
                        </select>
                    </div>
                    <div id="momo-payment-extra" style="display:none; margin-top:10px; padding:15px; background:var(--bg-secondary); border-radius:12px; border: 1px solid var(--border-color);">
                        <label style="display:block; margin-bottom:10px;">MoMo Phone Number</label>
                        <div style="display:flex; gap:10px;">
                            <span style="background:var(--bg-tertiary); padding:10px; border-radius:8px; border:1px solid var(--border-color);">+268</span>
                            <input type="text" id="input-momo-phone" class="form-control" placeholder="76XXXXXX" maxlength="8">
                        </div>
                    </div>
                    ` : `
                    <div class="alert alert-success" style="padding: 10px; background: rgba(16,185,129,0.1); border: 1px solid #10b981; color: #10b981; margin-bottom: 15px; border-radius: 8px;">
                        <i class="fa-solid fa-check-circle"></i> Balance is fully settled. No payment required.
                    </div>
                    <input type="hidden" id="input-payment-method" value="Pre-paid">
                    `}

                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">${isExpress ? 'Finalize Express Checkout' : 'Process Checkout'}</button>
                    </div>
                </form>
            `;
            this.openModal('Complete Check-out', html);

            const methodSelect = document.getElementById('input-payment-method');
            const momoExtra = document.getElementById('momo-payment-extra');
            const momoPhoneInput = document.getElementById('input-momo-phone');

            if (methodSelect && momoExtra) {
                methodSelect.onchange = () => {
                    momoExtra.style.display = methodSelect.value === 'MTN MoMo' ? 'block' : 'none';
                };
            }

            document.getElementById('form-complete-booking').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
                btn.disabled = true;

                // Suspend background UI refreshes to prevent massive lag
                this.isProcessingAction = true;

                try {
                    const paymentMethod = methodSelect ? methodSelect.value : 'Pre-paid';
                    const momoPhone = momoPhoneInput ? momoPhoneInput.value : '';

                    const confirmedAddOns = booking.addOns ? booking.addOns.filter(ao => ao.status === 'Confirmed' || ao.status === 'Delivered') : [];

                    if (amountDue > 0 && paymentMethod === 'MTN MoMo') {
                        await this.processMoMoPayment(id, booking.roomId, amountDue, momoPhone, actualCheckOutDate.toISOString().split('T')[0], confirmedAddOns);
                    } else if (amountDue > 0 && paymentMethod === 'Bank Transfer') {
                        await this.processBankPayment(id, booking.roomId, amountDue, actualCheckOutDate.toISOString().split('T')[0], confirmedAddOns);
                    } else {
                        // Standard Cash/Card or Zero Balance
                        if (amountDue > 0) {
                            await DataStore.addTransaction({
                                booking_id: id,
                                amount: amountDue,
                                payment_method: paymentMethod,
                                status: 'Success'
                            });
                        }
                        await DataStore.completeBooking(id, booking.roomId, paymentMethod, actualCheckOutDate.toISOString().split('T')[0], confirmedAddOns);

                        // Trigger Housekeeping Notification
                        await DataStore.addNotification('Housekeeper', `Room ${room.number} has been vacated and needs cleaning.`);
                        await DataStore.addNotification('Admin', `Guest ${booking.guestName} has checked out of Room ${room.number}.`);

                        this.closeModal();
                        await this.renderView('bookings');
                        await this.generateInvoice(id);
                        this.showToast(`Check-out complete for ${booking.guestName}.`);
                    }
                } catch (err) {
                    console.error('Checkout error:', err);
                    this.showDialog({ title: 'Checkout Error', message: 'An error occurred during checkout. Please try again.', type: 'error' });
                } finally {
                    this.isProcessingAction = false;
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        },

        async processMoMoPayment(bookingId, roomId, amount, phone, actualCheckOut, updatedAddOns) {
            const fullPhone = '268' + phone;

            // Show Processing UI
            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner"><i class="fa-solid fa-mobile-screen-button"></i></div>
                    <div class="payment-status-message">Initiating MoMo Request...</div>
                    <div class="payment-subtext">Sending E${amount} request to <strong>${fullPhone}</strong></div>
                </div>
            `;

            const result = await PaymentService.requestToPayMoMo(fullPhone, amount, bookingId);

            if (result.success) {
                this.modalBody.innerHTML = `
                    <div class="payment-processing">
                        <div class="payment-spinner"><i class="fa-solid fa-fingerprint"></i></div>
                        <div class="payment-status-message">Waiting for Authorization...</div>
                        <div class="payment-subtext">Please check your phone and enter your MoMo PIN to authorize the payment.</div>
                        <div style="margin-top:20px; font-size:0.8rem; color:var(--accent-primary);">Reference: ${result.transactionId}</div>
                    </div>
                `;

                // Poll for completion
                let statusResult;
                try {
                    statusResult = await PaymentService.waitForMoMoCompletion(result.transactionId);
                } catch (err) {
                    console.error('MoMo Polling Error:', err);
                    this.showPaymentError('Connection Error', 'We lost connection while waiting for authorization. Please check the transaction status manually.');
                    return;
                }

                if (statusResult.status === 'Success') {
                    await DataStore.completeBooking(bookingId, roomId, 'MTN MoMo', actualCheckOut, updatedAddOns);

                    // Trigger Housekeeping Notification
                    const rooms = await DataStore.getRooms();
                    const room = rooms.find(r => r.id === roomId);
                    const bookings = await DataStore.getBookings();
                    const b = bookings.find(x => x.id === bookingId);

                    await DataStore.addNotification('Housekeeper', `Room ${room ? room.number : 'Unknown'} has been vacated (Paid via MoMo) and needs cleaning.`);
                    await DataStore.addNotification('Admin', `Guest ${b ? b.guestName : 'Guest'} has checked out of Room ${room ? room.number : 'Unknown'}.`);

                    this.modalBody.innerHTML = `
                        <div class="payment-processing">
                            <div class="payment-spinner" style="color:var(--accent-green);"><i class="fa-solid fa-circle-check"></i></div>
                            <div class="payment-status-message">Payment Successful!</div>
                            <p>Check-out complete. Generating invoice...</p>
                        </div>
                    `;
                    setTimeout(async () => {
                        this.closeModal();
                        await this.renderView('bookings');
                        await this.generateInvoice(bookingId);
                    }, 2000);
                } else {
                    this.showPaymentError('Payment Failed', 'The user declined the request or the session timed out.');
                }
            } else {
                this.showPaymentError('System Error', result.message);
            }
        },

        async processBankPayment(bookingId, roomId, amount, actualCheckOut, updatedAddOns) {
            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner"><i class="fa-solid fa-building-columns"></i></div>
                    <div class="payment-status-message">Connecting to Bank Gateway...</div>
                </div>
            `;

            const result = await PaymentService.initiateBankPayment(amount, bookingId);

            if (result.success) {
                this.modalBody.innerHTML = `
                    <div class="payment-processing">
                        <div class="payment-spinner"><i class="fa-solid fa-arrow-up-right-from-square"></i></div>
                        <div class="payment-status-message">Redirecting to Secure Page...</div>
                        <p class="payment-subtext">You are being redirected to the bank's secure portal to complete the transfer.</p>
                        <div style="margin-top:2rem;">
                            <button class="btn btn-primary" onclick="window.open('${result.redirectUrl}', '_blank'); App.simulateBankReturn('${bookingId}', '${roomId}', '${result.transactionId}', '${actualCheckOut}', ${JSON.stringify(updatedAddOns).replace(/"/g, '&quot;')})">Open Payment Page</button>
                        </div>
                    </div>
                `;
            }
        },

        // Mock function to simulate returning from a bank portal
        async simulateBankReturn(bookingId, roomId, transactionId, actualCheckOut, updatedAddOns) {
            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
                    <div class="payment-status-message">Verifying Transfer...</div>
                </div>
            `;

            await new Promise(resolve => setTimeout(resolve, 3000));
            await DataStore.updateTransactionStatus(transactionId, 'Success');
            await DataStore.completeBooking(bookingId, roomId, 'Bank Transfer', actualCheckOut, updatedAddOns);

            // Trigger Housekeeping Notification
            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === roomId);
            const bookings = await DataStore.getBookings();
            const b = bookings.find(x => x.id === bookingId);

            await DataStore.addNotification('Housekeeper', `Room ${room ? room.number : 'Unknown'} has been vacated (Paid via Bank) and needs cleaning.`);
            await DataStore.addNotification('Admin', `Guest ${b ? b.guestName : 'Guest'} has checked out of Room ${room ? room.number : 'Unknown'}.`);

            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner" style="color:var(--accent-green);"><i class="fa-solid fa-circle-check"></i></div>
                    <div class="payment-status-message">Payment Verified!</div>
                </div>
            `;

            setTimeout(async () => {
                this.closeModal();
                await this.renderView('bookings');
                await this.generateInvoice(bookingId);
            }, 2000);
        },

        showPaymentError(title, message) {
            console.error(`Payment Error [${title}]: ${message}`);
            this.modalBody.innerHTML = `
                <div class="payment-processing">
                    <div class="payment-spinner" style="color:var(--accent-red);"><i class="fa-solid fa-circle-xmark"></i></div>
                    <div class="payment-status-message">${title}</div>
                    <p class="payment-subtext" style="color:var(--text-primary); background:rgba(255,0,0,0.05); padding:10px; border-radius:8px; font-family:monospace; font-size:0.85rem;">
                        ${message || 'An unexpected error occurred. Please check the system logs.'}
                    </p>
                    <div style="margin-top:2rem;">
                        <button class="btn btn-secondary" onclick="App.completeBooking('${this.currentBookingId}')">Try Again</button>
                    </div>
                </div>
            `;
        },

        async deleteGuest(id) {
            const confirmed = await this.showDialog({
                title: 'Delete Guest',
                message: 'Are you sure you want to delete this guest? This will remove their record from the database.',
                type: 'confirm'
            });
            if (confirmed) {
                await DataStore.deleteGuest(id);
                this.renderView('guests');
                this.showToast('Guest record removed.');
            }
        },

        async generateInvoice(bookingId) {
            const bookings = await DataStore.getBookings();
            const booking = bookings.find(b => b.id === bookingId);
            if (!booking) return;

            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === booking.roomId);
            if (!room) return;

            const invoices = await DataStore.getInvoices();
            let invoice = invoices.find(i => i.bookingId === bookingId);

            if (!invoice) {
                const checkInDate = new Date(booking.checkIn);
                const checkOutDate = new Date(booking.checkOut);
                const diffTime = Math.abs(checkOutDate - checkInDate);
                const actualNights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

                const roomAmount = actualNights * room.price;
                const addOnsAmount = booking.addOns?.reduce((sum, ao) => sum + (ao.price * ao.quantity), 0) || 0;
                const totalAmount = roomAmount + addOnsAmount;

                invoice = {
                    bookingId: booking.id,
                    guestName: booking.guestName,
                    roomNumber: room.number,
                    roomType: room.type,
                    pricePerNight: room.price,
                    nights: actualNights,
                    amount: totalAmount,
                    paymentMethod: booking.paymentMethod || 'N/A',
                    date: new Date().toISOString(),
                    checkIn: booking.checkIn,
                    checkOut: booking.checkOut,
                    actualCheckIn: booking.actualCheckIn,
                    actualCheckOut: booking.actualCheckOut,
                    addOns: booking.addOns || []
                };

                try {
                    invoice.id = await DataStore.addInvoice(invoice);
                } catch (dbErr) {
                    console.error('[Invoice] DB save failed, showing modal with local data:', dbErr);
                    invoice.id = 'LOCAL-' + Date.now();
                }

                // ✅ Send email ONLY when invoice is first created (checkout moment)
                try {
                    const guests = await DataStore.getGuests();
                    const guest = guests.find(g => g.id === booking.guestId);
                    if (guest?.email) {
                        this.sendInvoiceEmail(invoice, guest.email);
                        this.showToast(`Invoice emailed to ${guest.email}`);
                    }
                } catch (emailErr) {
                    console.warn('[Email] Could not send invoice email:', emailErr);
                }
            }
            // If invoice already existed (e.g. staff clicked 'Invoice' button again), no email is re-sent

            // 1. Refresh the list view FIRST before opening modal
            if (this.currentView === 'bookings') await this.initBookings();
            if (this.currentView === 'invoices') await this.initInvoicing();

            // 2. Show the invoice modal LAST — nothing will interrupt it
            this.showInvoiceModal(invoice);
        },


        showInvoiceModal(inv) {
            const html = `
                <div class="invoice-doc" id="invoice-printable">
                    <div class="invoice-header">
                        <div class="invoice-logo">
                            <i class="fa-solid fa-hotel"></i> Ndwandwe Estate
                        </div>
                        <div class="invoice-info">
                            <h1>INVOICE</h1>
                            <p>#${inv.id}</p>
                            <p>Date: ${this.formatDate(inv.date)}</p>
                        </div>
                    </div>
                    
                    <div class="invoice-details">
                        <div class="invoice-from">
                            <h4>From</h4>
                            <p><strong>Ndwandwe Estate</strong></p>
                            <p>Plot 42, Ezulwini</p>
                            <p>Eswatini</p>
                            <p>contact@ndwandwe.com</p>
                        </div>
                        <div class="invoice-to">
                            <h4>Bill To</h4>
                            <p><strong>${inv.guestName}</strong></p>
                            <p>Guest ID: ${inv.bookingId}</p>
                            <p style="margin-top: 10px;"><strong>Payment Method:</strong> ${inv.paymentMethod}</p>
                            <p style="margin-top: 10px; margin-bottom: 2px;"><strong>Stay Period:</strong></p>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">
                                <div>In: ${inv.actualCheckIn ? this.formatDateTime(inv.actualCheckIn) : this.formatDate(inv.checkIn)}</div>
                                <div>Out: ${inv.actualCheckOut ? this.formatDateTime(inv.actualCheckOut) : this.formatDate(inv.checkOut)}</div>
                            </div>
                        </div>
                    </div>

                    <table class="invoice-table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Qty</th>
                                <th>Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Room Stay: Room ${inv.roomNumber} (${inv.roomType})</td>
                                <td>${inv.nights} Night(s)</td>
                                <td>E${inv.pricePerNight}</td>
                                <td>E${(inv.pricePerNight * inv.nights).toFixed(2)}</td>
                            </tr>
                            ${inv.addOns && inv.addOns.length > 0 ? inv.addOns.map(ao => `
                                <tr>
                                    <td>Add-on: ${ao.name}</td>
                                    <td>${ao.quantity}</td>
                                    <td>E${ao.price}</td>
                                    <td>E${(ao.price * ao.quantity).toFixed(2)}</td>
                                </tr>
                            `).join('') : ''}
                        </tbody>
                    </table>

                    <div class="invoice-total">
                        <div class="total-box">
                            <div class="total-row">
                                <span>Subtotal</span>
                                <span>E${((inv.pricePerNight * inv.nights) + (inv.addOns?.reduce((sum, ao) => sum + (ao.price * ao.quantity), 0) || 0)).toFixed(2)}</span>
                            </div>
                            <div class="total-row">
                                <span>Tax (0%)</span>
                                <span>E0.00</span>
                            </div>
                            <div class="total-row grand-total">
                                <span>Total Paid</span>
                                <span>E${((inv.pricePerNight * inv.nights) + (inv.addOns?.reduce((sum, ao) => sum + (ao.price * ao.quantity), 0) || 0)).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="invoice-footer">
                        <p>Thank  you  for  choosing  Ndwandwe  Estate!</p>
                        <p>Please  keep  this  invoice  for  your  records.</p>
                    </div>
                </div>

                <div class="form-actions" style="margin-top: 2rem;">
                    <button class="btn btn-secondary" onclick="window.print()">
                        <i class="fa-solid fa-print"></i> Print
                    </button>
                    <button class="btn btn-primary" onclick="App.downloadInvoice('${inv.id}')">
                        <i class="fa-solid fa-download"></i> Download
                    </button>
                </div>
            `;
            this.openModal(`Invoice Detail`, html);

            // Adjust modal width for invoice
            document.getElementById('modal-container').style.maxWidth = '800px';
        },

        downloadInvoice(id) {
            const invoiceElement = document.getElementById('invoice-printable');
            if (!invoiceElement) return;

            const btn = event.currentTarget;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating PDF...';
            btn.disabled = true;

            const options = {
                margin: 10,
                filename: `Invoice_${id}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            // Use html2pdf library
            html2pdf().from(invoiceElement).set(options).save().then(() => {
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }).catch(err => {
                console.error('PDF Error:', err);
                this.showDialog({ title: 'PDF Error', message: 'Could not generate PDF. Please use the Print button instead.', type: 'error' });
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            });
        },

        async viewInvoiceDetail(id) {
            const invoices = await DataStore.getInvoices();
            const inv = invoices.find(i => i.id === id);
            if (inv) {
                this.showInvoiceModal(inv);
            }
        },


        // --- Notifications & Email (via Resend Edge Function) ---

        /**
         * Sends a transactional email through the Supabase Edge Function → Resend pipeline.
         * @param {'booking_confirmed'|'invoice_ready'} type
         * @param {object} data  - Template variables (guestName, roomNumber, checkIn, etc.)
         * @param {string} to    - Recipient email address
         */
        async sendEmail(type, data, to) {
            if (!to) {
                console.warn(`[Email] Skipped — no email address for guest.`);
                return;
            }

            try {
                const { data: sessionData } = await supabaseClient.auth.getSession();
                const accessToken = sessionData?.session?.access_token;

                const res = await fetch(SEND_EMAIL_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ type, to, data }),
                });

                const result = await res.json();

                if (!res.ok) {
                    console.error(`[Email] Resend error (${type}):`, result);
                    let errMsg = result.error || 'Unknown error';
                    if (result.details && result.details.message) errMsg += ` - ${result.details.message}`;

                    if ((result.details && result.details.name === 'validation_error') || errMsg.includes('domain') || errMsg.includes('verified')) {
                        this.showDialog({
                            title: 'Email Delivery Error',
                            message: `Failed to send email to <strong>${to}</strong>.<br><br><strong>Note:</strong> Since you are likely on the Resend free tier, you can only send emails to the email address registered with your Resend account. To send to other emails, you must verify your domain in Resend.`,
                            type: 'error'
                        });
                    } else {
                        this.showToast(`Email delivery failed: ${errMsg}`, 'error');
                    }
                } else {
                    console.log(`[Email] Sent successfully (${type}):`, result.id);
                }
            } catch (err) {
                console.error(`[Email] Network error sending ${type}:`, err);
            }
        },

        /**
         * Called after a booking is created. Sends booking confirmation email.
         */
        async sendNotification(type, data) {
            const { guestEmail, ...templateData } = data;

            if (type === 'booking_confirmed') {
                await this.sendEmail('booking_confirmed', templateData, guestEmail);
            } else if (type === 'invoice_ready') {
                await this.sendEmail('invoice_ready', templateData, guestEmail);
            } else if (type === 'stay_updated') {
                await this.sendEmail('stay_updated', templateData, guestEmail);
            } else {
                console.log(`[Notification] Unknown type: ${type}`, data);
            }
        },

        /**
         * Called after checkout. Sends the invoice as a branded email.
         */
        async sendInvoiceEmail(invoice, guestEmail) {
            if (!guestEmail) return;
            await this.sendEmail('invoice_ready', {
                guestName: invoice.guestName,
                roomNumber: invoice.roomNumber,
                roomType: invoice.roomType,
                nights: invoice.nights,
                pricePerNight: invoice.pricePerNight,
                addOns: invoice.addOns || [],
                totalAmount: invoice.amount,
                paymentMethod: invoice.paymentMethod || 'N/A',
                invoiceId: invoice.id,
                checkIn: invoice.checkIn || '',
                checkOut: invoice.checkOut || '',
            }, guestEmail);
        },

        async sendCheckInReceiptEmail(bookingId, roomCharge, paymentMethod, guestEmail) {
            if (!guestEmail) return;
            const bookings = await DataStore.getBookings();
            const booking = bookings.find(b => b.id === bookingId);
            if (!booking) return;

            const rooms = await DataStore.getRooms();
            const room = rooms.find(r => r.id === booking.roomId);
            if (!room) return;

            const checkInDate = new Date(booking.checkIn);
            const checkOutDate = new Date(booking.checkOut);
            const diffTime = Math.abs(checkOutDate - checkInDate);
            const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            await this.sendEmail('checkin_receipt', {
                guestName: booking.guestName,
                roomNumber: room.number,
                roomType: room.type,
                checkIn: booking.checkIn,
                checkOut: booking.checkOut,
                nights: nights,
                roomCharge: roomCharge,
                paymentMethod: paymentMethod,
                bookingId: bookingId
            }, guestEmail);
        },

        showDialog(options = {}) {
            return new Promise((resolve) => {
                const {
                    title = 'Notice',
                    message = '',
                    type = 'success', // success, error, confirm
                    confirmText = 'OK',
                    cancelText = 'Cancel',
                } = options;

                const overlay = document.createElement('div');
                overlay.className = 'dialog-overlay';

                let iconClass = 'fa-circle-check';
                let iconColorClass = 'dialog-icon-success';
                if (type === 'error') {
                    iconClass = 'fa-triangle-exclamation';
                    iconColorClass = 'dialog-icon-error';
                } else if (type === 'confirm') {
                    iconClass = 'fa-circle-question';
                    iconColorClass = 'dialog-icon-confirm';
                }

                const showCancel = type === 'confirm';

                overlay.innerHTML = `
                    <div class="dialog-box">
                        <div class="dialog-icon ${iconColorClass}">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <h3>${title}</h3>
                        <p>${message}</p>
                        <div class="dialog-buttons">
                            ${showCancel ? `<button class="btn-cancel">${cancelText}</button>` : ''}
                            <button class="btn-confirm">${confirmText}</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(overlay);

                // Trigger animation
                setTimeout(() => overlay.classList.add('active'), 10);

                const confirmBtn = overlay.querySelector('.btn-confirm');
                const cancelBtn = overlay.querySelector('.btn-cancel');

                const close = (result) => {
                    overlay.classList.remove('active');
                    setTimeout(() => {
                        overlay.remove();
                        resolve(result);
                    }, 300);
                };

                confirmBtn.addEventListener('click', () => close(true));
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => close(false));
                }
            });
        },

        // --- Utils ---
        showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type} fade-in`;
            toast.innerHTML = `
                <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
                <span>${message}</span>
            `;
            this.toastContainer.appendChild(toast);

            setTimeout(() => {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        },

        formatDate(dateString) {
            const options = { year: 'numeric', month: 'short', day: 'numeric' };
            return new Date(dateString).toLocaleDateString(undefined, options);
        },

        formatDateTime(dateString) {
            if (!dateString) return '';
            const options = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            return new Date(dateString).toLocaleString(undefined, options);
        }
    };

    // Expose needed methods to global scope for inline handlers
    window.App = App;

    // Start
    App.init();
});
