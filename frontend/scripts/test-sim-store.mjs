// Smoke-Tests für die Sim-Actions im Zustand-Store.
// Ohne Vitest-Setup — direkt mit `node scripts/test-sim-store.mjs` ausführbar.
// Importiert den echten Store, mutiert via Actions, vergleicht Zustand mit assert.
import assert from 'node:assert/strict'
import useAppStore from '../src/store/useAppStore.js'

const get = () => useAppStore.getState()
const reset = () => {
  get().clearSimCells()
  get().clearSimPolygons()
}

let passed = 0
function test(name, fn) {
  reset()
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed += 1
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`)
    process.exitCode = 1
  }
}

console.log('Sim-Store-Actions')

test('toggleSimCell — Kachel hinzufügen', () => {
  get().toggleSimCell(5)
  assert.deepEqual(get().sim.selectedCells, [5])
  assert.equal(get().sim.selectedCellsAreaM2, 10_000)
})

test('toggleSimCell — Kachel entfernen', () => {
  get().toggleSimCell(5)
  get().toggleSimCell(5)
  assert.deepEqual(get().sim.selectedCells, [])
  assert.equal(get().sim.selectedCellsAreaM2, 0)
})

test('toggleSimCell — mehrere Kacheln', () => {
  get().toggleSimCell(3)
  get().toggleSimCell(7)
  assert.deepEqual(get().sim.selectedCells, [3, 7])
  assert.equal(get().sim.selectedCellsAreaM2, 20_000)
})

test('clearSimCells — Reset', () => {
  get().toggleSimCell(1); get().toggleSimCell(2); get().toggleSimCell(3)
  get().setSimBaeumeAnzahl(123)
  get().clearSimCells()
  assert.deepEqual(get().sim.selectedCells, [])
  assert.equal(get().sim.selectedCellsAreaM2, 0)
  assert.equal(get().sim.baeume.anzahl, 1)
})

test('Anzahl-Kappung bei Deselektion', () => {
  // 5 Kacheln → max = 1000; 4 deselektieren → 1 Kachel = max 200
  for (let i = 0; i < 5; i += 1) get().toggleSimCell(i)
  get().setSimBaeumeAnzahl(500)
  assert.equal(get().sim.baeume.anzahl, 500)
  for (let i = 0; i < 4; i += 1) get().toggleSimCell(i)
  assert.equal(get().sim.selectedCells.length, 1)
  assert.equal(get().sim.baeume.anzahl, 200, 'anzahl muss auf neues max gekappt sein')
})

test('toggleSimPolygon — hinzufügen + groupConfig auto-fill', () => {
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 3000, label: 'P' })
  assert.equal(get().sim.selectedPolygons.length, 1)
  assert.equal(get().sim.selectedPolygonsAreaM2, 3000)
  assert.deepEqual(get().sim.wasser.groupConfig['osm_parking'], {
    from_surface: 'asphalt',
    to_surface:   'schotterrasen',
  })
})

test('toggleSimPolygon — entfernen', () => {
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 3000, label: 'P' })
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 3000, label: 'P' })
  assert.deepEqual(get().sim.selectedPolygons, [])
  assert.equal(get().sim.selectedPolygonsAreaM2, 0)
})

test('groupConfig persist bei zweitem Polygon gleichen Typs', () => {
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 3000, label: 'P1' })
  get().setSimWasserGroupSurface('osm_parking', 'to_surface', 'rasengitter')
  get().toggleSimPolygon({ idx: 1, type_key: 'osm_parking', area_m2: 2000, label: 'P2' })
  assert.equal(get().sim.wasser.groupConfig['osm_parking'].to_surface, 'rasengitter',
    'override darf nicht überschrieben werden')
})

test('groupConfig bereinigt wenn letztes Polygon eines Typs entfernt wird', () => {
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 3000, label: 'P' })
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 3000, label: 'P' })
  assert.equal('osm_parking' in get().sim.wasser.groupConfig, false)
})

test('Wohnbau-Default ist sickerpflaster', () => {
  get().toggleSimPolygon({ idx: 0, type_key: 'AX_Wohnbauflaeche', area_m2: 1000, label: 'W' })
  assert.equal(get().sim.wasser.groupConfig['AX_Wohnbauflaeche'].from_surface, 'sickerpflaster')
})

test('clearSimPolygons — Reset', () => {
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 3000, label: 'P' })
  get().setSimWasserFlaeche(500)
  get().clearSimPolygons()
  assert.deepEqual(get().sim.selectedPolygons, [])
  assert.equal(get().sim.selectedPolygonsAreaM2, 0)
  assert.equal(get().sim.wasser.flaeche_m2, 0)
  assert.deepEqual(get().sim.wasser.groupConfig, {})
})

test('flaeche-Kappung bei Polygon-Deselektion', () => {
  // 1 Parkplatz 10.000 m² × 0,95 = 9.500 sealable
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 10_000, label: 'P' })
  get().setSimWasserFlaeche(9_000)
  // Entfernen → sealable = 0 → flaeche muss gekappt sein
  get().toggleSimPolygon({ idx: 0, type_key: 'osm_parking', area_m2: 10_000, label: 'P' })
  assert.equal(get().sim.wasser.flaeche_m2, 0)
})

test('Tab-Wechsel: Selektionen unabhängig', () => {
  get().toggleSimCell(0)
  get().toggleSimPolygon({ idx: 5, type_key: 'osm_parking', area_m2: 1000, label: 'P' })
  assert.equal(get().sim.selectedCells.length, 1)
  assert.equal(get().sim.selectedPolygons.length, 1)
})

test('Sidebar-Toggle', () => {
  const initial = get().sidebarCollapsed
  get().toggleSidebar()
  assert.equal(get().sidebarCollapsed, !initial)
  get().toggleSidebar()
  assert.equal(get().sidebarCollapsed, initial)
})

console.log(`\n${passed} Tests grün`)
