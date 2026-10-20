import { describe, expect, it } from '@jest/globals';

import {
  shouldUploadAttachment,
  canDownloadAttachment,
  canParentSyncCompleteWithoutAttachment,
  isCloudPathSafe,
  ALL_ATTACHMENT_STATES,
} from '../attachment-sync';

describe('Attachment sync', () => {
  describe('shouldUploadAttachment', () => {
    it('never uploads local_only', () => {
      expect(shouldUploadAttachment('local_only')).toBe(false);
    });
    it('uploads cloud_private', () => {
      expect(shouldUploadAttachment('cloud_private')).toBe(true);
    });
    it('uploads shared_with_group', () => {
      expect(shouldUploadAttachment('shared_with_group')).toBe(true);
    });
    it('does NOT upload delete_after_extraction unless explicitly required', () => {
      expect(shouldUploadAttachment('delete_after_extraction')).toBe(false);
      expect(shouldUploadAttachment('delete_after_extraction', true)).toBe(true);
    });
  });

  describe('canDownloadAttachment', () => {
    it('does NOT download local_only', () => {
      expect(canDownloadAttachment('local_only', true, true)).toBe(false);
    });
    it('downloads cloud_private for the owner only', () => {
      expect(canDownloadAttachment('cloud_private', true, false)).toBe(true);
      expect(canDownloadAttachment('cloud_private', false, true)).toBe(false);
    });
    it('downloads shared_with_group for group members', () => {
      expect(canDownloadAttachment('shared_with_group', true, true)).toBe(true);
      expect(canDownloadAttachment('shared_with_group', false, true)).toBe(true);
      expect(canDownloadAttachment('shared_with_group', false, false)).toBe(false);
    });
  });

  describe('structured-data independence', () => {
    it('parent can sync complete even if attachment is pending', () => {
      expect(canParentSyncCompleteWithoutAttachment('expense', 'local')).toBe(true);
      expect(canParentSyncCompleteWithoutAttachment('expense', 'queued')).toBe(true);
      expect(canParentSyncCompleteWithoutAttachment('expense', 'failed')).toBe(true);
    });
  });

  describe('isCloudPathSafe', () => {
    it('accepts UUID-based paths', () => {
      expect(isCloudPathSafe('a/b/c-12345-67890')).toBe(true);
    });
    it('rejects paths with @ (email)', () => {
      expect(isCloudPathSafe('user@example.com/file.jpg')).toBe(false);
    });
    it('rejects paths with spaces (likely names)', () => {
      expect(isCloudPathSafe('Weekend Trip/file.jpg')).toBe(false);
    });
    it('rejects data-file extensions', () => {
      expect(isCloudPathSafe('export.json')).toBe(false);
      expect(isCloudPathSafe('data.csv')).toBe(false);
    });
  });

  it('ALL_ATTACHMENT_STATES has 10 states', () => {
    expect(ALL_ATTACHMENT_STATES).toHaveLength(10);
  });
});
