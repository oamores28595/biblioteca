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
  const resultados = page.locator('.libro-titulo');
  const informe = [];

  for (const titulo of titulos) {
    const respuestaPendiente = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/libros' && url.searchParams.get('q') === titulo;
    });

    await buscador.fill(titulo);
    const respuesta = await respuestaPendiente;
    const data = await respuesta.json();
    const titulosEncontrados = data.resultados.map(libro => libro.titulo);

    await expect(resultados).toHaveText(titulosEncontrados);
    if (titulosEncontrados.length === 0) {
      await expect(page.locator('#catalogo-vacio')).toBeVisible();
      informe.push(`SIN RESULTADOS | ${titulo}`);
    } else {
      informe.push(`ENCONTRADO (${titulosEncontrados.length}) | ${titulo} | ${titulosEncontrados.join('; ')}`);
    }
  }

  const resumen = informe.join('\n');
  console.log(`\nResultado de las búsquedas en el catálogo real:\n${resumen}\n`);
  await testInfo.attach('resultado-de-busquedas', {
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

  await expect(page.locator('.libro-titulo')).toHaveText(['Manual de agronomía tropical']);
});