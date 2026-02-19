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
} from '../lib/api';

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
      if (agentData.length > 0 && !fromAgentUuid && agentData[0]) {
        setFromAgentUuid(agentData[0].agentUuid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [teamUuid, fromAgentUuid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    if (!teamUuid) return;
    const interval = setInterval(async () => {
      try {
        const msgData = await listTeamMessages(teamUuid, { limit: 100 });
        setMessages(msgData.messages.reverse());
      } catch {
        // silently ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [teamUuid]);

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

  function getAgentName(agentUuid: string) {
    return agents.find((a) => a.agentUuid === agentUuid)?.name ?? agentUuid.slice(0, 8);
  }

  function getAgentColor(agentUuid: string) {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
    ];
    const idx = agents.findIndex((a) => a.agentUuid === agentUuid);
    return colors[idx % colors.length] ?? 'bg-gray-500';
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-8 w-48 rounded bg-gray-200" />
        <div className="animate-pulse h-[500px] rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <Link to={`/teams/${teamUuid}`} className="text-gray-400 hover:text-gray-600 text-sm">&larr; {team?.name ?? 'Team'}</Link>
          <h1 className="text-xl font-bold text-gray-900">Team Chat</h1>
          <span className="text-sm text-gray-400">{agents.length} agents</span>
        </div>
        <div className="flex items-center gap-2">
          {agents.map((agent) => (
            <div key={agent.agentUuid} className="flex items-center gap-1.5" title={agent.name}>
              <div className={`h-2 w-2 rounded-full ${agent.status === 'online' ? 'bg-green-400' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-500">{agent.name}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-3">{error}</div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3 mb-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            No messages yet. Start a conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.messageUuid} className="flex gap-3">
              <div className={`h-8 w-8 rounded-full ${getAgentColor(msg.fromAgentUuid)} flex items-center justify-center flex-shrink-0`}>
                <span className="text-xs font-bold text-white">
                  {getAgentName(msg.fromAgentUuid).charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-900">{getAgentName(msg.fromAgentUuid)}</span>
                  {msg.messageType === 'broadcast' ? (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">broadcast</span>
                  ) : msg.toAgentUuid ? (
                    <span className="text-[10px] text-gray-400">to {getAgentName(msg.toAgentUuid)}</span>
                  ) : null}
                  <span className="text-[10px] text-gray-400">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {msg.subject && (
                  <div className="text-xs font-medium text-gray-700 mb-0.5">{msg.subject}</div>
                )}
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      {agents.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
          Add agents to this team to start messaging.
        </div>
      ) : (
        <form onSubmit={handleSend} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex gap-3 items-center">
            <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Send as:</label>
            <select
              value={fromAgentUuid}
              onChange={(e) => setFromAgentUuid(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 outline-none"
            >
              {agents.map((a) => (
                <option key={a.agentUuid} value={a.agentUuid}>{a.name}</option>
              ))}
            </select>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setMessageType('broadcast')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${messageType === 'broadcast' ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Broadcast
              </button>
              <button
                type="button"
                onClick={() => setMessageType('direct')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${messageType === 'direct' ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Direct
              </button>
            </div>
            {messageType === 'direct' && (
              <select
                value={toAgentUuid}
                onChange={(e) => setToAgentUuid(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 outline-none"
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
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
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
              className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
