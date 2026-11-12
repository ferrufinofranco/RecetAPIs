// Formato de presentación únicamente: no transforma los datos enviados al servidor.
export function duracionLegible(valor) {
  return valor != null && String(valor).trim() !== '' && Number.isFinite(Number(valor)) && Number(valor) > 0
    ? `${valor} min` : ''
}

export function dificultadLegible(valor) {
  return ({ facil: 'Fácil', media: 'Media', dificil: 'Difícil' })[valor] || ''
}
