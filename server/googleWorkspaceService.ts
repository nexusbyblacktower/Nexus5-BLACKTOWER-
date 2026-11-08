/**
 * Google Workspace connector.
 *
 * OAuth 2.0 installed-app flow with offline access. The refresh token is kept in
 * the persistence layer (Supabase, with a local cache fallback) so the
 * connection survives restarts and sandbox rebuilds. Access tokens are refreshed
 * automatically shortly before they expire.
 */

import { listDocRecords, syncDoc, unsyncDoc } from './supabaseStore.ts';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';
const TOKEN_DOC_ID = 'google-workspace';
const TOKEN_KIND = 'integration';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
];

interface GoogleTokenRecord {
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  scope?: string;
  email?: string;
  connectedAt?: string;
  lastRefreshedAt?: string;
}

export interface GoogleConnectionStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: string;
  scopes?: string[];
  lastError?: string;
}

function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() || '';
}

function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
}

function isPlaceholder(value: string): boolean {
  return !value || /YOUR_|MY_|xxxx|changeme/i.test(value);
}

export function isGoogleConfigured(): boolean {
  return !isPlaceholder(clientId()) && !isPlaceholder(clientSecret());
}

export class GoogleWorkspaceService {
  private tokens: GoogleTokenRecord | null = null;
  private loaded = false;
  private loading: Promise<void> | null = null;
  private lastError: string | undefined;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const docs = await listDocRecords<GoogleTokenRecord>(TOKEN_KIND);
        const record = docs.find((doc) => doc.id === TOKEN_DOC_ID) || docs[0];
        this.tokens = record?.data || null;
      } catch (err) {
        console.error(
          '[google] could not load stored connection:',
          err instanceof Error ? err.message : err
        );
      } finally {
        this.loaded = true;
        this.loading = null;
      }
    })();
    return this.loading;
  }

  public async getStatus(): Promise<GoogleConnectionStatus> {
    await this.ensureLoaded();
    return {
      configured: isGoogleConfigured(),
      connected: Boolean(this.tokens?.refreshToken),
      email: this.tokens?.email,
      connectedAt: this.tokens?.connectedAt,
      scopes: this.tokens?.scope ? this.tokens.scope.split(' ') : undefined,
      lastError: this.lastError,
    };
  }

  public buildAuthorizationUrl(params: { redirectUri: string; state: string }): string {
    if (!isGoogleConfigured()) {
      throw new Error(
        'Google Workspace is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the app secrets.'
      );
    }
    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', clientId());
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', params.state);
    return url.toString();
  }

  public async completeAuthorization(params: {
    code: string;
    redirectUri: string;
  }): Promise<GoogleConnectionStatus> {
    if (!isGoogleConfigured()) {
      throw new Error('Google Workspace credentials are missing on the server.');
    }

    const body = new URLSearchParams({
      code: params.code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !payload.access_token) {
      throw new Error(
        payload.error_description || payload.error || `Google rejected the authorization (${res.status}).`
      );
    }

    if (!payload.refresh_token && !this.tokens?.refreshToken) {
      throw new Error(
        'Google did not return a refresh token. Remove the app from your Google account permissions and connect again.'
      );
    }

    let email = this.tokens?.email;
    try {
      const info = await fetch(USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${payload.access_token}` },
      });
      if (info.ok) {
        const profile = (await info.json()) as { email?: string };
        email = profile.email || email;
      }
    } catch {
      // Email is cosmetic; the connection is still valid without it.
    }

    this.tokens = {
      refreshToken: payload.refresh_token || this.tokens?.refreshToken,
      accessToken: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
      scope: payload.scope || GOOGLE_SCOPES.join(' '),
      email,
      connectedAt: new Date().toISOString(),
      lastRefreshedAt: new Date().toISOString(),
    };
    this.lastError = undefined;
    this.persist();
    return this.getStatus();
  }

  public async disconnect(): Promise<void> {
    await this.ensureLoaded();
    const token = this.tokens?.refreshToken;
    this.tokens = null;
    this.lastError = undefined;
    try {
      if (token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      }
    } catch {
      // Revocation is best-effort; local state is already cleared.
    }
    unsyncDoc(TOKEN_KIND, TOKEN_DOC_ID);
  }

  private persist(): void {
    if (!this.tokens) return;
    syncDoc(TOKEN_KIND, TOKEN_DOC_ID, this.tokens);
  }

  private async accessToken(): Promise<string> {
    await this.ensureLoaded();
    if (!this.tokens?.refreshToken) {
      throw new Error(
        'Google Workspace is not connected. Open Connections and click “Connect Google Workspace”.'
      );
    }

    if (this.tokens.accessToken && (this.tokens.expiresAt ?? 0) > Date.now() + 60_000) {
      return this.tokens.accessToken;
    }

    const body = new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: this.tokens.refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !payload.access_token) {
      const reason = payload.error || 'invalid_grant';
      this.lastError = payload.error_description || reason;
      if (reason === 'invalid_grant') {
        // Refresh token revoked or expired: clear it so the user can reconnect cleanly.
        this.tokens = null;
        unsyncDoc(TOKEN_KIND, TOKEN_DOC_ID);
      }
      throw new Error(
        reason === 'invalid_grant'
          ? 'Google Workspace access was revoked. Open Connections and reconnect your Google account.'
          : payload.error_description || `Google token refresh failed (${res.status}).`
      );
    }

    this.tokens = {
      ...this.tokens,
      accessToken: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
      lastRefreshedAt: new Date().toISOString(),
      scope: payload.scope || this.tokens.scope,
    };
    this.lastError = undefined;
    this.persist();
    return payload.access_token;
  }

  private async api(
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<unknown> {
    const token = await this.accessToken();
    const res = await fetch(`https://www.googleapis.com${path}`, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = `Google API error (${res.status})`;
      try {
        const parsed = JSON.parse(text);
        message = parsed?.error?.message || message;
      } catch {
        if (text) message = `${message}: ${text.slice(0, 180)}`;
      }
      if (res.status === 401) {
        throw new Error(
          `${message}. Google Workspace authorization may have expired — reconnect from Connections.`
        );
      }
      if (res.status === 403) {
        throw new Error(
          `${message}. The Google account may be missing a granted permission for this action.`
        );
      }
      throw new Error(message);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return res.json();
    return res.text();
  }

  // ---------------------------------------------------------------- Gmail

  public async gmailSearch(query: string, maxResults = 8): Promise<string> {
    const q = String(query || '').trim();
    const limit = Math.min(Math.max(Number(maxResults) || 8, 1), 20);
    const searchPath = `/gmail/v1/users/me/messages?maxResults=${limit}${
      q ? `&q=${encodeURIComponent(q)}` : ''
    }`;
    const found = (await this.api(searchPath)) as {
      messages?: { id: string; threadId: string }[];
      resultSizeEstimate?: number;
    };

    const ids = found.messages || [];
    if (ids.length === 0) {
      return JSON.stringify({ query: q, resultCount: 0, messages: [] }, null, 2);
    }

    const messages = await Promise.all(
      ids.map(async (item) => {
        const meta = (await this.api(
          `/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
        )) as {
          id: string;
          snippet?: string;
          internalDate?: string;
          payload?: { headers?: { name: string; value: string }[] };
        };
        const header = (name: string) =>
          meta.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        return {
          id: meta.id,
          from: header('From'),
          to: header('To'),
          subject: header('Subject') || '(no subject)',
          date: header('Date'),
          snippet: meta.snippet || '',
        };
      })
    );

    return JSON.stringify({ query: q, resultCount: messages.length, messages }, null, 2);
  }

  public async gmailRead(messageId: string): Promise<string> {
    if (!messageId) throw new Error('messageId is required.');
    const msg = (await this.api(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`)) as {
      id: string;
      snippet?: string;
      payload?: {
        headers?: { name: string; value: string }[];
        body?: { data?: string };
        parts?: unknown[];
      };
    };

    const header = (name: string) =>
      msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const decode = (data?: string) => {
      if (!data) return '';
      return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    };

    const collectText = (node: any): string => {
      if (!node) return '';
      if (node.mimeType === 'text/plain' && node.body?.data) return decode(node.body.data);
      if (Array.isArray(node.parts)) {
        for (const part of node.parts) {
          const text = collectText(part);
          if (text) return text;
        }
      }
      return '';
    };

    const bodyText =
      collectText(msg.payload) ||
      decode(msg.payload?.body?.data) ||
      msg.snippet ||
      '';

    return JSON.stringify(
      {
        id: msg.id,
        from: header('From'),
        to: header('To'),
        cc: header('Cc'),
        subject: header('Subject'),
        date: header('Date'),
        body: bodyText.slice(0, 12000),
      },
      null,
      2
    );
  }

  public async gmailSend(params: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
  }): Promise<string> {
    const to = String(params.to || '').trim();
    const subject = String(params.subject || '').trim();
    const body = String(params.body || '');
    if (!to) throw new Error('A recipient email address is required.');
    if (!subject) throw new Error('An email subject is required.');
    if (!body.trim()) throw new Error('An email body is required.');

    const from = (await this.getStatus()).email || 'me';
    const headers = [
      `To: ${to}`,
      params.cc ? `Cc: ${params.cc}` : '',
      `From: ${from}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
    ].filter(Boolean);

    const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const sent = (await this.api('/gmail/v1/users/me/messages/send', {
      method: 'POST',
      body: { raw },
    })) as { id?: string; threadId?: string };

    return JSON.stringify(
      { sent: true, to, subject, messageId: sent.id, threadId: sent.threadId },
      null,
      2
    );
  }

  // ------------------------------------------------------------- Calendar

  public async calendarList(params: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    query?: string;
  }): Promise<string> {
    const now = new Date();
    const timeMin = params.timeMin || now.toISOString();
    const timeMax = params.timeMax || new Date(now.getTime() + 14 * 86400000).toISOString();
    const limit = Math.min(Math.max(Number(params.maxResults) || 10, 1), 25);

    let path = `/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=${limit}&timeMin=${encodeURIComponent(
      timeMin
    )}&timeMax=${encodeURIComponent(timeMax)}`;
    if (params.query) path += `&q=${encodeURIComponent(params.query)}`;

    const data = (await this.api(path)) as {
      items?: {
        id: string;
        summary?: string;
        description?: string;
        location?: string;
        start?: { dateTime?: string; date?: string; timeZone?: string };
        end?: { dateTime?: string; date?: string; timeZone?: string };
        attendees?: { email?: string; responseStatus?: string }[];
        htmlLink?: string;
        hangoutLink?: string;
      }[];
    };

    const events = (data.items || []).map((event) => ({
      id: event.id,
      title: event.summary || '(untitled event)',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      timeZone: event.start?.timeZone,
      location: event.location,
      attendees: event.attendees?.map((a) => a.email).filter(Boolean),
      description: event.description?.slice(0, 400),
      link: event.htmlLink,
    }));

    return JSON.stringify({ timeMin, timeMax, eventCount: events.length, events }, null, 2);
  }

  public async calendarCreate(params: {
    summary: string;
    start: string;
    end: string;
    timeZone?: string;
    description?: string;
    location?: string;
    attendees?: string[];
  }): Promise<string> {
    if (!params.summary?.trim()) throw new Error('An event title (summary) is required.');
    if (!params.start || !params.end) {
      throw new Error('Event start and end date-times are required (ISO 8601).');
    }

    const payload = {
      summary: params.summary.trim(),
      description: params.description,
      location: params.location,
      start: { dateTime: params.start, timeZone: params.timeZone },
      end: { dateTime: params.end, timeZone: params.timeZone },
      attendees: (params.attendees || []).filter(Boolean).map((email) => ({ email })),
    };

    const created = (await this.api('/calendar/v3/calendars/primary/events?sendUpdates=all', {
      method: 'POST',
      body: payload,
    })) as { id?: string; htmlLink?: string; summary?: string };

    return JSON.stringify(
      {
        created: true,
        eventId: created.id,
        title: created.summary,
        link: created.htmlLink,
        start: params.start,
        end: params.end,
      },
      null,
      2
    );
  }

  // ---------------------------------------------------------------- Drive

  public async driveSearch(query: string, maxResults = 10): Promise<string> {
    const raw = String(query || '').trim();
    const limit = Math.min(Math.max(Number(maxResults) || 10, 1), 25);
    const escaped = raw.replace(/'/g, "\\'");
    const q = raw ? `name contains '${escaped}' and trashed = false` : 'trashed = false';
    const path = `/drive/v3/files?pageSize=${limit}&q=${encodeURIComponent(
      q
    )}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress))`;

    const data = (await this.api(path)) as {
      files?: {
        id: string;
        name: string;
        mimeType: string;
        modifiedTime?: string;
        webViewLink?: string;
        owners?: { emailAddress?: string }[];
      }[];
    };

    return JSON.stringify(
      {
        query: raw,
        fileCount: data.files?.length || 0,
        files: (data.files || []).map((file) => ({
          id: file.id,
          name: file.name,
          type: file.mimeType,
          modifiedTime: file.modifiedTime,
          owner: file.owners?.[0]?.emailAddress,
          link: file.webViewLink,
        })),
      },
      null,
      2
    );
  }

  public async driveRead(fileId: string): Promise<string> {
    if (!fileId) throw new Error('fileId is required.');

    const meta = (await this.api(
      `/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`
    )) as { id: string; name: string; mimeType: string; size?: string };

    const isGoogleDoc = meta.mimeType.startsWith('application/vnd.google-apps');
    const token = await this.accessToken();
    const url = isGoogleDoc
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          fileId
        )}/export?mimeType=text/plain`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Could not read "${meta.name}" (${res.status}).`);
    }
    const text = await res.text();

    return JSON.stringify(
      {
        id: meta.id,
        name: meta.name,
        type: meta.mimeType,
        truncated: text.length > 16000,
        content: text.slice(0, 16000),
      },
      null,
      2
    );
  }
}

export const googleWorkspaceService = new GoogleWorkspaceService();
