import { GoogleGenAI } from '@google/genai';
import { BrainRoutingDecision, GatewayStatus, ToolExecutionRecord } from '../src/types/nexus.ts';
import { sanitizeErrorMessage } from './authService.ts';
import { executionService } from './executionService.ts';
import { settingsService } from './settingsService.ts';
import type { OpenAIToolSchema } from './toolRegistry.ts';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_MODEL_CALLS = 5;

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface StreamCompletionCallbacks {
  onMetadata?: (decision: BrainRoutingDecision) => void;
  onToken: (token: string) => void;
  onToolExecution?: (record: ToolExecutionRecord) => void;
  onComplete: (fullText: string, finalDecision: BrainRoutingDecision) => void;
  onError: (errorMessage: string, finalDecision: BrainRoutingDecision) => void;
}

interface StreamResult {
  text: string;
  toolCalls: ChatToolCall[];
}

interface RunState {
  toolsExecuted: boolean;
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export class OpenRouterClient {
  public getGatewayStatus(): GatewayStatus {
    const settings = settingsService.getSettings();
    const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    const hasOpenRouterKey = Boolean(openRouterKey && openRouterKey !== 'YOUR_OPENROUTER_API_KEY');
    const hasGeminiKey = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');

    return {
      chatGatewayReady:
        hasOpenRouterKey || (settings.enableVerifiedFallback && hasGeminiKey),
      toolCallingEnabled: hasOpenRouterKey,
      configuredModels: {
        flash: settings.flashModelId,
        reasoning: settings.reasoningModelId,
        fallback: settings.fallbackModelId,
      },
    };
  }

  /**
   * Streams a chat completion and runs a real function-calling loop:
   * the model may request tools, the server executes them, and the result is
   * fed back until the model produces its final answer.
   */
  public async streamChatCompletion(params: {
    messages: OpenRouterMessage[];
    decision: BrainRoutingDecision;
    tools?: OpenAIToolSchema[];
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    callbacks: StreamCompletionCallbacks;
  }): Promise<void> {
    const settings = settingsService.getSettings();
    const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
    const hasOpenRouterKey = Boolean(openRouterKey && openRouterKey !== 'YOUR_OPENROUTER_API_KEY');

    const temperature = params.temperature ?? settings.temperature;
    const maxTokens = params.maxTokens ?? settings.maxOutputTokens;
    const decision: BrainRoutingDecision = { ...params.decision };
    const runState: RunState = { toolsExecuted: false };

    if (hasOpenRouterKey) {
      try {
        await this.runWithTools({
          apiKey: openRouterKey!,
          modelId: decision.requestedModelId,
          messages: params.messages,
          tools: params.tools,
          temperature,
          maxTokens,
          signal: params.signal,
          callbacks: params.callbacks,
          decision,
          state: runState,
          onStart: () => params.callbacks.onMetadata?.(decision),
        });
        return;
      } catch (primaryErr) {
        if (params.signal?.aborted) return;
        const primaryErrMsg = sanitizeErrorMessage(primaryErr);

        // Never retry automatically once a tool already ran: that could repeat a
        // real action such as sending an email or creating an event.
        if (runState.toolsExecuted) {
          params.callbacks.onError(primaryErrMsg, decision);
          return;
        }

        if (settings.enableVerifiedFallback && settings.fallbackModelId) {
          try {
            decision.fallbackTriggered = true;
            decision.gatewayUsed = 'fallback_openrouter';
            decision.executedModelId = settings.fallbackModelId;
            decision.fallbackReason = `Primary model "${decision.requestedModelId}" was unavailable (${primaryErrMsg}).`;

            await this.runWithTools({
              apiKey: openRouterKey!,
              modelId: settings.fallbackModelId,
              messages: params.messages,
              tools: params.tools,
              temperature,
              maxTokens,
              signal: params.signal,
              callbacks: params.callbacks,
              decision,
              state: runState,
              onStart: () => params.callbacks.onMetadata?.(decision),
            });
            return;
          } catch (fallbackErr) {
            if (params.signal?.aborted) return;
            if (settings.enableVerifiedFallback && process.env.GEMINI_API_KEY) {
              // Fall through to the verified Gemini fallback below.
            } else {
              params.callbacks.onError(
                `${primaryErrMsg} (fallback model also failed: ${sanitizeErrorMessage(fallbackErr)})`,
                decision
              );
              return;
            }
          }
        } else {
          params.callbacks.onError(primaryErrMsg, decision);
          return;
        }
      }
    }

    // Verified server-side fallback used only when OpenRouter cannot be used at all.
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const hasGeminiKey = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');

    if (settings.enableVerifiedFallback && hasGeminiKey) {
      const fallbackGeminiModel = 'gemini-2.5-flash';
      decision.fallbackTriggered = true;
      decision.gatewayUsed = 'fallback_gemini';
      decision.executedModelId = fallbackGeminiModel;
      decision.fallbackReason = hasOpenRouterKey
        ? `Requested model "${decision.requestedModelId}" was unavailable.`
        : `The primary chat gateway is not configured.`;

      params.callbacks.onMetadata?.(decision);

      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const systemMsg = params.messages.find((m) => m.role === 'system')?.content || '';
        const transcript = params.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => `${m.role === 'user' ? 'User' : 'NEXUS'}: ${m.content ?? ''}`)
          .join('\n\n');

        const responseStream = await ai.models.generateContentStream({
          model: fallbackGeminiModel,
          contents: transcript || 'Hello',
          config: { systemInstruction: systemMsg },
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

        params.callbacks.onComplete(fullText, decision);
        return;
      } catch (geminiErr) {
        params.callbacks.onError(
          `The chat gateway could not be reached: ${sanitizeErrorMessage(geminiErr)}`,
          decision
        );
        return;
      }
    }

    params.callbacks.onError(
      'The chat gateway is not configured on the server. Add the OPENROUTER_API_KEY secret and try again.',
      decision
    );
  }

  /**
   * Non-streaming completion helper used by internal agent verification steps.
   */
  public async completeOnce(params: {
    messages: OpenRouterMessage[];
    decision: BrainRoutingDecision;
    tools?: OpenAIToolSchema[];
    onToolExecution?: (record: ToolExecutionRecord) => void;
  }): Promise<{ text: string; finalDecision: BrainRoutingDecision }> {
    return new Promise((resolve, reject) => {
      let accumulated = '';
      this.streamChatCompletion({
        messages: params.messages,
        decision: params.decision,
        tools: params.tools,
        callbacks: {
          onToken: (token) => {
            accumulated += token;
          },
          onToolExecution: params.onToolExecution,
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

  private async runWithTools(params: {
    apiKey: string;
    modelId: string;
    messages: OpenRouterMessage[];
    tools?: OpenAIToolSchema[];
    temperature: number;
    maxTokens: number;
    signal?: AbortSignal;
    callbacks: StreamCompletionCallbacks;
    decision: BrainRoutingDecision;
    state: RunState;
    onStart: () => void;
  }): Promise<void> {
    const conversation: OpenRouterMessage[] = params.messages.map((message) => ({ ...message }));
    let accumulated = '';
    let modelCalls = 0;
    let metadataSent = false;

    while (true) {
      modelCalls += 1;
      const canUseTools = Boolean(params.tools && params.tools.length > 0) && modelCalls < MAX_MODEL_CALLS;

      const result = await this.invokeOpenRouterStream({
        apiKey: params.apiKey,
        modelId: params.modelId,
        messages: conversation,
        tools: canUseTools ? params.tools : undefined,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        signal: params.signal,
        onStart: () => {
          if (!metadataSent) {
            metadataSent = true;
            params.onStart();
          }
        },
        onToken: (token) => {
          accumulated += token;
          params.callbacks.onToken(token);
        },
      });

      if (result.toolCalls.length === 0) {
        params.callbacks.onComplete(accumulated, params.decision);
        return;
      }

      conversation.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const toolName = call.function?.name || '';
        const record = await executionService.executeTool({
          toolName,
          args: parseToolArguments(call.function?.arguments || ''),
        });
        params.state.toolsExecuted = true;
        params.callbacks.onToolExecution?.(record);

        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          name: toolName,
          content:
            record.output ||
            (record.status === 'pending_approval'
              ? 'This action is waiting for the user to approve it in the app. Tell the user it needs approval.'
              : `Tool failed: ${record.error || 'unknown error'}`),
        });
      }

      if (modelCalls >= MAX_MODEL_CALLS) {
        // Ask once more without tools so the user always gets a written answer.
        await this.invokeOpenRouterStream({
          apiKey: params.apiKey,
          modelId: params.modelId,
          messages: conversation,
          tools: undefined,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          signal: params.signal,
          onStart: () => undefined,
          onToken: (token) => {
            accumulated += token;
            params.callbacks.onToken(token);
          },
        });
        params.callbacks.onComplete(accumulated, params.decision);
        return;
      }
    }
  }

  private async invokeOpenRouterStream(params: {
    apiKey: string;
    modelId: string;
    messages: OpenRouterMessage[];
    tools?: OpenAIToolSchema[];
    temperature: number;
    maxTokens: number;
    signal?: AbortSignal;
    onStart: () => void;
    onToken: (token: string) => void;
  }): Promise<StreamResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();

    if (params.signal) {
      if (params.signal.aborted) controller.abort();
      else params.signal.addEventListener('abort', forwardAbort);
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
          ...(params.tools && params.tools.length > 0
            ? { tools: params.tools, tool_choice: 'auto' }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        let parsedMessage = `Gateway error (HTTP ${response.status}).`;
        try {
          const jsonErr = JSON.parse(errBody);
          parsedMessage = jsonErr?.error?.message || jsonErr?.message || parsedMessage;
        } catch {
          if (errBody) parsedMessage = `${parsedMessage} ${errBody.slice(0, 180)}`;
        }
        throw new Error(parsedMessage);
      }

      if (!response.body) {
        throw new Error('The chat gateway returned an empty response.');
      }

      params.onStart();

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let text = '';
      const toolCalls: ChatToolCall[] = [];

      const handleData = (dataPayload: string): boolean => {
        if (dataPayload === '[DONE]') return true;
        try {
          const parsed = JSON.parse(dataPayload);
          if (parsed?.error) {
            throw new Error(parsed.error.message || 'Chat gateway stream error.');
          }
          const delta = parsed?.choices?.[0]?.delta;
          if (!delta) return false;

          if (typeof delta.content === 'string' && delta.content.length > 0) {
            text += delta.content;
            params.onToken(delta.content);
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const fragment of delta.tool_calls) {
              const index = typeof fragment.index === 'number' ? fragment.index : toolCalls.length;
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: fragment.id || `call-${Date.now()}-${index}`,
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (fragment.id) toolCalls[index].id = fragment.id;
              if (typeof fragment.function?.name === 'string') {
                toolCalls[index].function.name += fragment.function.name;
              }
              if (typeof fragment.function?.arguments === 'string') {
                toolCalls[index].function.arguments += fragment.function.arguments;
              }
            }
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.includes('gateway stream error')) {
            throw parseErr;
          }
        }
        return false;
      };

      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
          if (handleData(line.slice(5).trim())) {
            finished = true;
            break;
          }
        }
      }

      return { text, toolCalls: toolCalls.filter((call) => call && call.function.name) };
    } finally {
      clearTimeout(timeoutId);
      if (params.signal) params.signal.removeEventListener('abort', forwardAbort);
    }
  }
}

export const openRouterClient = new OpenRouterClient();
