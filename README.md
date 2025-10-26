# Proyecto desarrollado por los estudiantes del 8vo. Ciclo de ingenieria en sistemas, de la Universidad UMG de Guatemala, >>Alcoholímetro con registro digital<<

El presente proyecto consiste en el desarrollo de un sistema completo de alcoholímetro digital basado y implemetado con la plataforma de PlatformIO,
el sistema combina hardware, firmware y software web para ofrecer una solución integral de medición, registro y visualización de niveles de alcohol en el aliento.

La implementación y armado del circuito incluye un SP32(Cerebro de todo), sensor de gas, una pantalla OLED, un buzzer y unos  LED'S, integrados con una API desarrollada en Node.js que almacena los registros en
una base de datos SQLite y los muestra mediante una interfaz web moderna.


## Plataformas y componentes electronicos: 

### Plataforma:
- PlatformIO, extension en VsCode.
- El firmware fue desarrollado en PlatformIO utilizando el framework Arduino, El archivo de configuración `platformio.ini` especifica las dependencias necesarias, como las
librerías de Adafruit SSD1306, GFX y ArduinoJson.
El código principal `main.ino` es el que se carga al SP32 para que realize la lectura analógica del sensor MQ-3, muestra los valores en la pantalla OLED, encienda y apague LEDS ademas de enviar mediante HTTP los datos al servidor.

### Componentes:
- ESP32 Microcontrolador con Wi-Fi y Bluetooth (Unidad principal de procesamiento).
- Sensor MQ-3, Sensor de gas sensible al alcohol Detecta la concentración de alcohol en el aire.
- OLED SSD1306, Pantalla de 0.96 I2C Muestra las lecturas de alcohol.
- Buzzer pasivo, Dispositivo sonoro Emite alerta cuando se supera el límite permitido.
- LED RGB, Diodo tricolor Indica visualmente el nivel de alcohol.
- Resistencias (220 Ω), Protección de pines Limitan corriente a LED y buzzer.
