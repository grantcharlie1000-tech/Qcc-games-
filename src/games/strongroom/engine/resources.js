// Imported client resources can be shared between scene objects and GLTF clones.
// A set per disposal pass prevents freeing a shared texture/material twice.
export function disposeObject(root, seen = new Set()) {
  const free = (resource) => {
    if (!resource || seen.has(resource)) return;
    seen.add(resource);
    resource.dispose?.();
  };
  root?.traverse?.((object) => {
    free(object.geometry);
    free(object.skeleton);
    if (object.isLight) free(object);
    for (const material of [object.material].flat()) {
      if (!material || seen.has(material)) continue;
      for (const value of Object.values(material)) if (value?.isTexture) free(value);
      for (const uniform of Object.values(material.uniforms || {})) if (uniform?.value?.isTexture) free(uniform.value);
      free(material);
    }
  });
  return seen;
}
