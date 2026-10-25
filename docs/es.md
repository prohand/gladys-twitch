# Twitch

Siga canales de Twitch en Gladys: sepa quién está en directo, en qué
categoría y ante cuántos espectadores, lance escenas cuando un directo empieza
o termina, y muestre los canales en un panel.

La integración solo lee datos **públicos**. No se vincula ninguna cuenta de
Twitch: usa las credenciales de una aplicación gratuita de Twitch que usted
crea una sola vez.

Requiere **Gladys 5.3.0 o posterior**.

## 1. Crear una aplicación de Twitch

1. Vaya a la [consola de desarrolladores de Twitch](https://dev.twitch.tv/console/apps/create)
   e inicie sesión con cualquier cuenta de Twitch (la autenticación en dos
   pasos debe estar activada).
2. Rellene el formulario:
   - **Nombre**: un nombre único, p. ej. `Gladys mi-casa`;
   - **OAuth Redirect URLs**: `http://localhost` (no se usa, pero es
     obligatoria);
   - **Categoría**: `Other`;
   - **Tipo de cliente**: `Confidencial`.
3. Haga clic en **Crear** y luego en **Administrar** en la nueva aplicación.
4. Copie el **Client ID**, haga clic en **Nuevo secreto** y copie el **Client
   Secret** (solo se muestra una vez).

## 2. Configurar la integración

1. Abra la pestaña **Configuración** de la integración en Gladys.
2. Pegue el **Client ID** y el **Client Secret**.
3. En **Canales**, indique los canales a seguir, separados por comas. Se
   aceptan nombres (`twitchdev`), `@nombres` y enlaces
   (`https://www.twitch.tv/twitchdev`), hasta 100 canales.
4. Cambie si lo desea el **Intervalo de actualización**: Twitch se consulta
   cada 60 segundos por defecto (de 30 segundos a una hora).
5. Guarde y haga clic en **Probar la conexión**: la respuesta indica cuántos
   canales se encontraron, cuántos están en directo y qué nombres no existen en
   Twitch.
6. Abra la pestaña **Descubrimiento** y añada los canales que desee como
   dispositivos.

## Qué obtiene

Un dispositivo por canal, llamado `Twitch <canal>`, con:

| Función  | Valor                                                   |
| -------- | ------------------------------------------------------- |
| Live     | 1 cuando el canal está en directo, 0 si no              |
| Viewers  | Número actual de espectadores                           |
| Uptime   | Minutos desde el inicio del directo                     |
| Title    | Título del directo (el último cuando está desconectado) |
| Category | Juego o categoría (la última cuando está desconectado)  |

El dispositivo está ligado al **identificador de usuario** de Twitch del
canal: un streamer que cambia el nombre de su canal conserva el mismo
dispositivo, su historial y sus escenas.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior).

Disparadores:

- **Directo de Twitch iniciado** — un canal seguido empieza un directo. Elija
  si quiere el canal y una categoría (nombre exacto, p. ej. `Just Chatting`).
  Variables: `{{triggerEvent.data.channel_name}}`, `title`, `game` y `url`.
- **Directo de Twitch terminado** — un canal seguido termina su directo.
  Variable: `duration_minutes`, la duración del directo.
- **Categoría de Twitch cambiada** — un canal en directo cambia de juego.
  Variables: `game`, `previous_game`, `title`.

Acciones:

- **Comprobar un canal de Twitch** — ¿está en directo un canal público
  cualquiera (seguido o no)? Devuelve `is_live`, `channel_name`,
  `viewer_count`, `title`, `game` y `uptime_minutes` para las acciones
  siguientes.
- **Actualizar canales de Twitch** — lee los canales seguidos ahora mismo, sin
  esperar la próxima actualización, y devuelve `live_count`.

También puede usar el disparador y la condición estándar **estado de un
dispositivo** sobre las funciones **Live** o **Viewers** («cuando haya más de
100 espectadores…»).

Ejemplo: _cuando empiece un directo en mi canal favorito, enviarme
«{{triggerEvent.data.channel_name}} está en directo:
{{triggerEvent.data.title}} {{triggerEvent.data.url}}»_.

## Panel

Añada el widget **Canales de Twitch** a un panel. Muestra cuántos canales
están en directo y luego una fila por canal: avatar, distintivo de directo,
categoría y espectadores. Toque una fila para ver el título del directo y un
enlace al canal. El botón **Actualizar** consulta Twitch al instante.

Ajustes del widget: elija los canales mostrados (todos si está vacío) y/o
muestre solo los que están en directo.

## Conviene saber

- Un directo solo se da por terminado cuando falta en dos respuestas de
  Twitch seguidas: Twitch a veces olvida un directo durante una petición, y
  las escenas anunciarían si no un final y un nuevo inicio un minuto después.
- Un canal añadido a la lista cuando ya está en directo no dispara
  **Directo de Twitch iniciado**: su directo no acaba de empezar.
- La integración guarda el último estado de cada canal en su volumen de
  datos: tras un reinicio, un directo ya en curso no se anuncia de nuevo, y
  uno empezado mientras tanto sí.

## Solución de problemas

- **«Twitch ha rechazado el Client ID o el Client Secret»**: cópielos de nuevo
  desde la consola de desarrolladores. Un secreto nuevo invalida el anterior.
- **Un canal «no se encuentra en Twitch»**: compruebe cómo se escribe en la
  dirección del canal.
- El distintivo del dispositivo indica **cloud** cuando Twitch responde e
  **inaccesible** si no. Consulte los registros de la integración desde la
  interfaz de Gladys para más detalles.
