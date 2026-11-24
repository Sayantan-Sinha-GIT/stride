'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { decodePolyline, type LatLng } from '@stride/track-engine';
import { getClientApiBase } from '@/lib/api';
import { useTheme } from '../ThemeProvider';

export interface MapOverlayZone {
  lat: number;
  lng: number;
  radiusMeters: number;
  name?: string;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

interface StrideMapProps {
  encodedPolyline?: string;
  points?: LatLng[];
  secondaryPolyline?: string;
  replayProgress?: number; // 0..1 for animated route replay marker + progressive trail
  privacyZones?: MapOverlayZone[];
  heatmapPoints?: HeatmapPoint[];
  interactive?: boolean;
  lazy?: boolean;
  pitch?: number;
  heightClass?: string;
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}

interface MapConfigResponse {
  provider: string;
  attribution: string;
  lightStyleUrl: string;
  darkStyleUrl: string;
  fallbackLightStyleUrl?: string;
  fallbackDarkStyleUrl?: string;
}

let cachedMapConfig: MapConfigResponse | null = null;

function createCirclePolygon(lat: number, lng: number, radiusM: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: Array<[number, number]> = [];
  const steps = 48;
  const earthR = 6371008.8;
  const dLat = (radiusM / earthR) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    coords.push([lng + Math.cos(theta) * dLng, lat + Math.sin(theta) * dLat]);
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

export function StrideMap({
  encodedPolyline,
  points: propPoints,
  secondaryPolyline,
  replayProgress,
  privacyZones = [],
  heatmapPoints = [],
  interactive = true,
  lazy = false,
  pitch = 35,
  heightClass = 'h-[360px]',
  center,
  zoom = 13,
  onMapClick,
  className = '',
}: StrideMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const { resolvedTheme } = useTheme();
  const [shouldMount, setShouldMount] = useState(!lazy);
  const [mapReady, setMapReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  const routePoints = useMemo(() => {
    if (propPoints && propPoints.length > 0) return propPoints;
    if (encodedPolyline) return decodePolyline(encodedPolyline);
    return [];
  }, [propPoints, encodedPolyline]);

  const secondaryPoints = useMemo(() => {
    if (!secondaryPolyline) return [];
    return decodePolyline(secondaryPolyline);
  }, [secondaryPolyline]);

  const defaultCenter: [number, number] = useMemo(() => {
    if (center) return center;
    if (routePoints.length > 0) {
      const mid = routePoints[Math.floor(routePoints.length / 2)];
      return [mid.lng, mid.lat];
    }
    if (heatmapPoints.length > 0) {
      return [heatmapPoints[0].lng, heatmapPoints[0].lat];
    }
    return [77.5946, 12.9716];
  }, [center, routePoints, heatmapPoints]);

  useEffect(() => {
    if (!lazy || shouldMount) return;
    const host = hostRef.current;
    if (!host) {
      setShouldMount(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin: '360px' }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [lazy, shouldMount]);

  useEffect(() => {
    if (!shouldMount) return;
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function init() {
      if (!cachedMapConfig) {
        try {
          const res = await fetch(`${getClientApiBase()}/v1/maps/config`);
          if (res.ok) cachedMapConfig = (await res.json()) as MapConfigResponse;
        } catch {
          // ignore
        }
      }
      if (cancelled || !container) return;

      const styleUrl =
        resolvedTheme === 'light'
          ? cachedMapConfig?.lightStyleUrl || 'https://tiles.openfreemap.org/styles/positron'
          : cachedMapConfig?.darkStyleUrl || 'https://tiles.openfreemap.org/styles/dark';

      const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

      try {
        const map = new maplibregl.Map({
          container,
          style: styleUrl,
          center: defaultCenter,
          zoom,
          pitch,
          interactive,
          cooperativeGestures: isMobile && pitch > 0,
          attributionControl: false,
        });

        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        if (interactive) {
          map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
        }

        map.on('styleimagemissing', (e) => {
          if (!map.hasImage(e.id)) {
            map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
          }
        });

        map.on('error', () => {
          const fallback =
            resolvedTheme === 'light'
              ? 'https://tiles.openfreemap.org/styles/positron'
              : 'https://tiles.openfreemap.org/styles/dark';
          if (styleUrl !== fallback && mapRef.current) {
            try {
              mapRef.current.setStyle(fallback);
            } catch {
              // ignore
            }
          }
        });

        if (onMapClick) {
          map.on('click', (ev) => onMapClick(ev.lngLat.lat, ev.lngLat.lng));
        }

        map.on('load', () => {
          if (!cancelled) setMapReady(true);
        });

        mapRef.current = map;
      } catch {
        setWebglFailed(true);
      }
    }

    init();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [shouldMount, resolvedTheme, interactive, pitch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect A: Update static GeoJSON sources (route, secondary, privacy zones, heatmap) + fitBounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const accent = resolvedTheme === 'light' ? '#D1380E' : '#FF4D1C';

    const syncStaticLayers = () => {
      const fullCoords = routePoints.map((p) => [p.lng, p.lat]);
      const fullFeature: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features:
          fullCoords.length >= 2
            ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: fullCoords } }]
            : [],
      };

      const existingFull = map.getSource('stride-route') as maplibregl.GeoJSONSource | undefined;
      if (existingFull) {
        existingFull.setData(fullFeature);
        if (map.getLayer('stride-route-line')) {
          map.setPaintProperty('stride-route-line', 'line-opacity', replayProgress != null ? 0.3 : 0.95);
        }
      } else {
        map.addSource('stride-route', { type: 'geojson', data: fullFeature });
        map.addLayer({
          id: 'stride-route-casing',
          type: 'line',
          source: 'stride-route',
          paint: {
            'line-color': resolvedTheme === 'light' ? '#FFFFFF' : '#080B0F',
            'line-width': 7,
            'line-opacity': 0.75,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: 'stride-route-line',
          type: 'line',
          source: 'stride-route',
          paint: {
            'line-color': accent,
            'line-width': 4,
            'line-opacity': replayProgress != null ? 0.3 : 0.95,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }

      const secFeature: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features:
          secondaryPoints.length >= 2
            ? [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: secondaryPoints.map((p) => [p.lng, p.lat]),
                  },
                },
              ]
            : [],
      };
      const existingSec = map.getSource('stride-secondary') as maplibregl.GeoJSONSource | undefined;
      if (existingSec) {
        existingSec.setData(secFeature);
      } else {
        map.addSource('stride-secondary', { type: 'geojson', data: secFeature });
        map.addLayer({
          id: 'stride-secondary-line',
          type: 'line',
          source: 'stride-secondary',
          paint: { 'line-color': '#18B87A', 'line-width': 5, 'line-dasharray': [2, 1.5] },
        });
      }

      const zonesFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: privacyZones.map((z) => createCirclePolygon(z.lat, z.lng, z.radiusMeters)),
      };
      const existingZones = map.getSource('stride-zones') as maplibregl.GeoJSONSource | undefined;
      if (existingZones) {
        existingZones.setData(zonesFc);
      } else {
        map.addSource('stride-zones', { type: 'geojson', data: zonesFc });
        map.addLayer({
          id: 'stride-zones-fill',
          type: 'fill',
          source: 'stride-zones',
          paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.2 },
        });
        map.addLayer({
          id: 'stride-zones-stroke',
          type: 'line',
          source: 'stride-zones',
          paint: { 'line-color': '#F59E0B', 'line-width': 2 },
        });
      }

      const heatFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: heatmapPoints.map((h) => ({
          type: 'Feature',
          properties: { weight: h.weight },
          geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
        })),
      };
      const existingHeat = map.getSource('stride-heat') as maplibregl.GeoJSONSource | undefined;
      if (existingHeat) {
        existingHeat.setData(heatFc);
      } else {
        map.addSource('stride-heat', { type: 'geojson', data: heatFc });
        map.addLayer({
          id: 'stride-heat-layer',
          type: 'heatmap',
          source: 'stride-heat',
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 1, 0.2, 30, 1],
            'heatmap-intensity': 1.2,
            'heatmap-radius': 24,
            'heatmap-opacity': 0.85,
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(0,0,0,0)',
              0.2,
              'rgba(56,189,248,0.55)',
              0.5,
              'rgba(245,158,11,0.8)',
              0.85,
              'rgba(255,77,28,0.95)',
              1,
              '#ffffff',
            ],
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      syncStaticLayers();
    } else {
      map.once('styledata', syncStaticLayers);
    }

    if (routePoints.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      for (const p of routePoints) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 48, duration: 450, maxZoom: 15.5 });
    }
  }, [mapReady, routePoints, secondaryPoints, privacyZones, heatmapPoints, resolvedTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect B: Differential replay layer + moving beacon update only (never rebuilds static GeoJSON)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const accent = resolvedTheme === 'light' ? '#D1380E' : '#FF4D1C';

    const syncReplay = () => {
      const activeCount =
        replayProgress != null && routePoints.length >= 2
          ? Math.max(2, Math.round(replayProgress * routePoints.length))
          : 0;
      const replayFeature: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features:
          activeCount >= 2
            ? [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: routePoints.slice(0, activeCount).map((p) => [p.lng, p.lat]),
                  },
                },
              ]
            : [],
      };
      const existingReplay = map.getSource('stride-replay') as maplibregl.GeoJSONSource | undefined;
      if (existingReplay) {
        existingReplay.setData(replayFeature);
      } else {
        map.addSource('stride-replay', { type: 'geojson', data: replayFeature });
        map.addLayer({
          id: 'stride-replay-line',
          type: 'line',
          source: 'stride-replay',
          paint: { 'line-color': accent, 'line-width': 5 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }

      if (replayProgress != null && routePoints.length >= 2) {
        const idx = Math.min(
          routePoints.length - 1,
          Math.max(0, Math.floor(replayProgress * (routePoints.length - 1)))
        );
        const pt = routePoints[idx];
        if (!markerRef.current) {
          const el = document.createElement('div');
          el.className = 'w-4 h-4 rounded-full border-2 border-white shadow-lg';
          el.style.backgroundColor = accent;
          markerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([pt.lng, pt.lat])
            .addTo(map);
        } else {
          markerRef.current.setLngLat([pt.lng, pt.lat]);
        }
      } else {
        markerRef.current?.remove();
        markerRef.current = null;
      }
    };

    if (map.isStyleLoaded()) {
      syncReplay();
    } else {
      map.once('styledata', syncReplay);
    }
  }, [mapReady, routePoints, replayProgress, resolvedTheme]);

  if (webglFailed) {
    return (
      <div
        className={`stride-card relative flex items-center justify-center overflow-hidden ${heightClass} ${className}`}
      >
        <div className="text-center text-sm text-[var(--stride-text-secondary)]">
          Vector map fallback ({routePoints.length} track points loaded)
        </div>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={`relative overflow-hidden rounded-[var(--stride-radius-md)] border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] ${heightClass} ${className}`}
    >
      {shouldMount ? (
        <div ref={containerRef} className="h-full w-full" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-[var(--stride-text-muted)]">
          Loading interactive telemetry map...
        </div>
      )}
    </div>
  );
}
