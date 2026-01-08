# Testing Guide

This document describes the testing infrastructure for the Figma Markdown Plugin.

## Overview

The plugin now includes a comprehensive test suite with 24 unit tests covering the core markdown parsing and image extraction logic. All tests are written using Jest and TypeScript.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Structure

### Test Files

- **`code.test.ts`**: Main test file with 24 unit tests
- **`test-setup.ts`**: Mocks for the Figma API
- **`jest.config.js`**: Jest configuration

### Test Coverage

#### 1. Image Extraction (`extractImagesFromTokens`)
- ✓ Extracts images from mixed content
- ✓ Handles image-only tokens
- ✓ Handles text-only tokens
- ✓ Handles empty token arrays

#### 2. Markdown Parsing (`parseMarkdownToBlocks`)
- ✓ Parses all heading levels (H1, H2, H3)
- ✓ Extracts standalone images
- ✓ Extracts inline images from paragraphs
- ✓ Handles multiple inline images
- ✓ Parses code blocks with language detection
- ✓ Parses lists
- ✓ Parses tables
- ✓ Parses blockquotes
- ✓ Parses horizontal rules
- ✓ Handles mixed content correctly

#### 3. Inline Styles (`flattenTokens`)
- ✓ Handles bold formatting
- ✓ Handles italic formatting
- ✓ Handles code spans
- ✓ Handles nested formatting
- ✓ Handles plain text
- ✓ Handles empty arrays
- ✓ Treats links as plain text

#### 4. Regression Tests
- ✓ Images with title attributes
- ✓ Text preservation during image extraction
- ✓ Empty paragraph handling

## Adding New Tests

When adding new features or fixing bugs, please add corresponding tests:

1. Add test cases to `code.test.ts`
2. Follow the existing test structure (describe blocks)
3. Use descriptive test names that explain what is being tested
4. Run tests to ensure they pass before committing

Example:

```typescript
test('should handle new markdown feature', () => {
    const markdown = '...';
    const blocks = parseMarkdownToBlocks(markdown);

    expect(blocks).toHaveLength(expectedLength);
    expect(blocks[0].type).toBe('expectedType');
});
```

## Continuous Integration

Consider setting up CI/CD to automatically run tests on every commit:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test
```

## Troubleshooting

### Tests failing after dependency updates

If tests fail after updating `marked` or other dependencies, check:
1. Token structure changes in `marked` library
2. API changes in type definitions
3. Mock compatibility in `test-setup.ts`

### TypeScript errors

Make sure all dependencies are installed:
```bash
npm install
```

## Current Test Results

All 24 tests passing ✓

```
Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
```
