// Position für die fixed-positionierten Karten-Tooltips.
// Desktop (Hover): am Cursor ankern (x+14 / y+14) — unverändertes Verhalten.
// Mobil (Tap): an den Viewport-Rand klemmen, damit die Karte/Karte den kleinen
// Screen nicht verlässt. w/h sind grobe Obergrenzen der Tooltip-Maße.
export function tooltipPos(x, y, mobile, w = 210, h = 150) {
  if (!mobile) return { left: x + 14, top: y + 14 }
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360
  const vh = typeof window !== 'undefined' ? window.innerHeight : 640
  return {
    left: Math.max(8, Math.min(x + 14, vw - w - 8)),
    top: Math.max(8, Math.min(y + 14, vh - h - 8)),
  }
}

// Adaptiert einen {object,x,y}-Handler (für deck.gl onHover gebaut) als
// onClick-Handler für Touch. deck.gl-`info.x/y` sind container-relativ; für den
// viewport-fixierten Tooltip brauchen wir aber die Client-Koordinaten des Taps,
// damit der Tooltip am Finger erscheint. Fällt auf info.x/y zurück, falls kein
// DOM-Event vorliegt.
export function tapToHover(handler) {
  return (info, event) => {
    const src = event && event.srcEvent
    handler({
      object: info.object,
      x: src && src.clientX != null ? src.clientX : info.x,
      y: src && src.clientY != null ? src.clientY : info.y,
    })
  }
}
