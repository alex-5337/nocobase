/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AIMessageChunk } from '@langchain/core/messages';
import { LLMProvider, ParsedAttachmentResult } from './provider';
import { LLMProviderMeta, SupportedModel } from '../manager/ai-manager';
import { Model } from '@nocobase/database';
import _ from 'lodash';
import { ReasoningChatOpenAI, getToolCallsKey, REASONING_MAP_KEY } from './common/reasoning';
import { Context } from '@nocobase/actions';
import PluginAIServer from '../plugin';
import path from 'node:path';
import { AttachmentModel } from '@nocobase/plugin-file-manager';

class DeepSeekChatOpenAI extends ReasoningChatOpenAI {
  async completionWithRetry(request: any, requestOptions?: any): Promise<any> {
    const reasoningMap = requestOptions?.[REASONING_MAP_KEY] as Map<string, string> | undefined;
    if (Array.isArray(request?.messages)) {
      for (const m of request.messages) {
        if (m.role !== 'assistant') continue;
        if (!m.reasoning_content) {
          if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0 && reasoningMap?.size) {
            const key = getToolCallsKey(m.tool_calls);
            m.reasoning_content = reasoningMap.get(key) || '';
          } else {
            m.reasoning_content = '';
          }
        }
      }
    }
    return super.completionWithRetry(request, requestOptions);
  }
}

export class DeepSeekProvider extends LLMProvider {
  declare chatModel: DeepSeekChatOpenAI;

  get baseURL() {
    return 'https://api.deepseek.com';
  }

  createModel() {
    const { baseURL, apiKey } = this.serviceOptions || {};
    const { responseFormat } = this.modelOptions || {};

    const modelKwargs: Record<string, any> = {};

    if (responseFormat) {
      modelKwargs['response_format'] = {
        type: responseFormat,
      };
    }

    return new DeepSeekChatOpenAI({
      apiKey,
      ...this.modelOptions,
      modelKwargs,
      configuration: {
        baseURL: baseURL || this.baseURL,
      },
      verbose: false,
    });
  }

  parseResponseMessage(message: Model) {
    const result = super.parseResponseMessage(message);
    if (['user', 'tool'].includes(result?.role)) {
      return result;
    }
    const { metadata } = message?.toJSON() ?? {};
    if (!_.isEmpty(metadata?.additional_kwargs?.reasoning_content)) {
      result.content = {
        ...(result.content ?? {}),
        reasoning: {
          status: 'stop',
          content: metadata?.additional_kwargs.reasoning_content,
        },
      };
    }
    return result;
  }

  parseReasoningContent(chunk: AIMessageChunk): { status: string; content: string } {
    if (!_.isEmpty(chunk?.additional_kwargs?.reasoning_content)) {
      return {
        status: 'streaming',
        content: chunk.additional_kwargs.reasoning_content as string,
      };
    }
    return null;
  }

  protected isApiSupportedAttachment(attachment: AttachmentModel): boolean {
    return false;
  }
}

export const deepseekProviderOptions: LLMProviderMeta = {
  title: 'DeepSeek',
  supportedModel: [SupportedModel.LLM],
  models: {
    [SupportedModel.LLM]: ['deepseek-chat', 'deepseek-reasoner'],
  },
  provider: DeepSeekProvider,
};
