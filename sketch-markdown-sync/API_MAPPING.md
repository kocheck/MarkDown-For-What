# Figma → Sketch API Mapping

This document describes the API conversions used when porting the "MarkDown For What" plugin from Figma to Sketch.

## Plugin Lifecycle & UI

| Figma API | Sketch Equivalent | Notes |
|-----------|-------------------|-------|
| `figma.showUI(__html__, { width, height })` | `new BrowserWindow({ width, height })` + `loadURL()` | Sketch uses `sketch-module-web-view` for webview panels |
| `figma.closePlugin(message?)` | `browserWindow.close()` | Manual window close, optional `sketch.UI.message()` |
| `figma.editorType` | N/A | Not needed — Sketch has only one editor type |
| `figma.ui.onmessage` | `webContents.on('nativeLog', callback)` | Messages from UI arrive as JSON strings |
| `figma.ui.postMessage(msg)` | `webContents.executeJavaScript('window.pluginMessage(...)')` | Plugin → UI messages via JS execution |
| `parent.postMessage({ pluginMessage }, '*')` | `window.postMessage('nativeLog', JSON.stringify(msg))` | UI → Plugin messages |

## Node / Layer Creation

| Figma API | Sketch Equivalent | Notes |
|-----------|-------------------|-------|
| `figma.createFrame()` | `new sketch.Artboard()` or `new sketch.Group()` | Root containers are Artboards; nested containers are Groups |
| `figma.createText()` | `new sketch.Text()` | Different text attribute model (see Text section) |
| `figma.createRectangle()` | `new sketch.ShapePath({ shapeType: Rectangle })` | Sketch uses ShapePath with ShapeType enum |
| `figma.createImageAsync(url)` | `new sketch.Image({ image: NSImage })` | Sketch uses NSImage from macOS for image data |

## Layout System

| Figma API | Sketch Equivalent | Notes |
|-----------|-------------------|-------|
| `frame.layoutMode = 'VERTICAL'` | Manual `currentY` tracking | Sketch has no auto-layout; positions must be calculated manually |
| `frame.layoutMode = 'HORIZONTAL'` | Manual `currentX` tracking | Same — manual positioning required |
| `frame.itemSpacing` | `currentY += height + spacing` | Spacing applied manually between items |
| `frame.paddingTop/Bottom/Left/Right` | Offset initial position + final size | Padding simulated by starting content at `(padding, padding)` |
| `frame.primaryAxisSizingMode = 'AUTO'` | Calculate total height after placing all children | Sum all child heights + spacings + padding |
| `frame.counterAxisSizingMode = 'FIXED'` | Set explicit width on artboard | Width set directly on the artboard frame |
| `node.layoutAlign = 'STRETCH'` | Set `layer.frame.width = contentWidth` | Width matched explicitly to parent content area |
| `node.layoutGrow = 1` | Calculate equal widths: `totalWidth / numItems` | Equal distribution computed manually |

## Text & Typography

| Figma API | Sketch Equivalent | Notes |
|-----------|-------------------|-------|
| `figma.loadFontAsync(fontName)` | N/A (system fonts available directly) | No pre-loading needed in Sketch |
| `figma.getLocalTextStyles()` | `document.sharedTextStyles` | Array of shared text styles in the document |
| `figma.createTextStyle()` | `sketch.SharedStyle.fromStyle()` | Creates a new shared style from a style object |
| `node.textStyleId = style.id` | `textLayer.sharedStyleId = sharedStyle.id` | Links layer to shared style |
| `node.fontName = { family, style }` | `textLayer.style.fontFamily` + `fontWeight` | Sketch uses separate properties |
| `node.fontSize` | `textLayer.style.fontSize` | Same concept |
| `node.characters = text` | `textLayer.text = text` | Property name difference |
| `node.textAlignHorizontal` | `textLayer.style.alignment` | Uses `sketch.Text.Alignment` enum |
| `node.setRangeFontName(start, end, font)` | `NSMutableAttributedString` manipulation | Sketch uses NSAttributedString for per-range formatting |
| `node.lineHeight = { value, unit: 'PERCENT' }` | `textLayer.style.lineHeight` (px value) | Sketch uses absolute pixel values |

## Visual Properties

