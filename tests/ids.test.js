import test from 'node:test'
import assert from 'node:assert/strict'
import { exigirIdEnteroSeguro } from '../src/utils/ids.js'

test('conserva enteros seguros, strings decimales y BigInt sin convertirlos', () => {
  assert.equal(exigirIdEnteroSeguro(83, 'identificador de la versión'), 83)
  assert.equal(exigirIdEnteroSeguro('9007199254740993'), '9007199254740993')
  assert.equal(exigirIdEnteroSeguro(25n), 25n)
  assert.equal(exigirIdEnteroSeguro(2 ** 53 - 1), 2 ** 53 - 1)
  assert.equal(exigirIdEnteroSeguro(0), 0)
})

test('rechaza números que ya no son enteros seguros, sin recuperar precisión', () => {
  // 2**53 es el primer entero no seguro; un bigint real de ese tamaño llega
  // redondeado desde JSON y el frontend solo puede rechazarlo, no repararlo.
  for (const valor of [2 ** 53, -(2 ** 53), NaN, Infinity, -Infinity, 1.5]) {
    assert.throws(() => exigirIdEnteroSeguro(valor, 'identificador de la versión'), /entero seguro/)
  }
})
