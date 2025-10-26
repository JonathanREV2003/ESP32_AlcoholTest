let activo = false;

//  Cambia esta IP por la IP local que muestra tu ESP32 en la zona WiFi del pc
const ESP_IP = "http://192.168.137.67";  

async function obtenerDatos() {
  try {
    const res = await fetch(`${ESP_IP}/data`);
    if (!res.ok) {
      throw new Error(`Error en la respuesta: ${res.status}`);
    }

    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("La respuesta no es JSON");
    }

    const data = await res.json();
    document.getElementById('alcohol').innerText = data.alcohol.toFixed(1);
    activo = data.activo;
    actualizarBoton();
  } catch (error) {
    console.error('Error al obtener datos:', error);
    document.getElementById('alcohol').innerText = '--';
  }
}

async function toggleRegistro() {
  try {
    const res = await fetch(`${ESP_IP}/toggle`);
    if (!res.ok) {
      throw new Error(`Error en la respuesta: ${res.status}`);
    }

    const data = await res.json();
    activo = data.activo;
    actualizarBoton();
  } catch (error) {
    console.error('Error al cambiar el estado del registro:', error);
  }
}

function actualizarBoton() {
  const btn = document.getElementById('toggleBtn');
  btn.innerText = activo ? "Detener Registro" : "Iniciar Registro";
  btn.style.background = activo ? "#ff5252" : "#00c3ff";
}

document.getElementById('toggleBtn').addEventListener('click', toggleRegistro);
setInterval(obtenerDatos, 2000);