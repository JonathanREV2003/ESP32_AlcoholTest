// Client script adapted to talk to the PC server (express)
let lecturasGuardadas = [];
let currentUser = 'USUARIO_01';
let registroActivo = false;

// If you still want to query the ESP32 directly, set ESP_IP. Otherwise set to null and client will use the PC server.
const ESP_IP = 'http://192.168.137.197'; // e.g. 'http://192.168.4.1'
const SERVER_PC = window.location.origin || 'http://localhost:3000';

// DOM elements
const elements = {
    alcoholMGL: document.getElementById('alcoholMGL'),
    alcoholPercent: document.getElementById('alcoholPercent'),
    sensorValue: document.getElementById('sensorValue'),
    currentUser: document.getElementById('currentUser'),
    registroStatus: document.getElementById('registroStatus'),
    toggleBtn: document.getElementById('toggleBtn'),
    userIdentification: document.getElementById('userIdentification'),
    observations: document.getElementById('observations'),
    readingsContainer: document.getElementById('readingsContainer'),
    loadingMessage: document.getElementById('loadingMessage'),
    noDataMessage: document.getElementById('noDataMessage')
};

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    updateDisplay();
    // Poll server for latest reading and state
    obtenerDatos();
    setInterval(obtenerDatos, 2000);
});

