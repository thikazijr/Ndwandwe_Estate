(async function() {
    const token = sessionStorage.getItem('housekeeper_token');
    const hkId = sessionStorage.getItem('housekeeper_id');
    let housekeeperProfile = null;

    function ensureToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    function showToast(message, type = 'success') {
        const container = ensureToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} fade-in`;
        toast.innerHTML = `
            <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
            <span>${message}</span>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 3500);
    }

    function debounce(fn, ms = 250) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }

    if (!token) {
        document.body.innerHTML = `
            <div style="text-align:center; padding:50px;">
                <h2 style="color:var(--accent-red);">Access Denied</h2>
                <p>Please scan your login QR code.</p>
            </div>
        `;
        return;
    }

    try {
        housekeeperProfile = await DataStore.getHousekeeperByToken(token);
        if (!housekeeperProfile) throw new Error('Invalid token');

        const displayId = housekeeperProfile.id || hkId;
        document.getElementById('housekeeper-name').textContent = housekeeperProfile.name || 'Housekeeper';
        document.getElementById('loading').style.display = 'none';
        document.getElementById('app').style.display = 'block';

        await DataStore.preloadCache();
        await renderTasks(displayId);
        await renderRooms();

        const debouncedRenderRooms = debounce(() => renderRooms());
        const debouncedRenderTasks = debounce(() => renderTasks(displayId));

        DataStore.subscribeToChanges('rooms', (payload) => {
            DataStore.handleRealtimeUpdate('rooms', payload);
            debouncedRenderRooms();
        }, 'hk-portal');

        DataStore.subscribeToChanges('housekeeping_tasks', () => {
            debouncedRenderTasks();
        }, 'hk-portal');

    } catch (e) {
        console.error(e);
        document.body.innerHTML = `<div style="text-align:center; padding:50px; color:var(--accent-red);">Session invalid. Error: ${e.message}</div>`;
    }

    async function renderTasks(housekeeperId) {
        const tasksContainer = document.getElementById('tasks-list');
        const tasks = await DataStore.getHousekeepingTasks(housekeeperId) || [];
        const rooms = await DataStore.getRooms() || [];

        if (tasks.length === 0) {
            tasksContainer.innerHTML = '<p style="color:var(--text-secondary);">No tasks assigned.</p>';
            return;
        }

        let html = '<table class="data-table"><thead><tr><th>Room</th><th>Task</th><th>Status</th><th>Action</th></tr></thead><tbody>';
        tasks.forEach(t => {
            const room = rooms.find(r => r.id === t.room_id);
            const rNum = room ? room.number : 'Unknown';
            const status = String(t.status || 'pending');
            const statusLabel = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
            const isCompleted = status.toLowerCase() === 'completed';
            const description = t.notes || t.description || '';

            html += `
                <tr>
                    <td>Room ${rNum}</td>
                    <td>${description}</td>
                    <td><span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">${statusLabel}</span></td>
                    <td>
                        <button class="btn btn-small ${isCompleted ? 'btn-secondary' : 'btn-success'}" 
                            ${isCompleted ? 'disabled' : ''}
                            onclick="window.completeTask('${t.id}')">
                            ${isCompleted ? 'Done' : 'Mark Done'}
                        </button>
                    </td>
                </tr>
            `;
        });
        html += '</tbody></table>';
        tasksContainer.innerHTML = html;
    }

    async function renderRooms() {
        const container = document.getElementById('rooms-overview');
        const rooms = await DataStore.getRooms();

        let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">';

        rooms.forEach(r => {
            const isClean = r.cleanliness === 'Clean';
            const isDirty = r.cleanliness === 'Dirty';
            const bgClass = isDirty ? 'room-dirty' : '';
            const safeNumber = String(r.number).replace(/'/g, "\\'");

            html += `
                <div class="room-card ${bgClass}" style="background:var(--bg-card); padding:15px; border-radius:12px; border:1px solid var(--border-color); display:flex; flex-direction:column;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <strong style="font-size:1.1rem;">Room ${r.number}</strong>
                        <span class="badge ${isClean ? 'badge-clean' : 'badge-dirty'}">${r.cleanliness || 'Clean'}</span>
                    </div>
                    <div style="color:var(--text-secondary); margin-bottom:15px;">${r.type} Room</div>
                    <button class="btn ${isClean ? 'btn-danger' : 'btn-success'}" style="margin-top:auto;" onclick="window.toggleRoomCleanliness('${r.id}', '${safeNumber}', '${r.cleanliness || 'Dirty'}')">
                        ${isClean ? 'Mark Dirty' : 'Mark Clean'}
                    </button>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    window.completeTask = async (taskId) => {
        try {
            await DataStore.updateTaskStatus(taskId, 'Completed');
            showToast('Task marked as completed.');
        } catch (e) {
            console.error('Failed to complete task', e);
            showToast(e.message || 'Failed to update task status.', 'error');
        }
    };

    window.toggleRoomCleanliness = async (id, number, current) => {
        const nextState = current === 'Clean' ? 'Dirty' : 'Clean';
        const btn = event?.target;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        }

        try {
            await DataStore.updateRoomCleanliness(id, nextState);

            if (nextState === 'Clean') {
                const hkName = housekeeperProfile?.name || 'Housekeeper';
                const hkProfileId = housekeeperProfile?.id || hkId;
                await DataStore.addNotification(
                    'Receptionist',
                    `Room ${number} is now Clean and ready for guests.`,
                    'Housekeeper',
                    hkName,
                    hkProfileId
                );
                await DataStore.addNotification(
                    'Admin',
                    `Room ${number} has been cleaned by ${hkName}.`,
                    'Housekeeper',
                    hkName,
                    hkProfileId
                );
                showToast(`Room ${number} marked as Clean. Reception has been notified.`);
            } else {
                showToast(`Room ${number} marked as Dirty.`);
            }

            await renderRooms();
        } catch (e) {
            console.error('Failed to toggle room status', e);
            showToast(e.message || 'Failed to update room status.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = nextState === 'Clean' ? 'Mark Dirty' : 'Mark Clean';
            }
        }
    };

})();
