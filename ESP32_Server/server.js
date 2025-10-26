const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

const DB_PATH = path.join(__dirname, 'registros.db');
const TXT_LOG = path.join(__dirname, 'registros_alcohol.txt');

// Inicializar DB
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Error al abrir la base de datos:', err.message);
  else {
    db.run(`
      CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        alcohol REAL,
        alcohol_mg_l REAL,
        user TEXT,
        observaciones TEXT,
        sensor_value INTEGER
      )
    `);
  }
});

// Estado y clientes SSE
let latest = { alcohol: 0, activo: false, timestamp: new Date().toISOString() };
const sseClients = [];

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// SSE endpoint
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'init', latest })}\n\n`);
  sseClients.push(res);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(c => c.write(msg));
}

// Guardar lectura
app.post('/guardar', (req, res) => {
  const data = req.body || {};
  const timestamp = data.timestamp || new Date().toISOString();
  const alcohol = typeof data.alcohol === 'number' ? data.alcohol : (data.alcohol_mg_l || 0);
  const alcohol_mg_l = data.alcohol_mg_l || null;
  const user = data.user || data.identificacion || 'USUARIO_01';
  const observaciones = data.observaciones || '';
  const sensor_value = data.sensor_value || null;

  db.run(
    `INSERT INTO readings (timestamp, alcohol, alcohol_mg_l, user, observaciones, sensor_value)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [timestamp, alcohol, alcohol_mg_l, user, observaciones, sensor_value],
    function (err) {
      if (err) {
        console.error('Error al guardar lectura:', err.message);
        return res.status(500).json({ error: err.message });
      }

      const entry = {
        id: this.lastID,
        timestamp,
        alcohol,
        alcohol_mg_l,
        user,
        observaciones,
        sensor_value
      };

      latest = { alcohol, activo: latest.activo, timestamp };
      fs.appendFileSync(TXT_LOG, JSON.stringify(entry) + '\n');
      broadcast('new-reading', entry);

      res.json({ message: 'Registro guardado', entry });
    }
  );
});

// Obtener lecturas
app.get('/readings', (req, res) => {
  db.all('SELECT * FROM readings ORDER BY id DESC LIMIT 1000', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Último estado
app.get('/data', (req, res) => {
  res.json(latest);
});

// Push de ESP32
app.post('/push', (req, res) => {
  const data = req.body || {};
  const timestamp = data.timestamp || new Date().toISOString();
  const alcohol = typeof data.alcohol === 'number' ? data.alcohol : 0;
  latest = { alcohol, activo: !!data.activo, timestamp };

  if (data.save) {
    db.run(
      `INSERT INTO readings (timestamp, alcohol, alcohol_mg_l, user, observaciones, sensor_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [timestamp, alcohol, data.alcohol_mg_l || null, data.user || 'ESP32', data.observaciones || '', data.sensor_value || null],
      function (err) {
        if (err) console.error('Error al guardar lectura desde ESP32:', err.message);
        else {
          const entry = {
            id: this.lastID,
            timestamp,
            alcohol,
            alcohol_mg_l: data.alcohol_mg_l || null,
            user: data.user || 'ESP32',
            observaciones: data.observaciones || '',
            sensor_value: data.sensor_value || null
          };
          fs.appendFileSync(TXT_LOG, JSON.stringify(entry) + '\n');
          broadcast('new-reading', entry);
        }
      }
    );
  } else {
    broadcast('update', latest);
  }

  res.json({ ok: true, latest });
});

// Toggle de estado
app.post('/toggle', (req, res) => {
  latest.activo = !latest.activo;
  broadcast('toggle', { activo: latest.activo });
  res.json({ activo: latest.activo });
});

// Iniciar server
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});