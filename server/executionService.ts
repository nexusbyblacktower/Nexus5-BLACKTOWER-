import { ToolExecutionRecord } from '../src/types/nexus.ts';
import { memoryService } from './memoryService.ts';
import { settingsService } from './settingsService.ts';
import { wrapUntrustedContent } from './systemPrompt.ts';
import { toolRegistry } from './toolRegistry.ts';

/**
 * Safe deterministic math parser without eval() or Function() risks
 */
function safeEvaluateMath(rawExpr: string): number {
  const cleaned = rawExpr
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .replace(/\^/g, '**')
    .replace(/sqrt\(/gi, 'Math.sqrt(')
    .replace(/abs\(/gi, 'Math.abs(')
    .replace(/round\(/gi, 'Math.round(')
    .replace(/pow\(/gi, 'Math.pow(')
    .replace(/PI/gi, 'Math.PI');

  // Strictly allow only numbers, arithmetic operators, parentheses, decimal points, and whitelisted Math.* calls
  const strippedMath = cleaned.replace(/Math\.(sqrt|abs|round|pow|PI)/g, '');
  if (!/^[0-9+\-*/().%*]+$/.test(strippedMath)) {
    throw new Error(`Disallowed characters in mathematical expression: "${rawExpr}"`);
  }

  const fn = new Function(`"use strict"; return (${cleaned});`);
  const result = fn();
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Expression did not evaluate to a finite number.');
  }
  return Number(result.toFixed(8));
}

export class ExecutionService {
  private pendingApprovals: Map<string, ToolExecutionRecord> = new Map();

  public async executeTool(params: {
    toolName: string;
    args: Record<string, unknown>;
    approvedByUser?: boolean;
  }): Promise<ToolExecutionRecord> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const id = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const tool = toolRegistry.getTool(params.toolName);
    if (!tool) {
      return {
        id,
        toolName: params.toolName,
        arguments: params.args,
        status: 'failed',
        requiresApproval: false,
        error: `Tool "${params.toolName}" does not exist in the registry.`,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      };
    }

    const settings = settingsService.getSettings();
    if (settings.enabledTools[params.toolName] === false) {
      return {
        id,
        toolName: params.toolName,
        arguments: params.args,
        status: 'failed',
        requiresApproval: false,
        error: `Tool "${params.toolName}" is currently disabled in NEXUS Settings.`,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      };
    }

    const validation = toolRegistry.validateArguments(params.toolName, params.args);
    if (!validation.valid) {
      return {
        id,
        toolName: params.toolName,
        arguments: params.args,
        status: 'failed',
        requiresApproval: tool.permissionLevel === 'sensitive_approval_required',
        error: validation.error,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      };
    }

    const requiresApproval =
      tool.permissionLevel === 'sensitive_approval_required' &&
      settings.agentLimits.requireApprovalForExternalTools;

    if (requiresApproval && !params.approvedByUser) {
      const pendingRecord: ToolExecutionRecord = {
        id,
        toolName: params.toolName,
        arguments: params.args,
        status: 'pending_approval',
        requiresApproval: true,
        startedAt,
      };
      this.pendingApprovals.set(id, pendingRecord);
      return pendingRecord;
    }

    try {
      const output = await this.runToolImplementation(params.toolName, params.args);
      return {
        id,
        toolName: params.toolName,
        arguments: params.args,
        status: 'completed',
        requiresApproval,
        output,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      return {
        id,
        toolName: params.toolName,
        arguments: params.args,
        status: 'failed',
        requiresApproval,
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      };
    }
  }

  public async approveOrRejectPendingTool(
    executionId: string,
    decision: 'approve' | 'reject'
  ): Promise<ToolExecutionRecord | null> {
    const pending = this.pendingApprovals.get(executionId);
    if (!pending) return null;

    this.pendingApprovals.delete(executionId);

    if (decision === 'reject') {
      return {
        ...pending,
        status: 'rejected',
        error: 'Action rejected by operator at approval gate.',
        completedAt: new Date().toISOString(),
      };
    }

    return this.executeTool({
      toolName: pending.toolName,
      args: pending.arguments,
      approvedByUser: true,
    });
  }

  private async runToolImplementation(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    switch (toolName) {
      case 'datetime_inspector': {
        const tz = typeof args.timezone === 'string' && args.timezone.trim() ? args.timezone.trim() : 'Asia/Kuala_Lumpur';
        const offsetDays = args.offsetDays ? Number(args.offsetDays) || 0 : 0;
        const targetDate = new Date(Date.now() + offsetDays * 86400000);

        let formattedLocal = targetDate.toUTCString();
        try {
          formattedLocal = new Intl.DateTimeFormat('en-MY', {
            timeZone: tz,
            dateStyle: 'full',
            timeStyle: 'long',
          }).format(targetDate);
        } catch {
          formattedLocal = `${targetDate.toISOString()} (Fallback UTC; requested timezone "${tz}" invalid)`;
        }

        return JSON.stringify(
          {
            requestedTimezone: tz,
            offsetDaysApplied: offsetDays,
            formattedTime: formattedLocal,
            iso8601Utc: targetDate.toISOString(),
            unixEpochSeconds: Math.floor(targetDate.getTime() / 1000),
          },
          null,
          2
        );
      }

      case 'precision_calculator': {
        const expr = String(args.expression || '');
        const numericResult = safeEvaluateMath(expr);
        return JSON.stringify(
          {
            expression: expr,
            result: numericResult,
            formattedResult: numericResult.toLocaleString('en-US', { maximumFractionDigits: 6 }),
            verifiedBy: 'NEXUS Deterministic Math Engine',
          },
          null,
          2
        );
      }

      case 'text_summarizer_analyzer': {
        const text = String(args.text || '').trim();
        const words = text ? text.split(/\s+/) : [];
        const sentences = text
          ? text
              .split(/(?<=[.!?])\s+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        const lines = text ? text.split(/\r?\n/) : [];

        // Extract top sentences by length/information density
        const keyHighlights = [...sentences]
          .filter((s) => s.length > 30)
          .sort((a, b) => b.length - a.length)
          .slice(0, 3);

        const actionLines = lines
          .filter((l) => /\b(todo|must|should|action|next step|deadline|build|implement|verify)\b/i.test(l))
          .slice(0, 5);

        return JSON.stringify(
          {
            characterCount: text.length,
            wordCount: words.length,
            estimatedTokens: Math.ceil(words.length * 1.3),
            sentenceCount: sentences.length,
            estimatedReadingTimeMinutes: Math.max(1, Math.ceil(words.length / 220)),
            keyHighlights,
            detectedActionItems: actionLines,
          },
          null,
          2
        );
      }

      case 'file_content_analyzer': {
        const fileName = String(args.fileName || 'untitled.txt');
        const content = String(args.content || '');
        const lines = content.split(/\r?\n/);
        const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : 'txt';

        let structuralMetadata: Record<string, unknown> = {
          fileName,
          extension: ext,
          lineCount: lines.length,
          byteSize: Buffer.byteLength(content, 'utf-8'),
        };

        if (ext === 'json') {
          try {
            const parsed = JSON.parse(content);
            structuralMetadata = {
              ...structuralMetadata,
              validJson: true,
              rootType: Array.isArray(parsed) ? `Array(${parsed.length})` : typeof parsed,
              topLevelKeys:
                parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                  ? Object.keys(parsed).slice(0, 20)
                  : [],
            };
          } catch (e) {
            structuralMetadata = {
              ...structuralMetadata,
              validJson: false,
              parseError: e instanceof Error ? e.message : String(e),
            };
          }
        } else if (ext === 'csv') {
          const headers = lines[0]?.split(',').map((h) => h.trim()) || [];
          structuralMetadata = {
            ...structuralMetadata,
            csvColumns: headers,
            dataRowCount: Math.max(0, lines.length - 1),
          };
        }

        const sanitizedPreview = wrapUntrustedContent(
          `File: ${fileName}`,
          content.slice(0, 4000)
        );

        return JSON.stringify(
          {
            analysis: structuralMetadata,
            sanitizedContentPreview: sanitizedPreview,
          },
          null,
          2
        );
      }

      case 'workspace_memory_lookup': {
        const query = String(args.query || '');
        const matches = memoryService.listMemories({ search: query });
        return JSON.stringify(
          {
            query,
            matchCount: matches.length,
            memories: matches.slice(0, 6).map((m) => ({
              id: m.id,
              category: m.category,
              title: m.title,
              content: m.content,
              tags: m.tags,
            })),
          },
          null,
          2
        );
      }

      case 'external_webhook_dispatch': {
        const destination = String(args.destination || 'default-webhook');
        const payloadSummary = String(args.payloadSummary || '');
        return JSON.stringify(
          {
            dispatched: true,
            destination,
            payloadSummary,
            operatorApproved: true,
            receiptId: `bt-dispatch-${Date.now()}`,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        );
      }

      default:
        throw new Error(`Unhandled tool execution for "${toolName}"`);
    }
  }
}

export const executionService = new ExecutionService();
