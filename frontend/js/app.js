const API = '/api';

const estado = {
  libros: [],
  sugerencias: [],
  categorias: [],
  usuarios: [],
  prestamos: [],
  filtroEstadoPrestamo: '',
};

async function api(path, opciones = {}) {
  const token = localStorage.getItem('bv_token');
  const esFormData = opciones.body instanceof FormData;

  const res = await fetch(`${API}${path}`, {
    headers: {
      ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opciones,
  });

  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/registro') {
    cerrarSesion('Tu sesión expiró. Inicia sesión de nuevo.');
    throw new Error('Sesión expirada');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Ocurrió un error inesperado');
  return data;
}

function mostrarToast(mensaje, tipo = 'ok') {
  const toast = document.getElementById('toast');
  toast.textContent = mensaje;
  toast.className = 'toast show' + (tipo === 'error' ? ' error' : '');
  clearTimeout(mostrarToast._t);
  mostrarToast._t = setTimeout(() => toast.classList.remove('show'), 2800);
}

function iniciales(nombre) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return '—';
  const f = new Date(fechaStr.replace(' ', 'T'));
  if (isNaN(f)) return fechaStr;
  return f.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function signatura(libro) {
  const prefijo = (libro.categoria_nombre || 'GEN').slice(0, 3).toUpperCase();
  return `${prefijo}-${String(libro.id_libro).padStart(3, '0')}`;
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- navegación entre vistas ----------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const vista = btn.dataset.view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${vista}`).classList.add('active');
  if (vista === 'panel') cargarEstadisticas();
});

// ---------- modal genérico ----------
const overlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');

function abrirModal(html) {
  modalContent.innerHTML = html;
  overlay.classList.add('open');
}
function cerrarModal() {
  overlay.classList.remove('open');
  modalContent.innerHTML = '';
}
document.getElementById('modal-close').addEventListener('click', cerrarModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarModal(); });

// ============================================================
// CATÁLOGO DE LIBROS (con sugerencias por contenido integradas)
// ============================================================
async function cargarCategorias() {
  estado.categorias = await api('/categorias');
  const select = document.getElementById('select-categoria');
  select.innerHTML = '<option value="">Todas las categorías</option>' +
    estado.categorias.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
}

async function cargarLibros() {
  const q = document.getElementById('input-buscar').value.trim();
  const categoria = document.getElementById('select-categoria').value;
  const disponibles = document.getElementById('check-disponibles').checked;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (categoria) params.set('categoria', categoria);
  if (disponibles) params.set('disponibles', 'true');

  const data = await api(`/libros?${params.toString()}`);
  estado.libros = data.resultados;
  estado.sugerencias = data.sugerencias || [];
  renderizarLibros();
  renderizarSugerencias();
}

function renderizarLibros() {
  const shelf = document.getElementById('shelf-libros');
  const vacio = document.getElementById('catalogo-vacio');

  if (estado.libros.length === 0) {
    shelf.innerHTML = '';
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;
  shelf.innerHTML = estado.libros.map(libro => tarjetaLibro(libro)).join('');
}

// Si Phi-3/Ollama no encontró nada relevante (o no está disponible), este
// bloque simplemente no se muestra — sin mensajes de error, sin paneles vacíos.
function renderizarSugerencias() {
  const bloque = document.getElementById('bloque-sugerencias');
  const shelf = document.getElementById('shelf-sugerencias');

  if (!estado.sugerencias || estado.sugerencias.length === 0) {
    bloque.hidden = true;
    shelf.innerHTML = '';
    return;
  }

  bloque.hidden = false;
  shelf.innerHTML = estado.sugerencias.map(libro => tarjetaLibro(libro, true)).join('');
}

function tarjetaLibro(libro, esSugerencia = false) {
  const sinStock = libro.ejemplares_disponibles === 0;
  return `
    <article class="libro-card ${sinStock ? 'sin-stock' : ''} ${esSugerencia ? 'es-sugerencia' : ''}">
      <span class="libro-signatura">${signatura(libro)}</span>
      <h3 class="libro-titulo">${escapeHtml(libro.titulo)}</h3>
      <p class="libro-autor">${escapeHtml(libro.autor)}${libro.anio_publicacion ? ' · ' + libro.anio_publicacion : ''}</p>
      <div class="libro-meta">
        <span class="libro-categoria">${libro.categoria_nombre || 'Sin categoría'}</span>
        <span class="libro-stock ${sinStock ? 'bajo' : 'ok'}">${libro.ejemplares_disponibles}/${libro.ejemplares_totales} disp.</span>
      </div>
      <div class="libro-acciones">
        ${libro.archivo_pdf ? `<button class="btn btn-secondary" data-accion="ver-pdf" data-id="${libro.id_libro}">📄 Ver PDF</button>` : ''}
        <button class="btn btn-secondary" data-accion="editar-libro" data-id="${libro.id_libro}">Editar</button>
        <button class="btn btn-danger" data-accion="borrar-libro" data-id="${libro.id_libro}">Quitar</button>
      </div>
    </article>
  `;
}

document.getElementById('input-buscar').addEventListener('input', debounce(cargarLibros, 400));
document.getElementById('select-categoria').addEventListener('change', cargarLibros);
document.getElementById('check-disponibles').addEventListener('change', cargarLibros);

async function manejarClicLibro(e) {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.dataset.accion === 'ver-pdf') {
    const token = localStorage.getItem('bv_token');
    window.open(`${API}/libros/${id}/pdf?token=${encodeURIComponent(token)}`, '_blank');
    return;
  }
  if (btn.dataset.accion === 'editar-libro') {
    const libro = [...estado.libros, ...estado.sugerencias].find(l => String(l.id_libro) === id);
    abrirFormularioLibro(libro);
    return;
  }
  if (btn.dataset.accion === 'borrar-libro') {
    if (!confirm('¿Quitar este libro del catálogo? Esta acción no se puede deshacer.')) return;
    try {
      await api(`/libros/${id}`, { method: 'DELETE' });
      mostrarToast('Libro eliminado del catálogo.');
      cargarLibros();
    } catch (err) {
      mostrarToast(err.message, 'error');
    }
  }
}
document.getElementById('shelf-libros').addEventListener('click', manejarClicLibro);
document.getElementById('shelf-sugerencias').addEventListener('click', manejarClicLibro);

document.getElementById('btn-nuevo-libro').addEventListener('click', () => abrirFormularioLibro());

function abrirFormularioLibro(libro = null) {
  const esEdicion = !!libro;
  const opcionesCategoria = estado.categorias.map(c =>
    `<option value="${c.id_categoria}" ${libro?.id_categoria === c.id_categoria ? 'selected' : ''}>${c.nombre}</option>`
  ).join('');

  abrirModal(`
    <h2>${esEdicion ? 'Editar libro' : 'Añadir libro'}</h2>
    <p class="modal-sub">${esEdicion ? signatura(libro) : 'Nueva ficha del catálogo'}</p>
    <form id="form-libro">
      <div class="form-field">
        <label for="f-titulo">Título</label>
        <input id="f-titulo" required value="${libro ? escapeHtml(libro.titulo) : ''}">
      </div>
      <div class="form-field">
        <label for="f-autor">Autor</label>
        <input id="f-autor" required value="${libro ? escapeHtml(libro.autor) : ''}">
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="f-isbn">ISBN</label>
          <input id="f-isbn" value="${libro?.isbn || ''}">
        </div>
        <div class="form-field">
          <label for="f-anio">Año</label>
          <input id="f-anio" type="number" value="${libro?.anio_publicacion || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="f-categoria">Categoría</label>
          <select id="f-categoria"><option value="">Sin categoría</option>${opcionesCategoria}</select>
        </div>
        <div class="form-field">
          <label for="f-ejemplares">Ejemplares</label>
          <input id="f-ejemplares" type="number" min="1" value="${libro?.ejemplares_totales || 1}" ${esEdicion ? 'disabled title="Se ajusta automáticamente con los préstamos"' : ''}>
        </div>
      </div>
      <div class="form-field">
        <label for="f-sinopsis">Sinopsis</label>
        <textarea id="f-sinopsis">${libro?.sinopsis || ''}</textarea>
      </div>
      <div class="form-field">
        <label for="f-pdf">Archivo PDF ${esEdicion ? '(opcional — solo si quieres reemplazarlo)' : '(opcional)'}</label>
        <input id="f-pdf" type="file" accept="application/pdf">
        ${esEdicion && libro?.archivo_pdf ? '<p style="font-size:12px;color:var(--tinta-suave);margin:6px 0 0;">Ya tiene un PDF cargado. Al subirlo, también se vuelve a indexar para la búsqueda por contenido.</p>' : '<p style="font-size:12px;color:var(--tinta-suave);margin:6px 0 0;">Si subes un PDF, su contenido se indexa automáticamente para búsquedas por significado.</p>'}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="cancelar-libro">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-block">${esEdicion ? 'Guardar cambios' : 'Añadir al catálogo'}</button>
      </div>
    </form>
  `);

  document.getElementById('cancelar-libro').addEventListener('click', cerrarModal);
  document.getElementById('form-libro').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.set('titulo', document.getElementById('f-titulo').value.trim());
    formData.set('autor', document.getElementById('f-autor').value.trim());
    formData.set('isbn', document.getElementById('f-isbn').value.trim());
    formData.set('anio_publicacion', document.getElementById('f-anio').value || '');
    formData.set('id_categoria', document.getElementById('f-categoria').value || '');
    formData.set('ejemplares_totales', document.getElementById('f-ejemplares').value || '1');
    formData.set('sinopsis', document.getElementById('f-sinopsis').value.trim());

    const archivo = document.getElementById('f-pdf').files[0];
    if (archivo) formData.set('pdf', archivo);

    try {
      if (esEdicion) {
        await api(`/libros/${libro.id_libro}`, { method: 'PUT', body: formData });
        mostrarToast('Cambios guardados.');
      } else {
        await api('/libros', { method: 'POST', body: formData });
        mostrarToast('Libro añadido al catálogo.');
      }
      cerrarModal();
      cargarLibros();
    } catch (err) {
      mostrarToast(err.message, 'error');
    }
  });
}

// ============================================================
// PRÉSTAMOS
// ============================================================
async function cargarPrestamos() {
  const params = estado.filtroEstadoPrestamo ? `?estado=${estado.filtroEstadoPrestamo}` : '';
  estado.prestamos = await api(`/prestamos${params}`);
  renderizarPrestamos();
}

function renderizarPrestamos() {
  const tbody = document.querySelector('#tabla-prestamos tbody');
  const vacio = document.getElementById('prestamos-vacio');

  if (estado.prestamos.length === 0) {
    tbody.innerHTML = '';
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;

  const hoy = new Date().toISOString().slice(0, 10);

  tbody.innerHTML = estado.prestamos.map(p => {
    const atrasado = p.estado === 'activo' && p.fecha_limite < hoy;
    const estadoVisual = atrasado ? 'atrasado' : p.estado;
    const etiqueta = { activo: 'Activo', devuelto: 'Devuelto', atrasado: 'Atrasado' }[estadoVisual];

    return `
      <tr>
        <td><strong>${escapeHtml(p.titulo)}</strong></td>
        <td>${escapeHtml(p.nombre_completo)}</td>
        <td class="fecha">${formatearFecha(p.fecha_prestamo)}</td>
        <td class="fecha">${formatearFecha(p.fecha_limite)}</td>
        <td><span class="estado-tag ${estadoVisual}">${etiqueta}</span></td>
        <td>${p.estado === 'activo' ? `<button class="btn btn-secondary" data-accion="devolver" data-id="${p.id_prestamo}">Registrar devolución</button>` : ''}</td>
      </tr>
    `;
  }).join('');
}

document.getElementById('filtro-estado').addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  document.querySelectorAll('#filtro-estado .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  estado.filtroEstadoPrestamo = pill.dataset.estado;
  cargarPrestamos();
});

document.querySelector('#tabla-prestamos tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-accion="devolver"]');
  if (!btn) return;
  try {
    await api(`/prestamos/${btn.dataset.id}/devolver`, { method: 'PUT' });
    mostrarToast('Devolución registrada. El ejemplar vuelve al catálogo.');
    cargarPrestamos();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
});

document.getElementById('btn-nuevo-prestamo').addEventListener('click', async () => {
  if (estado.libros.length === 0) await cargarLibros();
  if (estado.usuarios.length === 0) estado.usuarios = await api('/usuarios');

  const librosDisponibles = estado.libros.filter(l => l.ejemplares_disponibles > 0);

  abrirModal(`
    <h2>Registrar préstamo</h2>
    <p class="modal-sub">Vence a los 14 días</p>
    <form id="form-prestamo">
      <div class="form-field">
        <label for="p-libro">Libro</label>
        <select id="p-libro" required>
          <option value="">Selecciona un libro…</option>
          ${librosDisponibles.map(l => `<option value="${l.id_libro}">${escapeHtml(l.titulo)} — ${l.ejemplares_disponibles} disp.</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="p-usuario">Lector</label>
        <select id="p-usuario" required>
          <option value="">Selecciona un lector…</option>
          ${estado.usuarios.map(u => `<option value="${u.id_usuario}">${escapeHtml(u.nombre_completo)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="cancelar-prestamo">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-block" ${librosDisponibles.length === 0 ? 'disabled' : ''}>Confirmar préstamo</button>
      </div>
      ${librosDisponibles.length === 0 ? '<p style="font-size:13px;color:var(--sello);margin-top:10px;">No hay ejemplares disponibles en este momento.</p>' : ''}
    </form>
  `);

  document.getElementById('cancelar-prestamo').addEventListener('click', cerrarModal);
  document.getElementById('form-prestamo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      id_libro: Number(document.getElementById('p-libro').value),
      id_usuario: Number(document.getElementById('p-usuario').value),
    };
    try {
      await api('/prestamos', { method: 'POST', body: JSON.stringify(payload) });
      mostrarToast('Préstamo registrado.');
      cerrarModal();
      cargarPrestamos();
      cargarLibros();
    } catch (err) {
      mostrarToast(err.message, 'error');
    }
  });
});

// ============================================================
// USUARIOS / LECTORES
// ============================================================
async function cargarUsuarios() {
  estado.usuarios = await api('/usuarios');
  renderizarUsuarios();
}

function renderizarUsuarios() {
  const grid = document.getElementById('grid-usuarios');
  const vacio = document.getElementById('usuarios-vacio');

  if (estado.usuarios.length === 0) {
    grid.innerHTML = '';
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;

  grid.innerHTML = estado.usuarios.map(u => `
    <article class="reader-card">
      <div class="reader-avatar">${iniciales(u.nombre_completo)}</div>
      <h3 class="reader-name">${escapeHtml(u.nombre_completo)}</h3>
      <p class="reader-mail">${escapeHtml(u.correo)}</p>
      <span class="reader-stat">Lector desde ${formatearFecha(u.fecha_registro)}</span>
    </article>
  `).join('');
}

document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
  abrirModal(`
    <h2>Registrar lector</h2>
    <p class="modal-sub">Nueva ficha de socio</p>
    <form id="form-usuario">
      <div class="form-field">
        <label for="u-nombre">Nombre completo</label>
        <input id="u-nombre" required>
      </div>
      <div class="form-field">
        <label for="u-correo">Correo</label>
        <input id="u-correo" type="email" required>
      </div>
      <div class="form-field">
        <label for="u-telefono">Teléfono</label>
        <input id="u-telefono">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="cancelar-usuario">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-block">Registrar</button>
      </div>
    </form>
  `);

  document.getElementById('cancelar-usuario').addEventListener('click', cerrarModal);
  document.getElementById('form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      nombre_completo: document.getElementById('u-nombre').value.trim(),
      correo: document.getElementById('u-correo').value.trim(),
      telefono: document.getElementById('u-telefono').value.trim() || null,
    };
    try {
      await api('/usuarios', { method: 'POST', body: JSON.stringify(payload) });
      mostrarToast('Lector registrado.');
      cerrarModal();
      cargarUsuarios();
    } catch (err) {
      mostrarToast(err.message, 'error');
    }
  });
});

// ============================================================
// PANEL / ESTADÍSTICAS
// ============================================================
async function cargarEstadisticas() {
  const r = await api('/prestamos/estadisticas/resumen');
  const grid = document.getElementById('stat-grid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-num">${r.totalLibros}</div>
      <div class="stat-label">Ejemplares en total</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${r.disponibles}</div>
      <div class="stat-label">Disponibles ahora</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${r.prestamosActivos}</div>
      <div class="stat-label">Préstamos activos</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${r.totalUsuarios}</div>
      <div class="stat-label">Lectores registrados</div>
    </div>
    <div class="stat-card acento">
      <div class="stat-num">${r.atrasados}</div>
      <div class="stat-label">Préstamos atrasados</div>
    </div>
  `;
}

// ============================================================
// AUTENTICACIÓN
// ============================================================
const pantallaAuth = document.getElementById('pantalla-auth');
const pantallaApp = document.getElementById('pantalla-app');

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const esLogin = tab.dataset.form === 'login';
    document.getElementById('form-login').hidden = !esLogin;
    document.getElementById('form-registro').hidden = esLogin;
  });
});

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const correo = document.getElementById('login-correo').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ correo, password }) });
    iniciarSesion(data.token, data.bibliotecario);
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
});

