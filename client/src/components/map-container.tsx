import { useEffect, useRef } from "react";
import L from "leaflet";
// Leaflet finds its default marker images by guessing a path from the URL its
// stylesheet was loaded from. That guess only works for a CDN copy; now that
// the stylesheet is bundled, the images have to be wired up explicitly or the
// markers render as broken images.
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { MultiPolygon } from "geojson";
import type { AttractionPoint, Zone } from "@shared/schema";
import type { IsochroneFeature } from "@/lib/geo-types";
import { cn } from "@/lib/utils";

const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Puts the Russian name first on every label that has one.
 *
 * The style ships bilingual labels with the latin form first, which reads as a
 * foreign map to the people this is for: "Balashikha / Балашиха". Each label
 * layer is rewritten to prefer `name:ru`, falling back to whatever the feature
 * does have, so places without a Russian name still get a label rather than a
 * blank.
 */
function preferRussianLabels(map: MapLibreMap): void {
  const russianFirst: ExpressionSpecification = [
    "coalesce",
    ["get", "name:ru"],
    ["get", "name"],
    "",
  ];
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol") continue;
    // Not every symbol layer carries text — icon-only layers have no field,
    // and setting one on them would print labels the style never intended.
    if (!map.getLayoutProperty(layer.id, "text-field")) continue;
    map.setLayoutProperty(layer.id, "text-field", russianFirst);
  }
}

/**
 * Pulls in the vector rendering engine and the Leaflet bridge.
 *
 * MapLibre does its tile decoding in a web worker, which it starts from a URL
 * it works out at runtime. That guess does not survive bundling — the built
 * app got "Worker failed to load" and an empty map — so the worker is imported
 * as an asset of its own and handed over explicitly.
 */
async function loadVectorBasemap(): Promise<void> {
  const [maplibregl, { default: workerUrl }] = await Promise.all([
    import("maplibre-gl"),
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("@maplibre/maplibre-gl-leaflet"),
  ]);
  maplibregl.setWorkerUrl(workerUrl);
}

L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
});

interface MapContainerProps {
  attractionPoints: AttractionPoint[];
  zones: Zone[];
  isochrones?: IsochroneFeature[];
  optimalArea?: MultiPolygon | null;
  onMapClick: (lat: number, lng: number) => void;
  onDeletePoint?: (id: number) => void;
  selectedPoint?: {lat: number, lng: number} | null;
  className?: string;
}

