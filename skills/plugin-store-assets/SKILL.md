---
name: plugin-store-assets
description: Generate browser extension or plugin store materials, including Chrome Web Store copy, summaries, descriptions, 128x128 icons, screenshots, promo tiles, consistent logo usage, multilingual README files, and communication architecture diagrams. Use when the user asks for 插件物料, 浏览器插件商店素材, extension listing assets, Chrome Web Store assets, promotional tiles, README localization, or architecture diagrams for an extension/plugin project.
---

# Plugin Store Assets

## Core Workflow

1. Inspect the project before writing assets:
   - Read `package.json`, current `README*`, extension manifest/config such as `wxt.config.ts`, and UI entrypoints such as popup/options files.
   - Identify the product name, audience, supported sites/features, permissions, and user workflow.
   - Reuse existing brand assets when present. If the user provides a logo/reference, follow it and add a distinct plugin marker rather than copying an upstream product logo verbatim.

2. Create or update a project-local asset folder, usually `store-assets/`.
   - Keep both editable sources and final PNG files.
   - Prefer deterministic HTML/SVG/CSS sources rendered to PNG for UI/store graphics.
   - Use the `imagegen` skill only when the user explicitly wants photo/illustration-style bitmap art.

3. Generate listing copy:
   - Summary: concise, English by default unless the user asks otherwise.
   - Description: explain what the extension does, why users should install it, supported capabilities, and basic usage.
   - Save copy in `store-assets/summary-description.md` or a similarly clear file.

4. Generate visual assets:
   - Icon: `128x128`.
   - Screenshot: `1280x800` or `640x400`.
   - Small promo tile: `440x280`.
   - Marquee/top promo tile: `1400x560`.
   - Keep the logo visually consistent across all graphics.
   - If the icon is based on a known ecosystem mark, modify it with a clear product-specific badge or marker.

5. Generate README materials when requested:
   - Put the promo image first as a Markdown image link.
   - If the user asks for multiple languages, prefer separate files such as `README.md`, `README.en.md`, and `README.ja.md`.
   - Add language-switch links near the top.
   - Include a Mermaid communication architecture diagram when the project has background/content/popup/options messaging.

6. Validate:
   - Render PNGs from sources.
   - Verify exact pixel dimensions.
   - Inspect images for logo consistency, text overflow, crop issues, and accidental mismatch with user-provided brand direction.
   - Report final paths and validation results.

## Rendering Helper

Use `scripts/render_html_assets.py` when the project has HTML/SVG source files and needs deterministic PNG exports. The script renders with a local Chromium/Chrome executable and validates PNG dimensions.

Example:

```bash
python3 /path/to/plugin-store-assets/scripts/render_html_assets.py \
  --asset-dir store-assets \
  --asset icon-128.html:128x128:icon-128.png \
  --asset screenshot-1280x800.html:1280x800:screenshot-1280x800.png \
  --asset promo-small-440x280.html:440x280:promo-small-440x280.png \
  --asset promo-marquee-1400x560.html:1400x560:promo-marquee-1400x560.png
```

If this script cannot find Chrome automatically, pass `--chrome /path/to/chrome`.

## References

- For required dimensions, content checklist, README patterns, and architecture diagram guidance, read `references/asset-spec.md`.
