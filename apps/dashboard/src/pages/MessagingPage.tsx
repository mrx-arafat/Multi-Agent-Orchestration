import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  listTeamMessages,
  sendMessage,
  listTeamAgents,
  getTeam,
  type Message,
  type Agent,
  type Team,
} from '../lib/api.js';
import { useTeamEvents, useRealtimeEvent } from '../lib/websocket.js';

const AGENT_COLORS = [
  'from-blue-500 to-blue-600',
  'from-emerald-500 to-emerald-600',
  'from-purple-500 to-purple-600',
  'from-orange-500 to-orange-600',
  'from-pink-500 to-pink-600',
  'from-teal-500 to-teal-600',
  'from-indigo-500 to-indigo-600',
  'from-rose-500 to-rose-600',
];

export function MessagingPage() {
  const { teamUuid } = useParams<{ teamUuid: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState('');
  const [fromAgentUuid, setFromAgentUuid] = useState('');
  const [toAgentUuid, setToAgentUuid] = useState('');
  const [messageType, setMessageType] = useState<'broadcast' | 'direct'>('broadcast');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!teamUuid) return;
    try {
      setLoading(true);
      const [teamData, msgData, agentData] = await Promise.all([
        getTeam(teamUuid),
        listTeamMessages(teamUuid, { limit: 100 }),
        listTeamAgents(teamUuid),
      ]);
      setTeam(teamData);
      setMessages(msgData.messages.reverse());
      setAgents(agentData);
      // Only set default "from" agent on initial load (when none is selected)
      if (agentData.length > 0 && agentData[0]) {
        setFromAgentUuid((prev) => prev || agentData[0]!.agentUuid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [teamUuid]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to real-time team events via WebSocket
  useTeamEvents(teamUuid);

  // Refresh messages on real-time message events
  const refreshMessages = useCallback(async () => {
    if (!teamUuid) return;
    try {
      const msgData = await listTeamMessages(teamUuid, { limit: 100 });
      setMessages(msgData.messages.reverse());
    } catch { /* ignore — will retry on next event or poll */ }
  }, [teamUuid]);

  useRealtimeEvent('message:new', refreshMessages);
  useRealtimeEvent('message:broadcast', refreshMessages);

  // Fallback polling every 30s (in case WS disconnects)
  useEffect(() => {
    if (!teamUuid) return;
    const interval = setInterval(refreshMessages, 30000);
    return () => clearInterval(interval);
  }, [teamUuid, refreshMessages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!teamUuid || !fromAgentUuid || !content.trim()) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(teamUuid, {
        fromAgentUuid,
        content: content.trim(),
        messageType: messageType === 'direct' ? 'direct' : 'broadcast',
        toAgentUuid: messageType === 'direct' && toAgentUuid ? toAgentUuid : undefined,
      });
      setContent('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  function getAgent(agentUuid: string) {
    return agents.find((a) => a.agentUuid === agentUuid);
  }

  function getAgentColor(agentUuid: string) {
    const idx = agents.findIndex((a) => a.agentUuid === agentUuid);
    return AGENT_COLORS[idx % AGENT_COLORS.length] ?? AGENT_COLORS[0]!;
  }

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-6rem)]">
        <div className="animate-pulse h-8 w-48 rounded bg-gray-200 mb-4" />
        <div className="animate-pulse flex-1 rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Agent sidebar */}
      <div className="w-56 shrink-0 rounded-xl border border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <Link to={`/teams/${teamUuid}`} className="text-xs text-gray-400 hover:text-gray-600">&larr; {team?.name}</Link>
          <h2 className="text-sm font-bold text-gray-900 mt-1">Team Chat</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Agents ({agents.length})</p>
          {agents.map((agent) => (
            <div
              key={agent.agentUuid}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${getAgentColor(agent.agentUuid)} flex items-center justify-center shadow-sm`}>
                <span className="text-[10px] font-bold text-white">{agent.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{agent.name}</p>
                <div className="flex items-center gap-1">
                  <div className={`h-1.5 w-1.5 rounded-full ${agent.status === 'online' ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  <p className="text-[10px] text-gray-400">{agent.status}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-3">{error}</div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 space-y-4 mb-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">No messages yet</p>
              <p className="text-xs text-gray-400">Start a conversation between agents</p>
            </div>
          ) : (
            messages.map((msg) => {
              const agent = getAgent(msg.fromAgentUuid);
              const toAgent = msg.toAgentUuid ? getAgent(msg.toAgentUuid) : null;
              return (
                <div key={msg.messageUuid} className="flex gap-3 group">
                  <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${getAgentColor(msg.fromAgentUuid)} flex items-center justify-center shrink-0 shadow-sm`}>
                    <span className="text-[10px] font-bold text-white">
                      {(agent?.name ?? '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">{agent?.name ?? 'Unknown'}</span>
                      {msg.messageType === 'broadcast' ? (
                        <span className="rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">broadcast</span>
                      ) : toAgent ? (
                        <span className="rounded-full bg-gray-50 border border-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                          to {toAgent.name}
                        </span>
                      ) : null}
                      <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {msg.subject && (
                      <div className="text-xs font-semibold text-gray-700 mb-0.5">{msg.subject}</div>
                    )}
                    <div className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Compose */}
        {agents.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
            Add agents to this team to start messaging.
          </div>
        ) : (
          <form onSubmit={handleSend} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex gap-2 items-center mb-2">
              <select
                value={fromAgentUuid}
                onChange={(e) => setFromAgentUuid(e.target.value)}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium focus:border-brand-500 outline-none bg-gray-50"
              >
                {agents.map((a) => (
                  <option key={a.agentUuid} value={a.agentUuid}>{a.name}</option>
                ))}
              </select>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMessageType('broadcast')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${messageType === 'broadcast' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Broadcast
                </button>
                <button
                  type="button"
                  onClick={() => setMessageType('direct')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${messageType === 'direct' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Direct
                </button>
              </div>
              {messageType === 'direct' && (
                <select
                  value={toAgentUuid}
                  onChange={(e) => setToAgentUuid(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium focus:border-brand-500 outline-none bg-gray-50"
                >
                  <option value="">Select recipient</option>
                  {agents.filter((a) => a.agentUuid !== fromAgentUuid).map((a) => (
                    <option key={a.agentUuid} value={a.agentUuid}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none bg-gray-50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={sending || !content.trim()}
                className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 disabled:opacity-50 transition-all shadow-sm"
              >
                {sending ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Send'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
