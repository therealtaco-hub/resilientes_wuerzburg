# -*- coding: utf-8 -*-
"""
Google Earth Engine export of the Landsat land surface temperature (LST) rasters
used by the app (backend/data/lst_wue_2023_2025_summer_median.tif).

Summer (June–August) median of Landsat 8 + 9 Collection 2 Level-2, cloud- and
saturation-masked; bands: 1 = LST in °C, 2 = NDVI, 3 = NDBI. Exported as GeoTIFF
in EPSG:3035 at 100 m, snapped to the Destatis census grid.

Requirements: a Google Earth Engine account and `pip install earthengine-api`
(not part of backend/requirements.txt). Originally run in Google Colab.
Set PROJECT_ID to your own Google Cloud project; exports go to Google Drive.
For another city, replace the bounding box below.
"""

import ee

PROJECT_ID = "your-gcp-project-id"

ee.Authenticate()
ee.Initialize(project=PROJECT_ID)

# Würzburg Bounding Box (WGS84)
wuerzburg = ee.Geometry.BBox(9.8665, 49.7076, 10.0195, 49.8488)

# Landsat 8 + 9 Collections (Collection 2, Level 2, Tier 1)
l8_col = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
l9_col = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")
merged_collection = l8_col.merge(l9_col)


def mask_and_scale_landsat(image: ee.Image) -> ee.Image:
    """
    Maskiert Wolken, Schatten, Fill- und Sättigungspixel mit QA_PIXEL/QA_RADSAT
    und skaliert ST_B10 (Kelvin) sowie SR_B*-Bänder (Reflektanz).
    """

    # QA-Bänder
    qa_pixel = image.select("QA_PIXEL")
    qa_radsat = image.select("QA_RADSAT")

    # Bits 0–4 (Fill, Dilated Cloud, Cirrus, Cloud, Cloud Shadow) = 0
    # -> pixel ist gültig, wenn diese Bits alle 0 sind
    qa_mask = qa_pixel.bitwiseAnd(int("11111", 2)).eq(0)

    # Keine gesättigten Pixel
    sat_mask = qa_radsat.eq(0)

    # Oberflächen-Temperatur ST_B10 (Kelvin)
    # ST = DN * 0.00341802 + 149.0  (USGS)
    st_kelvin = image.select("ST_B10").multiply(0.00341802).add(149.0)

    # Optionale Skala für Oberflächenreflektanz SR_B* (falls du NDVI/NDBI ableiten willst)
    # Reflektanz = DN * 0.0000275 - 0.2 (USGS)
    sr = image.select("SR_B.*").multiply(0.0000275).add(-0.2)

    return (
        image.addBands(sr, None, True)
             .addBands(st_kelvin.rename("ST_B10"), None, True)
             .updateMask(qa_mask)
             .updateMask(sat_mask)
    )


def add_indices(image: ee.Image) -> ee.Image:
    """
    Fügt NDVI und NDBI hinzu (optional, aber praktisch für spätere Analysen).
    """
    # NDVI: (NIR - RED) / (NIR + RED)  -> SR_B5, SR_B4 bei Landsat 8/9
    ndvi = image.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI")

    # Beispiel NDBI: (SWIR - NIR) / (SWIR + NIR) -> SR_B6, SR_B5
    ndbi = image.normalizedDifference(["SR_B6", "SR_B5"]).rename("NDBI")

    return image.addBands([ndvi, ndbi])


def build_summer_collection(start_date: str, end_date: str) -> ee.ImageCollection:
    """
    Baut eine Sommer-Collection (Juni–August) für den angegebenen Zeitraum
    mit QA-Maske, Skalierung und NDVI/NDBI.
    """
    return (
        merged_collection
        .filterBounds(wuerzburg)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.calendarRange(6, 8, "month"))  # Juni–August
        .map(mask_and_scale_landsat)
        .map(add_indices)
    )


def export_summer_lst(start_date: str, end_date: str,
                      description: str, prefix: str) -> None:
    """
    Exportiert den Median der sommerlichen LST (Celsius) inkl. NDVI/NDBI-Bändern
    als Cloud-optimiertes GeoTIFF nach Google Drive, exakt auf 100m-EPSG:3035
    (Zensus-Gitter) gesnappt.
    """
    collection = build_summer_collection(start_date, end_date)

    # Median-LST in Kelvin
    lst_kelvin = collection.select("ST_B10").median()

    # Kelvin -> Celsius
    lst_celsius = lst_kelvin.subtract(273.15).rename("LST_C")

    # Median auch für NDVI & NDBI
    ndvi_median = collection.select("NDVI").median()
    ndbi_median = collection.select("NDBI").median()

    export_image = lst_celsius.addBands([ndvi_median, ndbi_median]).toFloat()

    task = ee.batch.Export.image.toDrive(
        image=export_image,
        description=description,
        folder="resilientes_wuerzburg",
        fileNamePrefix=prefix,
        region=wuerzburg,  # deine WGS84-BBox; wird nach EPSG:3035 reprojiziert
        # WICHTIG: anstatt scale -> crs + crsTransform für das Zensus-Gitter
        crs="EPSG:3035",
        crsTransform=[100, 0, 4_300_000, 0, -100, 2_985_000],
        fileFormat="GeoTIFF",
        formatOptions={"cloudOptimized": True},
        maxPixels=1e9,
    )
    task.start()
    print(f"Task gestartet: {task.id} ({description})")

# --- KONKRETE EXPORTS ---

# 1) Sommer 2023
export_summer_lst(
    start_date="2023-01-01",
    end_date="2023-12-31",
    description="lst_wuerzburg_2023_summer_median",
    prefix="lst_wue_2023_summer_median"
)

# 2) Sommer 2024
export_summer_lst(
    start_date="2024-01-01",
    end_date="2024-12-31",
    description="lst_wuerzburg_2024_summer_median",
    prefix="lst_wue_2024_summer_median"
)

# 3) Sommer 2025
export_summer_lst(
    start_date="2025-01-01",
    end_date="2025-12-31",
    description="lst_wuerzburg_2025_summer_median",
    prefix="lst_wue_2025_summer_median"
)

# 4) Sommer-Multi-Jahr 2023–2025 (dein Hauptdatensatz für die Baum-Korrelation)
export_summer_lst(
    start_date="2023-01-01",
    end_date="2025-12-31",
    description="lst_wuerzburg_2023_2025_summer_median",
    prefix="lst_wue_2023_2025_summer_median"
)
