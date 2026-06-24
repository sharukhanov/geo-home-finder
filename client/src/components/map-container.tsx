import { useEffect, useRef } from "react";
import L from "leaflet";
import type { AttractionPoint, Zone } from "@shared/schema";
import { cn } from "@/lib/utils";

interface MapContainerProps {
  attractionPoints: AttractionPoint[];
  zones: Zone[];
  onMapClick: (lat: number, lng: number) => void;
  selectedPoint?: {lat: number, lng: number} | null;
  className?: string;
}

export function MapContainer({ attractionPoints, zones, onMapClick, selectedPoint, className }: MapContainerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const zonesRef = useRef<L.Circle[]>([]);
  const selectedMarkerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Moscow center coordinates
    mapRef.current = L.map(mapContainerRef.current).setView([55.7558, 37.6176], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapRef.current);

    return () => {
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

      const marker = L.marker([point.latitude, point.longitude]).addTo(mapRef.current);
      
      const popupContent = `
        <div class="p-2">
          <div class="font-medium">${typeEmojis[point.type]} ${point.name}</div>
          <div class="text-sm text-slate-600 mt-1">${point.address}</div>
          <div class="text-xs text-slate-500 mt-1">
            Время в пути: ${point.travelTimeMinutes} мин
          </div>
        </div>
      `;
      
      marker.bindPopup(popupContent);
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
      style={{ minHeight: '100vh' }}
    />
  );
}
