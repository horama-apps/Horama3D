# Horama3D STP Configurator

Prototype web UI for STP product workflows: a local STL loader paired with a live 3D viewer, product-specific parameter panels, and a small API adapter for future generated model artifacts.

## Current Features

- Load a local `.stl` file from the left panel.
- Inspect the STL in a three.js viewer with orbit controls, lighting, grid, and auto-framing.
- Switch between product families such as urns and clickers.
- Adjust product-specific parameters while keeping the uploaded STL visible.
- Download the currently loaded STL.

## Direction

- Keep one shared configurator shell for every product family.
- Add one product module per STP case: urns, clickers, and future workflows.
- Connect product parameters to the STP API when the backend contract is finalized.
- Load generated STL/3MF/GLB artifacts back into the same viewer.

## Local Development

```sh
npm install
npm run dev
```

Set `VITE_STP_API_BASE_URL` when the real STP API is available:

```sh
VITE_STP_API_BASE_URL=http://localhost:8000 npm run dev
```

## Usage

1. Start the dev server.
2. Open the local Vite URL.
3. Click `Load STL` in the left panel.
4. Select a local `.stl` file.
5. Orbit, zoom, and inspect the model in the preview area.

## Current API Contract Draft

The API integration is not required for local STL inspection. When the STP API is available, the frontend expects:

```http
POST /generate
Content-Type: application/json
```

```json
{
  "productType": "urn",
  "params": {
    "heightMm": 180,
    "diameterMm": 95
  }
}
```

Response options:

```json
{ "modelUrl": "https://..." }
```

or:

```json
{ "downloadUrl": "https://..." }
```

or a direct binary response with STL/3MF/GLB data.
