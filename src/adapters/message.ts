/**
 * Adapter layer for converting between LoopMessage and Message types
 * - LoopMessage: From AgenticLoop (uses `content: unknown`)
 * - Message: From SessionManager (uses `content: MessageContent | MessageContent[]`)
 */

import { randomUUID } from 'node:crypto';
import type { LLMCompletionOptions, ToolCall } from '../types/llm';
import type { Message, MessageContent, TextContent } from '../types/message';

/**
 * LoopMessage type: message format used in AgenticLoop
 */
export type LoopMessage = LLMCompletionOptions['messages'][number];

/**
 * Extract text from LoopMessage content
 * LoopMessage.content is `unknown`, typically a string
 */
function extractTextFromLoopContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  return String(content);
}

/**
 * Extract text from Message content
 * Message.content can be a string, TextContent, or array of MessageContent
 */
function extractTextFromMessageContent(content: MessageContent | MessageContent[]): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const item of content) {
      if (typeof item === 'string') {
        texts.push(item);
      } else if (item && typeof item === 'object' && 'type' in item) {
        if (item.type === 'text' && 'text' in item) {
          texts.push((item as TextContent).text);
        }
      }
    }
    return texts.join('\n');
  }

  if (content && typeof content === 'object' && 'type' in content) {
    if (content.type === 'text' && 'text' in content) {
      return (content as TextContent).text;
    }
  }

  return '';
}

/**
 * Convert a LoopMessage to a Message
 * Generates a UUID for id and adds metadata with current timestamp
 */
export function loopMessageToMessage(msg: LoopMessage, sessionId?: string): Message {
  const textContent = extractTextFromLoopContent(msg.content);

  const message: Message = {
    id: randomUUID(),
    role: msg.role,
    content: textContent,
    metadata: {
      timestamp: Date.now(),
    },
  };

  if (msg.name !== undefined) {
    message.name = msg.name;
  }

  if (msg.toolCallId !== undefined) {
    message.toolCallId = msg.toolCallId;
  }

  if (msg.toolCalls !== undefined) {
    message.toolCalls = msg.toolCalls;
  }

  if (sessionId !== undefined) {
    message.metadata!.sessionId = sessionId;
  }

  return message;
}

/**
 * Convert a Message to a LoopMessage
 * Strips metadata and converts content back to string format
 */
export function messageToLoopMessage(msg: Message): LoopMessage {
  const textContent = extractTextFromMessageContent(msg.content);

  const loopMessage: LoopMessage = {
    role: msg.role,
    content: textContent,
  };

  if (msg.name !== undefined) {
    loopMessage.name = msg.name;
  }

  if (msg.toolCallId !== undefined) {
    loopMessage.toolCallId = msg.toolCallId;
  }

  if (msg.toolCalls !== undefined) {
    loopMessage.toolCalls = msg.toolCalls;
  }

  return loopMessage;
}
