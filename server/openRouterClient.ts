import { GoogleGenAI } from '@google/genai';
import { BrainRoutingDecision, GatewayStatus } from '../src/types/nexus.ts';
import { sanitizeErrorMessage } from './authService.ts';
import { settingsService } from './settingsService.ts';
import { memoryService } from './memoryService.ts';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCompletionCallbacks {
  onMetadata?: (decision: BrainRoutingDecision) => void;
  onToken: (token: string) => void;
  onComplete: (fullText: string, finalDecision: BrainRoutingDecision) => void;
  onError: (errorMessage: string, finalDecision: BrainRoutingDecision) => void;
}

export class OpenRouterClient {
  public async getGatewayStatus(): Promise<GatewayStatus> {
    const settings = settingsService.getSettings();
    const credential = settingsService.getOpenRouterApiKey();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    return {
      openRouterConfigured: Boolean(credential.key),
      openRouterKeySource: credential.source,
      openRouterKeyHint: credential.hint,
      openRouterEndpoint: OPENROUTER_API_URL,
      geminiFallbackAvailable: Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY'),
      configuredModels: {
        flash: settings.flashModelId,
        reasoning: settings.reasoningModelId,
        fallback: settings.fallbackModelId,
      },
      memoryStore: await memoryService.getStatus(),
    };
  }

  /**
   * Streams completion from OpenRouter (https://openrouter.ai/api/v1/chat/completions).
   * If the primary model ID fails on OpenRouter or OPENROUTER_API_KEY is not configured,
   * handles fallback transparently and NEVER claims a different model performed the work.
   */
  public async streamChatCompletion(params: {
    messages: OpenRouterMessage[];
    decision: BrainRoutingDecision;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    callbacks: StreamCompletionCallbacks;
  }): Promise<void> {
    const settings = settingsService.getSettings();
    const openRouterKey = settingsService.getOpenRouterApiKey().key;
    const hasOpenRouterKey = Boolean(openRouterKey);

    const temperature = params.temperature ?? settings.temperature;
    const maxTokens = params.maxTokens ?? settings.maxOutputTokens;
    const currentDecision: BrainRoutingDecision = { ...params.decision };

    // 1. Primary path: OpenRouter with requested model ID
    if (hasOpenRouterKey) {
      try {
        await this.invokeOpenRouterStream({
          apiKey: openRouterKey!,
          modelId: currentDecision.requestedModelId,
          messages: params.messages,
          temperature,
          maxTokens,
          signal: params.signal,
          onStart: () => {
            params.callbacks.onMetadata?.(currentDecision);
          },
          onToken: params.callbacks.onToken,
          onDone: (fullText) => {
            params.callbacks.onComplete(fullText, currentDecision);
          },
        });
        return;
      } catch (primaryErr) {
        const primaryErrMsg = sanitizeErrorMessage(primaryErr);

        // If user aborted, stop immediately
        if (params.signal?.aborted) {
          return;
        }

        // 2. If OpenRouter is configured, try OpenRouter fallback model if enabled
        if (settings.enableVerifiedFallback && settings.fallbackModelId) {
          try {
            currentDecision.fallbackTriggered = true;
            currentDecision.gatewayUsed = 'fallback_openrouter';
            currentDecision.executedModelId = settings.fallbackModelId;
            currentDecision.fallbackReason = `Primary model "${currentDecision.requestedModelId}" unavailable on OpenRouter (${primaryErrMsg}). Routed to OpenRouter fallback model "${settings.fallbackModelId}".`;

            await this.invokeOpenRouterStream({
              apiKey: openRouterKey!,
              modelId: settings.fallbackModelId,
              messages: params.messages,
              temperature,
              maxTokens,
              signal: params.signal,
              onStart: () => {
                params.callbacks.onMetadata?.(currentDecision);
              },
              onToken: params.callbacks.onToken,
              onDone: (fullText) => {
                params.callbacks.onComplete(fullText, currentDecision);
              },
            });
            return;
          } catch (fallbackErr) {
            const fbErrMsg = sanitizeErrorMessage(fallbackErr);
            // Fall through to Gemini fallback if enabled, or report error
            if (!settings.enableVerifiedFallback) {
              params.callbacks.onError(
                `OpenRouter error for "${currentDecision.requestedModelId}": ${primaryErrMsg} (Fallback "${settings.fallbackModelId}" also failed: ${fbErrMsg})`,
                currentDecision
              );
              return;
            }
          }
        } else {
          params.callbacks.onError(
            `OpenRouter request failed for model "${currentDecision.requestedModelId}": ${primaryErrMsg}`,
            currentDecision
          );
          return;
        }
      }
    }

    // 3. Verified Server-Side Fallback Gateway (when OPENROUTER_API_KEY is missing or OpenRouter models failed and fallback is enabled)
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const hasGeminiKey = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');

    if (settings.enableVerifiedFallback && hasGeminiKey) {
      const fallbackGeminiModel = 'gemini-3.8-flash';
      currentDecision.fallbackTriggered = true;
      currentDecision.gatewayUsed = 'fallback_gemini';
      currentDecision.executedModelId = `${fallbackGeminiModel} (Verified Fallback Gateway)`;
      currentDecision.fallbackReason = hasOpenRouterKey
        ? `Requested OpenRouter model "${currentDecision.requestedModelId}" was unavailable. Executed via verified server-side fallback (${fallbackGeminiModel}).`
        : `No OpenRouter key is configured. Executed via the verified server-side fallback (${fallbackGeminiModel}) while preserving ${currentDecision.selectedBrain} routing context.`;

      params.callbacks.onMetadata?.(currentDecision);

      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const systemMsg = params.messages.find((m) => m.role === 'system')?.content || '';
        const conversationTranscript = params.messages
          .filter((m) => m.role !== 'system')
          .map((m) => `${m.role === 'user' ? 'User' : 'NEXUS'}: ${m.content}`)
          .join('\n\n');

        const responseStream = await ai.models.generateContentStream({
          model: fallbackGeminiModel,
          contents: conversationTranscript || 'Hello',
          config: {
            systemInstruction: systemMsg,
          },
        });

        let fullText = '';
        for await (const chunk of responseStream) {
          if (params.signal?.aborted) break;
          const piece = chunk.text || '';
          if (piece) {
            fullText += piece;
            params.callbacks.onToken(piece);
          }
        }

        params.callbacks.onComplete(fullText, currentDecision);
        return;
      } catch (geminiErr) {
        params.callbacks.onError(
          `OpenRouter key missing and fallback gateway encountered an error: ${sanitizeErrorMessage(geminiErr)}`,
          currentDecision
        );
        return;
      }
    }

