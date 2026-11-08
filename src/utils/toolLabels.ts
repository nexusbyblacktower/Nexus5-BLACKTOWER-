const TOOL_LABELS: Record<string, string> = {
  datetime_inspector: 'Checked the time',
  precision_calculator: 'Calculated',
  text_summarizer_analyzer: 'Analyzed text',
  file_content_analyzer: 'Read attachment',
  workspace_memory_lookup: 'Recalled memory',
  memory_save: 'Saved to memory',
  gmail_search: 'Searched Gmail',
  gmail_read: 'Read email',
  gmail_send: 'Sent email',
  calendar_list_events: 'Checked calendar',
  calendar_create_event: 'Created event',
  drive_search: 'Searched Drive',
  drive_read_file: 'Read document',
  external_webhook_dispatch: 'Sent to webhook',
};

/** Short, user-facing label for a tool invocation (never a backend name). */
export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || 'Used a tool';
}
