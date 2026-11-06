const { test, expect } = require('@playwright/test');
const { mockCatalogApi } = require('./helpers');

test('El catálogo carga sin errores y sus controles principales tienen nombre accesible', async ({ page }) => {
  const errores = [];

  page.on('pageerror', error => {
    errores.push(error.message);
  });

  await mockCatalogApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'El catálogo' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar libros' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filtrar por categoría' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Solo disponibles' })).toBeVisible();

  expect(errores).toEqual([]);
});