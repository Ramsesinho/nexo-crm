# Poner Nexo CRM en linea

Dos partes separadas. La pagina y la aplicacion son archivos estaticos y van a
Hostinger. La API y la base de datos van a Cloudflare. Se pueden hacer en
cualquier orden, pero conviene empezar por Cloudflare porque la aplicacion
necesita saber la direccion de la API.

Tiempo estimado la primera vez: entre 30 y 45 minutos.

---

## Parte 1. La API y la base de datos (Cloudflare)

### 1.1 Entrar a Cloudflare desde la terminal

```bash
npx wrangler login
```

Se abre el navegador y pide autorizar. Acepta y vuelve a la terminal.

### 1.2 Crear la base de datos

```bash
npx wrangler d1 create nexo-crm
```

El comando imprime un bloque que termina con una linea `database_id = "..."`.
Copia ese identificador y pegalo en `wrangler.toml`, reemplazando el texto
`PEGAR_AQUI_EL_ID_QUE_DEVUELVE_WRANGLER`.

### 1.3 Crear el almacen para el limite de intentos de login

```bash
npx wrangler kv namespace create RATE
```

Devuelve otro `id`. Pegalo en `wrangler.toml` donde dice
`PEGAR_AQUI_EL_ID_DEL_KV`.

### 1.4 Cargar las tablas

```bash
npx wrangler d1 execute nexo-crm --remote --file=db/schema.sql
```

Si pregunta si confirmas, responde que si. Esto crea todas las tablas de una vez.
Es seguro repetirlo: el esquema usa `CREATE TABLE IF NOT EXISTS`.

### 1.5 Poner tu dominio en la configuracion

Abre `wrangler.toml` y cambia la linea de `ALLOWED_ORIGIN` por el dominio real
donde va a vivir la aplicacion. Sin barra al final.

```toml
ALLOWED_ORIGIN = "https://crm.tudominio.com"
```

Si vas a tener varios clientes en dominios distintos, separalos con coma y sin
espacios. **Nunca pongas un asterisco ahi.** Eso abriria la API a cualquier sitio
de internet.

### 1.6 Publicar

```bash
npx wrangler deploy
```

Al terminar imprime la direccion de tu API, algo como
`https://nexo-crm-api.TU-CUENTA.workers.dev`. Guardala, la necesitas en la
Parte 2.

### 1.7 Comprobar que responde

```bash
curl -i https://nexo-crm-api.TU-CUENTA.workers.dev/api/me
```

Debe responder `401` con un mensaje de sesion no valida. Eso significa que esta
viva y que protege bien las rutas privadas.

---

## Parte 2. La pagina y la aplicacion (Hostinger)

### 2.1 Conectar la aplicacion con la API

Abre `public/app.html` y agrega esta linea justo antes del script del modulo,
con la direccion que te dio el paso 1.6:

```html
<script>window.NEXO_API = 'https://nexo-crm-api.TU-CUENTA.workers.dev';</script>
<script type="module" src="js/app.js"></script>
```

Sin esa linea la aplicacion sigue en modo demostracion, que es exactamente lo que
quieres para la pagina publica. Por eso conviene mantener dos copias: una
demostracion sin la linea y la aplicacion real con ella.

### 2.2 Subir los archivos

Sube **todo el contenido de la carpeta `public`** a la raiz del sitio en
Hostinger, normalmente `public_html`. No subas la carpeta `public` en si, sino lo
que hay adentro.

Si prefieres hacerlo desde Claude Code, la skill `conectar-hostinger-v3` publica
la carpeta sin que toques un cliente FTP.

### 2.3 Crear la primera cuenta real

Con la API ya publicada, la primera empresa se crea con una peticion. Cambia los
datos y ejecuta:

```bash
curl -X POST https://nexo-crm-api.TU-CUENTA.workers.dev/api/auth/signup -H "Content-Type: application/json" -d "{\"orgName\":\"Nombre de la empresa\",\"name\":\"Tu nombre\",\"email\":\"correo@empresa.com\",\"password\":\"una-clave-larga-de-verdad\"}"
```

Eso crea la empresa, el usuario dueno y el embudo con sus seis etapas por
defecto. La contrasena debe tener al menos 10 caracteres.

**No pegues esa contrasena en un chat.** Escribela directo en la terminal.

---

## Revisar que todo quedo bien

- [ ] `https://tudominio.com` abre la pagina de venta
- [ ] El boton "Abrir la demostracion" lleva a la aplicacion con datos ficticios
- [ ] El embudo deja arrastrar tarjetas y los totales de columna cambian
- [ ] La aplicacion real pide correo y contrasena
- [ ] Al entrar con la cuenta creada, el panel aparece vacio y correcto
- [ ] En `wrangler.toml`, `ALLOWED_ORIGIN` tiene tu dominio y no un asterisco

---

## Problemas comunes

**La aplicacion carga pero no trae datos y la consola muestra un error de CORS.**
El dominio desde el que abres no coincide con `ALLOWED_ORIGIN`. Revisa que este
escrito igual, con `https` y sin barra al final, y vuelve a ejecutar
`npx wrangler deploy`.

**El login responde 429.** Es el limite de intentos. Son 10 cada 15 minutos por
direccion. Espera o prueba desde otra red.

**Los modulos de JavaScript no cargan al abrir el archivo directo.** Es normal.
El navegador los bloquea en `file://`. Hay que servir por HTTP, que es lo que
hace Hostinger.

**Quiero borrar todo y empezar de nuevo en la base de datos.**

```bash
npx wrangler d1 execute nexo-crm --remote --command="DROP TABLE IF EXISTS audit_log, taggings, tags, activities, tasks, deals, stages, pipelines, contacts, companies, sessions, users, orgs"
```

Y despues repite el paso 1.4.
