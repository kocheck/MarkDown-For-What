# MarkDown For What 🎵

**MarkDown For What** is a Figma plugin that synchronizes Markdown content directly into Figma as structured Auto Layout frames. It automatically generates styles, handles layout, and supports batch operations, making it the perfect tool for maintaining design system documentation, changelogs, or content-heavy prototypes.

![Plugin Preview](./doc-assets/preview.png)

## Features

- **Structured Auto Layout**: Imports markdown as a vertical Auto Layout frame with separate layers for each element.
  - **Headings** (H1, H2, H3)
  - **Paragraphs**
  - **Lists** (Bulleted)
  - **Code Blocks** (Wrapped in styled frames)
- **Automatic Styling**:
  - Generates local Text Styles (`Markdown/H1`, `Markdown/Body`, etc.) automatically.
  - Supports inline **Bold** (`**text**`), *Italic* (`*text*`), and `Code` spans.
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
