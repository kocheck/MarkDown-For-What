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

**MarkDown For What** turns your Markdown files into structured design frames — automatically. Drop in a file (or a dozen), and it builds headings, body text, code blocks, tables, and images as properly styled, Auto Layout-ready frames. Update the source later? Drop it again — it finds the frame and replaces it in place.

No copy-paste. No style hunting. No duplicates.

Currently available as a **Figma plugin**. Sketch support coming.

![Plugin Preview](./doc-assets/preview.png)

## Features

- **Structured Auto Layout**: Imports markdown as a vertical Auto Layout frame with separate layers for each element.
  - **Headings** (H1, H2, H3)
  - **Paragraphs**
  - **Lists** (Bulleted)
  - **Code Blocks** (Wrapped in styled frames)
  - **Tables** (GFM-style with alignment support)
  - **Images** (Fetched from URLs and embedded)
- **Automatic Styling**:
  - Generates local Text Styles (`Markdown/H1`, `Markdown/Body`, etc.) automatically.
  - Supports inline **Bold** (`**text**`), *Italic* (`*text*`), and `Code` spans.
- **Table Support**:
  - Renders GitHub Flavored Markdown tables as Auto Layout frames
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
  - **Auto-Mapping**: Matches file names to existing Frame or Layer names to replace content, or creates new Frames if no match is found.
- **Content Cleaning**: Automatically strips YAML front matter (`--- ... ---`) to keep your designs clean.

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or later recommended)
- Figma Desktop App

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kocheck/MarkDown-For-What.git
   cd MarkDown-For-What/figma-markdown-sync
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the plugin**:
   ```bash
   npm run build
   ```
   This generates a `dist/` folder containing `ui.html` and `code.js`.

### Loading into Figma

1. Open Figma and navigate to **plugins > Development > Import plugin from manifest...**
2. Select the `manifest.json` file located in `figma-markdown-sync/`.
3. The plugin "MarkDown For What" is now available in your plugins list!

## Usage

### Import Markdown
1. Run the plugin (**CMD+/ search "MarkDown For What"**).
2. Drag & drop markdown file(s) or click to browse.
3. **Result**:
   - A new **Auto Layout Frame** is created for each file, named after the filename.
   - If a layer with the same name already exists, it will be **replaced/updated** with the new content, preserving its position.

### Styles
The plugin automatically creates the following local styles if they don't exist:
- `Markdown/H1`, `Markdown/H2`, `Markdown/H3`
- `Markdown/Body`
- `Markdown/Quote`
- `Markdown/Code`
- `Markdown/List`

You can edit these styles in Figma to globally update the look of your imported documents!

## Development

To run the plugin in watch mode during development:

```bash
npm run watch
```

This will automatically rebuild the `dist/` files whenever you make changes to `src/` or `code.ts`.

---

**Troubleshooting Notes**:
- **Fonts**: Ensure you have `Inter` and `Roboto Mono` available in Figma (Google Fonts are available by default).
- **Security**: The plugin runs entirely locally in your Figma instance. No data is sent to external servers.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## Acknowledgments

- ASCII art generated with [ascii-art-generator](https://github.com/Darna-Digital/ascii-art-generator)
- Built with the [Figma Plugin API](https://www.figma.com/plugin-docs/)
- Markdown parsing powered by [marked](https://github.com/markedjs/marked)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.