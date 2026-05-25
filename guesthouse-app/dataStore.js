// dataStore.js - Handles Supabase database operations

const DataStore = {
    cache: {
        rooms: null,
        guests: null,
        bookings: null,
        addOns: null,
        invoices: null,
    },

    handleRealtimeUpdate(table, payload) {
        const { eventType, new: newRec, old: oldRec } = payload;
        
        const updateList = (cacheKey) => {
            if (!this.cache[cacheKey]) return;
            if (eventType === 'INSERT') {
                this.cache[cacheKey].push(newRec);
            } else if (eventType === 'UPDATE') {
                const idx = this.cache[cacheKey].findIndex(i => i.id === newRec.id);
                if (idx !== -1) this.cache[cacheKey][idx] = { ...this.cache[cacheKey][idx], ...newRec };
            } else if (eventType === 'DELETE') {
                this.cache[cacheKey] = this.cache[cacheKey].filter(i => i.id !== oldRec.id);
            }
        };

        if (table === 'rooms') updateList('rooms');
        if (table === 'guests') updateList('guests');
        if (table === 'add_ons' || table === 'addons') updateList('addOns');

        if (table === 'bookings') {
            if (!this.cache.bookings) return;
            if (eventType === 'DELETE') {
                this.cache.bookings = this.cache.bookings.filter(b => b.id !== oldRec.id);
            } else {
                const guest = this.cache.guests?.find(g => g.id === newRec.guest_id);
                const room = this.cache.rooms?.find(r => r.id === newRec.room_id);
                
                const formattedBooking = {
                    id: newRec.id,
                    guestId: newRec.guest_id,
                    guestName: guest ? guest.name : 'Unknown',
                    roomId: newRec.room_id,
                    roomNumber: room ? room.number : 'Unknown',
                    checkIn: newRec.check_in,
                    checkOut: newRec.check_out,
                    actualCheckIn: newRec.actual_check_in,
                    actualCheckOut: newRec.actual_check_out,
                    status: newRec.status,
                    paymentMethod: newRec.payment_method,
                    addOns: [],
                    transactions: []
                };

                if (eventType === 'INSERT') {
                    this.cache.bookings.unshift(formattedBooking);
                } else if (eventType === 'UPDATE') {
                    const idx = this.cache.bookings.findIndex(b => b.id === newRec.id);
                    if (idx !== -1) {
                        formattedBooking.addOns = this.cache.bookings[idx].addOns || [];
                        formattedBooking.transactions = this.cache.bookings[idx].transactions || [];
                        this.cache.bookings[idx] = formattedBooking;
                    } else {
                        this.cache.bookings.unshift(formattedBooking);
                    }
                }
            }
        }
        
        if (table === 'booking_add_ons') {
            if (!this.cache.bookings) return;
            const bookingId = newRec?.booking_id || oldRec?.booking_id;
            const idx = this.cache.bookings.findIndex(b => b.id === bookingId);
            if (idx !== -1) {
                const booking = this.cache.bookings[idx];
                if (eventType === 'INSERT') {
                    const addOn = this.cache.addOns?.find(a => a.id === newRec.add_on_id);
                    booking.addOns.push({
                        id: newRec.id,
                        addOnId: newRec.add_on_id,
                        name: addOn ? addOn.name : 'Unknown',
                        quantity: newRec.quantity,
                        price: parseFloat(newRec.price_at_time || 0),
                        status: newRec.status || 'Requested',
                        createdAt: newRec.created_at
                    });
                } else if (eventType === 'UPDATE') {
                    const aoIdx = booking.addOns.findIndex(a => a.id === newRec.id);
                    if (aoIdx !== -1) {
                        booking.addOns[aoIdx].quantity = newRec.quantity;
                        booking.addOns[aoIdx].status = newRec.status;
                        booking.addOns[aoIdx].price = parseFloat(newRec.price_at_time || 0);
                    }
                } else if (eventType === 'DELETE') {
                    booking.addOns = booking.addOns.filter(a => a.id !== oldRec.id);
                }
            }
        }

        if (table === 'invoices') {
            this.cache.invoices = null; // Complex relationships, fallback to refetch
        }
    },

    async preloadCache() {
        console.log('Preloading DataStore cache...');
        const [rooms, guests, bookings, addOns, invoices] = await Promise.all([
            this._fetchRooms(),
            this._fetchGuests(),
            this._fetchBookings(),
            this._fetchAddOns(),
            this._fetchInvoices(),
        ]);
        this.cache.rooms = rooms;
        this.cache.guests = guests;
        this.cache.bookings = bookings;
        this.cache.addOns = addOns;
        this.cache.invoices = invoices;
        console.log('Cache preloaded successfully.');
    },

    // --- Auth & Profiles ---
    async getProfile(userId) {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('DATABASE ERROR (Profiles):', error.message);
            console.log('Attempted ID search:', userId);
            return null;
        }
        if (data?.role) {
            const role = data.role.toLowerCase();
            if (role === 'housekeeper') data.role = 'Housekeeper';
            else if (role === 'admin') data.role = 'Admin';
            else if (role === 'receptionist') data.role = 'Receptionist';
        }
        return data;
    },

    // --- Audit Logs ---
    async logAction(action, entity, entityId, oldValue = null, newValue = null) {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;

            // Try to get name, but fallback to email if profile isn't ready
            const profile = await this.getProfile(user.id);
            const userName = profile?.name || user.email;

            const { error } = await supabaseClient
                .from('audit_logs')
                .insert([{
                    user_id: user.id,
                    user_name: userName,
                    action: action,
                    entity: entity,
                    entity_id: entityId.toString(),
                    old_value: oldValue,
                    new_value: newValue
                }]);

            if (error) {
                console.error(`Audit Log Failed [${action} ${entity}]:`, error.message);
            } else {
                console.log(`Audit Log Saved: ${action} on ${entity}`);
            }
        } catch (err) {
            console.error('Audit Log System Error:', err);
        }
    },


    // --- Rooms ---
    async _fetchRooms() {
        const { data, error } = await supabaseClient
            .from('rooms')
            .select('*')
            .order('number', { ascending: true });

        if (error) throw error;
        return data;
    },

    async getRooms() {
        if (this.cache.rooms) return this.cache.rooms;
        this.cache.rooms = await this._fetchRooms();
        return this.cache.rooms;
    },

    async addRoom(room) {
        const { data, error } = await supabaseClient
            .from('rooms')
            .insert([room])
            .select();

        if (error) throw error;
        const newRoom = data ? data[0] : null;
        if (newRoom) await this.logAction('CREATE', 'room', newRoom.id, null, newRoom);
        return newRoom;
    },

    async updateRoomStatus(id, status) {
        const { error } = await supabaseClient
            .from('rooms')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
    },

    async updateRoomICal(id, url) {
        const { error } = await supabaseClient
            .from('rooms')
            .update({ ical_import_url: url })
            .eq('id', id);

        if (error) throw error;
    },

    async updateRoomCleanliness(id, cleanliness) {
        const { data: oldRoom } = await supabaseClient.from('rooms').select('*').eq('id', id).single();
        const { error } = await supabaseClient
            .from('rooms')
            .update({ cleanliness })
            .eq('id', id);

        if (error) throw error;
        await this.logAction('UPDATE', 'room', id, { cleanliness: oldRoom.cleanliness }, { cleanliness });
    },

    async deleteRoom(id) {
        const { data: oldRoom } = await supabaseClient.from('rooms').select('*').eq('id', id).single();
        const { error } = await supabaseClient
            .from('rooms')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await this.logAction('DELETE', 'room', id, oldRoom, null);
    },

    // --- Guests ---
    async _fetchGuests() {
        const { data, error } = await supabaseClient
            .from('guests')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return data;
    },

    async getGuests() {
        if (this.cache.guests) return this.cache.guests;
        this.cache.guests = await this._fetchGuests();
        return this.cache.guests;
    },

    async addGuest(guest) {
        const { data, error } = await supabaseClient
            .from('guests')
            .insert([guest])
            .select();

        if (error) throw error;
        const newGuest = data ? data[0] : null;
        if (newGuest) await this.logAction('CREATE', 'guest', newGuest.id, null, newGuest);
        return newGuest;
    },

    async updateGuest(id, guest) {
        const { data: oldGuest } = await supabaseClient.from('guests').select('*').eq('id', id).single();
        const { data, error } = await supabaseClient
            .from('guests')
            .update(guest)
            .eq('id', id)
            .select();

        if (error) throw error;
        const updated = data ? data[0] : null;
        if (updated) await this.logAction('UPDATE', 'guest', id, oldGuest, updated);
        return updated;
    },

    async deleteGuest(id) {
        const { data: oldGuest } = await supabaseClient.from('guests').select('*').eq('id', id).single();
        const { error } = await supabaseClient
            .from('guests')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await this.logAction('DELETE', 'guest', id, oldGuest, null);
    },

    async isRoomAvailable(roomId, checkIn, checkOut, excludeBookingId = null) {
        // Overlap logic: (StartA < EndB) AND (EndA > StartB)
        let query = supabaseClient
            .from('bookings')
            .select('id')
            .eq('room_id', roomId)
            .neq('status', 'Cancelled') // Ignore cancelled bookings
            .lt('check_in', checkOut)
            .gt('check_out', checkIn);

        if (excludeBookingId) {
            query = query.neq('id', excludeBookingId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error checking room availability:', error.message);
            throw error;
        }

        return data.length === 0;
    },

    async getBookingByToken(token) {
        const { data, error } = await supabaseClient
            .from('bookings')
            .select(`
                *,
                guests (name, email, phone),
                rooms (number, type, price),
                booking_add_ons (
                    id,
                    add_on_id,
                    quantity,
                    price_at_time,
                    status,
                    created_at,
                    add_ons (name)
                ),
                transactions (
                    id,
                    amount,
                    status
                )
            `)
            .eq('portal_token', token)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        if (!data) return null;

        return {
            id: data.id,
            guestName: data.guests?.name,
            roomNumber: data.rooms?.number,
            roomType: data.rooms?.type,
            roomPrice: data.rooms?.price,
            checkIn: data.check_in,
            checkOut: data.check_out,
            actualCheckIn: data.actual_check_in,
            actualCheckOut: data.actual_check_out,
            status: data.status,
            addOns: data.booking_add_ons.map(ao => {
                let currentStatus = ao.status || 'Requested';
                if (currentStatus === 'Delivered' && ao.created_at) {
                    const age = Date.now() - new Date(ao.created_at).getTime();
                    if (age > 60 * 60 * 1000) { // 1 hour
                        currentStatus = 'Confirmed';
                        DataStore.updateAddOnStatus(ao.id, 'Confirmed').catch(console.error);
                    }
                }
                return {
                    id: ao.id,
                    addOnId: ao.add_on_id,
                    name: ao.add_ons?.name,
                    quantity: ao.quantity,
                    price: parseFloat(ao.price_at_time || 0),
                    status: currentStatus,
                    createdAt: ao.created_at
                };
            }),
            transactions: data.transactions || []
        };
    },

    async getBookingByRoom(roomId) {
        // Finds the currently active booking for a given room ID
        const { data, error } = await supabaseClient
            .from('bookings')
            .select(`
                *,
                guests (name, email, phone),
                rooms (number, type, price),
                booking_add_ons (
                    id,
                    add_on_id,
                    quantity,
                    price_at_time,
                    status,
                    created_at,
                    add_ons (name)
                ),
                transactions (
                    id,
                    amount,
                    status
                )
            `)
            .eq('room_id', roomId)
            .in('status', ['Active', 'Checkout Requested'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        return {
            id: data.id,
            portalToken: data.portal_token,
            guestName: data.guests?.name,
            roomNumber: data.rooms?.number,
            roomType: data.rooms?.type,
            roomPrice: data.rooms?.price,
            checkIn: data.check_in,
            checkOut: data.check_out,
            actualCheckIn: data.actual_check_in,
            actualCheckOut: data.actual_check_out,
            status: data.status,
            addOns: data.booking_add_ons ? data.booking_add_ons.map(ao => ({
                id: ao.id,
                addOnId: ao.add_on_id,
                name: ao.add_ons?.name,
                quantity: ao.quantity,
                price: parseFloat(ao.price_at_time || 0),
                status: ao.status || 'Requested',
                createdAt: ao.created_at
            })) : [],
            transactions: data.transactions || []
        };
    },

    async updateBookingStatus(id, status) {
        const { error } = await supabaseClient
            .from('bookings')
            .update({ status })
            .eq('id', id);
        
        if (error) throw error;
        await this.logAction('UPDATE', 'booking_status', id, null, { status });
    },

    async updateBookingCheckOut(id, newCheckOutDate) {
        const { error } = await supabaseClient
            .from('bookings')
            .update({ check_out: newCheckOutDate })
            .eq('id', id);
        
        if (error) throw error;
        await this.logAction('UPDATE', 'booking_checkout_extension', id, null, { check_out: newCheckOutDate });
    },

    async checkInBooking(id, roomId) {
        const { error } = await supabaseClient
            .from('bookings')
            .update({
                status: 'Active',
                actual_check_in: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;
        
        // Update Room Status to Occupied
        await this.updateRoomStatus(roomId, 'Occupied');
        await this.logAction('UPDATE', 'booking_checkin', id, { status: 'Confirmed' }, { status: 'Active', actual_check_in: new Date().toISOString() });
    },

    async updateAddOnStatus(addOnBookingId, status) {
        const { error } = await supabaseClient
            .from('booking_add_ons')
            .update({ status })
            .eq('id', addOnBookingId);
        
        if (error) throw error;
        await this.logAction('UPDATE', 'booking_add_on_status', addOnBookingId, null, { status });
    },

    async _fetchBookings() {
        const { data, error } = await supabaseClient
            .from('bookings')
            .select(`
                *,
                guests (name),
                rooms (number),
                booking_add_ons (
                    id,
                    add_on_id,
                    quantity,
                    price_at_time,
                    status,
                    created_at,
                    add_ons (name)
                ),
                transactions (
                    id,
                    amount,
                    status
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data.map(b => ({
            id: b.id,
            guestId: b.guest_id,
            guestName: b.guests ? b.guests.name : 'Unknown',
            roomId: b.room_id,
            roomNumber: b.rooms ? b.rooms.number : 'Unknown',
            checkIn: b.check_in,
            checkOut: b.check_out,
            actualCheckIn: b.actual_check_in,
            actualCheckOut: b.actual_check_out,
            status: b.status,
            paymentMethod: b.payment_method,
            addOns: b.booking_add_ons ? b.booking_add_ons.map(ao => {
                let currentStatus = ao.status || 'Delivered';
                if (currentStatus === 'Delivered' && ao.created_at) {
                    const age = Date.now() - new Date(ao.created_at).getTime();
                    if (age > 60 * 60 * 1000) { // 1 hour
                        currentStatus = 'Confirmed';
                        DataStore.updateAddOnStatus(ao.id, 'Confirmed').catch(console.error);
                    }
                }
                return {
                    id: ao.id,
                    addOnId: ao.add_on_id,
                    name: ao.add_ons ? ao.add_ons.name : 'Unknown',
                    quantity: ao.quantity,
                    price: parseFloat(ao.price_at_time || 0),
                    status: currentStatus,
                    createdAt: ao.created_at
                };
            }) : [],
            transactions: b.transactions || []
        }));
    },

    async getBookings() {
        if (this.cache.bookings) return this.cache.bookings;
        this.cache.bookings = await this._fetchBookings();
        return this.cache.bookings;
    },

    async addBooking(booking, selectedAddOns = []) {
        // 1. Check for overlapping bookings
        const isAvailable = await this.isRoomAvailable(booking.roomId, booking.checkIn, booking.checkOut);
        if (!isAvailable) {
            throw new Error('This room is already booked for the selected dates.');
        }

        const initialStatus = booking.status || 'Active';
        const dbBooking = {
            guest_id: booking.guestId,
            room_id: booking.roomId,
            check_in: booking.checkIn,
            check_out: booking.checkOut,
            status: initialStatus,
            actual_check_in: initialStatus === 'Active' ? new Date().toISOString() : null,
            portal_token: crypto.randomUUID() // Generate unique token for the guest portal
        };

        const { data, error } = await supabaseClient
            .from('bookings')
            .insert([dbBooking])
            .select();

        if (error) throw error;
        const newBooking = data[0];

        // Add-ons integration
        if (selectedAddOns.length > 0) {
            const addOnInserts = selectedAddOns.map(ao => ({
                booking_id: newBooking.id,
                add_on_id: ao.id,
                quantity: ao.quantity || 1,
                price_at_time: ao.price,
                status: 'Confirmed' // Initial booking add-ons are pre-confirmed
            }));
            await supabaseClient.from('booking_add_ons').insert(addOnInserts);
        }

        if (initialStatus === 'Active') {
            await this.updateRoomStatus(booking.roomId, 'Occupied');
        }
        await this.logAction('CREATE', 'booking', newBooking.id, null, { ...newBooking, addOns: selectedAddOns });

        return newBooking;
    },

    async completeBooking(id, roomId, paymentMethod, actualCheckOut, updatedAddOns) {
        const checkOutDate = actualCheckOut || new Date().toISOString().split('T')[0];
        
        // 1. Update Booking Status & Date
        const { error: bookingError } = await supabaseClient
            .from('bookings')
            .update({
                status: 'Completed',
                payment_method: paymentMethod,
                check_out: checkOutDate,
                actual_check_out: new Date().toISOString()
            })
            .eq('id', id);

        if (bookingError) throw bookingError;

        // 2. Clean up un-delivered requests and ensure confirmed/delivered ones are kept
        // First delete any add-on that is still 'Requested' (never delivered/confirmed)
        await supabaseClient
            .from('booking_add_ons')
            .delete()
            .eq('booking_id', id)
            .eq('status', 'Requested');

        // Then update all 'Delivered' add-ons to 'Confirmed' status
        await supabaseClient
            .from('booking_add_ons')
            .update({ status: 'Confirmed' })
            .eq('booking_id', id)
            .eq('status', 'Delivered');

        // If updatedAddOns is passed, update quantities for the kept add-ons
        if (updatedAddOns && updatedAddOns.length > 0) {
            for (const ao of updatedAddOns) {
                if (ao.quantity <= 0) {
                    await supabaseClient
                        .from('booking_add_ons')
                        .delete()
                        .eq('id', ao.id);
                } else {
                    await supabaseClient
                        .from('booking_add_ons')
                        .update({ quantity: ao.quantity })
                        .eq('id', ao.id);
                }
            }
        }

        // 3. Update Room Status
        await this.updateRoomStatus(roomId, 'Available');
        await this.updateRoomCleanliness(roomId, 'Dirty');
        
        await this.logAction('UPDATE', 'booking', id, { status: 'Active' }, { status: 'Completed', paymentMethod, checkOutDate, updatedAddOns });
    },

    async addServiceToBooking(bookingId, addOnId, quantity, price, status = 'Delivered') {
        // Check if this add-on already exists for this booking
        const { data: existing, error: fetchError } = await supabaseClient
            .from('booking_add_ons')
            .select('*')
            .eq('booking_id', bookingId)
            .eq('add_on_id', addOnId)
            .eq('status', status) // Match by status too to avoid combining confirmed and pending
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

        if (existing) {
            // Update quantity
            const { error: updateError } = await supabaseClient
                .from('booking_add_ons')
                .update({ quantity: existing.quantity + quantity })
                .eq('id', existing.id);
            if (updateError) throw updateError;
        } else {
            // Insert new
            const { error: insertError } = await supabaseClient
                .from('booking_add_ons')
                .insert([{
                    booking_id: bookingId,
                    add_on_id: addOnId,
                    quantity: quantity,
                    price_at_time: price,
                    status: status
                }]);
            if (insertError) throw insertError;
        }

        await this.logAction('CREATE', 'booking_service', bookingId, null, { addOnId, quantity, price, status });
    },

    // --- Add-ons (Inventory) ---
    async _fetchAddOns() {
        // Try 'add_ons' (standard) then 'addons' (fallback)
        const tablesToTry = ['add_ons', 'addons'];
        let lastError = null;

        for (const tableName of tablesToTry) {
            try {
                const { data, error } = await supabaseClient
                    .from(tableName)
                    .select('*');
                
                if (error) {
                    lastError = error;
                    continue; // Try next table
                }
                
                if (data) {
                    console.log(`Add-ons loaded from table: ${tableName}`);
                    return data.filter(ao => ao.is_active !== false);
                }
            } catch (err) {
                lastError = err;
            }
        }
        console.error('All add-ons table attempts failed:', lastError);
        return [];
    },

    async getAddOns() {
        if (this.cache.addOns) return this.cache.addOns;
        this.cache.addOns = await this._fetchAddOns();
        return this.cache.addOns;
    },

    // --- Housekeeping Tasks ---
    async getHousekeepingTasks(housekeeperId) {
        let query = supabaseClient.from('housekeeping_tasks').select('*');
        if (housekeeperId) {
            query = query.eq('staff_id', housekeeperId);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async addHousekeepingTask(task) {
        const payload = {
            staff_id: task.staff_id ?? task.housekeeper_id,
            room_id: task.room_id,
            notes: task.notes ?? task.description,
            status: (task.status || 'pending').toString().toLowerCase(),
        };

        const { data, error } = await supabaseClient
            .from('housekeeping_tasks')
            .insert([payload])
            .select();
        if (error) throw error;
        const newTask = Array.isArray(data) ? data[0] : data;
        if (newTask) await this.logAction('CREATE', 'housekeeping_task', newTask.id, null, newTask);
        return newTask;
    },

    async updateTaskStatus(taskId, status) {
        const normalizedStatus = status ? status.toString().toLowerCase() : 'pending';
        const { error } = await supabaseClient
            .from('housekeeping_tasks')
            .update({ status: normalizedStatus })
            .eq('id', taskId);
        if (error) throw error;
        await this.logAction('UPDATE', 'housekeeping_task_status', taskId, null, { status: normalizedStatus });
    },

    async createHousekeeperLoginToken(staffId) {
        const token = crypto.randomUUID();
        const { error } = await supabaseClient
            .from('housekeeping_logins')
            .insert([{ token, staff_id: staffId }]);
        if (error) throw error;
        return token;
    },

    async getHousekeepers() {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .ilike('role', '%housekeeper%');
        if (error) throw error;
        return data || [];
    },

    async getHousekeeperByToken(token) {
        const { data, error } = await supabaseClient
            .from('housekeeping_logins')
            .select('staff_id')
            .eq('token', token)
            .single();
        if (error) {
            console.error('Invalid housekeeping token', error.message);
            return null;
        }
        return this.getProfile(data.staff_id);
    },


    // --- Invoices ---
    async _fetchInvoices() {
        const { data, error } = await supabaseClient
            .from('invoices')
            .select(`
                *,
                bookings (
                    id,
                    guest_id,
                    room_id,
                    check_in,
                    check_out,
                    actual_check_in,
                    actual_check_out,
                    guests (name),
                    rooms (number, type, price),
                    booking_add_ons (
                        quantity,
                        price_at_time,
                        add_ons (name)
                    )
                )
            `)
            .order('date', { ascending: false });

        if (error) throw error;

        return data.map(inv => {
            const addOnsTotal = inv.bookings?.booking_add_ons?.reduce((sum, ao) => sum + (ao.price_at_time * ao.quantity), 0) || 0;
            return {
                id: inv.id,
                bookingId: inv.booking_id,
                date: inv.date,
                amount: inv.amount,
                paymentMethod: inv.payment_method,
                guestName: inv.bookings?.guests?.name || 'Unknown',
                roomNumber: inv.bookings?.rooms?.number || 'Unknown',
                roomType: inv.bookings?.rooms?.type || 'Unknown',
                pricePerNight: inv.bookings?.rooms?.price || 0,
                nights: inv.nights || 1,
                checkIn: inv.bookings?.check_in,
                checkOut: inv.bookings?.check_out,
                actualCheckIn: inv.bookings?.actual_check_in,
                actualCheckOut: inv.bookings?.actual_check_out,
                addOns: inv.bookings?.booking_add_ons?.map(ao => ({
                    name: ao.add_ons ? ao.add_ons.name : 'Unknown',
                    quantity: ao.quantity,
                    price: parseFloat(ao.price_at_time || 0)
                })) || []
            };
        });
    },

    async getInvoices() {
        if (this.cache.invoices) return this.cache.invoices;
        this.cache.invoices = await this._fetchInvoices();
        return this.cache.invoices;
    },

    async addInvoice(invoice) {
        const dbInvoice = {
            booking_id: invoice.bookingId,
            amount: invoice.amount,
            payment_method: invoice.paymentMethod,
            date: new Date().toISOString()
        };

        const { data, error } = await supabaseClient
            .from('invoices')
            .insert([dbInvoice])
            .select();

        if (error) throw error;
        await this.logAction('CREATE', 'invoice', data[0].id, null, dbInvoice);
        return data[0].id;
    },

    // --- Transactions ---
    async addTransaction(transaction) {
        console.log('Creating Transaction:', transaction);
        const { data, error } = await supabaseClient
            .from('transactions')
            .insert([transaction])
            .select();

        if (error) {
            console.error('DATABASE ERROR (Transactions):', error.message);
            throw error;
        }
        const newTransaction = data[0];
        await this.logAction('CREATE', 'transaction', newTransaction.id, null, newTransaction);
        return newTransaction.id;
    },

    async updateTransactionStatus(id, status) {
        const { data: oldTx } = await supabaseClient.from('transactions').select('*').eq('id', id).single();
        const { error } = await supabaseClient
            .from('transactions')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
        await this.logAction('UPDATE', 'transaction', id, { status: oldTx.status }, { status });
    },

    async getTransactionStatus(id) {
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('status')
            .eq('id', id)
            .single();

        if (error) return 'Failed';
        return data.status;
    },

    // --- Real-time Subscriptions ---
    subscribeToChanges(table, callback) {
        return supabaseClient
            .channel(`public:${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: table }, payload => {
                callback(payload);
            })
            .subscribe();
    },

    // --- Audit Logs Fetch ---
    async getLogs() {
        const { data, error } = await supabaseClient
            .from('audit_logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(100); // Only show the last 100 for performance

        if (error) throw error;
        return data;
    },

    // --- Notifications ---
    async getNotifications(role, unreadOnly = true, userId = null) {
        let query = supabaseClient.from('notifications').select('*');
        
        if (userId && !unreadOnly) {
            // Fetch messages for my role OR messages I sent (for Communication Hub)
            query = query.or(`target_role.eq.${role},sender_id.eq.${userId}`);
        } else {
            query = query.eq('target_role', role);
            if (unreadOnly) {
                query = query.eq('is_read', false);
            }
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
            console.error('DATABASE ERROR (Notifications):', error.message);
            return [];
        }
        return data;
    },

    async addNotification(targetRole, message, senderRole = 'System', senderName = 'System', senderId = null) {
        const { error } = await supabaseClient
            .from('notifications')
            .insert([{ 
                target_role: targetRole, 
                message: message,
                sender_role: senderRole,
                sender_name: senderName,
                sender_id: senderId
            }]);

        if (error) console.error('Error adding notification:', error.message);
    },

    async markNotificationAsRead(id) {
        const { error } = await supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (error) console.error('Error marking notification as read:', error.message);
    },
};

window.DataStore = DataStore;
