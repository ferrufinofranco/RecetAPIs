import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptarReceta, resolverImagen } from '../src/utils/recetas.js'
import { filtrarRecetas } from '../src/utils/catalogo.js'

const url = 'https://example.supabase.co'

test('adapta relaciones, cantidades y unidades sin modificar el orden original de pasos', () => {
  const version = {
    id: 8,
    receta_id: 3,
    titulo: 'Pan casero',
    tiempo_minutos: 30,
    receta_categorias: [{ categorias: { id: 1, nombre: 'General' } }, { categorias: { id: 2, nombre: 'Desayuno' } }],
    receta_ingredientes: [{ cantidad: 200, unidad: 'g', ingredientes: { id: 4, nombre: 'Harina' } }],
    receta_pasos: [{ orden: 2, descripcion: 'Cocinar' }, { orden: 1, descripcion: 'Mezclar' }],
  }
  const receta = adaptarReceta(version, url)
  assert.equal(receta.id, '3')
  assert.equal(receta.versionId, 8)
  assert.equal(receta.tiempoMinutos, 30)
  assert.deepEqual(receta.categorias, ['General', 'Desayuno'])
  assert.deepEqual(receta.ingredientes, [{ id: 4, nombre: 'Harina', cantidad: 200, unidad: 'g' }])
  assert.deepEqual(receta.pasos.map((paso) => paso.orden), [1, 2])
  assert.equal(version.receta_pasos[0].orden, 2)
  assert.deepEqual(filtrarRecetas([receta], 'pan', 'Desayuno'), [receta])
  assert.deepEqual(filtrarRecetas([receta], '', 'Postre'), [])
})

test('tolera imagen y relaciones ausentes sin agregar datos simulados', () => {
  const receta = adaptarReceta({ id: 1, receta_id: 1, receta_categorias: [{ categorias: null }], receta_ingredientes: [{ ingredientes: null }] }, url)
  assert.equal(receta.imagen, '')
  assert.deepEqual(receta.categorias, [])
  assert.deepEqual(receta.ingredientes, [])
  assert.deepEqual(receta.pasos, [])
})

test('resuelve URLs públicas y rutas de Storage con bucket', () => {
  assert.equal(resolverImagen(null, url), '')
  assert.equal(resolverImagen('https://example.com/foto.jpg', url), 'https://example.com/foto.jpg')
  assert.equal(resolverImagen('recetas/pan casero.jpg', url), `${url}/storage/v1/object/public/recetas/pan%20casero.jpg`)
  assert.equal(resolverImagen('/storage/v1/object/public/recetas/pan.jpg', url), `${url}/storage/v1/object/public/recetas/pan.jpg`)
})

test('combina búsqueda por título y categoría sin distinguir tildes o mayúsculas', () => {
  const recetas = [{ titulo: 'Pan mediterráneo', categorias: ['General', 'Desayuno'] }]
  assert.equal(filtrarRecetas(recetas, ' MEDITERRANEO ', 'desayuno').length, 1)
  assert.equal(filtrarRecetas(recetas, 'pan', 'Postre').length, 0)
  assert.equal(filtrarRecetas(recetas, 'pasta', '').length, 0)
  assert.deepEqual(filtrarRecetas([], '', ''), [])
})
