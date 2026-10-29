// "hace X" text for the age of the last reading: 7 min, 3 h 12 min, 4 d 2 h.
export function formatAge(ms) {
  const min = Math.floor(ms / 60000)
  if (min < 1)  return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48)   return `${h} h ${min % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}
