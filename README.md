# MarkDown For What 🎵

```
███╗   ███╗ █████╗ ██████╗ ██╗  ██╗██████╗  ██████╗ ██╗    ██╗███╗   ██╗
████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝██╔══██╗██╔═══██╗██║    ██║████╗  ██║
██╔████╔██║███████║██████╔╝█████╔╝ ██║  ██║██║   ██║██║ █╗ ██║██╔██╗ ██║
██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗ ██║  ██║██║   ██║██║███╗██║██║╚██╗██║
██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗██████╔╝╚██████╔╝╚███╔███╔╝██║ ╚████║
╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝  ╚══╝╚══╝ ╚═╝  ╚═══╝

███████╗ ██████╗ ██████╗     ██╗    ██╗██╗  ██╗ █████╗ ████████╗
██╔════╝██╔═══██╗██╔══██╗    ██║    ██║██║  ██║██╔══██╗╚══██╔══╝
█████╗  ██║   ██║██████╔╝    ██║ █╗ ██║███████║███████║   ██║
██╔══╝  ██║   ██║██╔══██╗    ██║███╗██║██╔══██║██╔══██║   ██║
██║     ╚██████╔╝██║  ██║    ╚███╔███╔╝██║  ██║██║  ██║   ██║
╚═╝      ╚═════╝ ╚═╝  ╚═╝     ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
```

**MarkDown For What** turns your Markdown files into structured design frames — automatically. Drop in a file (or a dozen), and it builds headings, body text, code blocks, tables, and images as properly styled frames. Update the source later? Drop it again — it finds the frame and replaces it in place.

No copy-paste. No style hunting. No duplicates.

Available for **Figma** and **Sketch**.

![Plugin Preview](./assets/preview.png)

## Features

Both plugins share the same feature set:

- **Structured Layout**: Imports markdown as a styled frame (Auto Layout in Figma, manually positioned in Sketch) with separate layers for each element.
  - **Headings** (H1, H2, H3)
  - **Paragraphs**
  - **Lists** (Bulleted)
  - **Code Blocks** (Wrapped in styled frames)
  - **Tables** (GFM-style with alignment support)
  - **Images** (Fetched from URLs and embedded)
- **Automatic Styling**:
  - Generates shared Text Styles (`Markdown/H1`, `Markdown/Body`, etc.) automatically.
  - Supports inline **Bold** (`**text**`), *Italic* (`*text*`), and `Code` spans.
- **Table Support**:
  - Renders GitHub Flavored Markdown tables with proper cell layout
  - Header row with distinct background styling
  - Supports left, center, and right text alignment (`:---`, `:---:`, `---:`)
  - Visual cell borders for clear separation
- **Image Support**:
  - Automatically fetches and embeds images from URLs
  - Scales images to fit frame width while maintaining aspect ratio
  - Error handling with placeholder for failed image loads
  - Supports standard markdown syntax: `![Alt Text](https://example.com/image.png)`
- **Smart Font Management**:
  - Uses `Inter` for UI text and `Roboto Mono` for code.
  - Handles font loading and fallbacks.
- **Batch Operations**:
  - **Drag & Drop**: Simply drag multiple markdown files into the plugin window.
  - **Auto-Mapping**: Matches file names to existing frames to replace content, or creates new frames if no match is found.
- **Content Cleaning**: Automatically strips YAML front matter (`--- ... ---`) to keep your designs clean.

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or later recommended)
- **Figma**: Figma Desktop App
- **Sketch**: Sketch for Mac (v70+)

### Figma Plugin

1. **Clone and build**:
   ```bash
   git clone https://github.com/kocheck/MarkDown-For-What.git
   cd MarkDown-For-What/figma-markdown-sync
   npm install
   npm run build
   ```
   This generates a `dist/` folder containing `ui.html` and `code.js`.

2. **Load into Figma**:
   - Open Figma → **Plugins > Development > Import plugin from manifest...**
   - Select the `manifest.json` file in `figma-markdown-sync/`.

### Sketch Plugin

1. **Clone and build**:
   ```bash
   git clone https://github.com/kocheck/MarkDown-For-What.git
   cd MarkDown-For-What/sketch-markdown-sync
   npm install
   npm run build
   ```
   This generates a `.sketchplugin` bundle.

2. **Load into Sketch**:
   - Double-click the generated `.sketchplugin` file, or
   - Go to **Plugins > Manage Plugins...** and add it manually.

## Usage

### Figma
1. Run the plugin (**CMD+/ search "MarkDown For What"**).
2. Drag & drop markdown file(s) or click to browse.
3. A new **Auto Layout Frame** is created for each file, named after the filename.
4. If a frame with the same name already exists, it will be **replaced/updated** in place.

### Sketch
1. Go to **Plugins > MarkDown For What > Import Markdown**.
2. Drag & drop markdown file(s) or click to browse.
3. A new **Artboard** is created for each file, named after the filename.
4. If an artboard with the same name already exists, it will be **replaced/updated** in place.

### Shared Text Styles
Both plugins automatically create the following text styles if they don't exist:
- `Markdown/H1`, `Markdown/H2`, `Markdown/H3`
- `Markdown/Body`
- `Markdown/Quote`
- `Markdown/Code`
- `Markdown/List`

You can edit these styles in your design tool to globally update the look of your imported documents. Existing style customizations are preserved on re-import.

### Settings
Both plugins offer configurable settings accessible from the Settings tab:
- **Frame Width** — Width of generated frames/artboards
- **Frame Padding** — Inner padding
- **Block Spacing** — Vertical spacing between elements
- **Code Background** — Background color for code blocks
- **Table Header Background** — Background color for table headers
- **Separator Color** — Color for horizontal rule dividers

## Development

Each plugin can be run in watch mode during development:

```bash
# Figma
cd figma-markdown-sync
npm run watch

# Sketch
cd sketch-markdown-sync
npm run watch
```

## Project Structure

```
MarkDown-For-What/
├── figma-markdown-sync/    # Figma plugin
│   ├── code.ts             # Plugin entry point
│   ├── src/                # Source modules (parser, renderer, styles, etc.)
│   └── manifest.json       # Figma plugin manifest
├── sketch-markdown-sync/   # Sketch plugin
│   ├── src/
│   │   ├── index.ts        # Plugin entry point
│   │   ├── parser.ts       # Markdown parser (shared logic)
│   │   ├── renderer.ts     # Sketch-specific rendering
│   │   ├── styles.ts       # SharedStyle management
│   │   ├── tables.ts       # Table rendering
│   │   ├── settings.ts     # Settings persistence
│   │   ├── utils.ts        # Shared utilities
│   │   └── ui/             # WebView UI
│   └── API_MAPPING.md      # Figma → Sketch API mapping reference
└── README.md
```

---

**Troubleshooting Notes**:
- **Fonts**: Ensure you have `Inter` and `Roboto Mono` installed. In Figma, Google Fonts are available by default. In Sketch, install them as system fonts.
- **Security**: Both plugins run entirely locally. No data is sent to external servers.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## Acknowledgments

- ASCII art generated with [ascii-art-generator](https://github.com/Darna-Digital/ascii-art-generator)
- Built with the [Figma Plugin API](https://www.figma.com/plugin-docs/) and [Sketch JavaScript API](https://developer.sketch.com/reference/api/)
- Markdown parsing powered by [marked](https://github.com/markedjs/marked)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.