import * as THREE from 'three';

/** Shared geometry + cached PBR materials = very few unique GPU resources (mid-phone friendly). */
export const BOX = new THREE.BoxGeometry(1, 1, 1);

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** Matte painted / fabric / skin surface. (Name kept from the old toon look so every scene picks up the upgrade.) */
export function toon(color: string, emissive?: string) {
  const key = color + '|' + (emissive ?? '');
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: 0.78, metalness: 0.04,
      emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1 : 0,
    });
    cache.set(key, m);
  }
  return m;
}

const paintCache = new Map<string, THREE.MeshStandardMaterial>();
/** Glossy metallic car paint: picks up sky reflections from the environment map. */
export function paint(color: string) {
  let m = paintCache.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.6, envMapIntensity: 1.4 }); paintCache.set(color, m); }
  return m;
}

const basicCache = new Map<string, THREE.MeshBasicMaterial>();
export function glow(color: string) {
  let m = basicCache.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, toneMapped: false }); basicCache.set(color, m); }
  return m;
}
