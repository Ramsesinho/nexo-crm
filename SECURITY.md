# Seguridad de Nexo CRM

Este documento sirve para dos cosas. Para ti, como registro de que esta protegido
y donde se toca. Y para el cliente que en la reunion pregunta si sus datos estan
seguros, porque esa pregunta siempre sale y conviene tener la respuesta escrita.

---

## Resumen en una frase

La demostracion publica no guarda nada de nadie, y el producto real aisla cada
empresa en el servidor, cifra las contrasenas de forma irreversible y registra
quien hizo cada cambio.

---

## Lo que aplica hoy en la demostracion publica

La demostracion **no tiene servidor ni base de datos**. Todo vive en el navegador
del visitante. No hay formulario de registro, no se pide correo y no se guarda
nada en ningun lado. Es la superficie de ataque mas pequena posible: no hay datos
que robar porque no hay datos.

Aun asi, la pagina va protegida con estas medidas.

**Politica de contenido estricta.** El navegador solo puede ejecutar scripts que
vengan del propio sitio. Los scripts en linea estan prohibidos por completo, que
es la defensa mas efectiva contra inyeccion de codigo. Por eso no hay ni un solo
`<script>` con codigo dentro del HTML ni atributos `onclick`. La politica esta
declarada dos veces a proposito: como cabecera en `vercel.json` y como etiqueta
`<meta>` en cada pagina. La cabecera es la que manda, pero la etiqueta sigue
protegiendo si el sitio se sube por FTP a un hosting que no permite cabeceras.

**Todo lo que se muestra en pantalla va escapado.** Cualquier dato que entre a la
interfaz pasa por la funcion `esc()` de `public/js/ui.js` antes de tocar el HTML.
Si alguien guarda un contacto llamado `<script>...`, se ve como texto, no se
ejecuta.

**Cabeceras de seguridad completas**, definidas en `vercel.json`:

| Cabecera | Que impide |
|---|---|
| `Content-Security-Policy` | Ejecutar scripts ajenos o inyectados |
| `Strict-Transport-Security` | Que alguien fuerce la conexion a HTTP sin cifrar |
| `X-Content-Type-Options` | Que el navegador adivine mal el tipo de archivo |
| `X-Frame-Options` y `frame-ancestors` | Que otro sitio te meta en un iframe para enganar al usuario |
| `Referrer-Policy` | Filtrar a donde navega el usuario hacia sitios externos |
| `Permissions-Policy` | Acceso a camara, microfono, ubicacion y pagos |

**Sin rastreadores ni analitica de terceros.** No hay pixel de Meta, no hay Google
Analytics, no hay cookies. Nada que declarar en un aviso de privacidad.

---

## Lo que aplica en el producto real

Todo esto ya esta escrito en `worker/index.js` y `db/schema.sql`. Entra en vigor
en cuanto se despliegue la API.

**Aislamiento entre empresas.** Es lo mas importante de un sistema multi empresa
y donde fallan la mayoria. El identificador de la empresa **nunca viaja desde el
navegador**: se deriva de la sesion en el servidor, en un solo lugar del codigo
(`requireAuth`). Toda consulta a la base lleva `WHERE org_id = ?`. Aunque un
cliente manipule la peticion a mano, no puede alcanzar datos de otro.

**Contrasenas irreversibles.** PBKDF2 con SHA-256 y 210 mil iteraciones, con sal
distinta por usuario. No se guardan ni se pueden recuperar, solo reemplazar. La
comparacion es de tiempo constante para que el tiempo de respuesta no revele
nada.

**No se filtra que correos existen.** El login responde lo mismo y tarda lo mismo
exista o no el usuario. Eso evita que alguien use el formulario para averiguar
quienes son tus clientes.

**Limite de intentos.** Diez intentos de login cada quince minutos por direccion,
y cinco registros por hora. Se lleva en Cloudflare KV.

**Las IP se guardan hasheadas.** Nunca la IP cruda, ni en las sesiones ni en la
auditoria.

**Sesiones que caducan.** Catorce dias. En la base solo se guarda el hash del
token, nunca el token. La cookie es `HttpOnly`, `Secure` y `SameSite=Lax`, asi
que JavaScript no puede leerla y no viaja en peticiones de otros sitios.

**CORS cerrado.** Solo responde al dominio de produccion declarado en
`ALLOWED_ORIGIN`. Nunca un asterisco.

**Registro de auditoria.** Cada creacion, cambio y borrado queda en `audit_log`
con autor, accion, objeto y hora.

**Validacion en el servidor.** Largos maximos, listas cerradas de valores
permitidos y consultas parametrizadas en todo. No hay una sola consulta armada
pegando texto, que es como se produce una inyeccion SQL.

---

## Al conectar la API real, no olvides esto

La politica de contenido bloquea por defecto las peticiones a cualquier dominio
que no sea el propio. En cuanto pongas el Worker en linea hay que permitirlo en
**dos lugares** o la aplicacion no cargara datos:

1. `vercel.json`, en la linea de `Content-Security-Policy`
2. La etiqueta `<meta>` de `public/app.html`

En ambos, cambia `connect-src 'self'` por:

```
connect-src 'self' https://nexo-crm-api.TU-CUENTA.workers.dev;
```

Si se te olvida, el sintoma es claro: la aplicacion carga pero no trae nada y la
consola del navegador muestra un error de Content Security Policy.

---

## Reglas que no se rompen

**Ningun secreto entra al repositorio.** Las claves de la API van con
`wrangler secret put`, nunca en un archivo. El `.gitignore` ya bloquea `.env`,
`.dev.vars`, `*.key` y `*.pem`.

**Ningun secreto se pega en un chat.** Si pasa por accidente, esa clave se
considera comprometida y se revoca de inmediato, sin excepcion.

**`ALLOWED_ORIGIN` nunca lleva asterisco.** Eso abriria la API a cualquier sitio
de internet.

---

## Si un cliente pregunta en la reunion

> **¿Mis datos los puede ver otro cliente tuyo?**
> No. Cada empresa esta en su propio espacio y el sistema filtra por empresa en
> el servidor, no en el navegador. No depende de que el programa se comporte
> bien, depende de como esta hecha la consulta.

> **¿Tu puedes ver mis contrasenas?**
> No. Se guardan cifradas de forma irreversible. Si alguien la olvida, se
> reemplaza, no se recupera.

> **¿Y si me quiero ir?**
> Te llevas todo en un archivo que abres en Excel. La cuenta se suspende, no se
> borra, y nada se elimina sin que lo pidas por escrito.

> **¿Donde estan los datos?**
> En la red de Cloudflare, con respaldo diario. La misma infraestructura que usan
> bancos y medios grandes.
