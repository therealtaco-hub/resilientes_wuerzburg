# Datenquellen und Lizenzen (`backend/data/`)

Die Dateien in diesem Ordner stammen aus offenen Datenquellen oder sind daraus abgeleitet (Parquet-Caches). Sie unterliegen den Lizenzen der jeweiligen Quelle, **nicht** der MIT-Lizenz des Codes.

| Datei | Quelle | Lizenz | Namensnennung |
|---|---|---|---|
| `lst_wue_2023_2025_summer_median.tif` | Landsat 8/9 Collection 2 Level-2 (USGS), Sommer-Median 2023–2025, verarbeitet in Google Earth Engine | Public Domain | Landsat-Daten: U.S. Geological Survey (USGS) |
| `lst.parquet` (abgeleitet) | wie oben; enthält zusätzlich aus Baumkataster, ATKIS und OSM abgeleitete Kennzahlen je Zelle | wie die jeweiligen Quellen | siehe Zeilen der Quellen |
| `zensus.parquet` (abgeleitet) | Zensus 2022, 100-m-Gitter (Alter, Einwohner) | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0) | © Statistisches Bundesamt (Destatis), Zensus 2022 |
| `baumkataster_stadt_wuerzburg.parquet`, `trees.parquet` (abgeleitet) | Baumkataster Stadt Würzburg, [opendata.wuerzburg.de](https://opendata.wuerzburg.de) | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0) | Stadt Würzburg, Fachabteilung Gartenamt |
| `stadtbezirke.parquet` | Stadtbezirke Würzburg, [opendata.wuerzburg.de](https://opendata.wuerzburg.de) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Stadt Würzburg – Fachbereich Tiefbau und Verkehrswesen / Geodaten und Vermessung |
| `entsiegelung.parquet` (abgeleitet) | ATKIS Basis-DLM Bayern (`sie02_f`, `ver01_f`) und OpenStreetMap (Parkplätze, Plätze, Flachdächer) | ATKIS: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); OSM-Anteile: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | Datenquelle: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de; © OpenStreetMap contributors |
| `dwd_wuerzburg_monthly_kl_hist.zip` | DWD Climate Data Center, Station Würzburg (05705) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Deutscher Wetterdienst (DWD) |

**OpenStreetMap:** Die OSM-Anteile in `entsiegelung.parquet` (Features mit `source = "osm"`) stehen unter der Open Database License (ODbL 1.0), siehe [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright).

Nicht im Repository (zu groß, siehe `.gitignore`): ATKIS-Rohdaten (`bkg_shape_712.zip`) und die Zensus-CSV-Dateien. Sie werden nur zum Neuaufbau der Caches benötigt.
