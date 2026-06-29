# Pagos Red

Panel de administración de pagos para red de internet.

## Estructura del proyecto

```
pagos-red/
├── index.html                  ← HTML + CSS (se sube al repo)
├── app.js                      ← Toda la lógica de la app (se sube al repo)
├── firebase-config.js          ← ⚠ CREDENCIALES — NO se sube (está en .gitignore)
├── firebase-config.example.js  ← Plantilla vacía (se sube como referencia)
├── .gitignore
└── README.md
```

## Configuración inicial

### 1. Clonar y configurar Firebase

```bash
# Copia la plantilla de config
cp firebase-config.example.js firebase-config.js

# Edita firebase-config.js con tus credenciales reales de Firebase
```

### 2. Subir a GitHub Pages

1. Crear repositorio en GitHub (puede ser privado)
2. Subir todos los archivos **excepto** `firebase-config.js`
3. Settings → Pages → Branch: main → Save
4. Acceder a: `https://TU_USUARIO.github.io/pagos-red/`

### 3. Uso local

Abrir `index.html` directamente en el navegador.
> Nota: para que funcionen los módulos ES6 localmente, usar un servidor local:
> ```bash
> npx serve .
> # o
> python -m http.server 8080
> ```

## Reglas de Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Colecciones en Firestore

### `clientes`
| Campo       | Tipo    | Descripción             |
|-------------|---------|-------------------------|
| nombre      | string  | Nombre del cliente      |
| wan         | string  | IP WAN / CPE            |
| lan         | string  | IP LAN                  |
| plan        | string  | Nombre del plan         |
| cuota       | number  | Precio mensual en Q     |
| activo      | boolean | Estado del servicio     |
| fechaInicio | string  | Fecha inicio (YYYY-MM-DD) |
| nota        | string  | Observación interna     |

### `pagos`
| Campo              | Tipo    | Descripción                    |
|--------------------|---------|--------------------------------|
| clienteId          | string  | ID del cliente en Firestore    |
| año                | number  | Año del pago                   |
| mes                | number  | Mes del pago (1-12)            |
| monto              | number  | Monto pagado en Q              |
| paused             | boolean | True si el servicio fue pausado|
| nota               | string  | Nota del pago                  |
| codigoComprobante  | string  | Código único (REC-YYYYMM-XXXX) |
| fechaRegistro      | string  | ISO timestamp del registro     |

## Seguridad

- `firebase-config.js` está en `.gitignore` — nunca se sube al repositorio
- La autenticación usa Firebase Auth (email/password)
- Las reglas de Firestore bloquean acceso no autenticado
- El `firebase-config.example.js` es la plantilla pública sin credenciales reales
