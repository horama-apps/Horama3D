# Integrated lanyard tunnel

The `strap_anchor` module subtracts a visible U-shaped 3D cutter from an uploaded STL. It creates an internal cord passage without adding an exterior eyelet. The former two-surface-point workflow is replaced by direct manipulation of the cutter volume.

## Interaction

1. Load the STL and choose “Colocar cortador”. Click the part to align the cutter with that surface, facing into the object.
2. Use “Mover” and the axis arrows to translate the whole cutter, or “Girar” and the rotation rings to orient it. Ordinary dragging outside the controls still orbits the model. Position and rotation can also be entered numerically, in the original STL coordinate system.
3. Adjust passage diameter, spacing, depth and the sampled wall minimum at the bend. The blue U previews the volume to remove. Both ends must protrude outside the part.
4. Choose “Aplicar corte” to inspect the actual result, then download STL/3MF. Choosing a manipulation mode, changing dimensions or editing the pose restores the original model. Repeated cuts never accumulate. A new upload or reset clears the cutter placement.

## Geometry

`strapCutterGeometry.ts` defines the U centerline as two straight legs joined by a semicircular bend, with rounded capsule segments along that centerline. Preview and worker use the same points, diameter and XYZ rotation/translation. The cutter is an editor aid and is excluded from exports.

The center spacing minus the passage diameter must leave the requested bridge thickness. Depth must accommodate the bend radius; increasing spacing raises the minimum allowed depth. The tool rejects an enclosed cutter, a nonintersecting path, sampled centerline discontinuities across cavities, insufficient material around nine stations of the central bend, an empty result and newly detached components. Full spherical material envelopes are checked at those bend stations. These checks do not prove minimum thickness everywhere or mechanical strength; the openings, material and print orientation still require inspection and physical testing. The tool does not fill cavities or thicken caps.

Cutting, cleanup and STL export run in a dedicated Manifold Web Worker. The serialized STL must pass the closed-mesh check. If needed, the tool retries from the original solid with a bounded 0.005 mm simplification and repeats the checks. Cleanup is reported to the user. The uploaded file is never overwritten.

## Validation

Tests cover a continuous U passage, retained bridge, closer opening spacing, unchanged source geometry, arbitrary cutter placement, rotated closed STL export, surface alignment, malformed poses, nonintersecting/enclosed cutters, weak bridges and thin parts. The earlier point-based geometry tests remain as library regression coverage.

Browser checks use the real 351,614-triangle bottle STL: surface placement, translation arrows, rotation mode, numerical adjustment and actual generation. Export tests validate the downloaded STL and 3MF. The customer file is not committed to the repository.

The catalog image was generated from the original two-entry tunnel concept. Its prompt remains in `assets/module-thumbnails/strap-anchor-prompt.json`.
