const { test, expect } = require('@playwright/test');
const { mockCatalogApi } = require('./helpers');

test('El usuario puede consultar un libro', async ({ page }) => {
  await mockCatalogApi(page);
  await page.goto('/');

  const libro = page.locator('.libro-card').filter({ hasText: 'Fundamentos de suelos' });
  await expect(libro).toBeVisible();
  await expect(libro).toContainText('Ana Martínez');
  await expect(libro).toContainText('Ciencia');
  await expect(libro).toContainText('2/2 disp.');
});