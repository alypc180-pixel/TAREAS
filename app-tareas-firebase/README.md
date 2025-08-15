# App de Tareas con Firebase
Control de tareas con **GPS, dirección (Nominatim), fotos (Storage) y exportación a Excel**. Roles: **admin** y **contributor**.

## Archivos
- `index.html` — estructura y dependencias (Leaflet, Firebase, SheetJS)
- `style.css` — estilos
- `script.js` — lógica, Firebase y permisos

## Configuración Firebase
1. Crea un proyecto en Firebase Console.
2. Habilita **Authentication (Email/Password)**, **Firestore** y **Storage**.
3. En **Project settings → General → SDK setup**, copia tu `firebaseConfig` y pégalo en `script.js`.

### Reglas Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /roles/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null
        && get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.role == "admin";
    }
    match /tasks/{taskId} {
      allow create: if request.auth != null
        && (get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.role in ["admin","contributor"])
        && request.resource.data.owner == request.auth.uid;
      allow read: if request.auth != null
        && (get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.role == "admin"
            || (get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.role == "contributor"
                && resource.data.owner == request.auth.uid));
      allow update, delete: if request.auth != null
        && get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.role == "admin";
    }
  }
}
```

### Reglas Storage
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /images/{userId}/{allPaths=**} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Crear roles
- En **Authentication**, crea tu usuario (registro desde la app o manual).
- En **Firestore → Data**, crea `roles/{tuUID}` con `{'role': 'admin'}`.
- Para invitados, crea `roles/{uid}` con `{'role': 'contributor'}`.

## Publicar en GitHub Pages
1. Sube estos archivos al repositorio (rama `main`).  
2. En **Settings → Pages**, selecciona **Branch: main** y **/(root)**.  
3. Abre la URL `https://TUUSUARIO.github.io/TUNOMBRE/`.

*Generado: 2025-08-15T04:01:57.919604Z*
