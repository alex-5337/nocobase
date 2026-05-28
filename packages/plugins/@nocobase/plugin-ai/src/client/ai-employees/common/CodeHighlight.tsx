/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { Button, Typography } from 'antd';
import { useGlobalTheme } from '@nocobase/client';
import { countLines, truncateLines } from './truncate';

export type CodeHighlightProps = {
  language: string;
  value: string;
  height?: string;
  scrollToBottom?: boolean;
  loading?: boolean;
};

const MAX_PREVIEW_LINES = 100;

const FALLBACK_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  fontSize: '85%',
};

const PlainTextCode: React.FC<{
  value: string;
  isDark: boolean;
  maxHeight?: string;
}> = React.memo(({ value, isDark, maxHeight }) => (
  <pre
    style={{
      ...FALLBACK_STYLE,
      maxHeight: maxHeight ?? '500px',
      overflowY: 'auto',
      background: isDark ? '#1e1e1e' : '#f5f5f5',
    }}
  >
    <code>{value}</code>
  </pre>
));

const HeavyHighlighter: React.FC<{
  language: string;
  value: string;
  isDark: boolean;
}> = React.memo(({ language, value, isDark }) => {
  const [ready, setReady] = React.useState(false);
  const [SH, setSH] = React.useState<React.ComponentType<any> | null>(null);
  const [hlStyle, setHlStyle] = React.useState<any>(null);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([import('react-syntax-highlighter'), import('react-syntax-highlighter/dist/esm/styles/hljs')])
      .then(([mod, styles]) => {
        if (cancelled) return;
        setSH(() => mod.default);
        setHlStyle(isDark ? styles.dark : styles.defaultStyle);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isDark]);

  if (!ready || !SH || !hlStyle) {
    return <PlainTextCode value={value} isDark={isDark} />;
  }

  return (
    <SH PreTag="div" language={language} style={hlStyle}>
      {value}
    </SH>
  );
});

export const CodeHighlight: React.FC<CodeHighlightProps> = React.memo(
  ({ language, value, height, scrollToBottom, loading, ...rest }) => {
    const { isDarkTheme } = useGlobalTheme();
    const bottomRef = React.useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = React.useState(false);

    React.useEffect(() => {
      if (scrollToBottom === true) {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      }
    }, [value, scrollToBottom]);

    const totalLines = React.useMemo(() => countLines(value), [value]);
    const isLong = totalLines > MAX_PREVIEW_LINES;
    const showTruncated = isLong && !expanded;

    const previewText = React.useMemo(
      () => (showTruncated ? truncateLines(value, MAX_PREVIEW_LINES) : value),
      [value, showTruncated],
    );

    const codeContent = showTruncated ? (
      <div>
        <PlainTextCode value={previewText} isDark={isDarkTheme} maxHeight={height} />
        <div
          style={{
            padding: '8px 12px',
            textAlign: 'center',
            borderTop: isDarkTheme ? '1px solid #333' : '1px solid #e8e8e8',
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
            Showing first {MAX_PREVIEW_LINES} of {totalLines} lines
          </Typography.Text>
          <Button size="small" onClick={() => setExpanded(true)}>
            Show all
          </Button>
        </div>
      </div>
    ) : loading ? (
      <PlainTextCode value={value} isDark={isDarkTheme} maxHeight={height} />
    ) : (
      <HeavyHighlighter language={language} value={value} isDark={isDarkTheme} />
    );

    if (!height && !scrollToBottom) {
      return codeContent;
    }

    return (
      <div style={{ maxHeight: height ?? '500px', overflowY: 'auto' }}>
        {codeContent}
        <div ref={bottomRef} />
      </div>
    );
  },
);
