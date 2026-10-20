import { describe, expect, it } from '@jest/globals';

import {
  classifySyncError,
  isRetriableError,
  requiresIntervention,
  isPermanentError,
  shouldRetryOperation,
  RETRIABLE_ERROR_CODES,
  REQUIRES_INTERVENTION_ERROR_CODES,
  PERMANENT_ERROR_CODES,
} from '../sync-error-classifier';

describe('Sync error classifier', () => {
  describe('classifySyncError', () => {
    it('classifies retriable errors', () => {
      expect(classifySyncError('NETWORK_UNAVAILABLE')).toBe('retriable');
      expect(classifySyncError('TIMEOUT')).toBe('retriable');
      expect(classifySyncError('SERVER_ERROR')).toBe('retriable');
      expect(classifySyncError('RATE_LIMIT')).toBe('retriable');
      expect(classifySyncError('TOKEN_REFRESH_IN_PROGRESS')).toBe('retriable');
    });

    it('classifies requires-intervention errors', () => {
      expect(classifySyncError('VERSION_CONFLICT')).toBe('requires_intervention');
      expect(classifySyncError('PERMISSION_CHANGED')).toBe('requires_intervention');
      expect(classifySyncError('PARENT_DELETED_REMOTELY')).toBe('requires_intervention');
      expect(classifySyncError('DELETED_REMOTELY')).toBe('requires_intervention');
    });

    it('classifies permanent errors', () => {
      expect(classifySyncError('INVALID_PAYLOAD')).toBe('permanent');
      expect(classifySyncError('UNSUPPORTED_SCHEMA_VERSION')).toBe('permanent');
      expect(classifySyncError('ENTITY_PERMANENTLY_INACCESSIBLE')).toBe('permanent');
      expect(classifySyncError('MALFORMED_ATTACHMENT')).toBe('permanent');
    });

    it('defaults unknown error codes to retriable (the safer default)', () => {
      expect(classifySyncError('SOME_UNKNOWN_ERROR')).toBe('retriable');
      expect(classifySyncError('')).toBe('retriable');
    });
  });

  describe('predicate functions', () => {
    it('isRetriableError returns true for retriable and unknown codes', () => {
      expect(isRetriableError('NETWORK_UNAVAILABLE')).toBe(true);
      expect(isRetriableError('UNKNOWN')).toBe(true);
      expect(isRetriableError('VERSION_CONFLICT')).toBe(false);
      expect(isRetriableError('INVALID_PAYLOAD')).toBe(false);
    });

    it('requiresIntervention returns true only for intervention codes', () => {
      expect(requiresIntervention('VERSION_CONFLICT')).toBe(true);
      expect(requiresIntervention('NETWORK_UNAVAILABLE')).toBe(false);
      expect(requiresIntervention('INVALID_PAYLOAD')).toBe(false);
    });

    it('isPermanentError returns true only for permanent codes', () => {
      expect(isPermanentError('INVALID_PAYLOAD')).toBe(true);
      expect(isPermanentError('NETWORK_UNAVAILABLE')).toBe(false);
      expect(isPermanentError('VERSION_CONFLICT')).toBe(false);
    });
  });

  describe('shouldRetryOperation', () => {
    it('returns false for permanent errors', () => {
      expect(shouldRetryOperation('create', 'INVALID_PAYLOAD', 1, 10)).toBe(false);
    });

    it('returns false for requires-intervention errors', () => {
      expect(shouldRetryOperation('create', 'VERSION_CONFLICT', 1, 10)).toBe(false);
    });

    it('returns false when retries are exhausted', () => {
      expect(shouldRetryOperation('create', 'NETWORK_UNAVAILABLE', 10, 10)).toBe(false);
    });

    it('returns true for retriable errors within the retry limit', () => {
      expect(shouldRetryOperation('create', 'NETWORK_UNAVAILABLE', 1, 10)).toBe(true);
      expect(shouldRetryOperation('update', 'TIMEOUT', 5, 10)).toBe(true);
    });
  });

  it('error code arrays are non-empty and disjoint', () => {
    expect(RETRIABLE_ERROR_CODES.length).toBeGreaterThan(0);
    expect(REQUIRES_INTERVENTION_ERROR_CODES.length).toBeGreaterThan(0);
    expect(PERMANENT_ERROR_CODES.length).toBeGreaterThan(0);
    // No overlap between categories
    for (const code of RETRIABLE_ERROR_CODES) {
      expect(REQUIRES_INTERVENTION_ERROR_CODES).not.toContain(code);
      expect(PERMANENT_ERROR_CODES).not.toContain(code);
    }
    for (const code of REQUIRES_INTERVENTION_ERROR_CODES) {
      expect(PERMANENT_ERROR_CODES).not.toContain(code);
    }
  });
});
