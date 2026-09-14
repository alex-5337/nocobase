/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { PasswordPolicyConfig } from './constants';

export interface PasswordCheckError {
  key: string;
  params?: Record<string, unknown>;
}

const hasLetter = (value: string) => /[a-zA-Z]/.test(value);
const hasDigit = (value: string) => /\d/.test(value);
const hasLower = (value: string) => /[a-z]/.test(value);
const hasUpper = (value: string) => /[A-Z]/.test(value);
const hasSymbol = (value: string) => /[^a-zA-Z0-9]/.test(value);

// Pure password complexity check shared by the server middleware and the client-side validator.
// Returns null when the password is valid, otherwise an i18n key with optional interpolation params.
export function checkPasswordComplexity(
  password: string,
  config: PasswordPolicyConfig,
  username?: string,
): PasswordCheckError | null {
  const minLength = Number(config?.minPasswordLength) || 0;
  if (minLength > 0 && password.length < minLength) {
    return { key: 'Password must be at least {{n}} characters', params: { n: minLength } };
  }
  const complexity = Number(config?.passwordComplexity) || 0;
  if (complexity === 1 && !(hasLetter(password) && hasDigit(password))) {
    return { key: 'Password must contain letters and numbers' };
  }
  if (complexity === 2 && !(hasLetter(password) && hasDigit(password) && hasSymbol(password))) {
    return { key: 'Password must contain letters, numbers and symbols' };
  }
  if (complexity === 3 && !(hasDigit(password) && hasLower(password) && hasUpper(password))) {
    return { key: 'Password must contain digits, uppercase and lowercase letters' };
  }
  if (complexity === 4 && !(hasDigit(password) && hasLower(password) && hasUpper(password) && hasSymbol(password))) {
    return { key: 'Password must contain digits, uppercase letters, lowercase letters and symbols' };
  }
  if (complexity === 5) {
    const kinds = [hasDigit(password), hasLower(password), hasUpper(password), hasSymbol(password)].filter(
      Boolean,
    ).length;
    if (kinds < 3) {
      return {
        key: 'Password must contain at least 3 of the following: digits, uppercase letters, lowercase letters and special characters',
      };
    }
  }
  if (config?.cantIncludeUsername && username) {
    const name = username.trim().toLowerCase();
    if (name && password.toLowerCase().includes(name)) {
      return { key: 'Password cannot contain the username' };
    }
  }
  return null;
}
