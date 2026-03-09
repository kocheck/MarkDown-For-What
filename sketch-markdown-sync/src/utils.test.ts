/**
 * Unit tests for utility functions.
 * These are pure functions with no Sketch API dependency.
 */

import {
    hexToSketchColor,
    errorMessage,
    isValidHex,
    hasSupportedExtension,
    SUPPORTED_EXTENSIONS,
    TEXT_COLOR,
    ERROR_TEXT_COLOR,
    ERROR_BORDER_COLOR,
    ERROR_BG_COLOR,
    PLACEHOLDER_BG_COLOR,
    WHITE_COLOR,
    TABLE_BORDER_COLOR,
    TABLE_ROW_BORDER_COLOR,
} from './utils';

describe('hexToSketchColor', () => {
    test('converts 6-digit hex with # prefix', () => {
        expect(hexToSketchColor('#AABBCC')).toBe('#aabbccff');
    });

    test('converts 6-digit hex without # prefix', () => {
        expect(hexToSketchColor('AABBCC')).toBe('#aabbccff');
    });

    test('returns lowercase', () => {
        expect(hexToSketchColor('#FF0000')).toBe('#ff0000ff');
    });

    test('throws on invalid hex (too short)', () => {
        expect(() => hexToSketchColor('#ABC')).toThrow('Invalid hex color');
    });

    test('throws on invalid hex (too long)', () => {
        expect(() => hexToSketchColor('#AABBCCDD')).toThrow('Invalid hex color');
    });

    test('throws on non-hex characters', () => {
        expect(() => hexToSketchColor('#GGHHII')).toThrow('Invalid hex color');
    });
});

describe('errorMessage', () => {
    test('extracts message from Error instance', () => {
        expect(errorMessage(new Error('test error'))).toBe('test error');
    });

    test('converts string to string', () => {
        expect(errorMessage('string error')).toBe('string error');
    });

    test('converts number to string', () => {
        expect(errorMessage(42)).toBe('42');
    });

    test('converts undefined to string', () => {
        expect(errorMessage(undefined)).toBe('undefined');
    });

    test('converts null to string', () => {
        expect(errorMessage(null)).toBe('null');
    });
});

describe('isValidHex', () => {
    test('returns true for valid 6-digit hex with #', () => {
        expect(isValidHex('#AABBCC')).toBe(true);
    });

    test('returns true for lowercase hex', () => {
        expect(isValidHex('#aabbcc')).toBe(true);
    });

    test('returns false for hex without #', () => {
        expect(isValidHex('AABBCC')).toBe(false);
    });

    test('returns false for 3-digit hex', () => {
        expect(isValidHex('#ABC')).toBe(false);
    });

    test('returns false for non-string values', () => {
        expect(isValidHex(123)).toBe(false);
        expect(isValidHex(null)).toBe(false);
        expect(isValidHex(undefined)).toBe(false);
    });

    test('returns false for empty string', () => {
        expect(isValidHex('')).toBe(false);
    });
});

describe('hasSupportedExtension', () => {
    test('returns true for .md files', () => {
        expect(hasSupportedExtension('readme.md')).toBe(true);
    });

    test('returns true for .markdown files', () => {
        expect(hasSupportedExtension('doc.markdown')).toBe(true);
    });

    test('returns true for .txt files', () => {
        expect(hasSupportedExtension('notes.txt')).toBe(true);
    });

    test('returns false for unsupported extensions', () => {
        expect(hasSupportedExtension('image.png')).toBe(false);
        expect(hasSupportedExtension('script.js')).toBe(false);
    });

    test('is case-insensitive', () => {
        expect(hasSupportedExtension('README.MD')).toBe(true);
    });
});

describe('SUPPORTED_EXTENSIONS', () => {
    test('includes .md, .markdown, and .txt', () => {
        expect(SUPPORTED_EXTENSIONS).toContain('.md');
        expect(SUPPORTED_EXTENSIONS).toContain('.markdown');
        expect(SUPPORTED_EXTENSIONS).toContain('.txt');
    });
});

describe('Color constants', () => {
    test('all color constants are valid hex+alpha format', () => {
        const hexAlphaRegex = /^#[0-9a-f]{8}$/;
        expect(TEXT_COLOR).toMatch(hexAlphaRegex);
        expect(ERROR_TEXT_COLOR).toMatch(hexAlphaRegex);
        expect(ERROR_BORDER_COLOR).toMatch(hexAlphaRegex);
        expect(ERROR_BG_COLOR).toMatch(hexAlphaRegex);
        expect(PLACEHOLDER_BG_COLOR).toMatch(hexAlphaRegex);
        expect(WHITE_COLOR).toMatch(hexAlphaRegex);
        expect(TABLE_BORDER_COLOR).toMatch(hexAlphaRegex);
        expect(TABLE_ROW_BORDER_COLOR).toMatch(hexAlphaRegex);
    });
});
