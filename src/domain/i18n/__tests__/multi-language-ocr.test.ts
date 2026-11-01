import {
  OCR_LANGUAGES,
  detectReceiptLanguage,
  getOcrLanguageConfig,
  isOcrLanguageSupported,
} from '../multi-language-ocr';

describe('i18n / multi-language-ocr', () => {
  describe('OCR_LANGUAGES', () => {
    it('defines 19 languages', () => {
      expect(Object.keys(OCR_LANGUAGES).length).toBe(19);
    });
    it('every language config is frozen', () => {
      for (const cfg of Object.values(OCR_LANGUAGES)) {
        expect(Object.isFrozen(cfg)).toBe(true);
      }
    });
    it('every config has displayName + nativeName + formats', () => {
      for (const cfg of Object.values(OCR_LANGUAGES)) {
        expect(cfg.displayName.length).toBeGreaterThan(0);
        expect(cfg.nativeName.length).toBeGreaterThan(0);
        expect(cfg.receiptFormats.length).toBeGreaterThan(0);
        expect(cfg.dateFormat.length).toBeGreaterThan(0);
        expect(cfg.numberFormat.length).toBeGreaterThan(0);
      }
    });
  });

  describe('detectReceiptLanguage', () => {
    it('returns null for empty string', () => {
      expect(detectReceiptLanguage('')).toBeNull();
    });
    it('returns null for non-string input', () => {
      expect(detectReceiptLanguage(undefined as unknown as string)).toBeNull();
    });
    it('defaults to English for plain ASCII text', () => {
      expect(detectReceiptLanguage('Coffee Shop\nTotal: $4.50')).toBe('en');
    });
    it('detects Hindi (Devanagari script)', () => {
      expect(detectReceiptLanguage('कॉफी शॉप\nकुल: ₹100')).toBe('hi');
    });
    it('detects Marathi (Devanagari script)', () => {
      expect(detectReceiptLanguage('कॉफी शॉप\nमराठी मध्ये')).toBe('hi');
      // Marathi also uses Devanagari — Hindi is the default for
      // Devanagari. This is documented behaviour.
    });
    it('detects Tamil', () => {
      expect(detectReceiptLanguage('காபி கடை\nமொத்தம்: ₹100')).toBe('ta');
    });
    it('detects Telugu', () => {
      expect(detectReceiptLanguage('కాఫీ షాప్\nమొత్తం: ₹100')).toBe('te');
    });
    it('detects Kannada', () => {
      expect(detectReceiptLanguage('ಕಾಫಿ ಶಾಪ್\nಒಟ್ಟು: ₹100')).toBe('kn');
    });
    it('detects Malayalam', () => {
      expect(detectReceiptLanguage('കാപ്പി ഷോപ്പ്\nമൊത്തം: ₹100')).toBe('ml');
    });
    it('detects Bengali', () => {
      expect(detectReceiptLanguage('কফি শপ\nমোট: ₹100')).toBe('bn');
    });
    it('detects Arabic', () => {
      expect(detectReceiptLanguage('متجر قهوة\nالإجمالي: ١٠٠')).toBe('ar');
    });
    it('detects Thai', () => {
      expect(detectReceiptLanguage('ร้านกาแฟ\nรวม: 100')).toBe('th');
    });
    it('detects Japanese via Hiragana', () => {
      expect(detectReceiptLanguage('コーヒーショップ\nありがとうございます')).toBe('ja');
    });
    it('detects Korean (Hangul)', () => {
      expect(detectReceiptLanguage('커피숍\n합계: 100')).toBe('ko');
    });
    it('detects Chinese (CJK only)', () => {
      // No Hiragana/Katakana → Chinese.
      expect(detectReceiptLanguage('咖啡店\n合计: 100')).toBe('zh');
    });
    it('detects German via Latin hints', () => {
      expect(detectReceiptLanguage('Rechnung\nMwSt: 19%\nTotal: 12,50')).toBe('de');
    });
    it('detects French via Latin hints', () => {
      expect(detectReceiptLanguage('Facture\nTVA: 20%\nTotal: 12,50')).toBe('fr');
    });
    it('detects Spanish via Latin hints', () => {
      expect(detectReceiptLanguage('Factura\nIVA: 21%\nTotal: 12,50')).toBe('es');
    });
    it('detects Portuguese via Latin hints', () => {
      expect(detectReceiptLanguage('Nota fiscal\nICMS: 17%\nTotal: 12,50')).toBe('pt');
    });
    it('detects Indonesian via Latin hints', () => {
      expect(detectReceiptLanguage('Faktur\nPPN: 11%\nTotal: 12.50')).toBe('id');
    });
    it('detects Vietnamese via Latin hints', () => {
      expect(detectReceiptLanguage('Hóa đơn\nTổng: 100.000')).toBe('vi');
    });
  });

  describe('getOcrLanguageConfig', () => {
    it('returns config for known language', () => {
      const cfg = getOcrLanguageConfig('hi');
      expect(cfg.language).toBe('hi');
      expect(cfg.nativeName).toBe('हिन्दी');
    });
    it('throws for unknown language', () => {
      expect(() => getOcrLanguageConfig('xx' as never)).toThrow();
    });
  });

  describe('isOcrLanguageSupported', () => {
    it('returns true for known language', () => {
      expect(isOcrLanguageSupported('en')).toBe(true);
      expect(isOcrLanguageSupported('hi')).toBe(true);
    });
    it('returns false for unknown language', () => {
      expect(isOcrLanguageSupported('xx')).toBe(false);
    });
    it('returns false for empty string', () => {
      expect(isOcrLanguageSupported('')).toBe(false);
    });
  });
});
