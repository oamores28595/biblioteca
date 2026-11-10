const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { mockCatalogApi } = require('./helpers');

const titulos = fs.readFileSync(path.join(__dirname, 'lista.txt'), 'utf8')
  .split(/\r?\n/)
  .map(titulo => titulo.trim())
  .filter(Boolean);

test('Informa cuáles búsquedas encuentran libros en el catálogo', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');

  const buscador = page.getByRole('textbox', { name: 'Buscar libros' });
  const resultados = page.locator('#shelf-libros .libro-titulo');
  const sugerencias = page.locator('#shelf-sugerencias .libro-titulo');
  const informe = [];

  for (const titulo of titulos) {
    const respuestaPendiente = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/libros' && url.searchParams.get('q') === titulo;
    });

    const inicio = Date.now();
    await buscador.fill(titulo);
    const respuesta = await respuestaPendiente;
    const tiempoApiMs = Date.now() - inicio;
    const data = await respuesta.json();
    const titulosEncontrados = data.resultados.map(libro => libro.titulo);
    const titulosSugeridos = data.sugerencias.map(libro => libro.titulo);

    await expect(resultados).toHaveText(titulosEncontrados);
    await expect(sugerencias).toHaveText(titulosSugeridos);
    if (titulosSugeridos.length > 0) {
      await expect(page.locator('#bloque-sugerencias')).toBeVisible();
    } else {
      await expect(page.locator('#bloque-sugerencias')).toBeHidden();
    }

    const detalleSugerencias = data.sugerencias
      .map(libro => `${libro.titulo} (${Number(libro.similitud).toFixed(3)})`)
      .join('; ') || 'ninguna';
    if (titulosEncontrados.length === 0) {
      await expect(page.locator('#catalogo-vacio')).toBeVisible();
    }
    informe.push(
      `${titulo} | exactos: ${titulosEncontrados.length}` +
      ` | semánticos: ${titulosSugeridos.length} (${detalleSugerencias})` +
      ` | tiempo hasta respuesta: ${tiempoApiMs} ms`
    );
  }

  const resumen = informe.join('\n');
  console.log(`\nBúsqueda del catálogo (exacta + semántica):\n${resumen}\n`);
  await testInfo.attach('resultado-de-busquedas-exactas-y-semanticas', {
    body: resumen,
    contentType: 'text/plain'
  });
});

test('La búsqueda filtra el catálogo por título', async ({ page }) => {
  await mockCatalogApi(page);
  await page.goto('/');

  const buscador = page.getByRole('textbox', { name: 'Buscar libros' });
  const respuesta = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/libros' && url.searchParams.get('q') === 'agronomía';
  });

  await buscador.fill('agronomía');
  await respuesta;

  await expect(page.locator('#shelf-libros .libro-titulo')).toHaveText(['Manual de agronomía tropical']);
});