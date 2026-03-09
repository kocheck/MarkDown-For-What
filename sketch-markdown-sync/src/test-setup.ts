/**
 * Test setup — mocks for Sketch APIs.
 *
 * Sketch plugins run in a CocoaScript/JavaScript bridge environment with access
 * to native macOS APIs (NSURL, NSImage, NSAttributedString) and the Sketch JS
 * API (sketch module). This file mocks all external dependencies so tests can
 * run in a plain Node.js environment.
 */

// ─── Mock: sketch module ──────────────────────────────────────────────────────

function createMockFrame(x = 0, y = 0, w = 100, h = 20) {
    return { x, y, width: w, height: h };
}

function createTextMock(opts: any) {
    const text: any = {
        name: opts?.name ?? 'Text',
        text: opts?.text ?? '',
        frame: createMockFrame(0, 0, opts?.frame?.width ?? 100, 20),
        parent: opts?.parent ?? null,
        style: {
            textColor: '#000000ff',
            fontSize: 16,
            fontFamily: 'Inter',
            fontWeight: 5,
            lineHeight: 24,
            alignment: 0,
            fills: [],
            borders: [],
        },
        sharedStyleId: null,
        sketchObject: {
            attributedStringValue: () => null,
            setAttributedStringValue_: jest.fn(),
        },
        adjustToFit: jest.fn(),
    };
    // Bind adjustToFit so `this` refers to the text object
    text.adjustToFit = jest.fn(function () {
        const lineCount = Math.max(1, Math.ceil((text.text?.length || 1) / 40));
        text.frame.height = lineCount * 24;
    });
    return text;
}

const TextConstructor: any = jest.fn().mockImplementation(createTextMock);
TextConstructor.Alignment = { left: 0, center: 1, right: 2 };

const mockSketch: any = {
    Artboard: jest.fn().mockImplementation((opts: any) => ({
        name: opts?.name ?? 'Artboard',
        frame: opts?.frame ?? createMockFrame(0, 0, 800, 100),
        parent: opts?.parent ?? null,
        layers: [],
        background: { enabled: false, color: '#ffffffff' },
    })),

    Text: TextConstructor,

    Group: jest.fn().mockImplementation((opts: any) => ({
        name: opts?.name ?? 'Group',
        frame: createMockFrame(),
        parent: opts?.parent ?? null,
        layers: [],
        adjustToFit: jest.fn(),
    })),

    ShapePath: Object.assign(
        jest.fn().mockImplementation((opts: any) => ({
            name: opts?.name ?? 'Shape',
            frame: createMockFrame(0, 0, opts?.frame?.width ?? 100, opts?.frame?.height ?? 100),
            parent: opts?.parent ?? null,
            style: { fills: [], borders: [] },
            shapeType: opts?.shapeType ?? 'Rectangle',
            points: opts?.points ?? [],
        })),
        { ShapeType: { Rectangle: 'Rectangle', Oval: 'Oval', Triangle: 'Triangle' } },
    ),

    Image: jest.fn().mockImplementation((opts: any) => ({
        name: opts?.name ?? 'Image',
        frame: createMockFrame(0, 0, opts?.frame?.width ?? 100, opts?.frame?.height ?? 100),
        parent: opts?.parent ?? null,
        image: opts?.image ?? null,
    })),

    Rectangle: jest.fn().mockImplementation((x: number, y: number, w: number, h: number) => ({
        x,
        y,
        width: w,
        height: h,
    })),

    SharedStyle: {
        fromStyle: jest.fn((opts: any) => ({
            id: `mock-style-${opts?.name ?? 'unknown'}`,
            name: opts?.name ?? 'Unknown Style',
            style: opts?.style ?? {},
        })),
    },

    Style: {
        LineEnd: { Round: 1 },
        Arrowhead: { None: 0 },
        FillType: { Color: 0, Gradient: 1, Pattern: 4 },
        BorderPosition: { Center: 0, Inside: 1, Outside: 2 },
    },
};

jest.mock('sketch', () => mockSketch, { virtual: true });

// ─── Mock: sketch/settings ────────────────────────────────────────────────────

const mockSettingsStore: Record<string, any> = {};

jest.mock(
    'sketch/settings',
    () => ({
        settingForKey: jest.fn((key: string) => mockSettingsStore[key] ?? undefined),
        setSettingForKey: jest.fn((key: string, value: any) => {
            mockSettingsStore[key] = value;
        }),
    }),
    { virtual: true },
);

// ─── Mock: macOS Native APIs ──────────────────────────────────────────────────

(global as any).NSURL = {
    URLWithString: jest.fn((url: string) => ({ absoluteString: url })),
};

(global as any).NSImage = {
    alloc: jest.fn(() => ({
        initWithContentsOfURL: jest.fn(() => null), // Default: image load fails
    })),
};

(global as any).NSMutableAttributedString = {
    alloc: jest.fn(() => ({
        initWithString: jest.fn(() => ({
            length: jest.fn(() => 0),
            addAttribute_value_range: jest.fn(),
        })),
    })),
};

(global as any).NSFont = {
    fontWithName_size_: jest.fn(() => ({})),
};

(global as any).NSFontManager = {
    sharedFontManager: jest.fn(() => ({
        convertFont_toHaveTrait_: jest.fn((font: any) => font),
    })),
};

(global as any).NSMakeRange = jest.fn((loc: number, len: number) => ({
    location: loc,
    length: len,
}));

// ─── Reset helpers ────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    // Clear settings store
    Object.keys(mockSettingsStore).forEach((k) => delete mockSettingsStore[k]);
});