async function obtenerDatos() {
    try {
        // Prefer server as source of truth
        const res = await fetch(`${SERVER_PC}/data`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Update UI (expect data.alcohol as number 0..100)
        const alcohol = typeof data.alcohol === 'number' ? data.alcohol : 0;
        elements.alcoholPercent.textContent = alcohol.toFixed(1);
        // Optionally compute mg/L or sensor value if you have conversion
        elements.alcoholMGL.textContent = '--';
        registroActivo = !!data.activo;
        currentUser = data.user || currentUser;
        elements.currentUser.textContent = currentUser;

        updateButtonState();
    } catch (err) {
        console.warn('obtenerDatos failed', err.message);
    }
}

// Send a reading to the PC server (/guardar)
async function enviarDatosAlServidorLocal(reading) {
    try {
        const res = await fetch(`${SERVER_PC}/guardar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reading)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('Error enviando lectura al servidor:', err.message);
        throw err;
    }
}

// Toggle registro on the server
async function toggleRegistro() {
    try {
        const res = await fetch(`${SERVER_PC}/toggle`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        registroActivo = !!data.activo;
        updateButtonState();
    } catch (err) {
        console.error('Error toggleRegistro:', err.message);
        showNotification('Error al cambiar estado', 'error');
    }
}

function updateButtonState() {
    elements.toggleBtn.textContent = registroActivo ? 'Detener Registro Automático' : 'Iniciar Registro Automático';
    elements.toggleBtn.className = registroActivo ? 'btn-primary' : 'btn-secondary';
    elements.registroStatus.textContent = registroActivo ? 'ACTIVO' : 'DETENIDO';
    elements.registroStatus.className = registroActivo ? 'status-on' : 'status-off';
}

// Hook the button
elements.toggleBtn.addEventListener('click', toggleRegistro);

// Set user identification on server
async function setUserIdentification() {
    const nuevaIdentificacion = elements.userIdentification.value.trim() || 'USUARIO_01';
    try {
        const res = await fetch(`${SERVER_PC}/setuser`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identificacion: nuevaIdentificacion })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        currentUser = data.identificacion || nuevaIdentificacion;
        elements.currentUser.textContent = currentUser;
        elements.userIdentification.value = '';
        showNotification('Usuario actualizado correctamente', 'success');
    } catch (err) {
        console.error('setUserIdentification error', err.message);
        showNotification('Error al actualizar usuario', 'error');
    }
}

// Save manual reading from UI to server and locally
async function saveManualReading() {
    const alcoholMGL = parseFloat(elements.alcoholMGL.textContent);
    const observaciones = elements.observations.value.trim();
    if (isNaN(alcoholMGL)) { showNotification('No hay datos válidos del sensor', 'warning'); return; }

    const reading = {
        alcohol_mg_l: alcoholMGL,
        alcohol: null,
        observaciones,
        timestamp: new Date().toISOString(),
        sensor_value: null
    };

    try {
        const res = await enviarDatosAlServidorLocal(reading);
        const entry = res.entry || { ...reading, id: Date.now(), user: currentUser };
        lecturasGuardadas.unshift(entry);
        saveToLocalStorage();
        updateReadingsDisplay();
        elements.observations.value = '';
        showNotification('Lectura guardada correctamente', 'success');
    } catch (err) {
        showNotification('Error al guardar lectura', 'error');
    }
}

async function loadReadings() {
    try {
        elements.loadingMessage.style.display = 'block';
        const res = await fetch(`${SERVER_PC}/readings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        lecturasGuardadas = Array.isArray(data) ? data : [];
        saveToLocalStorage();
        updateReadingsDisplay();
        showNotification('Registros actualizados', 'success');
    } catch (err) {
        console.error('loadReadings', err.message);
        showNotification('Error al cargar registros', 'error');
    } finally {
        elements.loadingMessage.style.display = 'none';
    }
}

function applyFilters() {
    const filterUser = document.getElementById('filterUser').value.toLowerCase();
    const filterDate = document.getElementById('filterDate').value;
    const filterMin = parseFloat(document.getElementById('filterMin').value);
    const filterMax = parseFloat(document.getElementById('filterMax').value);
    let filtered = lecturasGuardadas.slice();
    if (filterUser) filtered = filtered.filter(r => (r.user||'').toLowerCase().includes(filterUser));
    if (filterDate) filtered = filtered.filter(r => r.timestamp && r.timestamp.startsWith(filterDate));
    if (!isNaN(filterMin)) filtered = filtered.filter(r => (r.alcohol_mg_l||0) >= filterMin);
    if (!isNaN(filterMax)) filtered = filtered.filter(r => (r.alcohol_mg_l||0) <= filterMax);
    displayFilteredReadings(filtered);
}

function exportToCSV() {
    if (lecturasGuardadas.length === 0) { showNotification('No hay datos para exportar', 'warning'); return; }
    const headers = ['Fecha','Hora','Usuario','Alcohol (mg/L)','Alcohol (%)','Observaciones'];
    const csvData = lecturasGuardadas.map(l => {
        const fecha = new Date(l.timestamp);
        return [fecha.toLocaleDateString(), fecha.toLocaleTimeString(), l.user||'', (l.alcohol_mg_l||'').toString(), (l.alcohol||'').toString(), `"${l.observaciones||''}"`];
    });
    const csvContent = [headers, ...csvData].map(r=>r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `alcoholimetro_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
    showNotification('Datos exportados a CSV', 'success');
}

function updateReadingsDisplay() {
    if (!lecturasGuardadas || lecturasGuardadas.length === 0) { elements.readingsContainer.innerHTML = ''; elements.noDataMessage.style.display = 'block'; return; }
    elements.noDataMessage.style.display = 'none';
    displayFilteredReadings(lecturasGuardadas);
}

function displayFilteredReadings(readings) {
    elements.readingsContainer.innerHTML = readings.map(lectura => `
        <div class="reading-item">
            <div class="reading-header">
                <span class="reading-user">${lectura.user||''}</span>
                <span class="reading-time">${new Date(lectura.timestamp).toLocaleString()}</span>
            </div>
            <div class="reading-value">${(lectura.alcohol_mg_l||lectura.alcohol||0).toString()} ${(lectura.alcohol_mg_l ? 'mg/L' : '%')}</div>
            ${lectura.observaciones ? `<div class="reading-obs">${lectura.observaciones}</div>` : ''}
        </div>
    `).join('');
}

function saveToLocalStorage() { localStorage.setItem('alcoholimetro_lecturas', JSON.stringify(lecturasGuardadas)); localStorage.setItem('alcoholimetro_usuario', currentUser); }

function loadFromLocalStorage() {
    const saved = localStorage.getItem('alcoholimetro_lecturas');
    const savedUser = localStorage.getItem('alcoholimetro_usuario');
    if (saved) lecturasGuardadas = JSON.parse(saved);
    if (savedUser) { currentUser = savedUser; elements.currentUser.textContent = currentUser; }
}

function clearLocalData() { if (confirm('¿Está seguro de que desea eliminar todos los datos locales?')) { lecturasGuardadas = []; localStorage.removeItem('alcoholimetro_lecturas'); updateReadingsDisplay(); showNotification('Datos locales eliminados', 'success'); } }

function showNotification(mensaje, tipo = 'success') { const notification = document.getElementById('notification'); const message = document.getElementById('notificationMessage'); if (!notification || !message) return; message.textContent = mensaje; notification.className = `notification ${tipo}`; setTimeout(()=>notification.classList.remove('hidden'),100); setTimeout(()=>notification.classList.add('hidden'),3000); }

// expose some functions to inline HTML buttons
window.setUserIdentification = setUserIdentification;
window.saveManualReading = saveManualReading;
window.loadReadings = loadReadings;
window.exportToCSV = exportToCSV;
window.clearLocalData = clearLocalData;
window.applyFilters = applyFilters;

// initial UI update
function updateDisplay() { updateButtonState(); updateReadingsDisplay(); }

// Cargar registros
async function loadReadings() {
    try {
        elements.loadingMessage.style.display = 'block';
        elements.noDataMessage.style.display = 'none';
        
        // En una implementación real, aquí cargaríamos desde el ESP32
        // Por ahora usamos datos locales
        updateReadingsDisplay();
        
        showNotification('Registros actualizados', 'success');
        
    } catch (error) {
        console.error('Error cargando registros:', error);
        showNotification('Error al cargar registros', 'error');
    } finally {
        elements.loadingMessage.style.display = 'none';
    }
}

// Aplicar filtros
function applyFilters() {
    const filterUser = document.getElementById('filterUser').value.toLowerCase();
    const filterDate = document.getElementById('filterDate').value;
    const filterMin = parseFloat(document.getElementById('filterMin').value);
    const filterMax = parseFloat(document.getElementById('filterMax').value);
    
    let filteredReadings = lecturasGuardadas;
    
    if (filterUser) {
        filteredReadings = filteredReadings.filter(r => 
            r.user.toLowerCase().includes(filterUser)
        );
    }
    
    if (filterDate) {
        filteredReadings = filteredReadings.filter(r => 
            r.timestamp.startsWith(filterDate)
        );
    }
    
    if (!isNaN(filterMin)) {
        filteredReadings = filteredReadings.filter(r => r.alcohol_mg_l >= filterMin);
    }
    
    if (!isNaN(filterMax)) {
        filteredReadings = filteredReadings.filter(r => r.alcohol_mg_l <= filterMax);
    }
    
    displayFilteredReadings(filteredReadings);
}

// Exportar a CSV
function exportToCSV() {
    if (lecturasGuardadas.length === 0) {
        showNotification('No hay datos para exportar', 'warning');
        return;
    }
    
    const headers = ['Fecha', 'Hora', 'Usuario', 'Alcohol (mg/L)', 'Alcohol (%)', 'Observaciones'];
    const csvData = lecturasGuardadas.map(lectura => {
        const fecha = new Date(lectura.timestamp);
        return [
            fecha.toLocaleDateString(),
            fecha.toLocaleTimeString(),
            lectura.user,
            lectura.alcohol_mg_l.toFixed(2),
            lectura.alcohol_porcentaje.toFixed(1),
            `"${lectura.observaciones || ''}"`
        ];
    });
    
    const csvContent = [headers, ...csvData]
        .map(row => row.join(','))
        .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alcoholimetro_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Datos exportados a CSV', 'success');
}

// Actualizar interfaz
function updateButtonState() {
    elements.toggleBtn.textContent = registroActivo ? 
        "Detener Registro Automático" : "Iniciar Registro Automático";
    elements.toggleBtn.className = registroActivo ? 'btn-primary' : 'btn-secondary';
    elements.registroStatus.textContent = registroActivo ? 'ACTIVO' : 'DETENIDO';
    elements.registroStatus.className = registroActivo ? 'status-on' : 'status-off';
}

function updateReadingsDisplay() {
    if (lecturasGuardadas.length === 0) {
        elements.readingsContainer.innerHTML = '';
        elements.noDataMessage.style.display = 'block';
        return;
    }
    
    elements.noDataMessage.style.display = 'none';
    displayFilteredReadings(lecturasGuardadas);
}

function displayFilteredReadings(readings) {
    elements.readingsContainer.innerHTML = readings.map(lectura => `
        <div class="reading-item">
            <div class="reading-header">
                <span class="reading-user">${lectura.user}</span>
                <span class="reading-time">${new Date(lectura.timestamp).toLocaleString()}</span>
            </div>
            <div class="reading-value">${lectura.alcohol_mg_l.toFixed(2)} mg/L</div>
            ${lectura.observaciones ? `<div class="reading-obs">${lectura.observaciones}</div>` : ''}
        </div>
    `).join('');
}

// Local Storage
function saveToLocalStorage() {
    localStorage.setItem('alcoholimetro_lecturas', JSON.stringify(lecturasGuardadas));
    localStorage.setItem('alcoholimetro_usuario', currentUser);
}

function loadFromLocalStorage() {
    const savedLecturas = localStorage.getItem('alcoholimetro_lecturas');
    const savedUsuario = localStorage.getItem('alcoholimetro_usuario');
    
    if (savedLecturas) {
        lecturasGuardadas = JSON.parse(savedLecturas);
    }
    
    if (savedUsuario) {
        currentUser = savedUsuario;
        elements.currentUser.textContent = currentUser;
    }
    
    updateReadingsDisplay();
}

function clearLocalData() {
    if (confirm('¿Está seguro de que desea eliminar todos los datos locales?')) {
        lecturasGuardadas = [];
        localStorage.removeItem('alcoholimetro_lecturas');
        updateReadingsDisplay();
        showNotification('Datos locales eliminados', 'success');
    }
}

// Notificaciones
function showNotification(mensaje, tipo = 'success') {
    const notification = document.getElementById('notification');
    const message = document.getElementById('notificationMessage');
    
    message.textContent = mensaje;
    notification.className = `notification ${tipo}`;
    
    // Mostrar
    setTimeout(() => {
        notification.classList.remove('hidden');
    }, 100);
    
    // Ocultar después de 3 segundos
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

// Actualizar display completo
function updateDisplay() {
    updateButtonState();
    updateReadingsDisplay();
}

// Añadir conexión SSE para recibir actualizaciones en tiempo real desde el servidor
const evtSource = new EventSource('/events');

evtSource.addEventListener('open', () => {
  console.log('SSE conectado');
});

evtSource.addEventListener('error', (e) => {
  console.warn('SSE error', e);
});

// evento inicial con estado
evtSource.addEventListener('message', (e) => {
  // mensaje por defecto (cuando se usa data: ...)
  try {
    const payload = JSON.parse(e.data);
    if (payload && payload.latest) {
      elements.alcoholPercent.textContent = (payload.latest.alcohol || 0).toFixed(1);
      registroActivo = !!payload.latest.activo;
      updateButtonState();
    }
  } catch (err) { console.warn('SSE message parse error', err); }
});

// evento específico cuando llega una nueva lectura guardada
evtSource.addEventListener('new-reading', (e) => {
  try {
    const entry = JSON.parse(e.data);
    lecturasGuardadas.unshift(entry);
    saveToLocalStorage();
    updateReadingsDisplay();
    showNotification('Nueva lectura recibida', 'success');
  } catch (err) { console.warn('SSE new-reading parse error', err); }
});

// evento para actualizaciones de solo valor (no guardado)
evtSource.addEventListener('update', (e) => {
  try {
    const payload = JSON.parse(e.data);
    elements.alcoholPercent.textContent = (payload.alcohol || 0).toFixed(1);
    registroActivo = !!payload.activo;
    updateButtonState();
  } catch (err) { console.warn('SSE update parse error', err); }
});

// evento toggle
evtSource.addEventListener('toggle', (e) => {
  try {
    const payload = JSON.parse(e.data);
    registroActivo = !!payload.activo;
    updateButtonState();
  } catch (err) { console.warn('SSE toggle parse error', err); }
});

// Nota: el resto del script existente sigue funcionando (fetch /data, /readings, etc.)