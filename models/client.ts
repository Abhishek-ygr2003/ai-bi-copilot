/**
 * Ollama LLM Client — Phi-3 Mini (Local)
 *
 * Handles communication with the local Ollama server for:
 *   - General assistant queries
 *   - Expert Mode critique (Phi-3 as critic)
 *   - Fallback when HuggingFace is unavailable
 *
 * BI analysis is handled separately by qwen-bi-client.ts (HuggingFace API).
 */

import {
  OLLAMA_CONFIG,
  ORCHESTRATOR_MODEL,
  PHI3_GENERAL_SYSTEM_PROMPT,
  PHI3_CRITIC_SYSTEM_PROMPT,
  ACTIVE_MODEL,
} from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  stream?: boolean;
}

export interface ChatResponse {
  message: ChatMessage;
  done: boolean;
}

export interface ModelStatus {
  available: boolean;
  model: string;
  modelInfo?: { size: string; duration: number };
  error?: string;
}

// ---------------------------------------------------------------------------
// OllamaClient
// ---------------------------------------------------------------------------

class OllamaClient {
  private _model?: string;

  get baseUrl(): string {
    return OLLAMA_CONFIG.baseUrl;
  }

  get model(): string {
    return this._model || OLLAMA_CONFIG.model;
  }

  set model(val: string) {
    this._model = val;
  }

  get timeout(): number {
    return OLLAMA_CONFIG.timeout;
  }

  get maxRetries(): number {
    return OLLAMA_CONFIG.maxRetries;
  }

  constructor() {}

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  async checkStatus(modelTag?: string): Promise<ModelStatus> {
    const tag = modelTag || this.model;
    try {
      const versionRes = await fetch(`${this.baseUrl}/api/version`);
      if (!versionRes.ok) {
        return { available: false, model: tag, error: `Ollama returned ${versionRes.status}` };
      }

      const t0 = Date.now();
      const testRes = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: tag, prompt: "Hi", stream: false, options: { num_predict: 1 } }),
      });
      const duration = Date.now() - t0;

      if (testRes.ok) {
        return {
          available: true,
          model: tag,
          modelInfo: { size: ORCHESTRATOR_MODEL.size, duration },
        };
      }
      return {
        available: false,
        model: tag,
        error: `Model not found. Run: ollama pull ${tag}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return {
        available: false,
        model: tag,
        error: msg.includes("ECONNREFUSED")
          ? "Ollama not running. Start with: ollama serve"
          : msg,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Inference
  // -------------------------------------------------------------------------

  /**
   * Send a chat request to Phi-3 Mini.
   * @param systemPromptOverride  Override the default general assistant prompt
   */
  async chat(
    request: ChatRequest,
    systemPromptOverride?: string,
    targetModel?: string
  ): Promise<ChatResponse> {
    const sysPrompt = systemPromptOverride ?? PHI3_GENERAL_SYSTEM_PROMPT;
    const url = `${this.baseUrl}/api/chat`;

    const body = {
      model: targetModel || this.model,
      messages: [
        { role: "system", content: sysPrompt },
        ...request.messages,
      ],
      stream: false,
      options: {
        temperature: 0.5,
        top_p: 0.9,
        num_predict: 512,
        num_ctx: ACTIVE_MODEL.contextLength,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} — ${error}`);
    }
    return response.json();
  }

  /**
   * Generate a single string response from a prompt.
   * @param systemPromptOverride  Defaults to general assistant prompt
   */
  async generate(
    prompt: string,
    systemPromptOverride?: string,
    targetModel?: string
  ): Promise<string> {
    const sysPrompt = systemPromptOverride ?? PHI3_GENERAL_SYSTEM_PROMPT;

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel || this.model,
        prompt,
        system: sysPrompt,
        stream: false,
        options: {
          temperature: 0.5,
          top_p: 0.9,
          num_predict: 512,
          num_ctx: ACTIVE_MODEL.contextLength,
        },
      }),
    });

    if (!response.ok) throw new Error(`Ollama generate error: ${response.status}`);
    const data = await response.json();
    return typeof data.response === "string" ? data.response.trim() : "";
  }

  /**
   * Generate using the Expert Mode critic system prompt.
   */
  async generateCritique(prompt: string): Promise<string> {
    return this.generate(prompt, PHI3_CRITIC_SYSTEM_PROMPT);
  }

  /**
   * Streaming token generator (for future streaming UI support).
   */
  async *generateStream(prompt: string): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: true,
        options: { temperature: 0.5, top_p: 0.9, num_predict: 512 },
      }),
    });

    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
          try {
            const data = JSON.parse(line);
            if (data.response) yield data.response;
            if (data.done) return;
          } catch { /* skip malformed chunks */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  getModelInfo() {
    return { ...ACTIVE_MODEL, baseUrl: this.baseUrl, timeout: this.timeout };
  }

  setModel(modelName: string) {
    this.model = modelName;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const ollamaClient = new OllamaClient();
export { OllamaClient };
