/**
 * A2A Agent Card — Google Agent-to-Agent protocol discovery.
 *
 * Builds the /.well-known/agent.json card that external agents
 * use to discover and communicate with MAOF agents.
 * Spec: https://google.github.io/A2A/
 */

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

export interface A2AAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  authentication: {
    schemes: string[];
    credentials?: string;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2ASkill[];
}

export interface MaofAgentInfo {
  agentUuid: string;
  agentId: string;
  name: string;
  description: string | null;
  capabilities: string[];
  status: string;
}

/**
 * Build an A2A Agent Card for the MAOF platform.
 * Aggregates all active agents' capabilities into a single card.
 */
export function buildPlatformAgentCard(
  baseUrl: string,
  agents: MaofAgentInfo[],
): A2AAgentCard {
  const skills: A2ASkill[] = [];
  const seenCaps = new Set<string>();

  for (const agent of agents) {
    for (const cap of agent.capabilities) {
      if (!seenCaps.has(cap)) {
        seenCaps.add(cap);
        skills.push({
          id: cap,
          name: cap.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description: `Capability: ${cap} — provided by agent "${agent.name}"`,
          tags: [cap.split('.')[0] ?? cap],
        });
      }
    }
  }

  return {
    name: 'MAOF Platform',
    description:
      'Multi-Agent Orchestration Framework — routes tasks to specialized AI agents ' +
      'based on capabilities. Supports workflows, task delegation, and real-time collaboration.',
    url: `${baseUrl}/a2a`,
    version: '1.0.0',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ['Bearer'],
      credentials: `Obtain via POST ${baseUrl}/auth/login`,
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills,
  };
}

/**
 * Build an A2A Agent Card for a specific MAOF agent.
 */
export function buildAgentCard(
  baseUrl: string,
  agent: MaofAgentInfo,
): A2AAgentCard {
  return {
    name: agent.name,
    description: agent.description ?? `Agent ${agent.agentId}`,
    url: `${baseUrl}/a2a`,
    version: '1.0.0',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ['Bearer'],
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: agent.capabilities.map(cap => ({
      id: cap,
      name: cap.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: `Capability: ${cap}`,
      tags: [cap.split('.')[0] ?? cap],
    })),
  };
}
