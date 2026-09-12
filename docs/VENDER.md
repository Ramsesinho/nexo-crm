# Vender Nexo CRM

El producto esta construido para ser generico a proposito. Nada en la interfaz
nombra un rubro. Eso permite venderlo tal cual a una clinica, a una constructora
o a un corredor de seguros sin tocar codigo.

---

## Cambiar la marca

Todo lo visual sale de un solo archivo: `public/css/tokens.css`. Para revender el
sistema con la marca de un cliente hay exactamente cuatro cambios.

**1. El color.** En el bloque `:root`, cambia estas cuatro lineas:

```css
--accent:          #0E6E52;   /* el color principal del cliente */
--accent-hover:    #0B5942;   /* el mismo, un poco mas oscuro */
--accent-soft:     #E4F0EA;   /* el mismo, muy claro, para fondos */
--accent-contrast: #FFFFFF;   /* blanco o negro, lo que se lea encima */
```

Repite los mismos cuatro valores en el bloque de modo oscuro, aclarando un poco
el acento para que se lea sobre fondo negro.

**2. El nombre.** Busca `Nexo CRM` en `public/app.html` y `public/index.html` y
reemplazalo. Son pocas apariciones.

**3. La inicial del logo.** En los dos archivos, la letra dentro de
`<span class="brand__mark">N</span>`.

**4. El titulo de la pestana.** La etiqueta `<title>` de cada pagina.

Nada mas. No hay que tocar la logica ni el CSS de componentes.

### Lo que NO conviene cambiar

Los colores semanticos (`--won`, `--lost`, `--warn`, `--info`) no son la marca.
Son significado. Si pones el rojo de perdido en el color corporativo del cliente,
el tablero deja de leerse de un vistazo. Dejalos como estan.

---

## Los dos modelos de cobro

**Suscripcion.** Una sola instalacion tuya, cada cliente en su propia cuenta. Es
lo que el esquema ya soporta: cada empresa esta aislada en la base de datos. El
ingreso es recurrente y no tienes que hacer nada cuando entra un cliente nuevo.

**Implementacion.** Un pago inicial por migrar los datos, armar las etapas del
embudo con el vocabulario del cliente, capacitar al equipo y dejarlo en su
dominio. Es lo que paga el trabajo de la primera semana.

Lo normal es cobrar las dos cosas. La implementacion cubre tu tiempo, la
suscripcion cubre el hosting y el soporte.

---

## Sobre los precios que estan en la pagina

Los numeros que aparecen hoy en `public/index.html` son una propuesta, no una
decision. Estan marcados con un comentario en el codigo justo encima del bloque.

| Plan | Precio propuesto | Alcance |
|---|---|---|
| Esencial | 29 dolares al mes | Hasta 3 usuarios |
| Equipo | 79 dolares al mes | Hasta 10 usuarios, marca propia |
| Implementacion | Se cotiza | Migracion, configuracion, capacitacion |

Cobrar por empresa y no por usuario es una decision deliberada de venta. Quita la
friccion de "si agrego a la secretaria me sube la factura", que es la razon mas
comun por la que un equipo chico deja de usar el CRM que compro.

Antes de publicar, revisa estos numeros contra lo que cobra la competencia en tu
mercado y ajustalos.

---

## Como mostrarlo en una reunion

La demostracion tiene datos de una agencia ficticia en Panama, con nombres y
negocios verosimiles. Ese detalle importa: un CRM vacio no vende, y uno lleno de
"Cliente 1, Cliente 2" tampoco.

El momento que cierra la venta es el embudo. Abre la pestana Embudo y arrastra
una tarjeta a Ganado delante del cliente. Ve como cambia el total de la columna y
como aparece el movimiento en el panel. Eso comunica el producto entero en diez
segundos, mucho mejor que cualquier lista de caracteristicas.

Si el prospecto quiere probarlo despues, mandale el enlace de la demostracion. No
pide correo ni tarjeta, y el boton "Reiniciar datos" devuelve todo al estado
original si lo desordena.

---

## Adaptar el vocabulario a un rubro

El sistema es generico, pero el cliente quiere oir sus palabras. Las etapas del
embudo se definen en la tabla `stages` y se pueden cambiar por empresa sin tocar
codigo:

- **Clinica:** Consulta solicitada, Evaluacion, Presupuesto, Aprobado, Tratado, Desistio
- **Constructora:** Contacto, Visita tecnica, Propuesta, Negociacion, Contratado, Descartado
- **Agencia:** Prospecto, Reunion, Propuesta, Negociacion, Ganado, Perdido

Los campos propios de cada rubro van en la columna `custom`, que guarda JSON, sin
necesidad de alterar las tablas. Esa es la razon por la que existe.

---

## Que falta para que sea un SaaS completo

Lo que hay hoy sostiene clientes reales. Esto es lo que agregarias despues,
en orden de lo que mas se pide:

1. **Cobro automatico.** Hoy la suscripcion se cobra por fuera. Conectar Stripe o
   Yappy y marcar la empresa como `past_due` cuando falla el pago.
2. **Invitar usuarios.** El esquema ya guarda roles y el estado `invited`. Falta
   la pantalla y el correo de invitacion.
3. **Importar desde Excel.** Es el primer pedido de todo cliente que ya lleva su
   cartera en una hoja de calculo.
4. **Recordatorios por correo o WhatsApp** cuando una tarea vence.
5. **Exportar la cuenta completa**, que es lo que promete la pagina de preguntas
   frecuentes y hay que poder cumplir.
