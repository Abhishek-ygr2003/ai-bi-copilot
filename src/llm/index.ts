import { ACTIVE_MODEL, OLLAMA_CONFIG } from '../../models/config';

export interface LLMResponse {
  text: string;
  error?: string;
}

export class LLMService {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = OLLAMA_CONFIG.baseUrl;
    this.model = OLLAMA_CONFIG.model;
  }

  async generate(prompt: string, systemPrompt?: string, overrideModel?: string): Promise<LLMResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: overrideModel || this.model,
          prompt: prompt,
          system: systemPrompt,
          stream: false,
          options: {
            num_ctx: ACTIVE_MODEL.contextLength,
            temperature: 0.7,
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { text: data.response };
    } catch (error) {
      console.error('LLM Generation Error:', error);
      return { 
        text: '', 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const llmService = new LLMService();