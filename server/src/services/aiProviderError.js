// Shared by both aiProvider.js (Anthropic) and ollamaProvider.js so neither
// module has to import the other just to throw/catch this type.
export class AIProviderError extends Error {}
