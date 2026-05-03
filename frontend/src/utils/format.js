export const fmt = {
  num:   (v, d = 0) => v.toLocaleString('de-DE', {
           maximumFractionDigits: d, minimumFractionDigits: d }),
  temp:  (v) => `${v.toFixed(1)}°C`,
  dT:    (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} °C`,
  pct:   (v, d = 1) => `${v.toFixed(d)}%`,
  area:  (m2) => m2 >= 10000
           ? `${(m2 / 10000).toFixed(2)} ha`
           : `${m2.toLocaleString('de-DE')} m²`,
  index: (v) => v.toFixed(2),
}