    // 4. Neither OpenRouter nor Fallback is available / permitted
    params.callbacks.onError(
      'The assistant is not connected yet. Open Settings and add your OpenRouter API key to start chatting.',
      currentDecision
    );
  }

  /**
   * Non-streaming completion helper used by internal agent verification/planning steps
   */
  public async completeOnce(params: {
    messages: OpenRouterMessage[];
    decision: BrainRoutingDecision;
  }): Promise<{ text: string; finalDecision: BrainRoutingDecision }> {
    return new Promise((resolve, reject) => {
      let accumulated = '';
      this.streamChatCompletion({
        messages: params.messages,
        decision: params.decision,
        callbacks: {
          onToken: (tok) => {
            accumulated += tok;
          },
          onComplete: (fullText, finalDecision) => {
            resolve({ text: fullText || accumulated, finalDecision });
          },
          onError: (errMsg) => {
            reject(new Error(errMsg));
          },
        },
      });
    });
  }

  private async invokeOpenRouterStream(params: {
    apiKey: string;
    modelId: string;
    messages: OpenRouterMessage[];
    temperature: number;
    maxTokens: number;
    signal?: AbortSignal;
    onStart: () => void;
    onToken: (token: string) => void;
    onDone: (fullText: string) => void;
  }): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    if (params.signal) {
      params.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://blacktower.nexus.internal',
          'X-Title': 'NEXUS 5.5 | BLACKTOWER Dual-Brain Edition',
        },
        body: JSON.stringify({
          model: params.modelId,
          messages: params.messages,
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        let parsedMessage = `HTTP ${response.status}`;
        try {
          const jsonErr = JSON.parse(errBody);
          parsedMessage = jsonErr?.error?.message || jsonErr?.message || parsedMessage;
        } catch {
          if (errBody) parsedMessage = `${parsedMessage}: ${errBody.slice(0, 180)}`;
        }
        throw new Error(parsedMessage);
      }

      if (!response.body) {
        throw new Error('OpenRouter returned an empty response body.');
      }

      params.onStart();

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data:')) continue;

          const dataPayload = line.slice(5).trim();
          if (dataPayload === '[DONE]') {
            clearTimeout(timeoutId);
            params.onDone(fullText);
            return;
          }

          try {
            const parsed = JSON.parse(dataPayload);
            if (parsed.error) {
              throw new Error(parsed.error.message || 'OpenRouter stream error');
            }
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (typeof deltaContent === 'string' && deltaContent.length > 0) {
              fullText += deltaContent;
              params.onToken(deltaContent);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message.includes('OpenRouter stream error')) {
              throw parseErr;
            }
          }
        }
      }

      clearTimeout(timeoutId);
      params.onDone(fullText);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const openRouterClient = new OpenRouterClient();
