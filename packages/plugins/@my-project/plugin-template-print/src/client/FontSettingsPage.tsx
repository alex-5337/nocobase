/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState, useEffect } from 'react';
import { Card, message, Tag, Input, Button, Space, Typography, Spin } from 'antd';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';

const { Text } = Typography;

/**
 * 字体设置页面组件。
 * 用户可以在此页面添加/删除字体白名单中的字体。
 * 字体仅作为名称存入库中，最终在 Word 模板编辑器中生效。
 */
export const FontSettingsPage: React.FC = () => {
  const { t } = useTranslation(NAMESPACE);
  const apiClient = useAPIClient();
  const [fonts, setFonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newFont, setNewFont] = useState('');

  // 加载字体配置
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.request({ url: 'printTemplateFonts:get' });
        const data = res?.data?.data;
        setFonts(data?.fontWhitelist || []);
      } catch {
        message.error(t('Failed to load font settings'));
      } finally {
        setLoading(false);
      }
    })();
  }, [apiClient, t]);

  // 保存字体配置
  const handleSave = async (updatedFonts: string[]) => {
    setSaving(true);
    try {
      await apiClient.request({
        url: 'printTemplateFonts:set',
        method: 'post',
        data: { fontWhitelist: updatedFonts },
      });
      setFonts(updatedFonts);
      message.success(t('Font settings saved'));
    } catch {
      message.error(t('Failed to save font settings'));
    } finally {
      setSaving(false);
    }
  };

  // 添加字体
  const handleAdd = () => {
    const trimmed = newFont.trim();
    if (!trimmed) return;
    if (fonts.includes(trimmed)) {
      message.warning(t('Font already exists'));
      return;
    }
    const updated = [...fonts, trimmed];
    handleSave(updated);
    setNewFont('');
  };

  // 删除字体
  const handleRemove = (font: string) => {
    const updated = fonts.filter((f) => f !== font);
    handleSave(updated);
  };

  return (
    <div style={{ padding: 24, width: '100%' }}>
      <Card
        title={
          <Space>
            <SettingOutlined />
            <span>{t('Font Settings')}</span>
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <>
            {/* 字体列表 */}
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                {t(
                  'Configure the font list available in the Word template editor. Font names must match the font names recognized by the operating system where the document will be opened.',
                )}
              </Text>
              {fonts.length === 0 ? (
                <Text type="secondary">{t('No fonts configured. Add fonts below.')}</Text>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {fonts.map((font) => (
                    <Tag
                      key={font}
                      closable
                      onClose={() => handleRemove(font)}
                      style={{ fontFamily: font, fontSize: 14, padding: '2px 8px' }}
                    >
                      {font}
                    </Tag>
                  ))}
                </div>
              )}
            </div>

            {/* 添加字体 */}
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={newFont}
                onChange={(e) => setNewFont(e.target.value)}
                placeholder={t('Enter font name, e.g. SimSun')}
                onPressEnter={handleAdd}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
                loading={saving}
                disabled={!newFont.trim()}
              >
                {t('Add')}
              </Button>
            </Space.Compact>
          </>
        )}
      </Card>
    </div>
  );
};

export default FontSettingsPage;
