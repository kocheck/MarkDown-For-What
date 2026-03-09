/**
 * parser.ts — Re-exports shared parsing logic.
 * The actual implementation lives in ../../shared/parser.ts.
 */
export {
    Block,
    StyledSegment,
    parseMarkdownToBlocks,
    extractImagesFromTokens,
    flattenTokens,
} from '../../shared/parser';
