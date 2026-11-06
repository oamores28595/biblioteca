const { test, expect } = require('@playwright/test');
const { mockCatalogApi } = require('./helpers');

test('El formulario muestra el error cuando el servidor rechaza las credenciales', async ({ page }) => {
  await mockCatalogApi(page);
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Correo o contraseña incorrectos' })
  }));

  await page.goto('/');

  await page.getByRole('button', { name: 'Acceso administrador' }).click();
  await page.getByLabel('Correo').fill('prueba@ejemplo.com');
  await page.getByLabel('Contraseña').fill('ClaveIncorrecta123');

  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.locator('#toast')).toHaveText('Correo o contraseña incorrectos');
});