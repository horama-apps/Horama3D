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

## STP API Contract

The API integration is not required for local STL inspection. When the STP API is available, the frontend calls the product transform endpoints with multipart form data:

```http
POST /transforms/urns
POST /transforms/clickers
POST /transforms/generic
Content-Type: multipart/form-data
```

Responses may be direct binary STL/3MF/GLB data, or JSON pointing at an artifact stored by STP:

```jsonc
{
  "success": true,
  "artifact_id": "4f5a...",
  "filename": "storage/artifacts/clicker_4f5a_model.stl",
  "download_url": "/downloads/4f5a...",
  "expires_at": "2026-07-15T12:00:00Z",
  "preview_files": [
    {
      "role": "body",
      "object": "bottom",
      "filename": "storage/artifacts/clicker_4f5a_model_bottom.stl"
    }
  ],
  "objects": ["bottom", "top"]
}
```

The frontend resolves relative STP URLs against `VITE_STP_API_BASE_URL`, prefers `download_url`/`artifact_id` for the primary model, and builds preview downloads from `preview_files[].url`, `preview_files[].download_url`, or `preview_files[].filename`.

Legacy `modelUrl`, `downloadUrl`, and `filename` responses are still accepted for compatibility.
