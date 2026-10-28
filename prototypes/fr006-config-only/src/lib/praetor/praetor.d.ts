/**
 * @praetor/app-bridge — type definitions.
 * See ./index.js for runtime behaviour and full doc comments.
 */

export interface ArtifactPayload {
  title?: string;
  file: string;
  type?: string;
  format?: string;
}

export interface ContextPayload {
  entity: string;
  id?: string;
  label?: string;
  payload?: unknown;
}

export interface NavIntent {
  menuId?: string;
  path?: string;
}

export type CommandHandler = (payload: unknown) => unknown | Promise<unknown>;

export type CompanionChatAuth =
  | { type: 'app-portal-token'; token?: string; fallbackToSdk?: boolean }
  | { type: 'app-portal-sdk'; token?: never }
  | { type: 'token-provider'; getToken: () => string | Promise<string> };

export interface CreateChatOptions {
  container: HTMLElement;
  appId: string;
  /** Absolute Praetor `/copilot-chat` URL for cross-origin hosts. */
  praetorUrl?: string;
  auth?: CompanionChatAuth;
  context?: Record<string, unknown>;
  /** @deprecated Use context. */
  params?: Record<string, unknown>;
  title?: string;
  style?: { width?: string; height?: string; className?: string };
}

export type CompanionChatStatus = 'creating' | 'authenticating' | 'ready' | 'auth-required' | 'error' | 'destroyed';
export interface CompanionChatState {
  status: CompanionChatStatus;
  threadId?: string;
  features?: { history: false; newThread: false; artifacts: false };
}

export interface CompanionChat {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  focus(): void;
  send(prompt: string): Promise<void>;
  setContext(context: Record<string, unknown>): Promise<void>;
  getState(): CompanionChatState;
  on(event: string, handler: (payload?: unknown) => void): () => void;
  destroy(): void;
}

export function createChat(options: CreateChatOptions): Promise<CompanionChat>;

/** The signed-in Praetor user viewing the app — identity only, never a
 *  credential (#2805). */
export interface Viewer {
  id: string;
  /** Display name; equals `id` when the account has none. */
  name: string;
}

export interface PraetorBridge {
  createChat: typeof createChat;
  /**
   * Initialise the bridge. `appId` is optional — bound apps pass their
   * `apps[].id`; agent-generated artifact HTML can omit it (the host
   * routes artifacts by iframe identity, not by id). `hostOrigin` is
   * learned from `document.referrer` / the first host frame when omitted.
   */
  init(options?: { appId?: string; hostOrigin?: string }): void;
  sendToChat(text: string, attachments?: ArtifactPayload[]): void;
  suggest(text: string): void;
  notifyContext(ctx: ContextPayload): void;
  publishArtifact(art: ArtifactPayload): void;
  navIntent(intent: NavIntent): void;
  /**
   * Ask the host for the current viewer's delegated App Portal (EnOS) upstream
   * token, to call an upstream API as the signed-in user. Resolves to the token
   * or `null` (delegation off / not an App Portal session / dev / transport
   * error) — never throws for absence. Do NOT cache it; request per use. See the
   * `app-portal-integration` skill.
   */
  getAppPortalToken(options?: { timeoutMs?: number }): Promise<string | null>;
  /**
   * Ask the host who is viewing the app. Resolves to the signed-in Praetor
   * user's `{ id, name }`, or `null` (anonymous viewer of a public app / a
   * host that predates this request / transport error) — never throws for
   * absence. Identity only, never a token: to act as the viewer upstream use
   * `getAppPortalToken()`; an app backend must not trust an id the frontend
   * merely relays. Ask per use rather than caching across a session.
   */
  getViewer(options?: { timeoutMs?: number }): Promise<Viewer | null>;
  onCommand(type: string, handler: CommandHandler): () => void;
  request(type: string, payload?: unknown, options?: { timeoutMs?: number }): Promise<unknown>;
  /** Remove the window listener, reject in-flight requests, clear the
   *  outbox. Call on app/iframe teardown. */
  destroy(): void;
}

export const praetor: PraetorBridge;
export default praetor;

export const init: PraetorBridge['init'];
export const sendToChat: PraetorBridge['sendToChat'];
export const suggest: PraetorBridge['suggest'];
export const notifyContext: PraetorBridge['notifyContext'];
export const publishArtifact: PraetorBridge['publishArtifact'];
export const navIntent: PraetorBridge['navIntent'];
export const getAppPortalToken: PraetorBridge['getAppPortalToken'];
export const getViewer: PraetorBridge['getViewer'];
export const onCommand: PraetorBridge['onCommand'];
export const request: PraetorBridge['request'];
export const destroy: PraetorBridge['destroy'];
