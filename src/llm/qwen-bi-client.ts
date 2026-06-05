/**
 * Qwen2.5-3B BI Analyst — HuggingFace Inference API Client
 *
 * Calls Abhishekygr/qwen2.5-3b-bi-analyst via:
 *   - Free Serverless Inference API (default, needs HF_TOKEN)
 *   - Custom Dedicated Inference Endpoint (set HF_ENDPOINT_URL)
 *
 * Both paths use the OpenAI-compatible chat/completions format.
 *
 * This model ONLY receives pre-computed analytics context.
 * It interprets results — it never calculates business metrics.
 */

import { HF_CONFIG, QWEN_BI_SYSTEM_PROMPT, resolveHFEndpoint } from "../../models/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QwenChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface QwenResponse {
  text: string;
  model: string;
  finishReason?: string;
  tokensUsed?: number;
}

export interface HFConnectionStatus {
  available: boolean;
  modelId: string;
  endpointType: "dedicated" | "serverless";
  endpointUrl: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class QwenBiClient {
  get token(): string {
    return HF_CONFIG.token;
  }
  get modelId(): string {
    return HF_CONFIG.modelId;
  }
  get maxNewTokens(): number {
    return HF_CONFIG.maxNewTokens;
  }

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  async checkConnection(): Promise<HFConnectionStatus> {
    const url = resolveHFEndpoint();
    const endpointType = HF_CONFIG.endpointUrl ? "dedicated" : "serverless";

    if (!this.token || this.token === "hf_your_token_here") {
      return {
        available: false,
        modelId: this.modelId,
        endpointType,
        endpointUrl: url,
        error: "HF_TOKEN not configured. Add it to your .env file.",
      };
    }

    try {
      // Lightweight ping: send a minimal 1-token generation request
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        return { available: true, modelId: this.modelId, endpointType, endpointUrl: url };
      }

      const errorText = await res.text().catch(() => `HTTP ${res.status}`);
      // 503 = model loading (still "available", just cold)
      if (res.status === 503) {
        return {
          available: true,
          modelId: this.modelId,
          endpointType,
          endpointUrl: url,
          error: "Model is loading (cold start) — first request may be slow.",
        };
      }
      return {
        available: false,
        modelId: this.modelId,
        endpointType,
        endpointUrl: url,
        error: `HF API error ${res.status}: ${errorText.slice(0, 120)}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        modelId: this.modelId,
        endpointType,
        endpointUrl: url,
        error: msg.includes("TimeoutError") ? "HF connection timed out (15s)" : msg,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Core inference
  // -------------------------------------------------------------------------

  /**
   * Generate a BI analysis narrative from structured context.
   *
   * @param userPrompt      The assembled analytics prompt (evidence + query)
   * @param systemOverride  Optional system prompt override (defaults to QWEN_BI_SYSTEM_PROMPT)
   * @returns               Plain text narrative, or empty string on failure
   */
  async generate(userPrompt: string, systemOverride?: string): Promise<QwenResponse> {
    const url = resolveHFEndpoint();
    const systemPrompt = systemOverride ?? QWEN_BI_SYSTEM_PROMPT;

    if (!this.token || this.token === "hf_your_token_here") {
      return { text: "", model: this.modelId, error: "HF_TOKEN not configured" } as any;
    }

    const messages: QwenChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelId,
          messages,
          max_tokens: this.maxNewTokens,
          temperature: 0.65,
          top_p: 0.92,
          stream: false,
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);

        // 503: model loading — wait and retry once
        if (res.status === 503) {
          console.warn("[Qwen HF] Model loading (503) — retrying in 20s…");
          await new Promise((r) => setTimeout(r, 20000));
          return this.generate(userPrompt, systemOverride);
        }

        console.error(`[Qwen HF] API error ${res.status}: ${errText}`);
        return { text: "", model: this.modelId };
      }

      const data = await res.json();

      // OpenAI-compatible response format
      const content: string =
        data?.choices?.[0]?.message?.content ??
        data?.generated_text ??
        data?.[0]?.generated_text ??
        "";

      return {
        text: content.trim(),
        model: data?.model ?? this.modelId,
        finishReason: data?.choices?.[0]?.finish_reason,
        tokensUsed: data?.usage?.total_tokens,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Qwen HF] Request failed:", msg);
      return { text: "", model: this.modelId };
    }
  }

  /**
   * Convenience: generate and return plain text (or empty string on failure).
   */
  async generateText(userPrompt: string, systemOverride?: string): Promise<string> {
    const res = await this.generate(userPrompt, systemOverride);
    return res.text;
  }

  get isConfigured(): boolean {
    return Boolean(this.token && this.token !== "hf_your_token_here");
  }

  get modelInfo() {
    return {
      modelId: this.modelId,
      endpointType: HF_CONFIG.endpointUrl ? "dedicated" : "serverless",
      endpointUrl: resolveHFEndpoint(),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const qwenBiClient = new QwenBiClient();
