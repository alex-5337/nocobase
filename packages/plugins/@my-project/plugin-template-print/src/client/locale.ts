import { useTranslation } from 'react-i18next';

export const NAMESPACE = 'plugin-template-print';

export function usePluginTranslation() {
  return useTranslation([NAMESPACE, 'client'], { nsMode: 'fallback' });
}
