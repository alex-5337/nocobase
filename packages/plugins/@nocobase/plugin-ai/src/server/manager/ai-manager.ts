/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  LLMProvider,
  LLMProviderOptions,
  EmbeddingProvider,
  EmbeddingProviderOptions,
} from '../llm-providers/provider';
import PluginAIServer from '../plugin';
import _ from 'lodash';
import { ToolManager } from './tool-manager';

export type LLMProviderMeta = {
  title: string;
  supportedModel?: SupportedModel[];
  models?: Partial<Record<SupportedModel, string[]>>;
  provider: new (opts: LLMProviderOptions) => LLMProvider;
  embedding?: new (opts: EmbeddingProviderOptions) => EmbeddingProvider;
  supportWebSearch?: boolean;
};

export enum SupportedModel {
  LLM = 'LLM',
  EMBEDDING = 'EMBEDDING',
}

export type LLMModelOptions = {
  llmService: string;
  model: string;
  webSearch?: boolean;
  reasoningEffort?: string;
};

export class AIManager {
  llmProviders = new Map<string, LLMProviderMeta>();
  toolManager = new ToolManager();
  constructor(protected plugin: PluginAIServer) {}

  registerLLMProvider(name: string, meta: LLMProviderMeta) {
    this.llmProviders.set(name, meta);
  }

  listLLMProviders() {
    const providers = this.llmProviders.entries();
    return Array.from(providers).map(([name, { title, supportedModel, supportWebSearch }]) => ({
      name,
      title,
      supportedModel: supportedModel ?? [SupportedModel.LLM],
      supportWebSearch: supportWebSearch ?? false,
    }));
  }

  getSupportedProvider(model: SupportedModel): string[] {
    return Array.from(this.llmProviders.entries())
      .filter(([_, { supportedModel }]) => supportedModel && supportedModel.includes(model))
      .map(([name]) => name);
  }

  async getLLMService(options: LLMModelOptions) {
    const { llmService, model, webSearch, reasoningEffort } = options ?? {};

    // model is required - it's set by the frontend ModelSwitcher
    if (!llmService || !model) {
      throw new Error('LLM service not configured');
    }

    const service = await this.plugin.db.getRepository('llmServices').findOne({
      filter: {
        name: llmService,
      },
    });

    if (!service) {
      throw new Error('LLM service not found');
    }

    // Merge stored modelOptions with runtime values.
    // DB stored values serve as defaults; explicit dialog params override them.
    const modelOptions: Record<string, any> = {
      ...(service.modelOptions || {}),
      llmService,
      model,
    };

    // Dialog explicitly passed reasoningEffort overrides DB stored value
    if (reasoningEffort) {
      modelOptions.reasoningEffort = reasoningEffort;
    }

    if (webSearch === true) {
      modelOptions.builtIn = { webSearch: true };
    }

    const providerOptions = this.llmProviders.get(service.provider);
    if (!providerOptions) {
      throw new Error('LLM service provider not found');
    }

    const Provider = providerOptions.provider;
    const provider = new Provider({
      app: this.plugin.app,
      serviceOptions: service.options,
      modelOptions,
    });

    return { provider, model, service };
  }
}
