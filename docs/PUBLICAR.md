# Publicar en Vercel y guardar en GitHub

> **ESTADO AL 2026-09-12.** En linea: **https://nexocrm-demo.vercel.app**
>
> **Problema abierto en Vercel.** El primer despliegue de un proyecto compila bien.
> Todos los siguientes quedan en estado `UNKNOWN` y nunca pasan a `Ready`, asi que
> el alias publico se queda servindo la version anterior. Pasa igual si lo lanzas
> tu desde PowerShell o desde otra maquina, y pasa en proyectos distintos, asi que
> es de la cuenta y no del codigo.
>
> Por eso la direccion actual es `nexocrm-demo` y no `nexo-crm`: el proyecto
> original quedo trabado y hubo que crear uno nuevo, cuyo primer despliegue si
> compilo.
>
> **Como averiguar la causa:** abre el despliegue trabado en el panel de Vercel y
> lee el aviso que sale arriba. La consola no da razon alguna, solo `UNKNOWN`. Lo
> tipico es un limite de compilaciones del plan o una accion pendiente en la
> cuenta, por ejemplo confirmar el correo o agregar metodo de pago al equipo.
>
> **Mientras no se resuelva**, cada cambio necesita un proyecto nuevo para salir en
> linea, lo que va cambiando la direccion. No es sostenible: conviene resolverlo
> antes de repartir el enlace a clientes.



Para mostrar el CRM en una reunion **solo necesitas el paso 1**. La demostracion
no lleva servidor ni base de datos, asi que con Vercel ya queda una direccion
publica que abre en cualquier celular.

Los pasos 2 y 3 son respaldo y comodidad. Se pueden hacer despues.

---

## Paso 1. Ponerlo en linea (5 minutos)

El primer comando abre el navegador para que entres a tu cuenta de Vercel. Si no
tienes, se crea ahi mismo con tu correo o con GitHub.

```bash
npx vercel login
```

Cuando termine, publica:

```bash
npx vercel --prod --yes
```

Al final imprime la direccion, algo como `https://nexo-crm.vercel.app`. **Esa es
la que le mandas al cliente.**

No hace falta responder preguntas de configuracion. El archivo `vercel.json` ya
le dice a Vercel que sirva la carpeta `public` y que aplique las cabeceras de
seguridad.

### Comprobar que quedo bien

Abre la direccion en el celular y revisa:

- [ ] Carga la pagina con el titular y el panel en vivo al lado
- [ ] El boton "Abrir la demostracion" entra al CRM
- [ ] En Embudo se pueden arrastrar las tarjetas
- [ ] El candado del navegador aparece cerrado

---

## Paso 2. Guardarlo en GitHub

Sirve para tener respaldo, historial de cambios y algo que ensenar como
portafolio tecnico.

Primero crea el repositorio vacio en `https://github.com/new`. Ponle de nombre
`nexo-crm`. **No marques ninguna casilla** de README, licencia ni `.gitignore`,
porque el proyecto ya los trae.

Despues conecta y sube:

```powershell
cd C:\Users\soliz\Desktop\nexo-crm
git remote add origin https://github.com/Ramsesinho/nexo-crm.git
git push -u origin main
```

La primera vez abre una ventana para que autorices, no hay que escribir
contrasena.

### Publico o privado

**Publico desde el 2026-09-13**, como portafolio para reclutadores. El aviso de
derechos del README deja claro que poder verlo no da permiso de usarlo.

Revisado antes de abrirlo: 0 secretos en los 8 commits del historial,
`.claude/launch.json` sin rutas personales en ninguna version, y el correo y el
WhatsApp que aparecen son los de contacto, a proposito.

Ningun secreto esta en el repositorio. Las claves de la API van con
`wrangler secret put`, nunca en un archivo, y el `.gitignore` bloquea `.env`,
`.dev.vars`, `*.key` y `*.pem`.

---

## Paso 3. Que se publique solo con cada cambio

Una vez el codigo esta en GitHub, en el panel de Vercel entra al proyecto,
**Settings**, **Git**, y conecta el repositorio `nexo-crm`.

Desde ahi cada `git push` publica la version nueva sola. Ya no hay que correr
`npx vercel` a mano.

Para subir un cambio a partir de entonces:

```bash
git add -A && git commit -m "describe el cambio" && git push
```

---

## Antes de ensenarlo manana

Tres cosas de treinta segundos cada una.

1. **El correo del pie de pagina.** En `public/index.html` dice
   `hola@nexocrm.app`, que no existe. Cambialo por el tuyo o por tu WhatsApp.
2. **Los precios.** Los de la pagina son una propuesta. Si no estas listo para
   comprometerte con un numero, quita la seccion o pon "se cotiza".
3. **Prueba la demo en tu propio celular**, con datos moviles y no con el wifi de
   la casa. Es la condicion real de una reunion.

---

## La API real, cuando la necesites

Lo de arriba publica la demostracion. Para que un cliente tenga su cuenta con
login y datos guardados hace falta desplegar la API en Cloudflare, que esta en
`docs/DESPLIEGUE.md`.

No corre prisa. Puedes vender, cobrar la implementacion y desplegar despues, que
es el orden sano: primero el cliente, luego la infraestructura.

Cuando lo hagas, **acuerdate de permitir el dominio de la API en la politica de
contenido**, en `vercel.json` y en la etiqueta `<meta>` de `public/app.html`. Los
detalles estan en `SECURITY.md`.
