import React, { useCallback, useRef } from 'react';
import { Form } from 'antd';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';
import { CollectionFieldPicker } from './CollectionFieldPicker';

interface Props {
  form: any;
}

export const WordTemplateEditor: React.FC<Props> = ({ form }) => {
  const { t } = useTranslation(NAMESPACE);
  const quillRef = useRef<any>(null);
  const collectionName = Form.useWatch('collectionName', form);

  const value = form.getFieldValue('content') || '';

  const handleChange = (html: string) => {
    form.setFieldsValue({ content: html });
  };

  const handleInsertVariable = useCallback((fieldPath: string) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;

    const variableText = `{${fieldPath}}`;
    const selection = editor.getSelection();

    if (selection) {
      // Insert at cursor position
      editor.insertText(selection.index, variableText);
      editor.setSelection(selection.index + variableText.length);
    } else {
      // No cursor position, append to end
      const length = editor.getLength();
      editor.insertText(length, variableText);
      editor.setSelection(length + variableText.length);
    }

    // Focus the editor
    editor.focus();
  }, []);

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ align: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'code-block'],
      [{ indent: '-1' }, { indent: '+1' }],
      ['table'],
      ['link', 'image'],
      ['clean'],
    ],
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ color: '#666', fontSize: 12 }}>
          {t('Tip: Click the variable button to insert data fields, e.g. {customerName}. Or type them directly.')}
        </span>
        <CollectionFieldPicker
          collectionName={collectionName}
          onInsert={handleInsertVariable}
          label={t('Insert Variable')}
        />
      </div>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={handleChange}
        modules={modules}
        style={{ height: 400, marginBottom: 40 }}
        placeholder="Design your Word template here..."
      />
    </div>
  );
};
