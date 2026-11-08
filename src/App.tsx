/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AgentTaskPanel } from './components/AgentTaskPanel.tsx';
import { ChatComposer } from './components/ChatComposer.tsx';
import { ChatWorkspace } from './components/ChatWorkspace.tsx';
import { LeftSidebar } from './components/LeftSidebar.tsx';
import { MemoryModal } from './components/MemoryModal.tsx';
import { ProjectsModal } from './components/ProjectsModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { ToolsConnectorsModal } from './components/ToolsConnectorsModal.tsx';
import { TopBar } from './components/TopBar.tsx';
import { apiClient, SystemStatusResponse } from './services/apiClient.ts';
import {
  AgentTask,
  BRAIN_MODELS,
  BrainRoutingDecision,
  BrainRoutingMode,
  BrainType,
  Conversation,
  FileAttachment,
  MCPConnectorAdapter,
  MemoryEntry,
  NexusSettings,
  ProjectWorkspace,
  ToolDefinition,
  ToolExecutionRecord,
} from './types/nexus.ts';

const FALLBACK_SETTINGS: NexusSettings = {
  defaultBrain: 'FLASH',
  brainMode: 'AUTO',
  flashModelId: BRAIN_MODELS.FLASH,
  reasoningModelId: BRAIN_MODELS.REASONING,
  fallbackModelId: 'openai/gpt-4o-mini',
  enableVerifiedFallback: true,
  temperature: 0.4,
  maxOutputTokens: 2048,
  streamingEnabled: true,
  memoryPolicy: {
    injectUserMemory: true,
    injectProjectMemory: true,
    requireExplicitApprovalToSave: true,
  },
  agentLimits: {
    maxPlanSteps: 6,
    toolTimeoutMs: 8000,
    requireApprovalForExternalTools: true,
  },
  enabledTools: {
    datetime_inspector: true,
    precision_calculator: true,
    text_summarizer_analyzer: true,
    file_content_analyzer: true,
    workspace_memory_lookup: true,
    external_webhook_dispatch: true,
  },
  appearance: {
    glassBlurIntensity: 'balanced',
    ambientGlow: 'violet_cyan',
    compactDensity: false,
  },
};

