/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { connect, mapProps, mapReadPretty } from '@formily/react';
import { sanitizeRichTextHtml } from '@nocobase/utils/client';
import React, { useEffect, useRef } from 'react';
import { css } from '@emotion/css';
import classNames from 'classnames';
import type ReactQuillComponent from 'react-quill';
import { lazy } from '../../../lazy-helper';
import { isVariable } from '../../../variables/utils/isVariable';
import { ReadPretty as InputReadPretty } from '../input';
import { useStyles } from './style';
import Quill from 'quill';
import QuillTableBetter from 'quill-table-better';
import 'react-quill-new/dist/quill.snow.css';
import 'quill-table-better/dist/quill-table-better.css';

Quill.register({ 'modules/table-better': QuillTableBetter }, true);

const ReactQuill = lazy(() => import('react-quill-new'));

const TABLE_MODULE_CONFIG = {
  language: 'en_US',
  menus: ['column', 'row', 'merge', 'table', 'cell', 'wrap', 'copy', 'delete'],
  toolbarTable: true,
};

type ReactQuillValue = ReactQuillComponent.ReactQuillProps['value'];

export const RichText = connect(
  (props) => {
    const { wrapSSR, hashId, componentCls } = useStyles();
    const quillRef = useRef<any>(null);
    const matcherFixed = useRef(false);
    const boundsClass = React.useMemo(() => `quill-bounds-${Math.random().toString(36).slice(2, 9)}`, []);

    const defaultModules = {
      toolbar: [
        ['bold', 'italic', 'underline', 'link'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['table-better'],
        ['clean'],
      ],
      table: false,
      'table-better': TABLE_MODULE_CONFIG,
      keyboard: {
        bindings: QuillTableBetter.keyboardBindings,
      },
    };
    const defaultFormats = [
      'header',
      'bold',
      'italic',
      'underline',
      'strike',
      'blockquote',
      'list',
      'bullet',
      'indent',
      'link',
      'image',
    ];
    const { value, defaultValue, onChange, disabled, modules: propsModules, formats: propsFormats } = props;
    const resultValue = isVariable(value || defaultValue) ? undefined : value || '';

    const modules = propsModules || defaultModules;
    const formats = propsFormats || defaultFormats;

    // Apply fixes for quill-table-better compatibility with Quill 2 + react-quill-new:
    // 1. Remove Quill 2's built-in 'tr' matcher (conflicts with quill-table-better's 'tr' matcher)
    // 2. Patch setEditorContents to use updateContents instead of setContents
    //    (setContents breaks quill-table-better table blots)
    useEffect(() => {
      const instance = quillRef.current;
      if (!instance || matcherFixed.current) return;
      matcherFixed.current = true;

      const editor = instance.getEditor();
      if (!editor) return;

      // Fix 1: remove Quill 2's built-in 'tr' matcher
      let trSeen = false;
      editor.clipboard.matchers = editor.clipboard.matchers
        .slice()
        .reverse()
        .filter(([s]: [string, Function]) => {
          if (s === 'tr') {
            if (trSeen) return false;
            trSeen = true;
          }
          return true;
        })
        .reverse();

      // Fix 2: patch setEditorContents to use updateContents
      const { onEditorChange } = instance;
      instance.setEditorContents = function (ed: any, val: string) {
        this.value = val;
        const sel = this.getEditorSelection();
        if (typeof val === 'string') {
          const delta = ed.clipboard.convert({ html: val });
          ed.off('editor-change', onEditorChange);
          ed.updateContents(delta, Quill.sources.USER);
          ed.on('editor-change', onEditorChange);
        } else {
          ed.off('editor-change', onEditorChange);
          ed.updateContents(val, Quill.sources.USER);
          ed.on('editor-change', onEditorChange);
        }
        Promise.resolve()
          .then(() => this.setEditorSelection(ed, sel))
          .catch(() => {});
      };
    }, []);

    const previousIncomingValueRef = React.useRef(resultValue);
    const pendingEditorValueRef = React.useRef<{ value: ReactQuillValue }>();
    const [editorValue, setEditorValue] = React.useState<ReactQuillValue>(() =>
      typeof resultValue === 'string' ? sanitizeRichTextHtml(resultValue) : resultValue,
    );

    React.useEffect(() => {
      if (Object.is(resultValue, previousIncomingValueRef.current)) {
        return;
      }
      previousIncomingValueRef.current = resultValue;
      const pendingEditorValue = pendingEditorValueRef.current;
      pendingEditorValueRef.current = undefined;
      if (pendingEditorValue && Object.is(resultValue, pendingEditorValue.value)) {
        return;
      }
      setEditorValue(typeof resultValue === 'string' ? sanitizeRichTextHtml(resultValue) : resultValue);
    }, [resultValue]);

    const quillDisabled = css`
      .ql-container.ql-disabled {
        background-color: #f5f5f5;
        color: #999;
        opacity: 0.7;
        cursor: not-allowed;
        pointer-events: none;
        border: 1px solid #d9d9d9;
        border-radius: 6px;
      }
    `;

    return wrapSSR(
      <ReactQuill
        ref={quillRef}
        className={classNames(componentCls, hashId, quillDisabled, boundsClass, {
          'is-disabled': disabled,
        })}
        modules={modules}
        formats={formats}
        value={editorValue}
        useSemanticHTML={false}
        onChange={(value) => {
          const nextValue = value === '<p><br></p>' ? '' : value;
          pendingEditorValueRef.current = { value: nextValue };
          setEditorValue(nextValue);
          onChange(nextValue);
        }}
        readOnly={disabled}
        bounds={`.${boundsClass}`}
      />,
    );
  },
  mapProps({
    initialValue: 'defaultValue',
  }),
  mapReadPretty((props) => {
    return <InputReadPretty.Html {...props} />;
  }),
);
