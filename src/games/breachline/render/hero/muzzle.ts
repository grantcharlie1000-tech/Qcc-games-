/** Where the held weapon's muzzle is, for the flash in the viewmodel and for tracers in the world. The viewmodel has its
 * own camera (its own field of view), so a point on the held gun is carried to the world through the screen: the same
 * screen position, at the same distance from the eye. */
import * as THREE from 'three';

/** The flash point in the viewmodel's space: the muzzle socket, 1.5 cm ahead, through the gun's current pose. */
export function muzzleInView(gun: THREE.Object3D, socket: readonly [number, number, number], out: THREE.Vector3): THREE.Vector3 {
  gun.updateWorldMatrix(true, false);
  return out.set(socket[0], socket[1], socket[2] - 0.015).applyMatrix4(gun.matrixWorld);
}

const ndc = new THREE.Vector3(), eye = new THREE.Vector3();
/** A point in the viewmodel camera's space (camera at the origin looking down -Z) to the world point the player sees
 * there: same screen position through `world`, same distance from the eye. */
export function viewToWorld(p: THREE.Vector3, view: THREE.PerspectiveCamera, world: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
  const d = p.length();
  view.updateProjectionMatrix();
  ndc.copy(p).applyMatrix4(view.projectionMatrix);
  world.updateMatrixWorld(true);
  world.getWorldPosition(eye);
  return out.set(ndc.x, ndc.y, 0.5).unproject(world).sub(eye).normalize().multiplyScalar(d).add(eye);
}
