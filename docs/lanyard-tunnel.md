# Integrated lanyard tunnel

The `strap_anchor` module is an STL tool. It removes a continuous rounded channel connecting two surface points without adding an exterior eyelet. It can use adjacent faces at a corner or a shared face with sufficient material.

## Interaction

1. Load the closed STL to modify.
2. Activate opening 1, then click the mesh. Repeat for opening 2. Cancel placement with “Girar modelo” to orbit freely between selections.
3. Drag the blue/orange surface handles for fine placement. Coordinates are in the original STL frame, in millimeters.
4. Adjust passage diameter (1.5–8 mm) and minimum surrounding material (1–6 mm).
5. Generate, inspect and export STL/3MF. Position edits restore the original mesh, so repeated generations never accumulate holes. Uploading another file clears the stored openings.

## Geometry

A cubic Bézier path starts and ends normal to the chosen surfaces. Rounded capsule segments form the subtractive tool. This library is independent of the UI and reusable by other modules. Cutting, validation and STL export run in a dedicated Manifold Web Worker. Sub-0.0001 mm Boolean slivers are simplified before float32 serialization; the serialized STL is checked again for watertightness before being returned. If that round trip is not closed, the tool retries from the original solid with a bounded 0.005 mm simplification, then repeats all geometry checks and validates the serialized STL again. This resolves near-degenerate source surfaces and float32 export slivers without accepting an open result. Cleanup is reported to the user; the uploaded file is never overwritten.

The original coordinate system is retained. Both endpoints must match exterior surfaces. Openings too close together, a path outside the local object, insufficient material around nine sampled interior stations, an empty result and newly detached components are rejected. Nine interior stations use full spherical material envelopes, not just a check of the centerline.

These are geometric checks, not a strength calculation or a proof that every location along the channel has the requested wall thickness. Geometry near the openings, material, print orientation, layer bonding and service loads still require inspection in the slicer and a physical trial. Hollow or thin caps may not have enough material for this subtraction-only tool; it does not automatically fill cavities or thicken a functional cap.

## Validation

Unit tests cover a continuous two-entry corner tunnel, closed connected output, rejection of a thin slab, unchanged source geometry on failure, entry separation, invalid surface positions, a shared-face route and nonzero source coordinates.

A binary STL round-trip test checks closed output for both exact and ray-picked floating-point endpoint coordinates.

Browser checks exercise real surface clicks, dragging, regeneration, original-mesh restoration, STL/3MF downloads and mobile layout. A real 351,614-triangle bottle STL with source slivers reproduced an export rejection; the recovery path produces a closed STL with two 2.5 mm openings on its cap, retaining a 1.2 mm sampled wall minimum. The customer file is not checked into the repository.

The catalog image was generated with the built-in image tool from a rendered result of this actual cutter. Its full prompt is saved in `assets/module-thumbnails/strap-anchor-prompt.json`.
