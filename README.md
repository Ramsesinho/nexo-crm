# Nexo CRM

CRM multi empresa en espanol, pensado para venderse a PyMEs. Sirve a la vez como
pieza de portafolio (demostracion publica que cualquiera puede tocar) y como
producto real con cuentas, login y base de datos.

**Estado:** aplicacion completa en modo demostracion, funcionando y verificada en
navegador. La API y el esquema de base de datos estan escritos y listos para
desplegar. Falta ejecutar el despliegue en Cloudflare, que se hace una sola vez.

---

## Que incluye

| Modulo | Que hace |
|---|---|
| Panel | Valor en negociacion, proyeccion ponderada, ganado del mes, efectividad de cierre, seguimientos vencidos, actividad reciente |
| Embudo | Tablero kanban. Las oportunidades se arrastran entre etapas y el total de cada columna se recalcula |
| Contactos | Listado con busqueda, ficha lateral con historial completo, oportunidades y tareas asociadas |
| Empresas | Agrupacion de contactos por cuenta |
| Tareas | Seguimientos con fecha, prioridad y responsable. Lo vencido sube al tope y se marca en rojo |

Ademas: modo claro y oscuro, funciona en celular, atajos de teclado en el embudo
(flechas izquierda y derecha mueven la tarjeta enfocada) y estados de carga,
vacio y error en todas las vistas.

---

## Los dos modos

La aplicacion tiene una sola interfaz y dos motores de datos intercambiables.

**Modo demostracion (el que corre ahora).** Todo vive en el navegador del
visitante usando `localStorage`. No hay cuenta, no hay servidor, no hay nada que
pagar. Es lo que se le muestra a un prospecto.

**Modo producto.** Se activa definiendo `window.NEXO_API` antes de cargar la app:

```html
<script>window.NEXO_API = 'https://api.tudominio.com';</script>
```

A partir de ahi la misma interfaz habla con el Worker de Cloudflare y cada
empresa entra con su usuario y contrasena.

---

## Estructura

```
nexo-crm/
├── db/schema.sql          Esquema multi empresa para Cloudflare D1
├── worker/index.js        API completa: auth, contactos, empresas, embudo, tareas, metricas
├── wrangler.toml          Configuracion de despliegue
├── public/
│   ├── index.html         Pagina de venta
│   ├── app.html           La aplicacion
│   ├── css/tokens.css     UNICO archivo a tocar para cambiar de marca
│   ├── css/app.css        Interfaz de producto
│   ├── css/site.css       Pagina de venta
│   └── js/
│       ├── seed.js        Datos ficticios de la demostracion
│       ├── store.js       Capa de datos con los dos motores
│       ├── ui.js          Formato, plantillas seguras, avisos
│       └── app.js         Enrutador y vistas
├── vercel.json            Despliegue estatico y cabeceras de seguridad
├── SECURITY.md            Que esta protegido y como. Sirve tambien en reuniones
└── docs/
    ├── PUBLICAR.md        Vercel y GitHub, empieza por aqui
    ├── DESPLIEGUE.md      La API en Cloudflare, cuando haya clientes reales
    └── VENDER.md          Como revenderlo con otra marca
```

---

## Publicarlo

Para mostrarlo en una reunion basta con Vercel. La demostracion no necesita
servidor ni base de datos.

```bash
cd C:/Users/soliz/Desktop/nexo-crm && npx vercel login
```

```bash
cd C:/Users/soliz/Desktop/nexo-crm && npx vercel --prod --yes
```

Pasos completos, GitHub incluido, en `docs/PUBLICAR.md`.

---

## Como verlo en tu computadora

No hay que instalar dependencias ni compilar nada. Solo hace falta servir la
carpeta `public` por HTTP, porque el navegador bloquea los modulos de JavaScript
cuando se abre el archivo directamente.

```bash
cd C:/Users/soliz/Desktop/nexo-crm
python -m http.server 4321 --directory public
```

Luego abre `http://localhost:4321`.

---

## Decisiones tecnicas que importan

**El dinero se guarda en centavos, como numero entero.** Nunca con decimales.
Un CRM que redondea mal los montos pierde la confianza del cliente el primer dia.

**El identificador de empresa nunca viaja desde el navegador.** Se deriva de la
sesion en el servidor. Es la unica forma de garantizar que un cliente no pueda
ver los datos de otro, aunque manipule la peticion.

**Las contrasenas usan PBKDF2 con 210 mil iteraciones.** La comparacion es de
tiempo constante y el mensaje de error es el mismo exista o no el usuario, para
no revelar que correos estan registrados.

**Las IP se guardan hasheadas.** Nunca la IP cruda.

**CORS restringido al dominio de produccion.** Nunca abierto.

**Sin paso de compilacion.** HTML, CSS y JavaScript nativo. Se sube por FTP a
Hostinger y funciona. Cero mantenimiento de dependencias, cero versiones de Node
que se rompen a los seis meses.
