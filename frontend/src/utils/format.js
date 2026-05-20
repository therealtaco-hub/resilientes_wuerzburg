// Zentrale Zahlenformatierung für die gesamte App — immer de-DE Locale.
export const fmt = {
  num:   (v, d = 0) => v.toLocaleString('de-DE', {         // 1.234 / 1.234,5
           maximumFractionDigits: d, minimumFractionDigits: d }),
  temp:  (v) => `${v.toFixed(1)}°C`,                       // 32,4°C
  dT:    (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} °C`,  // +0,42 °C / -1,10 °C
  pct:   (v, d = 1) => `${v.toFixed(d)}%`,                 // 18,2%  (v in Prozent, nicht 0–1)
  area:  (m2) => m2 >= 10000                                // ab 1 ha → Hektar, sonst m²
           ? `${(m2 / 10000).toFixed(2)} ha`
           : `${m2.toLocaleString('de-DE')} m²`,
  index: (v) => v.toFixed(2),                              // HVI-Wert: 7,42
}
