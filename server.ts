import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { agentEngine } from './server/agentEngine.ts';
import { aiRouter } from './server/aiRouter.ts';
import {
  getOperatorProfile,
  rateLimitMiddleware,
  sanitizeErrorMessage,
  securityHeadersMiddleware,
} from './server/authService.ts';
import { conversationService } from './server/conversationService.ts';
import { executionService } from './server/executionService.ts';
import { memoryService } from './server/memoryService.ts';
import { openRouterClient, OpenRouterMessage } from './server/openRouterClient.ts';
import { settingsService } from './server/settingsService.ts';
import { buildContextualSystemPrompt, wrapUntrustedContent } from './server/systemPrompt.ts';
import { toolRegistry } from './server/toolRegistry.ts';
import {
  BrainRoutingMode,
  BrainType,
  ChatMessage,
  FileAttachment,
  MemoryCategory,
  MemoryLayer,
  ToolExecutionRecord,
} from './src/types/nexus.ts';
import { MemoryStoreError } from './server/supabaseMemoryStore.ts';

/** Memory storage problems are reported as a friendly, actionable message. */
function memoryFailure(res: Response, err: unknown) {
  if (err instanceof MemoryStoreError) {
    return res.status(503).json({ error: err.message, code: err.code });
  }
  return res.status(500).json({ error: sanitizeErrorMessage(err) });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', rateLimitMiddleware(120));

  // 1. System & Gateway Status + Operator Profile
  app.get('/api/status', async (_req: Request, res: Response) => {
    res.json({
      gateway: await openRouterClient.getGatewayStatus(),
      operator: getOperatorProfile(),
      settings: settingsService.getSettings(),
    });
  });

  // 2. Settings Endpoints
  app.get('/api/settings', (_req: Request, res: Response) => {
    res.json(settingsService.getSettings());
  });

  app.put('/api/settings', (req: Request, res: Response) => {
    try {
      const updated = settingsService.updateSettings(req.body || {});
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: sanitizeErrorMessage(err) });
    }
  });

  app.post('/api/settings/reset', (_req: Request, res: Response) => {
    const reset = settingsService.resetSettings();
    res.json(reset);
  });

  // The user's own OpenRouter key. Never returned to the browser.
  app.put('/api/settings/openrouter-key', async (req: Request, res: Response) => {
    try {
      const { apiKey } = (req.body || {}) as { apiKey?: string };
      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ error: 'Enter your OpenRouter API key.' });
      }
      const { hint } = await settingsService.setOpenRouterApiKey(apiKey);
      return res.json({ gateway: await openRouterClient.getGatewayStatus(), hint });
    } catch (err) {
      return res.status(400).json({ error: sanitizeErrorMessage(err) });
    }
  });

  app.delete('/api/settings/openrouter-key', async (_req: Request, res: Response) => {
    settingsService.clearOpenRouterApiKey();
    res.json({ gateway: await openRouterClient.getGatewayStatus() });
  });

  // 3. Projects Workspace Endpoints
  app.get('/api/projects', (_req: Request, res: Response) => {
    res.json(conversationService.listProjects());
  });

  app.post('/api/projects', (req: Request, res: Response) => {
    const { name, description, systemInstructions, defaultBrain, defaultMode, colorAccent } =
      req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required.' });
    }
    const created = conversationService.createProject({
      name,
      description: description || '',
      systemInstructions: systemInstructions || '',
      defaultBrain,
      defaultMode,
      colorAccent,
    });
    return res.status(201).json(created);
  });

  app.delete('/api/projects/:id', (req: Request, res: Response) => {
    const ok = conversationService.deleteProject(req.params.id);
    res.json({ deleted: ok });
  });

  // 4. Conversations Endpoints
  app.get('/api/conversations', (req: Request, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    res.json(conversationService.listConversations({ search, projectId }));
  });

  app.get('/api/conversations/:id', (req: Request, res: Response) => {
    const conv = conversationService.getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
    return res.json(conv);
  });

  app.post('/api/conversations', (req: Request, res: Response) => {
    const conv = conversationService.createConversation(req.body || {});
    res.status(201).json(conv);
  });

  app.patch('/api/conversations/:id', (req: Request, res: Response) => {
    const updated = conversationService.updateConversationMeta(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Conversation not found.' });
    return res.json(updated);
  });

  app.delete('/api/conversations/:id', (req: Request, res: Response) => {
    const deleted = conversationService.deleteConversation(req.params.id);
    res.json({ deleted });
  });

  // 5. Chat Streaming & Dual-Brain Execution Endpoint (SSE)
  app.post('/api/chat/stream', async (req: Request, res: Response) => {
    try {
      const {
        conversationId,
        content,
        mode,
        requestedBrain,
        requestedModel,
        attachments,
        editFromMessageId,
        regenerateFromAssistantId,
      } = req.body as {
        conversationId?: string;
        content: string;
        mode?: BrainRoutingMode;
        requestedBrain?: BrainType;
        requestedModel?: string;
        attachments?: FileAttachment[];
        editFromMessageId?: string;
        regenerateFromAssistantId?: string;
      };

      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'Message content cannot be empty.' });
      }

      // Validate file attachments if provided
      const validAttachments: FileAttachment[] = [];
      if (Array.isArray(attachments)) {
        for (const att of attachments.slice(0, 5)) {
          if (att && typeof att.name === 'string' && typeof att.contentText === 'string') {
            if (att.sizeBytes > 1024 * 1024) {
              return res
                .status(400)
                .json({ error: `Attachment "${att.name}" exceeds maximum allowed size (1 MB).` });
            }
            validAttachments.push({
              id: att.id || `file-${Date.now()}`,
              name: att.name,
              mimeType: att.mimeType || 'text/plain',
              sizeBytes: att.sizeBytes || Buffer.byteLength(att.contentText, 'utf-8'),
              contentText: att.contentText.slice(0, 50000),
            });
          }
        }
      }

      let conv = conversationId ? conversationService.getConversation(conversationId) : null;
      if (!conv) {
        conv = conversationService.createConversation({
          selectedBrain: requestedBrain,
          selectedModel: requestedModel,
          brainMode: mode,
        });
      }

      // Handle message editing or regeneration truncation
      if (editFromMessageId) {
        conversationService.truncateMessagesFrom(conv.id, editFromMessageId);
      } else if (regenerateFromAssistantId) {
        conversationService.truncateMessagesFrom(conv.id, regenerateFromAssistantId);
      }

      // Append user message unless regenerating existing last user message
      let userMessage: ChatMessage;
      const refreshedConv = conversationService.getConversation(conv.id)!;
      if (
        regenerateFromAssistantId &&
        refreshedConv.messages.length > 0 &&
        refreshedConv.messages[refreshedConv.messages.length - 1].role === 'user'
      ) {
        userMessage = refreshedConv.messages[refreshedConv.messages.length - 1];
      } else {
        userMessage = {
          id: `msg-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          conversationId: conv.id,
          role: 'user',
          content: content.trim(),
          createdAt: new Date().toISOString(),
          attachments: validAttachments.length > 0 ? validAttachments : undefined,
          isEdited: Boolean(editFromMessageId),
        };
        conversationService.appendMessage(conv.id, userMessage);
      }

      // Update conversation active brain/mode metadata
      const effectiveMode = mode || conv.brainMode || 'AUTO';
      const { decision, toolCandidates } = aiRouter.routeRequest({
        prompt: userMessage.content,
        mode: effectiveMode,
        requestedBrain: requestedBrain || conv.selectedBrain,
        requestedModel: requestedModel || ( effectiveMode === 'MANUAL' ? conv.selectedModel : undefined ),
        attachments: userMessage.attachments,
      });

      conversationService.updateConversationMeta(conv.id, {
        brainMode: effectiveMode,
        selectedBrain: decision.selectedBrain,
        selectedModel: decision.requestedModelId,
      });

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendSSE = (event: string, payload: unknown) => {
        if (!res.writableEnded) {
          res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
        }
      };

      const abortController = new AbortController();
      req.on('close', () => {
        abortController.abort();
      });

      // Execute detected tools on the backend before model synthesis
      const executedTools: ToolExecutionRecord[] = [];
      for (const candidate of toolCandidates) {
        const record = await executionService.executeTool({
          toolName: candidate.toolName,
          args: candidate.args,
        });
        executedTools.push(record);
        sendSSE('tool_execution', record);
      }

      sendSSE('routing_decision', {
        conversationId: conv.id,
        userMessage,
        decision,
        toolExecutions: executedTools,
      });

      // Build contextual system prompt with Project + Memory + Sanitized Tool Outputs
      const settings = settingsService.getSettings();
      const project = conversationService.getProject(conv.projectId);
      const memories = await memoryService
        .getRelevantContextMemories({
          projectId: conv.projectId,
          conversationId: conv.id,
          includeUserMemory: settings.memoryPolicy.injectUserMemory,
          includeProjectMemory: settings.memoryPolicy.injectProjectMemory,
        })
        .catch((err) => {
          console.error('Memory unavailable for this turn:', err);
          return [];
        });

      const toolOutputsSummary =
        executedTools.length > 0
          ? executedTools
              .map(
                (t) =>
                  `Tool: ${t.toolName} | Status: ${t.status}\nOutput:\n${t.output || t.error || 'Pending operator approval'}`
              )
              .join('\n\n')
          : undefined;

      const systemPrompt = buildContextualSystemPrompt({
        activeBrain: decision.selectedBrain,
        executedModelId: decision.executedModelId,
        project,
        persona: settings.agentPersona,
        memories,
        toolOutputsSummary,
      });

      const latestConv = conversationService.getConversation(conv.id)!;
      const historyMessages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt },
        ...latestConv.messages.slice(-16).map((m) => {
          let msgContent = m.content;
          if (m.attachments && m.attachments.length > 0) {
            const attBlocks = m.attachments
              .map((a) => wrapUntrustedContent(`Attached File: ${a.name}`, a.contentText))
              .join('\n\n');
            msgContent = `${msgContent}\n\n${attBlocks}`;
          }
          return {
            role: m.role,
            content: msgContent,
          };
        }),
      ];

      await openRouterClient.streamChatCompletion({
        messages: historyMessages,
        decision,
        signal: abortController.signal,
        callbacks: {
          onMetadata: (updatedDecision) => {
            sendSSE('routing_update', updatedDecision);
          },
          onToken: (token) => {
            sendSSE('token', { token });
          },
          onComplete: (fullText, finalDecision) => {
            const assistantMsg: ChatMessage = {
              id: `msg-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              conversationId: conv!.id,
              role: 'assistant',
              content: fullText.trim() || 'Task completed.',
              createdAt: new Date().toISOString(),
              routingDecision: finalDecision,
              toolExecutions: executedTools.length > 0 ? executedTools : undefined,
            };
            const updatedConv = conversationService.appendMessage(conv!.id, assistantMsg);
            sendSSE('complete', {
              assistantMessage: assistantMsg,
              conversation: updatedConv,
            });
            res.end();
          },
          onError: (errMsg, finalDecision) => {
            const errorAssistantMsg: ChatMessage = {
              id: `msg-err-${Date.now()}`,
              conversationId: conv!.id,
              role: 'assistant',
              content: `**I couldn't reach the assistant.**\n\n${errMsg}`,
              createdAt: new Date().toISOString(),
              routingDecision: finalDecision,
              toolExecutions: executedTools.length > 0 ? executedTools : undefined,
              error: errMsg,
            };
            const updatedConv = conversationService.appendMessage(conv!.id, errorAssistantMsg);
            sendSSE('error_event', {
              error: errMsg,
              assistantMessage: errorAssistantMsg,
              conversation: updatedConv,
            });
            res.end();
          },
        },
      });
    } catch (err) {
      const msg = sanitizeErrorMessage(err);
      if (!res.headersSent) {
        res.status(500).json({ error: msg });
      } else {
        res.write(`event: error_event\ndata: ${JSON.stringify({ error: msg })}\n\n`);
        res.end();
      }
    }
  });

  // 6. Memory Vault Endpoints (Supabase-backed, encrypted at rest)
  app.get('/api/memory/status', async (_req: Request, res: Response) => {
    res.json(await memoryService.getStatus());
  });

  app.get('/api/memories', async (req: Request, res: Response) => {
    try {
      const category = req.query.category as MemoryCategory | undefined;
      const layer = req.query.layer as MemoryLayer | undefined;
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      res.json(await memoryService.listMemories({ category, layer, projectId, search }));
    } catch (err) {
      return memoryFailure(res, err);
    }
  });

  app.post('/api/memories', async (req: Request, res: Response) => {
    try {
      const { category, layer, title, content, projectId, conversationId, tags, userApproved } =
        req.body || {};
      if (!title || !content || (!category && !layer)) {
        return res.status(400).json({ error: 'A memory layer, title, and content are required.' });
      }
      const entry = await memoryService.createMemory({
        category,
        layer,
        title,
        content,
        projectId,
        conversationId,
        tags: Array.isArray(tags) ? tags : [],
        userApproved: userApproved ?? true,
      });
      return res.status(201).json(entry);
    } catch (err) {
      return memoryFailure(res, err);
    }
  });

  app.put('/api/memories/:id', async (req: Request, res: Response) => {
    try {
      const updated = await memoryService.updateMemory(req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ error: 'Memory entry not found.' });
      return res.json(updated);
    } catch (err) {
      return memoryFailure(res, err);
    }
  });

  app.delete('/api/memories/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await memoryService.deleteMemory(req.params.id);
      res.json({ deleted });
    } catch (err) {
      return memoryFailure(res, err);
    }
  });

  // 7. Tools & MCP Connectors Endpoints
  app.get('/api/tools', (_req: Request, res: Response) => {
    res.json({
      tools: toolRegistry.listTools(),
      connectors: toolRegistry.listConnectors(),
    });
  });

  app.post('/api/tools/execute', async (req: Request, res: Response) => {
    const { toolName, args, approvedByUser } = req.body || {};
    if (!toolName || typeof toolName !== 'string') {
      return res.status(400).json({ error: 'toolName is required.' });
    }
    const record = await executionService.executeTool({
      toolName,
      args: args || {},
      approvedByUser: Boolean(approvedByUser),
    });
    return res.json(record);
  });

  app.post('/api/connectors', (req: Request, res: Response) => {
    const { name, transport, endpointUrl, requiresApproval, exposedTools, description } =
      req.body || {};
    if (!name || !endpointUrl) {
      return res.status(400).json({ error: 'Connector name and endpointUrl are required.' });
    }
    const connector = toolRegistry.registerConnector({
      name,
      transport: transport || 'http_sse',
      endpointUrl,
      status: 'connected',
      requiresApproval: requiresApproval ?? true,
      exposedTools: Array.isArray(exposedTools) ? exposedTools : [],
      description: description || 'Custom modular MCP connector adapter.',
    });
    return res.status(201).json(connector);
  });

  // 8. Agent Engine Endpoints
  app.get('/api/agent/tasks', (req: Request, res: Response) => {
    const conversationId =
      typeof req.query.conversationId === 'string' ? req.query.conversationId : undefined;
    res.json(agentEngine.listTasks(conversationId));
  });

  app.post('/api/agent/tasks', async (req: Request, res: Response) => {
    try {
      const { objective, conversationId, projectId, mode, requestedBrain, attachments } =
        req.body || {};
      if (!objective || typeof objective !== 'string' || !objective.trim()) {
        return res.status(400).json({ error: 'Agent task objective is required.' });
      }
      const task = await agentEngine.createAndRunTask({
        objective: objective.trim(),
        conversationId,
        projectId,
        mode,
        requestedBrain,
        attachments,
      });
      return res.status(201).json(task);
    } catch (err) {
      return res.status(500).json({ error: sanitizeErrorMessage(err) });
    }
  });

  app.post('/api/agent/tasks/:taskId/approval', async (req: Request, res: Response) => {
    try {
      const { executionId, decision } = req.body || {};
      if (!executionId || (decision !== 'approve' && decision !== 'reject')) {
        return res.status(400).json({ error: 'Valid executionId and decision (approve/reject) required.' });
      }
      const updatedTask = await agentEngine.handleToolApprovalDecision(
        req.params.taskId,
        executionId,
        decision
      );
      if (!updatedTask) return res.status(404).json({ error: 'Agent task not found.' });
      return res.json(updatedTask);
    } catch (err) {
      return res.status(500).json({ error: sanitizeErrorMessage(err) });
    }
  });

  const httpServer = http.createServer(app);

  // Vite middleware for development / static serving for production
  if (process.env.NODE_ENV !== 'production') {
    app.use((_req: Request, res: Response, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[BLACKTOWER // NEXUS 5.5] Dual-Brain Server running on http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
