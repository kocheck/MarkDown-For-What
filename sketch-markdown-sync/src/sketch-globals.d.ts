/**
 * Type declarations for macOS native APIs available in the Sketch plugin runtime.
 * These are global objects injected by the CocoaScript bridge.
 */

/* eslint-disable no-var */

declare var NSURL: {
    URLWithString(url: string): any;
};

declare var NSImage: {
    alloc(): {
        initWithContentsOfURL(url: any): any;
    };
};

declare var NSMutableAttributedString: {
    alloc(): {
        initWithString(str: string): any;
    };
};

declare var NSFont: {
    fontWithName_size_(name: string, size: number): any;
};

declare var NSFontManager: {
    sharedFontManager(): {
        convertFont_toHaveTrait_(font: any, trait: number): any;
    };
};

declare var NSMakeRange: (location: number, length: number) => any;

declare var NSFontAttributeName: string;
declare var NSBoldFontMask: number;
declare var NSItalicFontMask: number;
