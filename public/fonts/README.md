# Sign fonts

Add new `.ttf` or Three.js `*.typeface.json` files here, then add the same font key to the `signs` font options in `src/products/catalog.ts`. TTF keys also need to be listed in `localTtfFonts` inside `src/generation/signGenerator.ts`.

Keep the key equal to the filename without its extension. Sign generation stays entirely inside the browser.