| Figma API | Sketch Equivalent | Notes |
|-----------|-------------------|-------|
| `node.fills = [{ type: 'SOLID', color }]` | `layer.style.fills = [{ color, fillType }]` | Colors use hex strings with alpha: `'#rrggbbaa'` |
| `node.fills = [{ type: 'IMAGE', imageHash }]` | `new sketch.Image({ image: data })` | Images are separate layer types in Sketch |
| `node.strokes = [{ type: 'SOLID', color }]` | `layer.style.borders = [{ color, thickness }]` | Sketch calls them "borders" |
| `node.strokeWeight` | `border.thickness` | Property name difference |
| `node.strokeAlign` | `border.position` | Uses `sketch.Style.BorderPosition` enum |
| `node.strokeTopWeight` / `strokeRightWeight` etc. | Individual `ShapePath` border lines | No per-side borders in Sketch; use separate shapes |
| `node.cornerRadius` | `shapePath.points[].cornerRadius` | Set on individual path points |
| `node.resize(w, h)` | `layer.frame = new Rectangle(x, y, w, h)` | Sketch uses frame property |
| `node.dashPattern = [5, 5]` | `border.dashPattern` (if supported) | Limited dash pattern support |

## Storage & Settings

| Figma API | Sketch Equivalent | Notes |
|-----------|-------------------|-------|
| `figma.clientStorage.getAsync(key)` | `Settings.settingForKey(key)` | Sketch's is synchronous |
| `figma.clientStorage.setAsync(key, value)` | `Settings.setSettingForKey(key, value)` | Sketch's is synchronous |

## Document Access

| Figma API | Sketch Equivalent | Notes |
|-----------|-------------------|-------|
| `figma.currentPage` | `document.selectedPage` | Currently active page |
| `figma.currentPage.children` | `page.layers` | Top-level layers on the page |
| `figma.currentPage.findAll(pred)` | `page.layers.filter(pred)` | Manual filtering in Sketch |
| `parent.appendChild(child)` | `child.parent = parentLayer` or `parent.layers.push(child)` | Set parent property on the child |
| `parent.insertChild(index, child)` | `parent.layers.splice(index, 0, child)` | Manual array manipulation |
| `node.remove()` | `layer.remove()` | Same concept |
| `node.x` / `node.y` | `layer.frame.x` / `layer.frame.y` | Nested under frame property |
| `node.width` / `node.height` | `layer.frame.width` / `layer.frame.height` | Nested under frame property |

## Color Format

| Figma | Sketch | Notes |
|-------|--------|-------|
| `{ r: 0-1, g: 0-1, b: 0-1 }` | `'#rrggbbaa'` hex string | Sketch uses hex with alpha channel |
| `hexToRgb('#FF0000')` → `{ r: 1, g: 0, b: 0 }` | `'#ff0000ff'` | Alpha `ff` = fully opaque |

## Image Handling

| Figma | Sketch | Notes |
|-------|--------|-------|
| `figma.createImageAsync(url)` → `Image` | `NSImage.alloc().initWithContentsOfURL(nsUrl)` | macOS native image loading |
| `image.getSizeAsync()` → `{ width, height }` | `nsImage.size()` → `{ width, height }` | Synchronous in Sketch |
| `rect.fills = [{ type: 'IMAGE', imageHash }]` | `new sketch.Image({ image: nsImage })` | Sketch has dedicated Image layer type |

## Event Model

| Figma | Sketch | Notes |
|-------|--------|-------|
| `figma.ui.onmessage = async (msg) => {}` | `webContents.on('nativeLog', (s) => {})` | Both use message-based communication |
| Single async message handler | Synchronous handler with JSON parsing | Sketch handlers are synchronous |
| `figma.on('close', handler)` | `browserWindow.on('closed', handler)` | Window lifecycle events |

## Key Architectural Differences

1. **Auto-layout vs Manual positioning**: Sketch requires explicit `(x, y, width, height)` for every layer. A `LayoutContext` tracks `currentY` as blocks are placed sequentially.

2. **Async vs Sync**: Figma's API is heavily async (font loading, image creation, storage). Sketch's API is primarily synchronous, simplifying the control flow but requiring different patterns for image loading.

3. **Text formatting**: Figma uses `setRangeFontName()` for per-character formatting. Sketch uses `NSAttributedString` manipulation via the native macOS bridge for the same effect.

4. **Borders**: Figma supports per-side stroke weights (`strokeTopWeight`, etc.). Sketch requires separate `ShapePath` layers to simulate individual borders on table cells.

5. **Plugin packaging**: Figma uses `manifest.json` + webpack → dist/. Sketch uses `skpm` → `.sketchplugin` bundle with its own `manifest.json` format.