document.getElementById('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre_completo = document.getElementById('reg-nombre').value.trim();
  const correo = document.getElementById('reg-correo').value.trim();
  const password = document.getElementById('reg-password').value;
  try {
    const data = await api('/auth/registro', { method: 'POST', body: JSON.stringify({ nombre_completo, correo, password }) });
    iniciarSesion(data.token, data.bibliotecario);
    mostrarToast('Cuenta creada. ¡Bienvenido/a!');
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
});

document.getElementById('btn-logout').addEventListener('click', () => cerrarSesion());

function iniciarSesion(token, bibliotecario) {
  localStorage.setItem('bv_token', token);
  localStorage.setItem('bv_bibliotecario', JSON.stringify(bibliotecario));
  mostrarApp(bibliotecario);
}

function cerrarSesion(mensaje) {
  localStorage.removeItem('bv_token');
  localStorage.removeItem('bv_bibliotecario');
  pantallaApp.hidden = true;
  pantallaAuth.hidden = false;
  document.getElementById('form-login').reset();
  if (mensaje) mostrarToast(mensaje, 'error');
}

function mostrarApp(bibliotecario) {
  document.getElementById('topbar-user-nombre').textContent = bibliotecario.nombre_completo;
  pantallaAuth.hidden = true;
  pantallaApp.hidden = false;
  cargarApp();
}

async function cargarApp() {
  try {
    await cargarCategorias();
    await cargarLibros();
    await cargarUsuarios();
    await cargarPrestamos();
  } catch (err) {
    mostrarToast('No se pudo conectar con el servidor. ¿Está corriendo el backend?', 'error');
    console.error(err);
  }
}

(function iniciar() {
  const token = localStorage.getItem('bv_token');
  const bibliotecarioGuardado = localStorage.getItem('bv_bibliotecario');
  if (token && bibliotecarioGuardado) {
    mostrarApp(JSON.parse(bibliotecarioGuardado));
  } else {
    pantallaAuth.hidden = false;
  }
})();