export default function App() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [settings, setSettings] = useState<NexusSettings>(FALLBACK_SETTINGS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectWorkspace[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [connectors, setConnectors] = useState<MCPConnectorAdapter[]>([]);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);

  // Active Brain & Router controls
  const [activeBrain, setActiveBrain] = useState<BrainType>('FLASH');
  const [brainMode, setBrainMode] = useState<BrainRoutingMode>('AUTO');

  // UI Panels & Modals
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [projectsModalOpen, setProjectsModalOpen] = useState(false);
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingRouting, setStreamingRouting] = useState<BrainRoutingDecision | null>(null);
  const [streamingTools, setStreamingTools] = useState<ToolExecutionRecord[]>([]);
  const [isRunningAgentTask, setIsRunningAgentTask] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || null;
  const selectedModel =
    activeBrain === 'REASONING' ? settings.reasoningModelId : settings.flashModelId;

  const loadInitialWorkspace = useCallback(async () => {
    try {
      const [statusData, convList, projList, memList, toolsData, tasksList] =
        await Promise.all([
          apiClient.getStatus(),
          apiClient.listConversations(),
          apiClient.listProjects(),
          apiClient.listMemories(),
          apiClient.listToolsAndConnectors(),
          apiClient.listAgentTasks(),
        ]);

      setStatus(statusData);
      setSettings(statusData.settings);
      setActiveBrain(statusData.settings.defaultBrain);
      setBrainMode(statusData.settings.brainMode);
      setConversations(convList);
      setProjects(projList);
      setMemories(memList);
      setTools(toolsData.tools);
      setConnectors(toolsData.connectors);
      setAgentTasks(tasksList);

      if (convList.length > 0) {
        setActiveConversationId(convList[0].id);
        setActiveBrain(convList[0].selectedBrain);
        setBrainMode(convList[0].brainMode);
      }
    } catch (err) {
      console.error('Failed to bootstrap NEXUS workspace:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialWorkspace();
  }, [loadInitialWorkspace]);

  // Keyboard shortcut Cmd/Ctrl + K for New Session
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // On narrow screens the side panels float over the chat instead of squeezing it
  useEffect(() => {
    const handleResize = () => {
      const narrow = window.innerWidth < 1024;
      setIsNarrow(narrow);
      if (narrow) setSidebarCollapsed(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter conversations when search or project changes
  const filteredConversations = conversations.filter((c) => {
    if (selectedProjectId && c.projectId !== selectedProjectId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleNewChat = async () => {
    try {
      const created = await apiClient.createConversation({
        title: 'New Operational Session',
        projectId: selectedProjectId,
        selectedBrain: activeBrain,
        selectedModel,
        brainMode,
      });
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      if (isNarrow) setSidebarCollapsed(true);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    if (isNarrow) setSidebarCollapsed(true);
    const found = conversations.find((c) => c.id === id);
    if (found) {
      setActiveBrain(found.selectedBrain);
      setBrainMode(found.brainMode);
    }
  };

  const executeChatStream = async (params: {
    content: string;
    attachments?: FileAttachment[];
    editFromMessageId?: string;
    regenerateFromAssistantId?: string;
  }) => {
    if (isStreaming) return;

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      const created = await apiClient.createConversation({
        title: 'New Operational Session',
        projectId: selectedProjectId,
        selectedBrain: activeBrain,
        selectedModel,
        brainMode,
      });
      setConversations((prev) => [created, ...prev]);
      targetConvId = created.id;
      setActiveConversationId(created.id);
    }

    setIsStreaming(true);
    setStreamingContent('');
    setStreamingRouting(null);
    setStreamingTools([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await apiClient.streamChat(
        {
          conversationId: targetConvId,
          content: params.content,
          mode: brainMode,
          requestedBrain: activeBrain,
          requestedModel: selectedModel,
          attachments: params.attachments,
          editFromMessageId: params.editFromMessageId,
          regenerateFromAssistantId: params.regenerateFromAssistantId,
          signal: controller.signal,
        },
        {
          onRoutingDecision: (data) => {
            setStreamingRouting(data.decision);
            setActiveBrain(data.decision.selectedBrain);
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== data.conversationId) return c;
                let msgs = [...c.messages];
                if (params.editFromMessageId) {
                  const idx = msgs.findIndex((m) => m.id === params.editFromMessageId);
                  if (idx !== -1) msgs = msgs.slice(0, idx);
                } else if (params.regenerateFromAssistantId) {
                  const idx = msgs.findIndex(
                    (m) => m.id === params.regenerateFromAssistantId
                  );
                  if (idx !== -1) msgs = msgs.slice(0, idx);
                }
                const alreadyExists = msgs.some((m) => m.id === data.userMessage.id);
                if (!alreadyExists) {
                  msgs.push(data.userMessage);
                }
                return {
                  ...c,
                  selectedBrain: data.decision.selectedBrain,
                  selectedModel: data.decision.requestedModelId,
                  messages: msgs,
                };
              })
            );
          },
          onRoutingUpdate: (updatedDecision) => {
            setStreamingRouting(updatedDecision);
          },
          onToolExecution: (record) => {
            setStreamingTools((prev) => [...prev, record]);
          },
          onToken: (token) => {
            setStreamingContent((prev) => prev + token);
          },
          onComplete: ({ conversation }) => {
            setConversations((prev) =>
              prev.map((c) => (c.id === conversation.id ? conversation : c))
            );
            setIsStreaming(false);
            setStreamingContent('');
            setStreamingRouting(null);
            setStreamingTools([]);
          },
          onError: ({ conversation }) => {
            if (conversation) {
              setConversations((prev) =>
                prev.map((c) => (c.id === conversation.id ? conversation : c))
              );
            }
            setIsStreaming(false);
            setStreamingContent('');
          },
        }
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Streaming error:', err);
      }
      // Refresh conversation state from server
      if (targetConvId) {
        const refreshed = await apiClient.getConversation(targetConvId).catch(() => null);
        if (refreshed) {
          setConversations((prev) =>
            prev.map((c) => (c.id === refreshed.id ? refreshed : c))
          );
        }
      }
      setIsStreaming(false);
      setStreamingContent('');
    }
  };

  const handleStopGeneration = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  const handleRunAgentTask = async (
    objective: string,
    attachments?: FileAttachment[]
  ) => {
    setAgentPanelOpen(true);
    setIsRunningAgentTask(true);
    try {
      const task = await apiClient.runAgentTask({
        objective,
        conversationId: activeConversationId,
        projectId: selectedProjectId,
        mode: brainMode,
        requestedBrain: activeBrain,
        attachments,
      });
      setAgentTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
    } catch (err) {
      console.error('Agent task execution error:', err);
    } finally {
      setIsRunningAgentTask(false);
    }
  };

  const handleResolveToolApproval = async (
    taskId: string,
    executionId: string,
    decision: 'approve' | 'reject'
  ) => {
    setIsRunningAgentTask(true);
    try {
      const updated = await apiClient.resolveAgentToolApproval(
        taskId,
        executionId,
        decision
      );
      setAgentTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      console.error('Failed to resolve approval gate:', err);
    } finally {
      setIsRunningAgentTask(false);
    }
  };

  const ambientClass =
    settings.appearance.ambientGlow === 'amethyst'
      ? 'from-purple-900/25 via-indigo-950/15 to-transparent'
      : settings.appearance.ambientGlow === 'obsidian_minimal'
      ? 'from-slate-900/15 via-transparent to-transparent'
      : 'from-violet-900/25 via-cyan-950/15 to-transparent';

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#07080c] text-slate-100 relative">
      {/* Atmospheric Glassmorphism Background Lighting */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] ${ambientClass} z-0`}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-48 left-1/3 w-[640px] h-[360px] rounded-full bg-violet-600/10 blur-[130px] z-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-48 right-1/4 w-[520px] h-[320px] rounded-full bg-cyan-500/8 blur-[130px] z-0"
      />

      {/* Top Bar */}
      <TopBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((p) => !p)}
        agentPanelOpen={agentPanelOpen}
        onToggleAgentPanel={() => setAgentPanelOpen((p) => !p)}
        operator={status?.operator || null}
        onOpenSettings={() => setSettingsModalOpen(true)}
        activeTasksCount={agentTasks.length}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex min-h-0 relative z-10">
        {/* Backdrop when a floating side panel is open on a narrow screen */}
        {isNarrow && (!sidebarCollapsed || agentPanelOpen) && (
          <div
            aria-hidden="true"
            onClick={() => {
              setSidebarCollapsed(true);
              setAgentPanelOpen(false);
            }}
            className="fixed inset-0 top-16 bg-black/55 backdrop-blur-sm z-20"
          />
        )}

        {/* Collapsible Left Sidebar */}
        <LeftSidebar
          collapsed={sidebarCollapsed}
          overlay={isNarrow}
          conversations={filteredConversations}
          activeConversationId={activeConversationId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onRenameConversation={async (id, title) => {
            const updated = await apiClient.updateConversation(id, { title });
            setConversations((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c))
            );
          }}
          onDeleteConversation={async (id) => {
            await apiClient.deleteConversation(id);
            setConversations((prev) => {
              const remaining = prev.filter((c) => c.id !== id);
              if (activeConversationId === id) {
                setActiveConversationId(remaining[0]?.id || null);
              }
              return remaining;
            });
          }}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          onOpenProjectsModal={() => setProjectsModalOpen(true)}
          onOpenAgentPanel={() => setAgentPanelOpen(true)}
          onOpenMemoryModal={() => setMemoryModalOpen(true)}
          onOpenToolsModal={() => setToolsModalOpen(true)}
          onOpenSettingsModal={() => setSettingsModalOpen(true)}
          memoryCount={memories.length}
          toolsCount={tools.length}
          tasksCount={agentTasks.length}
        />

        {/* Center Chat & Composer Column */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <ChatWorkspace
            messages={activeConversation?.messages || []}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            onQuickPrompt={(prompt, runAsAgent) => {
              if (runAsAgent) {
                handleRunAgentTask(prompt);
              } else {
                executeChatStream({ content: prompt });
              }
            }}
            onEditAndResend={(messageId, newContent) => {
              executeChatStream({
                content: newContent,
                editFromMessageId: messageId,
              });
            }}
            onRegenerate={(assistantMessageId) => {
              const msgs = activeConversation?.messages || [];
              const assistantIdx = msgs.findIndex((m) => m.id === assistantMessageId);
              const priorUserMsg =
                assistantIdx > 0 ? msgs[assistantIdx - 1] : msgs[msgs.length - 1];
              if (priorUserMsg) {
                executeChatStream({
                  content: priorUserMsg.content,
                  regenerateFromAssistantId: assistantMessageId,
                });
              }
            }}
            onSaveToMemory={async (title, content) => {
              const created = await apiClient.createMemory({
                category: selectedProjectId ? 'project_memory' : 'user_memory',
                title,
                content,
                projectId: selectedProjectId,
                conversationId: activeConversationId,
                tags: ['chat-insight'],
                userApproved: true,
              });
              setMemories((prev) => [created, ...prev]);
            }}
          />

          <ChatComposer
            onSendMessage={(content, attachments) =>
              executeChatStream({ content, attachments })
            }
            onRunAsAgentTask={(objective, attachments) =>
              handleRunAgentTask(objective, attachments)
            }
            onStopGeneration={handleStopGeneration}
            isStreaming={isStreaming}
          />
        </main>

        {/* Right Collapsible Agent Protocol Panel */}
        <AgentTaskPanel
          open={agentPanelOpen}
          overlay={isNarrow}
          onClose={() => setAgentPanelOpen(false)}
          tasks={agentTasks}
          isRunningTask={isRunningAgentTask}
          onLaunchTask={(objective) => handleRunAgentTask(objective)}
          onResolveApproval={handleResolveToolApproval}
        />
      </div>

      {/* Modals */}
      <MemoryModal
        open={memoryModalOpen}
        onClose={() => setMemoryModalOpen(false)}
        memories={memories}
        projects={projects}
        onCreateMemory={async (input) => {
          const created = await apiClient.createMemory(input);
          setMemories((prev) => [created, ...prev]);
        }}
        onUpdateMemory={async (id, updates) => {
          const updated = await apiClient.updateMemory(id, updates);
          setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }}
        onDeleteMemory={async (id) => {
          await apiClient.deleteMemory(id);
          setMemories((prev) => prev.filter((m) => m.id !== id));
        }}
      />

      <ProjectsModal
        open={projectsModalOpen}
        onClose={() => setProjectsModalOpen(false)}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        onCreateProject={async (input) => {
          const created = await apiClient.createProject(input);
          setProjects((prev) => [created, ...prev]);
        }}
        onDeleteProject={async (id) => {
          await apiClient.deleteProject(id);
          setProjects((prev) => prev.filter((p) => p.id !== id));
          if (selectedProjectId === id) setSelectedProjectId(null);
        }}
      />

      <ToolsConnectorsModal
        open={toolsModalOpen}
        onClose={() => setToolsModalOpen(false)}
        tools={tools}
        connectors={connectors}
        settings={settings}
        onToggleTool={async (toolName, enabled) => {
          const updated = await apiClient.updateSettings({
            enabledTools: {
              ...settings.enabledTools,
              [toolName]: enabled,
            },
          });
          setSettings(updated);
        }}
        onTestTool={(toolName, args, approvedByUser) =>
          apiClient.executeToolDirect(toolName, args, approvedByUser)
        }
        onRegisterConnector={async (input) => {
          const created = await apiClient.registerConnector(input);
          setConnectors((prev) => [...prev, created]);
        }}
      />

      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        gatewayStatus={status?.gateway || null}
        onSaveSettings={async (updates) => {
          const updated = await apiClient.updateSettings(updates);
          setSettings(updated);
          setActiveBrain(updated.defaultBrain);
          setBrainMode(updated.brainMode);
        }}
        onResetSettings={async () => {
          const reset = await apiClient.resetSettings();
          setSettings(reset);
          setActiveBrain(reset.defaultBrain);
          setBrainMode(reset.brainMode);
        }}
      />
    </div>
  );
}
