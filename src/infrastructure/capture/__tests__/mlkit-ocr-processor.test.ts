/**
 * ML Kit adapter boundary tests (native module mocked).
 * Native recognition itself still requires a device/dev build.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { MlKitOcrCaptureProcessor } from '../mlkit-ocr-capture-processor';

const mockRecognize = jest.fn<(uri: string) => Promise<{ text: string }>>();
function processor(): MlKitOcrCaptureProcessor {
  return new MlKitOcrCaptureProcessor(async () => async (uri: string) => {
    const result = await mockRecognize(uri);
    return result as { text: string };
  });
}

const input = {
  captureSourceId: 'cap-1' as never,
  imageUri: 'file:///tmp/receipt.jpg',
  sourceType: 'paper_receipt' as const,
};

beforeEach(() => {
  mockRecognize.mockReset();
});

describe('MlKitOcrCaptureProcessor', () => {
  it('retries once and maps recognised text to an extraction result', async () => {
    mockRecognize
      .mockRejectedValueOnce(new Error('transient native init'))
      .mockResolvedValueOnce({
        text: 'Udupi\nSubtotal: 95.24\nCGST: 2.38\nSGST: 2.38\nGrand total: 100.00',
      });

    const result = await processor().process(input);
    expect(result.total.value).toBe(10_000);
    expect(result.totalMatches).toBe(true);
    expect(mockRecognize).toHaveBeenCalledTimes(2);
  });

  it('fails clearly after two native failures', async () => {
    mockRecognize.mockRejectedValue(new Error('no native module'));
    await expect(processor().process(input)).rejects.toThrow(
      /could not read this image/,
    );
  });

  it('rejects empty OCR output instead of inventing a draft', async () => {
    mockRecognize.mockResolvedValue({ text: '   ' });
    await expect(processor().process(input)).rejects.toThrow(/No receipt text/);
  });

  it('honours cancellation before native work', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      processor().process(input, { signal: controller.signal }),
    ).rejects.toThrow(/cancelled/);
    expect(mockRecognize).not.toHaveBeenCalled();
  });
});
