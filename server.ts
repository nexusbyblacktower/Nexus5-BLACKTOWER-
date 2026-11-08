import 'dotenv/config';
import crypto from 'crypto';
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
import { googleWorkspaceService } from './server/googleWorkspaceService.ts';
import { memoryService } from './server/memoryService.ts';
import { openRouterClient, OpenRouterMessage } from './server/openRouterClient.ts';
import { settingsService } from './server/settingsService.ts';
import {
  getSupabaseStatus,
  isSupabaseConfigured,
  listDocs,
} from './server/supabaseStore.ts';
import { buildContextualSystemPrompt, wrapUntrustedContent } from './server/systemPrompt.ts';
import { toolRegistry } from './server/toolRegistry.ts';
import {
  BrainRoutingMode,
  BrainType,
  ChatMessage,
  Conversation,
  FileAttachment,
  MemoryCategory,
  MemoryEntry,
  NexusSettings,
  ProjectWorkspace,
  ToolExecutionRecord,
} from './src/types/nexus.ts';

const oauthStates = new Map<string, { createdAt: number; redirectUri: string }>();

function requestBaseUrl(req: Request): string {
  const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)
    ?.split(',')[0]
    ?.trim();
  const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)
    ?.split(',')[0]
    ?.trim();
  const host = forwardedHost || req.headers.host || `localhost:3000`;
  const proto = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function friendlyAssistantError(raw: string): string {
  if (/google workspace|reconnect|revoked/i.test(raw)) {
    return 'I need access to your Google Workspace for that. Open Connections, connect your Google account, then ask me again.';
  }
  if (/not configured|OPENROUTER_API_KEY|gateway is not configured/i.test(raw)) {
    return 'The assistant is not fully configured yet. Please finish setup in Connections and try again.';
  }
  if (/rate limit|429|too many requests/i.test(raw)) {
    return 'That request was rate-limited. Give it a moment and try again.';
  }
  return 'I could not complete that request. Please try again in a moment.';
}

async function buildConnections(req: Request) {
  const google = await googleWorkspaceService.getStatus();
  const storage = await getSupabaseStatus();
  return {
    google: {
      ...google,
      redirectUri: `${requestBaseUrl(req)}/api/google/callback`,
    },
    storage: {
      configured: storage.configured,
      reachable: storage.reachable,
      schemaReady: storage.schemaReady,
      engine: storage.configured && storage.schemaReady ? 'supabase' : 'local',
      error: storage.error,
    },
  };
}

