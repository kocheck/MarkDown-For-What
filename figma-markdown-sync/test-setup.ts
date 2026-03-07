/**
 * Test setup file - mocks Figma API globals
 */

// Mock the Figma API globals
// We need to cast to any because the Figma plugin typings declare these as readonly
(global as any).figma = {
    showUI: jest.fn(),
    ui: {
        onmessage: null,
        postMessage: jest.fn()
    },
    currentPage: {
        appendChild: jest.fn(),
        findAll: jest.fn(() => [])
    },
    editorType: 'figma',
    loadFontAsync: jest.fn().mockResolvedValue(undefined),
    createFrame: jest.fn(),
    createText: jest.fn(),
    createRectangle: jest.fn(),
    createSection: jest.fn(),
    createSticky: jest.fn(),
    createShapeWithText: jest.fn(),
    createTextStyle: jest.fn(),
    getLocalTextStyles: jest.fn(() => []),
    createImageAsync: jest.fn(),
    clientStorage: {
        getAsync: jest.fn().mockResolvedValue(undefined),
        setAsync: jest.fn().mockResolvedValue(undefined),
    }
};

(global as any).__html__ = '';

export {};
