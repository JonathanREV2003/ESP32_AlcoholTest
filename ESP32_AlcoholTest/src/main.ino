#include <WiFi.h>
#include <WebServer.h>
#include <SPIFFS.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>

// --- Configuración OLED ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C  
#define OLED_SDA 21
#define OLED_SCL 22
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- Pines ---
const int sensorPin = 34; // Pin analógico para el sensor de alcohol
const int buzzer = 32;
const int ledVerde = 27;
const int ledAzul = 26;
const int ledAmarillo = 25;

// --- WiFi ---
const char* ssid = "<nombre_wifi>";       // OJITO CON ESTO HAY QUE PONERLE LA CLAVE WIFI Y NOMBRE LOCAL  (ZONA WIFI DEL PC)
const char* password = "<clave_wifi>";

// --- Servidor web ---
WebServer server(80);

// --- Variables ---
bool registroActivo = false;
unsigned long ultimaLectura = 0;
const unsigned long intervaloLectura = 2000;

// --- Prototipos ---
void manejarIndicadores(float alcohol);
void handleRoot();
void handleData();
void handleToggle();
void enviarAlServidor(float alcohol);

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println("\n--- Iniciando sistema ---");

  // --- Inicializar I2C manualmente ---
  Wire.begin(OLED_SDA, OLED_SCL);
  delay(100);

  // --- Inicializar pantalla OLED ---
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println(F(" Error: pantalla OLED no detectada (verifica dirección I2C o conexiones SDA/SCL)"));
    for (;;); 
  }

  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Iniciando...");
  display.display();
  delay(1500);

  // --- Configurar pines ---
  pinMode(buzzer, OUTPUT);
  pinMode(ledVerde, OUTPUT);
  pinMode(ledAzul, OUTPUT);
  pinMode(ledAmarillo, OUTPUT);
  digitalWrite(buzzer, LOW);
  digitalWrite(ledVerde, LOW);
  digitalWrite(ledAzul, LOW);
  digitalWrite(ledAmarillo, LOW);

  // --- Conexión WiFi ---
  Serial.printf("Conectando a WiFi: %s\n", ssid);
  WiFi.begin(ssid, password);
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20) {
    delay(500);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Conectado a WiFi!");
    Serial.print("IP local: ");
    Serial.println(WiFi.localIP());

    display.clearDisplay();
    display.setCursor(0, 0);
    display.setTextSize(1);
    display.println("WiFi conectado!");
    display.print("IP: ");
    display.println(WiFi.localIP());
    display.display();
  } else {
    Serial.println("\n No se pudo conectar al WiFi.");
    display.clearDisplay();
    display.setCursor(0, 0);
    display.setTextSize(1);
    display.println("WiFi fallo!");
    display.display();
  }

  // --- Montar SPIFFS ---
  if (!SPIFFS.begin(true)) {
    Serial.println(" Error montando SPIFFS");
  } else {
    Serial.println(" SPIFFS montado correctamente");
  }

  // --- Configurar rutas del servidor ---
  server.on("/", handleRoot);
  server.on("/data", handleData);
  server.on("/toggle", handleToggle);
  server.serveStatic("/static", SPIFFS, "/");

  server.begin();
  Serial.println(" Servidor web iniciado!");
}

void loop() {
  server.handleClient();

  int valor = analogRead(sensorPin);
  float alcohol = map(valor, 0, 4095, 0, 100);

  // --- Mostrar en OLED ---
  display.clearDisplay();
  display.setTextSize(4);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print(alcohol, 1);
  display.println("%");
  display.display();

  // --- LEDs y buzzer ---
  manejarIndicadores(alcohol);

  // --- Registro periódico ---
  if (registroActivo && millis() - ultimaLectura > intervaloLectura) {
    ultimaLectura = millis();
    Serial.printf("Registro: %.1f %% alcohol\n", alcohol);
    enviarAlServidor(alcohol);
  }

  delay(500);
}

// --- manejo de niveles de alcohol pre establesidos (humbral de 20 y 24)---
void manejarIndicadores(float alcohol) {
  if (alcohol < 20) {
    digitalWrite(ledVerde, HIGH);
    digitalWrite(ledAzul, LOW);
    digitalWrite(ledAmarillo, LOW);
    noTone(buzzer);
  } 
  else if (alcohol >= 20 && alcohol <= 24) {
    digitalWrite(ledVerde, LOW);
    digitalWrite(ledAzul, HIGH);
    digitalWrite(ledAmarillo, LOW);
    noTone(buzzer);
  } 
  else {
    digitalWrite(ledVerde, LOW);
    digitalWrite(ledAzul, LOW);
    digitalWrite(ledAmarillo, HIGH);
    tone(buzzer, 1000, 500);
  }
}

// --- Rutas del servidor ---
void handleRoot() {
  if (!SPIFFS.exists("/index.html")) {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(404, "text/plain", "Archivo index.html no encontrado");
    return;
  }
  File file = SPIFFS.open("/index.html", "r");
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.streamFile(file, "text/html");
  file.close();
}

void handleData() {
  float alcohol = map(analogRead(sensorPin), 0, 4095, 0, 100);
  StaticJsonDocument<128> doc;
  doc["alcohol"] = alcohol;
  doc["activo"] = registroActivo;
  String json;
  serializeJson(doc, json);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

void handleToggle() {
  registroActivo = !registroActivo;
  StaticJsonDocument<64> doc;
  doc["activo"] = registroActivo;
  String json;
  serializeJson(doc, json);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

void enviarAlServidor(float alcohol) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin("http://<PC_IP>:3000/push"); // reemplaza <PC_IP> por la IP del PC que corre el server
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<128> doc;
  doc["alcohol"] = alcohol;
  doc["activo"] = registroActivo;
  doc["timestamp"] = String(millis());
  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  if (code > 0) {
    String payload = http.getString();
    Serial.printf("POST /push -> %d %s\n", code, payload.c_str());
  } else {
    Serial.printf("POST fallo: %d\n", code);
  }
  http.end();
}