/** Loads conversations, settings and memories from Supabase (falls back to local files). */
async function bootstrapPersistence(): Promise<void> {
  const status = await getSupabaseStatus(true);
  if (!isSupabaseConfigured() || !status.schemaReady) {
    console.warn(
      '[persistence] Local storage in use.',
      status.configured ? status.error || '' : 'Supabase credentials are not set.'
    );
    return;
  }

  try {
    const [conversationRows, projectRows, memoryRows, settingsRows] = await Promise.all([
      listDocs<Conversation>('conversation'),
      listDocs<ProjectWorkspace>('project'),
      listDocs<MemoryEntry>('memory'),
      listDocs<NexusSettings>('settings'),
    ]);

    conversationService.hydrateFromCloud(projectRows, conversationRows);
    memoryService.hydrateFromCloud(memoryRows);
    settingsService.hydrateFromCloud(settingsRows[0] || null);

    console.log(
      `[persistence] Supabase synced: ${conversationRows.length} conversations, ${projectRows.length} projects, ${memoryRows.length} memories, settings ${settingsRows.length ? 'loaded' : 'seeded'}.`
    );
  } catch (err) {
    console.error('[persistence] Supabase hydration failed, keeping local cache:', sanitizeErrorMessage(err));
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  await bootstrapPersistence();

  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', rateLimitMiddleware(120));

  // 1. System Status + Operator Profile + Connection Health
  app.get('/api/status', async (req: Request, res: Response) => {
    res.json({
      gateway: openRouterClient.getGatewayStatus(),
      operator: getOperatorProfile(),
      settings: settingsService.getSettings(),
      connections: await buildConnections(req),
    });
  });

  app.get('/api/connections', async (req: Request, res: Response) => {
    res.json(await buildConnections(req));
  });

  // Google Workspace OAuth
  app.get('/api/google/connect', (req: Request, res: Response) => {
    try {
      const redirectUri = `${requestBaseUrl(req)}/api/google/callback`;
      const state = crypto.randomBytes(18).toString('hex');
      oauthStates.set(state, { createdAt: Date.now(), redirectUri });
      const url = googleWorkspaceService.buildAuthorizationUrl({ redirectUri, state });
      res.redirect(url);
    } catch (err) {
      res.status(400).json({ error: sanitizeErrorMessage(err) });
    }
  });

  app.get('/api/google/callback', async (req: Request, res: Response) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const denied = typeof req.query.error === 'string';
    const entry = state ? oauthStates.get(state) : undefined;
    if (state) oauthStates.delete(state);

    if (denied) return res.redirect('/?google=denied');
    if (!code || !entry) return res.redirect('/?google=invalid');

    try {
      await googleWorkspaceService.completeAuthorization({ code, redirectUri: entry.redirectUri });
      return res.redirect('/?google=connected');
    } catch (err) {
      console.error('[google] authorization failed:', sanitizeErrorMessage(err));
      return res.redirect('/?google=error');
    }
  });

  app.post('/api/google/disconnect', async (_req: Request, res: Response) => {
    try {
      await googleWorkspaceService.disconnect();
      res.json({ disconnected: true });
    } catch (err) {
      res.status(500).json({ error: sanitizeErrorMessage(err) });
    }
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

  app.post('/api/gateway/check', async (_req: Request, res: Response) => {
    try {
      const { decision } = aiRouter.routeRequest({ prompt: 'ping', mode: 'MANUAL', requestedBrain: 'FLASH' });
      const { text } = await openRouterClient.completeOnce({
        decision,
        messages: [
          { role: 'system', content: 'Reply with the single word OK.' },
          { role: 'user', content: 'ping' },
        ],
      });
      res.json({ ok: Boolean(text.trim()), message: 'Chat gateway responded.' });
    } catch (err) {
      res.status(502).json({ ok: false, error: friendlyAssistantError(sanitizeErrorMessage(err)) });
    }
  });

  app.post('/api/settings/reset', (_req: Request, res: Response) => {
    const reset = settingsService.resetSettings();
    res.json(reset);
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
      const { decision } = aiRouter.routeRequest({
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
      // Abort only when the client actually disconnects. Listening on `req`
      // fires as soon as the request body ends, which aborted every reply.
      res.on('close', () => {
        if (!res.writableEnded) abortController.abort();
      });

      const executedTools: ToolExecutionRecord[] = [];

      sendSSE('routing_decision', {
        conversationId: conv.id,
        userMessage,
        decision,
        toolExecutions: [],
      });

      // Build the contextual prompt: project directives + memories relevant to this message.
      const settings = settingsService.getSettings();
      const project = conversationService.getProject(conv.projectId);
      const memories = memoryService.getRelevantContextMemories({
        projectId: conv.projectId,
        conversationId: conv.id,
        includeUserMemory: settings.memoryPolicy.injectUserMemory,
        includeProjectMemory: settings.memoryPolicy.injectProjectMemory,
        query: `${userMessage.content} ${project?.name || ''}`,
      });

      const systemPrompt = buildContextualSystemPrompt({
        activeBrain: decision.selectedBrain,
        executedModelId: decision.executedModelId,
        project,
        memories,
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

      const toolSchemas = toolRegistry.getOpenAITools(settings.enabledTools);

      await openRouterClient.streamChatCompletion({
        messages: historyMessages,
        decision,
        tools: toolSchemas,
        signal: abortController.signal,
        callbacks: {
          onMetadata: (updatedDecision) => {
            sendSSE('routing_update', updatedDecision);
          },
          onToolExecution: (record) => {
            executedTools.push(record);
            sendSSE('tool_execution', record);
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
              content: friendlyAssistantError(errMsg),
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

  // 6. Memory Vault Endpoints
  app.get('/api/memories', (req: Request, res: Response) => {
    const category = req.query.category as MemoryCategory | undefined;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json(memoryService.listMemories({ category, projectId, search }));
  });

  app.post('/api/memories', (req: Request, res: Response) => {
    const { category, title, content, projectId, conversationId, tags, userApproved } =
      req.body || {};
    if (!title || !content || !category) {
      return res.status(400).json({ error: 'Category, title, and content are required.' });
    }
    const entry = memoryService.createMemory({
      category,
      title,
      content,
      projectId,
      conversationId,
      tags: Array.isArray(tags) ? tags : [],
      userApproved: userApproved ?? true,
    });
    return res.status(201).json(entry);
  });

  app.put('/api/memories/:id', (req: Request, res: Response) => {
    const updated = memoryService.updateMemory(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Memory entry not found.' });
    return res.json(updated);
  });

  app.delete('/api/memories/:id', (req: Request, res: Response) => {
    const deleted = memoryService.deleteMemory(req.params.id);
    res.json({ deleted });
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
