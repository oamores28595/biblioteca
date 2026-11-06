async function mockCatalogApi(page, libros = [
  {
    id_libro: 1,
    titulo: 'Manual de agronomía tropical',
    autor: 'Carlos Gómez',
    categoria_nombre: 'Agricultura',
    ejemplares_disponibles: 1,
    ejemplares_totales: 1,
    anio_publicacion: 2020
  },
  {
    id_libro: 2,
    titulo: 'Fundamentos de suelos',
    autor: 'Ana Martínez',
    categoria_nombre: 'Ciencia',
    ejemplares_disponibles: 2,
    ejemplares_totales: 2,
    anio_publicacion: 2022
  }
]) {
  const categorias = [
    { id_categoria: 1, nombre: 'Ciencia', libros_asignados: 1 },
    { id_categoria: 2, nombre: 'Agricultura', libros_asignados: 1 }
  ];

  await page.route('**/api/categorias', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(categorias)
  }));

  await page.route('**/api/libros**', route => {
    const url = new URL(route.request().url());
    const query = (url.searchParams.get('q') || '').toLocaleLowerCase();
    const resultados = libros.filter(libro =>
      `${libro.titulo} ${libro.autor}`.toLocaleLowerCase().includes(query)
    );

    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ resultados, sugerencias: [] })
    });
  });
}

module.exports = { mockCatalogApi };
