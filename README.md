# Horama3D Configurator

Web configurator for loading STL files, applying product-specific transformations, previewing the result in 3D, and exporting printable models.

## Current features

- Local STL validation and interactive Three.js preview.
- Browser-local generators isolated in workers for lamps, urns, clickers, and textures.
- Local image-to-layers generation with palette reduction, printable backfill sheets, frames, and colored 3MF export.
- Local creators for signs, commercial keychains, pet tags, and Bracelet Gems.
- Configurable tip jars with standard and premium dimensions, removable lids,
  raised branding, scannable QR geometry, and NFC placement markers.
- WiFi QR signs with configurable network credentials, security, dimensions,
  raised typography, and scan-ready connection payloads.
- Universal QR signs for menus, payments, reviews, contact links, and social media.
- Modular business signage with presets, icons, countertop or wall supports,
  and optional double-sided text.
- Business-card holders, menu holders, and small branded decorations.
- Coordinated exports for the Shopify Kit QR, Esencial, Presencia, and
  Experiencia packages. Every printable color/component is included as an
  independent STL inside the downloaded ZIP.
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
