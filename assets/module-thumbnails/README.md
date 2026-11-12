# Horama3D · Product thumbnail direction

Complete 20-module catalog collection. The initial QR Signs, Paycards and Christmas ornament studies establish the photographic family.
Generated using the built-in image generation tool. The first three use local geometry references; the remaining 17 use the approved QR image as a style reference and subject briefs based on the module definitions. These are catalog illustrations, not printable models or output previews.

## Files

- `v1/*.png`: 20 full-resolution generated masters.
- `references/`: geometry reference views for the original three studies.
- `../../public/module-thumbnails/`: 768 × 768 WebP derivatives, quality 84, prepared for the future catalog.

The Estudio module catalog uses all 20 WebP derivatives. Icons remain available as a fallback for future modules.

## Shared prompt direction

Use case: product-mockup. One square editorial product photograph per module. Seamless warm pale stone tabletop and background, soft large upper-left window light, gentle contact shadow, subtle matte FDM PLA layer texture. Ivory, forest green, terracotta, charcoal. Complete isolated object at a gentle three-quarter angle, with crop-safe margins. No interface, props, hands, watermark, caption, or graphic border. Preserve printable geometry from the reference rather than inventing features. Use the QR sign result as a lighting/material reference for the other two assets.

## Prompt set

### QR Signs

Preserve the tall rounded rectangular ivory plate, charcoal QR and horizontal separators, and separate terracotta slotted stepped trapezoid countertop base whose width equals the plate. Display upright, gentle three-quarter front view. Clean uppercase “HORAMA” at the top and “EXPLORA EL MENÚ” under the QR. Improve rendering artifacts in the source lettering. No extra stand, electronics or other text.

### Paycards

Preserve the actual slim credit-card sleeve geometry, 85.6 × 54 mm proportions, narrow perimeter lip and insertion opening at one short edge. Matte four-color flat inlaid artwork: ivory stylized leaf silhouette, forest-green ground, terracotta semicircle and charcoal accent. Lay diagonally on the same tabletop, high three-quarter view, showing thin side thickness and a glimpse of a blank ivory card edge. No payment terminal, stand, screen, electronics, brand, bank, text or numbers.

### Christmas ornament

Preserve the flat three-tier Christmas-tree silhouette, short trunk, integral hanging eyelet, warm biscuit PLA base, thin raised green outline, small red and green discs and stars. Red lettering “FAMILIA HORAMA” in the upper-middle on two lines and “Navidad” below, comfortably within the outline. Lay face-up on the same stone surface, gently diagonal, high three-quarter view showing the thin side thickness. No three-dimensional conifer, cookie, bauble, hanging string or props.

## Remaining 17 prompts

The complete production prompts and file mapping are in [prompts-remaining-v1.json](prompts-remaining-v1.json). The style reference is the approved `v1/qr-sign.png`; the generation tool is built-in `image_gen`. These images illustrate representative printable products rather than promising an exact model or a scannable QR.

## Presentation

All three images use the same photographic family. Card layout should preserve a square image area and use the module name as interface text beneath the image. Model generation and downloads remain independent of these illustrative assets.
