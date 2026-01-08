# FigJam Porting Architecture Guide

## Step 1: Update manifest.json

```json
{
  "name": "MarkDown For What",
  "id": "123456789",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "capabilities": [],
  "enableProposedApi": false,
  "editorType": [
    "figma",
    "figjam"
  ]
}
```

## Step 2: Editor Detection Pattern

```typescript
// Detect which editor is active
const editorType = figma.editorType; // "figma" | "figjam"

// Use conditional logic
if (editorType === 'figma') {
  // Figma-specific implementation
  await renderMarkdownToFigma(blocks);
} else if (editorType === 'figjam') {
  // FigJam-specific implementation
  await renderMarkdownToFigJam(blocks);
}
```

## Step 3: Node Factory Pattern

Create an abstraction layer for node creation:

```typescript
interface NodeRenderer {
  createContainer(name: string): BaseNode;
  createHeading(text: string, level: number): BaseNode;
  createParagraph(text: string): BaseNode;
  createCodeBlock(code: string): BaseNode;
  createList(items: string[]): BaseNode;
  createQuote(text: string): BaseNode;
  layoutNodes(parent: BaseNode, children: BaseNode[]): void;
}

class FigmaRenderer implements NodeRenderer {
  createContainer(name: string): FrameNode {
    const frame = figma.createFrame();
    frame.name = name;
    frame.layoutMode = 'VERTICAL';
    frame.itemSpacing = 16;
    // ... existing auto layout logic
    return frame;
  }

  layoutNodes(parent: FrameNode, children: BaseNode[]): void {
    // Auto layout handles this automatically
    children.forEach(child => parent.appendChild(child));
  }

  // ... other methods
}

class FigJamRenderer implements NodeRenderer {
  private currentY = 0;
  private readonly SPACING = 20;
  private readonly START_X = 0;

  createContainer(name: string): SectionNode {
    // FigJam uses sections to group content
    const section = figma.createSection();
    section.name = name;
    return section;
  }

  createHeading(text: string, level: number): StickyNode {
    const sticky = figma.createSticky();
    sticky.text.characters = text;

    // Size based on heading level
    if (level === 1) {
      sticky.resize(600, 100);
      // Note: FigJam stickies have limited styling
    } else if (level === 2) {
      sticky.resize(500, 80);
    } else {
      sticky.resize(400, 60);
    }

    return sticky;
  }

  createParagraph(text: string): ShapeWithTextNode {
    const shape = figma.createShapeWithText();
    shape.text.characters = text;
    shape.resize(600, 100); // Will auto-adjust height
    shape.shapeType = 'ROUNDED_RECTANGLE';
    shape.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    return shape;
  }

  createCodeBlock(code: string): ShapeWithTextNode {
    const shape = figma.createShapeWithText();
    shape.text.characters = code;
    shape.resize(600, 200);
    shape.shapeType = 'ROUNDED_RECTANGLE';
    shape.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
    // Note: Cannot set font to monospace easily in FigJam
    return shape;
  }

  createQuote(text: string): StickyNode {
    const sticky = figma.createSticky();
    sticky.text.characters = text;
    sticky.resize(500, 120);
    // FigJam stickies have preset colors
    return sticky;
  }

  layoutNodes(parent: SectionNode, children: BaseNode[]): void {
    // Manual positioning in FigJam (no auto layout)
    let currentY = 0;
    const startX = 0;
    const spacing = 20;

    children.forEach(child => {
      if ('x' in child && 'y' in child) {
        child.x = startX;
        child.y = currentY;

        // Calculate next Y position based on node height
        if ('height' in child) {
          currentY += child.height + spacing;
        }
      }
    });

    // Note: In FigJam, sections don't "contain" nodes like frames
    // Nodes are just visually grouped by section boundaries
    // You may need to adjust section size after positioning all nodes
    if (children.length > 0) {
      const lastChild = children[children.length - 1];
      if ('y' in lastChild && 'height' in lastChild) {
        parent.resizeWithoutConstraints(
          650,
          lastChild.y + lastChild.height + 40
        );
      }
    }
  }
}
```

## Step 4: Factory Function

```typescript
function getRenderer(): NodeRenderer {
  if (figma.editorType === 'figma') {
    return new FigmaRenderer();
  } else {
    return new FigJamRenderer();
  }
}

// Usage in main logic
async function createMarkdownDocument(name: string, markdown: string) {
  const blocks = parseMarkdownToBlocks(markdown);
  const renderer = getRenderer();

  const container = renderer.createContainer(name);
  const nodes: BaseNode[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        nodes.push(await renderer.createHeading(block.content!, block.level!));
        break;
      case 'paragraph':
        nodes.push(await renderer.createParagraph(block.content!));
        break;
      // ... other cases
    }
  }

  renderer.layoutNodes(container, nodes);
  return container;
}
```

## Key Differences to Handle:

### Figma:
- Auto Layout handles positioning automatically
- Rich text styling support
- Text styles system
- Frames with layout properties
- Tables can be built with nested frames

### FigJam:
- Manual Y-positioning required
- Limited text styling (no font family/weight control)
- Stickies and shapes instead of frames
- No native table support (would need creative workaround)
- No image support for external URLs (FigJam is more widget-based)

## Limitations in FigJam:

1. **No rich inline text formatting** - bold, italic, code spans will be lost
2. **No custom fonts** - FigJam uses system defaults
3. **No tables** - recommend converting to list or skip
4. **No images** - recommend creating text placeholder or skip
5. **No text styles** - manual text sizing only
6. **Limited colors** - stickies have preset colors

## Recommended FigJam Strategy:

For best results in FigJam, simplify the rendering:
- Headings → Yellow stickies (visual hierarchy)
- Paragraphs → White shapes with text
- Code → Grey shapes with text
- Lists → Individual shapes with bullet text
- Quotes → Pink/purple stickies
- Tables → Skip or convert to bulleted list
- Images → Create text placeholder with URL

This maintains the Markdown structure while adapting to FigJam's simpler, more collaborative whiteboard nature.