export function MapContainer({ attractionPoints, zones, isochrones = [], optimalArea = null, onMapClick, onDeletePoint, selectedPoint, className }: MapContainerProps) {
  // Kept in a ref so marker rebuilding doesn't depend on callback identity.
  const onDeletePointRef = useRef(onDeletePoint);
  onDeletePointRef.current = onDeletePoint;
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const zonesRef = useRef<L.Circle[]>([]);
  const geoLayersRef = useRef<L.GeoJSON[]>([]);
  const selectedMarkerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Moscow center coordinates
    // Default zoom buttons sit top-left, hidden under the header and panel —
    // move them to the top-right (CSS pushes them below the header).
    mapRef.current = L.map(mapContainerRef.current, { zoomControl: false })
      .setView([55.7558, 37.6176], 11);
    L.control.zoom({ position: "topright" }).addTo(mapRef.current);
    // Drop Leaflet's own prefix (it carries a flag icon). The OpenStreetMap
    // credit below stays — it is required by the map data licence.
    mapRef.current.attributionControl.setPrefix(false);

    // Basemap.
    //
    // Default: OpenFreeMap's vector "liberty" style — no API key, no account,
    // commercial use allowed, and vector, so it stays sharp at every zoom
    // instead of going blurry between tile levels.
    //
    // Setting VITE_MAP_TILE_URL switches to plain raster tiles from that URL
    // instead, which is the way back to OpenStreetMap (or to a keyed provider)
    // if the vector host ever becomes unreachable. VITE_MAP_ATTRIBUTION goes
    // with it; the credit is a licence condition, not decoration.
    const rasterUrl = import.meta.env.VITE_MAP_TILE_URL;
    let cancelled = false;

    if (rasterUrl) {
      L.tileLayer(rasterUrl, {
        attribution:
          import.meta.env.VITE_MAP_ATTRIBUTION || '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);
    } else {
      // Loaded on demand: the rendering engine is larger than the rest of the
      // app put together, and fetching it up front would hold up the first
      // paint of everything else.
      void loadVectorBasemap().then(() => {
        const map = mapRef.current;
        if (cancelled || !map) return;
        const layer = L.maplibreGL({ style: VECTOR_STYLE_URL }).addTo(map);
        // The credit is carried in the style and surfaced by the bridge, so
        // adding it here too printed it twice.
        const gl = layer.getMaplibreMap();
        gl.on("load", () => preferRussianLabels(gl));
      });
    }

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Убираем onMapClick из зависимостей

  // Separate effect for handling map clicks  
  useEffect(() => {
    if (!mapRef.current) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
      
      // Simple zoom without excessive animations
      const currentZoom = mapRef.current?.getZoom() || 11;
      const targetZoom = Math.max(currentZoom, 15);
      
      if (mapRef.current && currentZoom < 15) {
        mapRef.current.setView([e.latlng.lat, e.latlng.lng], targetZoom);
      }
    };

    mapRef.current.on('click', handleMapClick);

    return () => {
      mapRef.current?.off('click', handleMapClick);
    };
  }, [onMapClick]);

  // Update markers when attraction points change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => {
      mapRef.current?.removeLayer(marker);
    });
    markersRef.current = [];

    // Add new markers
    attractionPoints.forEach(point => {
      if (!mapRef.current) return;

      const typeEmojis: Record<string, string> = {
        'home': '🏠',
        'work': '🏢',
        'study': '🎓',
        'fitness': '💪',
        'hobby': '🎨',
        'family': '👨‍👩‍👧‍👦',
        'shopping': '🛍️',
        'other': '📍'
      };

      const typeNames: Record<string, string> = {
        'home': 'Дом',
        'work': 'Работа',
        'study': 'Учёба',
        'fitness': 'Фитнес',
        'hobby': 'Хобби',
        'family': 'Семья',
        'shopping': 'Покупки',
        'other': 'Другое'
      };

      const transportEmojis: Record<string, string> = {
        'public_transport': '🚇',
        'driving': '🚗',
        'walking': '🚶'
      };

      const emoji = typeEmojis[point.type] ?? '📍';
      const typeName = typeNames[point.type] ?? point.type;
      const arrival = String(point.arrivalHour).padStart(2, '0');
      const transportEmoji = transportEmojis[point.transport] ?? '🚇';

      const marker = L.marker([point.latitude, point.longitude]).addTo(mapRef.current);

      // Hover tooltip with the key parameters, so the user doesn't have to
      // remember what they set for each point.
      const tooltipContent = `
        <div style="font-weight:600">${emoji} ${typeName}</div>
        <div style="font-size:12px;color:#475569">${transportEmoji} до ${point.travelTimeMinutes} мин · к ${arrival}:00</div>
      `;
      marker.bindTooltip(tooltipContent, { direction: "top", offset: [0, -12] });

      // Popup with the point details and a delete action.
      const popupEl = document.createElement("div");
      popupEl.style.minWidth = "180px";
      const info = document.createElement("div");
      info.innerHTML = `
        <div style="font-weight:600">${emoji} ${typeName}</div>
        <div style="font-size:13px;color:#475569;margin-top:2px">${point.address}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">
          ${transportEmoji} до ${point.travelTimeMinutes} мин · к ${arrival}:00
        </div>
      `;
      popupEl.appendChild(info);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "Удалить это место";
      deleteBtn.style.cssText =
        "margin-top:8px;width:100%;padding:6px 8px;border:1px solid #fecaca;background:#fef2f2;" +
        "color:#dc2626;border-radius:6px;font-size:13px;cursor:pointer";
      deleteBtn.onclick = () => {
        mapRef.current?.closePopup();
        onDeletePointRef.current?.(point.id);
      };
      popupEl.appendChild(deleteBtn);

      marker.bindPopup(popupEl);
      markersRef.current.push(marker);
    });
  }, [attractionPoints]);

  // Update zones when zones change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing zones
    zonesRef.current.forEach(zone => {
      mapRef.current?.removeLayer(zone);
    });
    zonesRef.current = [];

    // Add new zones
    zones.forEach(zone => {
      if (!mapRef.current) return;

      const zoneColors: Record<string, {color: string, fillColor: string, fillOpacity: number}> = {
        'ideal': { color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.3 },
        'good': { color: '#10B981', fillColor: '#10B981', fillOpacity: 0.2 },
        'far': { color: '#EF4444', fillColor: '#EF4444', fillOpacity: 0.1 }
      };

      const zoneStyle = zoneColors[zone.zoneType] || zoneColors.far;

      const circle = L.circle([zone.centerLatitude, zone.centerLongitude], {
        radius: zone.radiusMeters,
        ...zoneStyle,
        weight: zone.zoneType === 'ideal' ? 2 : zone.zoneType === 'good' ? 2 : 1
      }).addTo(mapRef.current);

      zonesRef.current.push(circle);
    });
  }, [zones]);

  // Update isochrones (real travel-time areas) and the optimal intersection.
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing geo layers
    geoLayersRef.current.forEach((layer) => {
      mapRef.current?.removeLayer(layer);
    });
    geoLayersRef.current = [];

    // Draw each point's reachability area as a thin outline
    isochrones.forEach((iso) => {
      if (!mapRef.current) return;
      const layer = L.geoJSON(iso.geometry, {
        // Let clicks pass through to the map so a point can be added inside
        // a zone.
        interactive: false,
        style: {
          color: "#2563EB",
          weight: 2,
          opacity: 0.9,
          fillColor: "#3B82F6",
          fillOpacity: 0.18,
        },
      }).addTo(mapRef.current);
      geoLayersRef.current.push(layer);
    });

    // Draw the optimal area (intersection of all isochrones) filled in green
    if (optimalArea) {
      const layer = L.geoJSON(optimalArea, {
        // Non-interactive so the user can click inside the green zone to add
        // a place there (the popup used to swallow those clicks).
        interactive: false,
        style: {
          color: "#059669",
          weight: 2,
          opacity: 0.9,
          fillColor: "#10B981",
          fillOpacity: 0.3,
        },
      }).addTo(mapRef.current);
      geoLayersRef.current.push(layer);
    }

    // Zoom the map to fit whatever was drawn (green area, or the blue zones
    // when there is no common area).
    if (geoLayersRef.current.length > 0) {
      try {
        const group = L.featureGroup(geoLayersRef.current);
        mapRef.current.fitBounds(group.getBounds(), { padding: [40, 40] });
      } catch {
        // ignore if bounds are invalid
      }
    }
  }, [isochrones, optimalArea]);

  // Update selected point marker and zoom
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove existing selected marker
    if (selectedMarkerRef.current) {
      mapRef.current.removeLayer(selectedMarkerRef.current);
      selectedMarkerRef.current = null;
    }

    // Add new selected marker if point is selected
    if (selectedPoint) {
      // Zoom to selected point
      console.log('Zooming to selected point:', selectedPoint);
      
      // Smooth zoom to selected point
      setTimeout(() => {
        if (mapRef.current) {
          console.log('Applying zoom...');
          const currentZoom = mapRef.current.getZoom();
          const targetZoom = Math.max(currentZoom, 15); // Сохраняем текущий зум если он больше 15
          
          // Use flyTo for smooth animation
          try {
            mapRef.current.flyTo([selectedPoint.lat, selectedPoint.lng], targetZoom, {
              duration: 2.0, // Плавная анимация 2 секунды
              easeLinearity: 0.1
            });
          } catch (error) {
            // Fallback to instant view
            mapRef.current.setView([selectedPoint.lat, selectedPoint.lng], targetZoom);
          }
          mapRef.current.invalidateSize(); // Force map refresh
        }
      }, 100);
      // Create custom orange icon for selected point
      const orangeIcon = L.divIcon({
        className: 'selected-point-marker',
        html: `
          <div style="
            width: 20px;
            height: 20px;
            background: #F97316;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            animation: pulse 2s infinite;
          "></div>
          <style>
            @keyframes pulse {
              0% { transform: scale(1); }
              50% { transform: scale(1.2); }
              100% { transform: scale(1); }
            }
          </style>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      selectedMarkerRef.current = L.marker([selectedPoint.lat, selectedPoint.lng], {
        icon: orangeIcon,
        zIndexOffset: 1000
      }).addTo(mapRef.current);

      // Add popup with coordinates
      selectedMarkerRef.current.bindPopup(`
        <div class="p-2">
          <div class="font-medium text-orange-600">📍 Выбранная точка</div>
          <div class="text-sm text-slate-600 mt-1">
            ${selectedPoint.lat.toFixed(4)}, ${selectedPoint.lng.toFixed(4)}
          </div>
          <div class="text-xs text-slate-500 mt-1">
            Нажмите "Добавить точку" чтобы сохранить
          </div>
        </div>
      `);
    }
  }, [selectedPoint]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div 
      ref={mapContainerRef}
      className={cn("h-full w-full", className)}
    />
  );
}
