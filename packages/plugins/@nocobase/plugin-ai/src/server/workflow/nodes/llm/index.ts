/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { FlowNodeModel, Instruction, JOB_STATUS, Processor } from '@nocobase/plugin-workflow';
import PluginAIServer from '../../../plugin';
import { LLMProvider } from '../../../llm-providers/provider';
import _ from 'lodash';
import { parseMessages } from './parse-messages';

export class LLMInstruction extends Instruction {
  async getLLMProvider(llmService: string, modelOptions: any) {
    const service = await this.workflow.db.getRepository('llmServices').findOne({
      filter: {
        name: llmService,
      },
    });
    if (!service) {
      throw new Error('invalid llm service');
    }
    const plugin = this.workflow.app.pm.get('ai') as PluginAIServer;
    const providerOptions = plugin.aiManager.llmProviders.get(service.provider);
    if (!providerOptions) {
      throw new Error('invalid llm provider');
    }
    const Provider = providerOptions.provider;
    const provider = new Provider({ app: this.workflow.app, serviceOptions: service.options, modelOptions });
    return provider;
  }

  async run(node: FlowNodeModel, input: any, processor: Processor) {
    const { llmService, ...chatOptions } = processor.getParsedValue(node.config, node.id);
    const { messages, structuredOutput, ...modelOptions } = chatOptions;
    let provider: LLMProvider;
    try {
      provider = await this.getLLMProvider(llmService, modelOptions);
    } catch (e) {
      return {
        status: JOB_STATUS.ERROR,
        result: e.message,
      };
    }

    const job = processor.saveJob({
      status: JOB_STATUS.PENDING,
      nodeId: node.id,
      nodeKey: node.key,
      upstreamId: input?.id ?? null,
    });

    const parsedMessages = await parseMessages(messages);

    // eslint-disable-next-line promise/catch-or-return
    provider
      .invoke({
        messages: parsedMessages,
        structuredOutput,
      })
      .then((aiMsg) => {
        let raw = aiMsg;
        if (aiMsg.raw) {
          raw = aiMsg.raw;
        }

        job.set({
          status: JOB_STATUS.RESOLVED,
          result: {
            id: raw.id,
            content: raw.content,
            additionalKwargs: raw.additional_kwargs,
            responseMetadata: raw.response_metadata,
            toolCalls: raw.tool_calls,
            structuredContent: aiMsg.parsed,
          },
        });
      })
      .catch((e) => {
        const rawMsg = e.message || '';
        processor.logger.error(`llm invoke failed, ${rawMsg}`, {
          node: node.id,
          stack: e.stack,
          chatOptions: _.omit(chatOptions, 'messages'),
        });

        // 配置错误：参数设置问题，用户可自行修正
        const configErrors: [RegExp, string][] = [
          [/json_schema/i, `模型不支持 json_schema，请改用 json_object`],
          [/invalid llm service|llm service.*invalid/i, `LLM 服务无效，请检查配置`],
        ];
        for (const [pattern, hint] of configErrors) {
          if (pattern.test(rawMsg)) {
            job.set({ status: JOB_STATUS.ERROR, result: `[配置] ${hint}` });
            return;
          }
        }

        // 模型错误：模型侧返回的异常
        const modelErrors: [RegExp, string | (() => string)][] = [
          [
            /content type/i,
            () => {
              const contentTypes = new Set<string>();
              for (const msg of messages) {
                for (const c of msg.content || []) {
                  contentTypes.add(c.type);
                }
              }
              const model = modelOptions.model || 'this model';
              return `模型 "${model}" 不支持内容类型: ${[...contentTypes].join(', ')}，请更换模型或移除对应内容`;
            },
          ],
        ];
        for (const [pattern, hintOrFn] of modelErrors) {
          if (pattern.test(rawMsg)) {
            const hint = typeof hintOrFn === 'function' ? hintOrFn() : hintOrFn;
            job.set({ status: JOB_STATUS.ERROR, result: `[模型] ${hint}` });
            return;
          }
        }

        // 兜底：原始错误
        job.set({ status: JOB_STATUS.ERROR, result: rawMsg });
      })
      .finally(() => {
        setImmediate(() => {
          this.workflow.resume(job);
        });
      });

    processor.logger.trace(`llm invoke, waiting for response...`, {
      node: node.id,
    });
    return processor.exit();
  }

  resume(node: FlowNodeModel, job: any, processor: Processor) {
    const { ignoreFail } = node.config;
    if (ignoreFail) {
      job.set('status', JOB_STATUS.RESOLVED);
    }
    return job;
  }
}
