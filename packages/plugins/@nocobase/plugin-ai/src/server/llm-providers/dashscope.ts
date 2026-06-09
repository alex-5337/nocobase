/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AIMessageChunk } from '@langchain/core/messages';
import { OpenAIEmbeddings } from '@langchain/openai';
import { EmbeddingProvider, LLMProvider } from './provider';
import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { SupportedModel } from '../manager/ai-manager';
import { Context } from '@nocobase/actions';
import { Model } from '@nocobase/database';
import _ from 'lodash';
import PluginAIServer from '../plugin';
import path from 'node:path';
import { ReasoningChatOpenAI } from './common/reasoning';
import { AttachmentModel } from '@nocobase/plugin-file-manager';
import { serverRequest } from '@nocobase/utils';

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export class DashscopeProvider extends LLMProvider {
  declare chatModel: ReasoningChatOpenAI;

  get baseURL() {
    return DASHSCOPE_URL;
  }

  createModel() {
    const { apiKey } = this.serviceOptions || {};
    const { responseFormat, structuredOutput, thinking, ...restModelOptions } = this.modelOptions || {};
    const { schema } = structuredOutput || {};

    const modelKwargs: Record<string, any> = {};

    // Only set response_format when responseFormat is explicitly provided
    // Dashscope API rejects { type: undefined }
    if (responseFormat) {
      const responseFormatOptions: Record<string, any> = {
        type: responseFormat,
      };
      if (responseFormat === 'json_schema' && schema) {
        responseFormatOptions['json_schema'] = schema;
      }
      modelKwargs['response_format'] = responseFormatOptions;
    } else {
      modelKwargs['response_format'] = { type: 'text' };
    }

    if (restModelOptions?.builtIn?.webSearch === true) {
      // enable platform's web search ability
      // ref: https://bailian.console.aliyun.com/?tab=doc#/doc/?type=model&url=2867560
      modelKwargs['enable_search'] = true;
    }

    // Dashscope uses `enable_thinking` (boolean) to control reasoning,
    // ref: https://help.aliyun.com/zh/model-studio/deep-thinking
    if (thinking === false) {
      modelKwargs['enable_thinking'] = false;
    }

    return new ReasoningChatOpenAI({
      apiKey,
      topP: 0.8,
      temperature: 0.7,
      ...restModelOptions,
      modelKwargs,
      configuration: {
        baseURL: this.getResolvedBaseURL(),
      },
      verbose: false,
    });
  }

  isToolConflict(): boolean {
    return true;
  }

  resolveTools(toolDefinitions: any[]): any[] {
    if (this.isToolConflict() && this.modelOptions?.builtIn?.webSearch === true) {
      return [];
    } else {
      return toolDefinitions;
    }
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
    return attachment.mimetype?.startsWith('image/') ?? false;
  }

  async listModels(): Promise<{
    models?: { id: string }[];
    code?: number;
    errMsg?: string;
  }> {
    const apiKey = this.serviceOptions?.apiKey;

    // Try 1: OpenAI-compatible /models endpoint
    if (apiKey) {
      try {
        const url = this.buildRequestURL('models');
        const res = await serverRequest({
          method: 'GET',
          url,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        if (res?.data?.data) {
          return { models: res.data.data };
        }
      } catch {
        // Fall through to next attempt
      }

      // Try 2: Dashscope native API to list models
      try {
        const res = await serverRequest({
          method: 'GET',
          url: 'https://dashscope.aliyuncs.com/api/v1/deployments/models?page_no=1&page_size=200',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        const models = res?.data?.output?.models;
        if (Array.isArray(models) && models.length > 0) {
          return { models: models.map((m: { model_name: string }) => ({ id: m.model_name })) };
        }
      } catch {
        // Fall through to static list
      }
    }

    // Fallback: return static model list
    const result: { id: string }[] = [];
    for (const models of Object.values(dashscopeProviderOptions.models)) {
      result.push(...models.map((id) => ({ id })));
    }
    return { models: result };
  }
}

export class DashscopeEmbeddingProvider extends EmbeddingProvider {
  protected getDefaultUrl(): string {
    return DASHSCOPE_URL;
  }

  createEmbedding(): EmbeddingsInterface {
    return new OpenAIEmbeddings({
      configuration: {
        baseURL: this.baseURL,
        apiKey: this.apiKey,
      },
      model: this.model,
    });
  }
}

export const dashscopeProviderOptions = {
  title: '{{t("Dashscope", {ns: "ai"})}}',
  supportedModel: [SupportedModel.LLM, SupportedModel.EMBEDDING],
  supportWebSearch: true,
  models: {
    [SupportedModel.LLM]: ['qwen3.7-plus', 'qwen3.6-flash', 'qwen3-vl-plus', 'qwen3-coder-plus', 'qwen-long'],
    [SupportedModel.EMBEDDING]: ['text-embedding-v4', 'text-embedding-v3'],
  },
  provider: DashscopeProvider,
  embedding: DashscopeEmbeddingProvider,
};
