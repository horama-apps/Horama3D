# Horama3D Configurator

Web configurator for loading STL files, applying product-specific transformations, previewing the result in 3D, and exporting printable models.

## Current features

- Local STL validation and interactive Three.js preview.
- Browser-local generators isolated in workers for lamps, urns, clickers, and textures.
- Local image-to-layers generation with palette reduction, printable backfill sheets, frames, and colored 3MF export.
- Local creators for signs and Bracelet Gems.
- Configurable tip jars with standard and premium dimensions, removable lids,
  raised branding, scannable QR geometry, and NFC placement markers.
- Urn generation with a silhouette cavity, lid-rest ring, pressure lid, and four retaining ribs.
- STL, ZIP, and 3MF exports without a generation backend.

## Local development

```sh
npm install
npm run dev
```

## Usage

1. Start the development server.
2. Open the Vite URL.
3. Select a product module.
4. Load a valid STL or reduced-color image when the module requires one.
5. Configure the parameters and generate the model locally.
6. Inspect and export the resulting parts.

Signs use Three.js `*.typeface.json` font files. Additional fonts can be placed under `public/fonts` and added to the sign font catalog without their extension.
