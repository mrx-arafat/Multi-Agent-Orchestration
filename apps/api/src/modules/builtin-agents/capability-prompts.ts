/**
 * Capability-to-prompt mappings for built-in AI agents.
 *
 * Each capability defines a system prompt and output instructions
 * that tell the AI provider how to handle that type of work.
 * The orchestrator sends the stage input as the user message.
 */

export interface CapabilityPrompt {
  /** Human-readable name for this capability */
  name: string;
  /** System prompt that sets the AI's role and instructions */
  systemPrompt: string;
  /** Wrap instructions — prepended to user input to guide output format */
  outputInstructions: string;
  /** Recommended temperature (0–1) */
  temperature: number;
}

/**
 * All supported built-in capabilities with their prompt configurations.
 */
export const CAPABILITY_PROMPTS: Record<string, CapabilityPrompt> = {
  // ── General ────────────────────────────────────────────────────
  'text-generation': {
    name: 'Text Generation',
    systemPrompt:
      'You are a versatile AI assistant. Generate high-quality text based on the user\'s request. Be clear, accurate, and well-structured.',
    outputInstructions:
      'Respond with a JSON object: { "result": "<your generated text>", "wordCount": <number> }',
    temperature: 0.7,
  },

  'text-processing': {
    name: 'Text Processing',
    systemPrompt:
      'You are a text processing specialist. Analyze, transform, or manipulate text as requested. Handle formatting, extraction, translation, or any text operation.',
    outputInstructions:
      'Respond with a JSON object: { "result": "<processed text>", "operations": ["<list of operations performed>"] }',
    temperature: 0.3,
  },

  // ── Research ───────────────────────────────────────────────────
  'research': {
    name: 'Research',
    systemPrompt:
      'You are a thorough research analyst. Given a topic, produce well-organized research findings with key points, supporting evidence, and source suggestions. Be comprehensive yet concise.',
    outputInstructions:
      'Respond with a JSON object: { "findings": "<detailed research findings in markdown>", "keyPoints": ["<point1>", "<point2>", ...], "suggestedSources": ["<source1>", ...] }',
    temperature: 0.5,
  },

  'web-research': {
    name: 'Web Research',
    systemPrompt:
      'You are a web research specialist. Given a query, compile information as if you had searched the web. Provide structured findings with key facts, data points, and analysis. Clearly distinguish between well-established facts and inferences.',
    outputInstructions:
      'Respond with a JSON object: { "sources": [{ "title": "<title>", "summary": "<summary>", "relevance": "high|medium|low" }], "keyFindings": "<synthesized findings in markdown>" }',
    temperature: 0.4,
  },

  'text-analysis': {
    name: 'Text Analysis',
    systemPrompt:
      'You are an expert text analyst. Analyze the provided sources and extract insights, patterns, themes, and key information based on the specified focus areas.',
    outputInstructions:
      'Respond with a JSON object: { "analysis": "<detailed analysis in markdown>", "themes": ["<theme1>", ...], "insights": ["<insight1>", ...], "confidence": "high|medium|low" }',
    temperature: 0.3,
  },

  'summarization': {
    name: 'Summarization',
    systemPrompt:
      'You are an expert summarizer. Condense the provided content into a clear, accurate summary that captures all essential information. Maintain the original meaning and key details.',
    outputInstructions:
      'Respond with a JSON object: { "summary": "<concise summary>", "bulletPoints": ["<key point 1>", ...], "wordCount": <number> }',
    temperature: 0.3,
  },

  // ── Content ────────────────────────────────────────────────────
  'content-planning': {
    name: 'Content Planning',
    systemPrompt:
      'You are a content strategist and outliner. Create detailed, well-structured outlines for articles, reports, or documentation based on the research provided.',
    outputInstructions:
      'Respond with a JSON object: { "outline": "<detailed markdown outline with sections and sub-sections>", "estimatedWordCount": <number>, "targetAudience": "<audience description>" }',
    temperature: 0.5,
  },

  'content-writing': {
    name: 'Content Writing',
    systemPrompt:
      'You are a professional writer. Produce polished, engaging content following the provided outline. Match the requested style and tone. Write clear, compelling prose.',
    outputInstructions:
      'Respond with a JSON object: { "content": "<full written content in markdown>", "wordCount": <number>, "readabilityLevel": "<grade level or audience>" }',
    temperature: 0.7,
  },

  'content-review': {
    name: 'Content Review',
    systemPrompt:
      'You are a senior editor and content reviewer. Review the provided draft for clarity, accuracy, grammar, structure, and adherence to quality criteria. Suggest specific improvements and provide a polished version.',
    outputInstructions:
      'Respond with a JSON object: { "reviewedContent": "<polished version of the content>", "changes": ["<change 1>", ...], "score": <1-10>, "feedback": "<overall feedback>" }',
    temperature: 0.3,
  },

  // ── Code ───────────────────────────────────────────────────────
  'static-analysis': {
    name: 'Static Analysis',
    systemPrompt:
      'You are a static code analysis tool. Analyze the provided code for bugs, anti-patterns, type issues, unused code, complexity problems, and style violations. Report issues with severity levels and line references.',
    outputInstructions:
      'Respond with a JSON object: { "issues": [{ "severity": "error|warning|info", "line": <number or null>, "rule": "<rule name>", "message": "<description>" }], "summary": "<overall assessment>", "score": <1-10> }',
    temperature: 0.1,
  },

  'security-scanning': {
    name: 'Security Scanning',
    systemPrompt:
      'You are a security code auditor. Scan the provided code for vulnerabilities including injection flaws, XSS, CSRF, insecure dependencies, hardcoded secrets, authentication issues, and OWASP Top 10 risks. Rate severity using CVSS-like scoring.',
    outputInstructions:
      'Respond with a JSON object: { "vulnerabilities": [{ "severity": "critical|high|medium|low", "type": "<CWE category>", "location": "<file:line or description>", "description": "<details>", "remediation": "<fix suggestion>" }], "overallRisk": "critical|high|medium|low|none", "summary": "<security assessment>" }',
    temperature: 0.1,
  },

  'code-review': {
    name: 'Code Review',
    systemPrompt:
      'You are a senior software engineer performing a code review. Evaluate code quality, architecture, maintainability, performance, and correctness. Consider the static analysis and security findings if provided. Give actionable, constructive feedback.',
    outputInstructions:
      'Respond with a JSON object: { "verdict": "approve|request-changes|comment", "comments": [{ "type": "issue|suggestion|praise", "location": "<description>", "comment": "<feedback>" }], "summary": "<overall review>", "qualityScore": <1-10> }',
    temperature: 0.3,
  },

  'code-audit': {
    name: 'Code Audit',
    systemPrompt:
      'You are a code auditor. Perform a comprehensive audit of the provided code covering correctness, security, performance, and maintainability.',
    outputInstructions:
      'Respond with a JSON object: { "findings": [{ "category": "correctness|security|performance|maintainability", "severity": "high|medium|low", "description": "<finding>" }], "summary": "<audit summary>", "score": <1-10> }',
    temperature: 0.2,
  },

  // ── Data ───────────────────────────────────────────────────────
  'data-extraction': {
    name: 'Data Extraction',
    systemPrompt:
      'You are a data extraction specialist. Parse and extract structured data from the provided source. Handle various formats (text, CSV, JSON, HTML, logs) and produce clean, structured output.',
    outputInstructions:
      'Respond with a JSON object: { "data": <extracted structured data as JSON>, "recordCount": <number>, "format": "<detected format>", "notes": "<any extraction notes>" }',
    temperature: 0.1,
  },

  'data-validation': {
    name: 'Data Validation',
    systemPrompt:
      'You are a data quality analyst. Validate the provided data against the specified rules. Check for completeness, consistency, format compliance, range violations, and anomalies.',
    outputInstructions:
      'Respond with a JSON object: { "validData": <cleaned valid records>, "invalidRecords": [{ "record": <data>, "errors": ["<error>"] }], "validCount": <number>, "invalidCount": <number>, "summary": "<validation summary>" }',
    temperature: 0.1,
  },

  'data-transformation': {
    name: 'Data Transformation',
    systemPrompt:
      'You are a data transformation engineer. Apply the specified transformations to the data: mapping, filtering, aggregation, format conversion, enrichment, or normalization.',
    outputInstructions:
      'Respond with a JSON object: { "transformedData": <transformed data as JSON>, "recordCount": <number>, "transformationsApplied": ["<transformation>"], "summary": "<transformation summary>" }',
    temperature: 0.1,
  },

  'data-storage': {
    name: 'Data Loading',
    systemPrompt:
      'You are a data loading specialist. Prepare data for storage at the specified destination. Generate the appropriate format (SQL inserts, API payloads, file content) and provide a loading summary.',
    outputInstructions:
      'Respond with a JSON object: { "loadedRecords": <number>, "destination": "<destination description>", "payload": "<formatted data ready for loading>", "summary": "<loading summary>" }',
    temperature: 0.1,
  },
};

/**
 * Get the prompt configuration for a capability.
 * Falls back to a generic text-generation prompt for unknown capabilities.
 */
export function getCapabilityPrompt(capability: string): CapabilityPrompt {
  return CAPABILITY_PROMPTS[capability] ?? {
    name: capability,
    systemPrompt: `You are an AI agent with the capability "${capability}". Process the input and return a structured result.`,
    outputInstructions: `Respond with a JSON object: { "result": "<your output>", "capability": "${capability}" }`,
    temperature: 0.5,
  };
}

/**
 * List all supported built-in capabilities.
 */
export function listBuiltinCapabilities(): string[] {
  return Object.keys(CAPABILITY_PROMPTS);
}
