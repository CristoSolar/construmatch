# ConstruMatch

Marketplace para conectar clientes validados con empresas de construcción habilitadas. El repositorio contiene la experiencia web publicada en `dist/`, la API TypeScript en `server/` y el esquema PostgreSQL en `db/`.

## Seguridad aplicada

- Contraseñas con `crypto.scrypt`, sal aleatoria y parámetros almacenados.
- Sesiones mediante tokens aleatorios; PostgreSQL conserva solamente su hash SHA-256.
- Cookies `HttpOnly`, `Secure` en producción y `SameSite=Lax`.
- HSTS, CSP, `nosniff`, verificación de origen y límites de tamaño.
- Bloqueo tras 5 fallos por cuenta/IP o 30 por IP en 15 minutos.
- Consultas parametrizadas en todas las rutas; no se concatena entrada del usuario en SQL.
- Autorización por rol, validación de cuenta y propiedad/participación del recurso.
- Transacción con `FOR UPDATE` e índice parcial único para una sola cotización aceptada.
- Imágenes limitadas a 5 MB y verificadas por firma real JPG, PNG o WebP.
- Acciones críticas registradas en `audit_log`.

## Validación de cuentas

- Temporalmente, las cuentas **cliente**, **empresa** y **maestro independiente** se validan automáticamente al registrarse.
- Empresas y maestros pueden completar sus antecedentes de verificación, pero el envío no bloquea el uso de la cuenta mientras este modo temporal esté activo.
- Cada aprobación automática queda registrada en `audit_log`; una suspensión administrativa sigue revocando las sesiones.

## Ejecución local

1. Copia `.env.example` como `.env` y reemplaza los valores.
2. Crea una base PostgreSQL 17 y ejecuta `psql "$DATABASE_URL" -f db/schema.sql`.
3. Ejecuta `npm install` y luego `npm start` con Node.js 23.6 o superior.
4. Sirve `dist/` desde `http://localhost:4173` o ajusta `APP_ORIGIN` a tu frontend.

No subas `.env`, respaldos, documentos de identidad ni credenciales al repositorio. En producción, los binarios de verificación y las imágenes deben almacenarse cifrados en un object store privado; PostgreSQL solo conserva referencias y metadatos.

## Validación automática de empresas (SII)

`npm run verify:companies -- --file PUB_NOMBRES_PJ.zip` revisa las solicitudes pendientes de cuentas empresa contra la [Nómina de Personas Jurídicas del SII](https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html) (archivo público, sin captcha). Sin `--apply` solo muestra el informe.

```bash
curl -LO https://www.sii.cl/estadisticas/nominas/PUB_NOMBRES_PJ.zip
npm run verify:companies -- --file PUB_NOMBRES_PJ.zip           # simulación
npm run verify:companies -- --file PUB_NOMBRES_PJ.zip --apply   # guarda decisiones
```

- **Aprueba** si el RUT tiene dígito verificador válido, figura en la nómina sin término de giro, la razón social coincide (sin importar tildes, puntuación ni forma jurídica) y no está validado en otra cuenta.
- **Rechaza** si el dígito verificador es inválido o la empresa tiene término de giro. La empresa puede volver a enviar su solicitud.
- **Deja para revisión manual** todo lo demás: referencia que no es RUT, RUT fuera de la nómina (personas naturales o empresas más nuevas que la nómina), razón social distinta o RUT repetido.
- Cada decisión queda en `audit_log` como `verification.verified` o `verification.rejected`, con `actor_user_id` nulo y motivo "Validación automática SII". No modifica cuentas suspendidas.
- La nómina se actualiza aproximadamente una vez al año; las empresas creadas después quedan para revisión manual.

## GitHub y Cloudflare

El frontend se publica mediante Cloudflare Workers Static Assets usando `wrangler deploy`. El despliegue automático de GitHub está deshabilitado para evitar ejecuciones duplicadas sin credenciales.

La API Express no debe desplegarse como un sitio estático. Debe ejecutarse en un servicio Node.js con acceso privado a PostgreSQL 17. Configura `APP_ORIGIN` con la URL pública de Cloudflare y mantén `DATABASE_URL` solamente en el gestor de secretos del servicio.
