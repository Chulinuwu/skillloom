const RESOURCE_DIRECTORY = "(?:references|scripts|assets|examples|templates)";

export const PLAIN_REFERENCE = new RegExp(`(?:^|[\\s(\\[\"'])(?:(?:\\.\\.?)/)*${RESOURCE_DIRECTORY}\\/[^\\s\`<>\"']+`, "g");
export const ABSOLUTE_REFERENCE = new RegExp(`(?:^|[\\s(\\[\"'])(?:/|[A-Za-z]:\\\\)${RESOURCE_DIRECTORY}(?:/|\\\\)[^\\s\`<>\"']+`, "g");
export const INLINE_LINK = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
export const DEFINITION_LINK = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
export const INLINE_CODE = /(`+)(.*?)\1/g;
export const DIRECT_RESOURCE_REFERENCE = /^(?:\.\/)?(?:references|scripts|assets|examples|templates)\/.+/;
export const RESOURCE_LIKE_REFERENCE = /^(?:\.\/)?(?:references|scripts|assets|examples|templates)[\\/]/;
export const ABSOLUTE_RESOURCE_REFERENCE = new RegExp(`^(?:/|[A-Za-z]:\\\\)${RESOURCE_DIRECTORY}(?:/|\\\\)`);
export const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
export const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
export const AMBIGUOUS_PATH_CHARACTER = /[?\\%*{}$]/;
export const COMMAND_FLAG_VALUE = /--[A-Za-z0-9][A-Za-z0-9-]*(?:=|\s+)$/;
export const GENERATED_OUTPUT_LINE = /^\s*(?:output|generated output|generated file|writes?|creates?|saves?)\s*:/i;
