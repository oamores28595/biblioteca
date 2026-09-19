# 📚 Bibliotheca — Biblioteca Virtual (con búsqueda vectorial integrada, Phi-3 + Ollama)

Proyecto integrador full-stack: catálogo, lectores, préstamos, login del personal, carga de PDFs, y **búsqueda por contenido semántico** integrada en la misma barra de búsqueda, usando una base de datos vectorial propia y **Phi-3** (vía Ollama).

**Stack:** Node.js + Express (API REST) · SQLite (`better-sqlite3`) · JWT + bcrypt (login) · `multer` + `pdf-parse` (carga y lectura de PDFs) · HTML/CSS/JavaScript puro (frontend) · Ollama + Phi-3 (embeddings y base de datos vectorial).

---

## 1. Instalación y ejecución

```bash
cd backend
npm install
npm run seed       # datos de ejemplo + 1 cuenta de bibliotecario
npm start
```

Abre `http://localhost:3000`. Usa `bibliotecario@biblioteca.com` / `biblioteca123`, o crea tu propia cuenta.

Si tienes Ollama corriendo, después del seed puedes generar los embeddings de los libros de ejemplo:
```bash
npm run indexar
```

## 2. Módulos

- **Login / registro** del personal, con JWT (8h) y contraseñas cifradas con bcrypt.
- **Catálogo**: crear, editar, eliminar, buscar y filtrar libros por categoría/disponibilidad. Cada libro puede tener un **PDF adjunto**.
- **Préstamos**: registrar y devolver préstamos, con control de ejemplares disponibles, vencimiento a 14 días, y detección de atrasados.
- **Lectores**: registro de usuarios que piden prestado.
- **Panel**: estadísticas generales de la biblioteca.
- **Búsqueda por contenido (IA)**: ver sección siguiente.

## 3. Cómo funciona la búsqueda vectorial

Cuando añades o editas un libro (con o sin PDF), el sistema automáticamente:
1. Toma su título, autor, sinopsis, y el texto extraído del PDF (si tiene uno).
2. Lo divide en fragmentos (~900 caracteres, con solape) y genera un **embedding** (vector numérico) por fragmento con Phi-3 vía Ollama.
3. Guarda esos vectores en la tabla `embeddings_libros` — esa tabla ES la base de datos vectorial. Todo esto corre **en segundo plano** al guardar el libro, sin bloquear la respuesta al bibliotecario.

Cuando alguien busca algo en la barra de búsqueda normal del catálogo, además de los resultados exactos (por título/autor/ISBN, como siempre), el sistema:
1. Convierte la búsqueda en un vector de la misma forma.
2. Compara ese vector contra todos los fragmentos guardados (similitud de coseno).
3. Si encuentra libros relevantes que no aparecieron ya en los resultados exactos, los muestra debajo como **"Quizás te interese (sugerido por el contenido)"** — integrado en la misma pantalla, sin ningún panel aparte.
4. **Si no hay nada relevante, o Ollama no responde, esa sección simplemente no aparece.** Nunca se rompe la búsqueda normal ni se muestra un error al bibliotecario.

Puedes re-generar los embeddings de todos los libros en cualquier momento con:
```bash
npm run indexar
```
Esto es útil si Ollama estuvo apagado mientras se cargaban libros, o si cambias de modelo de embeddings.

### Configuración (opcional, variables de entorno)
```bash
export OLLAMA_URL="http://localhost:11434"
export OLLAMA_MODEL="phi3"                 # modelo usado para los embeddings
export OLLAMA_UMBRAL_SIMILITUD="0.5"       # qué tan parecido debe ser algo para sugerirse (0 a 1)
```

> **Nota sobre la calidad:** Phi-3 no es un modelo especializado en embeddings (fue diseñado para generar texto), así que las sugerencias son útiles pero no perfectas. Si más adelante quieres mejor precisión sin tocar código, instala un modelo dedicado (`ollama pull nomic-embed-text`) y cambia `OLLAMA_MODEL` a `nomic-embed-text`.

## 4. Carga de PDFs

Al añadir o editar un libro puedes adjuntar un PDF (máx. 20 MB). Se guarda en `backend/uploads/pdfs/` con un nombre generado por el servidor (no el original). Cada libro con PDF muestra un botón **"📄 Ver PDF"** que lo abre en una pestaña nueva — la ruta que lo sirve exige el mismo token de sesión que el resto de la API (viaja como `?token=` porque `window.open` no puede mandar headers personalizados).

Si reemplazas o eliminas un libro con PDF, el archivo viejo se borra solo del servidor.

## 5. Estructura del proyecto

```
biblioteca-virtual/
├── backend/
│   ├── database/
│   │   ├── schema.sql       # incluye la tabla embeddings_libros (vectorial)
│   │   ├── db.js             # conexión + migraciones automáticas
│   │   ├── seed.js           # datos de ejemplo
│   │   └── indexar.js        # script para (re)generar embeddings en lote
│   ├── middleware/auth.js    # verificación de JWT
│   ├── services/vectores.js  # toda la lógica de embeddings y similitud
│   ├── routes/
│   │   ├── auth.js
│   │   ├── libros.js         # incluye subida de PDF y búsqueda + sugerencias
│   │   ├── usuarios.js
│   │   ├── prestamos.js
│   │   └── categorias.js
│   └── server.js
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## 6. Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/registro` | Autenticación (públicas) |
| GET | `/api/libros?q=...&categoria=...&disponibles=true` | Catálogo. Devuelve `{ resultados, sugerencias }` |
| POST | `/api/libros` | Crear libro (multipart/form-data, PDF opcional en el campo `pdf`) |
| PUT | `/api/libros/:id` | Editar libro (PDF opcional, reemplaza el anterior) |
| GET | `/api/libros/:id/pdf?token=...` | Ver el PDF del libro |
| DELETE | `/api/libros/:id` | Eliminar libro (borra también su PDF y sus embeddings) |
| GET/POST | `/api/usuarios`, `/api/prestamos`, `/api/categorias` | Resto de módulos (protegidos con JWT) |
