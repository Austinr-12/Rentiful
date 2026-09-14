"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAppSelector } from "@/state/redux";
import { PropertyWithLocation, useGetPropertiesQuery } from "@/state/api";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN as string;

const MAP_STYLE = "mapbox://styles/austin-12/cmjbtjo2i000x01qtgae3dx4y";
const DEFAULT_ZOOM = 9;

/**
 * Builds the popup with DOM APIs instead of an HTML string so a property
 * name containing markup is rendered as text, not executed.
 */
const createPropertyMarker = (
  property: PropertyWithLocation,
  map: mapboxgl.Map
): mapboxgl.Marker => {
  const { longitude, latitude } = property.location.coordinates;

  const link = document.createElement("a");
  link.href = `/search/${property.id}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "marker-popup-title";
  link.textContent = property.name;

  const unit = document.createElement("span");
  unit.className = "marker-popup-price-unit";
  unit.textContent = " / month";

  const price = document.createElement("p");
  price.className = "marker-popup-price";
  price.textContent = `$${property.pricePerMonth.toLocaleString()}`;
  price.appendChild(unit);

  const body = document.createElement("div");
  body.append(link, price);

  const image = document.createElement("div");
  image.className = "marker-popup-image";

  const content = document.createElement("div");
  content.className = "marker-popup";
  content.append(image, body);

  return new mapboxgl.Marker({ color: "#000000" })
    .setLngLat([longitude, latitude])
    .setPopup(new mapboxgl.Popup({ offset: 25 }).setDOMContent(content))
    .addTo(map);
};

const PropertyMap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const filters = useAppSelector((state) => state.global.filters);
  const [lng, lat] = filters.coordinates;
  const { data: properties, isLoading, isError } = useGetPropertiesQuery(filters);

  // Create the map once and keep it alive across filter changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new mapboxgl.Map({
      container,
      style: MAP_STYLE,
      center: [lng, lat],
      zoom: DEFAULT_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    // The filters panel animates its width; keep the canvas in sync.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter when the searched location changes.
  useEffect(() => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: DEFAULT_ZOOM, essential: true });
  }, [lng, lat]);

  // Replace markers whenever the result set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !properties) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = properties.map((property) =>
      createPropertyMarker(property, map)
    );
  }, [properties]);

  return (
    <div className="basis-5/12 grow relative rounded-xl overflow-hidden">
      <div ref={containerRef} className="map-container h-full w-full" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm">
          Loading map…
        </div>
      )}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-red-600">
          Failed to fetch properties
        </div>
      )}
    </div>
  );
};

export default PropertyMap;
