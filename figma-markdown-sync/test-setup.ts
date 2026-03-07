/**
 * Test setup file - mocks Figma API globals.
 * createFrame/createText/createRectangle return objects with settable properties
 * so renderer.ts can execute without crashing in tests.
 */

function makeMockFrame(): any {
    const children: any[] = [];
    const frame: any = {
        name: '',
        layoutMode: 'NONE',
        primaryAxisSizingMode: 'AUTO',
        counterAxisSizingMode: 'AUTO',
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        itemSpacing: 0,
        layoutAlign: 'MIN',
        layoutGrow: 0,
        fills: [],
        strokes: [],
        strokeAlign: 'INSIDE',
        strokeWeight: 1,
        strokeTopWeight: 1,
        strokeBottomWeight: 1,
        strokeLeftWeight: 1,
        strokeRightWeight: 1,
        cornerRadius: 0,
        dashPattern: [],
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        type: 'FRAME',
        parent: null,
        children,
        resize: jest.fn(function(w: number, h: number) { frame.width = w; frame.height = h; }),
        appendChild: jest.fn(function(child: any) {
            children.push(child);
            child.parent = frame;
        }),
        insertChild: jest.fn(function(index: number, child: any) {
            children.splice(index, 0, child);
            child.parent = frame;
        }),
        remove: jest.fn(),
    };
    return frame;
}

function makeMockText(): any {
    return {
        name: '',
        characters: '',
        textStyleId: '',
        fontName: { family: 'Inter', style: 'Regular' },
        fontSize: 16,
        fills: [],
        layoutAlign: 'MIN',
        layoutGrow: 0,
        textAlignHorizontal: 'LEFT',
        type: 'TEXT',
        parent: null,
        setRangeFontName: jest.fn(),
        insertCharacters: jest.fn(),
        remove: jest.fn(),
    };
}

function makeMockRectangle(): any {
    const rect: any = {
        name: '',
        fills: [],
        strokes: [],
        strokeAlign: 'INSIDE',
        strokeWeight: 1,
        dashPattern: [],
        layoutAlign: 'MIN',
        layoutGrow: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 1,
        type: 'RECTANGLE',
        parent: null,
        resize: jest.fn(function(w: number, h: number) { rect.width = w; rect.height = h; }),
        remove: jest.fn(),
    };
    return rect;
}

(global as any).figma = {
    showUI: jest.fn(),
    ui: {
        onmessage: null,
        postMessage: jest.fn(),
    },
    currentPage: {
        appendChild: jest.fn(),
        findAll: jest.fn(() => []),
        children: [],
    },
    editorType: 'figma',
    loadFontAsync: jest.fn().mockResolvedValue(undefined),
    createFrame: jest.fn(() => makeMockFrame()),
    createText: jest.fn(() => makeMockText()),
    createRectangle: jest.fn(() => makeMockRectangle()),
    createTextStyle: jest.fn(() => ({
        id: 'mock-style-id',
        name: '',
        fontName: { family: 'Inter', style: 'Regular' },
        fontSize: 16,
        lineHeight: { value: 150, unit: 'PERCENT' },
    })),
    getLocalTextStyles: jest.fn(() => []),
    createImageAsync: jest.fn().mockResolvedValue({
        hash: 'mock-hash',
        getSizeAsync: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
    }),
    clientStorage: {
        getAsync: jest.fn().mockResolvedValue(undefined),
        setAsync: jest.fn().mockResolvedValue(undefined),
    },
    closePlugin: jest.fn(),
};

(global as any).__html__ = '';

export {};
