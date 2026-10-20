import {
  REGIONAL_CONFIGS,
  getRegionalConfig,
  isRegionSupported,
  getCountriesForOnboardingFlow,
} from '../regional-config';

describe('i18n / regional-config', () => {
  describe('REGIONAL_CONFIGS', () => {
    it('has at least 15 regions', () => {
      expect(Object.keys(REGIONAL_CONFIGS).length).toBeGreaterThanOrEqual(15);
    });
    it('includes India with UPI onboarding', () => {
      expect(REGIONAL_CONFIGS['IN']!.onboardingFlow).toBe('india_upi');
      expect(REGIONAL_CONFIGS['IN']!.paymentMethods).toContain('upi');
    });
    it('includes US with sales tax onboarding', () => {
      expect(REGIONAL_CONFIGS['US']!.onboardingFlow).toBe('us_sales_tax');
    });
    it('includes GB with EU VAT onboarding', () => {
      expect(REGIONAL_CONFIGS['GB']!.onboardingFlow).toBe('eu_vat');
    });
    it('India uses GST tax terminology', () => {
      expect(REGIONAL_CONFIGS['IN']!.taxTerminology).toBe('GST');
    });
    it('Japan uses Consumption Tax terminology', () => {
      expect(REGIONAL_CONFIGS['JP']!.taxTerminology).toBe('Consumption Tax');
    });
    it('US uses Sales Tax terminology', () => {
      expect(REGIONAL_CONFIGS['US']!.taxTerminology).toBe('Sales Tax');
    });
    it('Germany uses VAT terminology', () => {
      expect(REGIONAL_CONFIGS['DE']!.taxTerminology).toBe('VAT');
    });
    it('every config has currency + locale + timezone', () => {
      for (const cfg of Object.values(REGIONAL_CONFIGS)) {
        expect(cfg.currencyCode.length).toBe(3);
        expect(cfg.locale.length).toBeGreaterThan(0);
        expect(cfg.timezone.length).toBeGreaterThan(0);
      }
    });
    it('every config has at least one payment method', () => {
      for (const cfg of Object.values(REGIONAL_CONFIGS)) {
        expect(cfg.paymentMethods.length).toBeGreaterThan(0);
      }
    });
    it('every config has at least one compliance requirement', () => {
      for (const cfg of Object.values(REGIONAL_CONFIGS)) {
        expect(cfg.complianceRequirements.length).toBeGreaterThan(0);
      }
    });
    it('configs are frozen', () => {
      for (const cfg of Object.values(REGIONAL_CONFIGS)) {
        expect(Object.isFrozen(cfg)).toBe(true);
      }
    });
  });

  describe('getRegionalConfig', () => {
    it('returns config for known country', () => {
      const cfg = getRegionalConfig('IN');
      expect(cfg.countryCode).toBe('IN');
      expect(cfg.currencyCode).toBe('INR');
    });
    it('is case-insensitive', () => {
      const cfg = getRegionalConfig('in');
      expect(cfg.countryCode).toBe('IN');
    });
    it('returns US defaults for unknown country', () => {
      const cfg = getRegionalConfig('ZZ');
      expect(cfg.countryCode).toBe('US');
      expect(cfg.currencyCode).toBe('USD');
    });
    it('returns US defaults for empty string', () => {
      const cfg = getRegionalConfig('');
      expect(cfg.countryCode).toBe('US');
    });
    it('returns US defaults for undefined input', () => {
      const cfg = getRegionalConfig(undefined as unknown as string);
      expect(cfg.countryCode).toBe('US');
    });
  });

  describe('isRegionSupported', () => {
    it('returns true for known country', () => {
      expect(isRegionSupported('US')).toBe(true);
      expect(isRegionSupported('us')).toBe(true);
    });
    it('returns false for unknown country', () => {
      expect(isRegionSupported('ZZ')).toBe(false);
    });
  });

  describe('getCountriesForOnboardingFlow', () => {
    it('returns India for india_upi flow', () => {
      const countries = getCountriesForOnboardingFlow('india_upi');
      expect(countries).toContain('IN');
    });
    it('returns US for us_sales_tax flow', () => {
      const countries = getCountriesForOnboardingFlow('us_sales_tax');
      expect(countries).toContain('US');
    });
    it('returns multiple EU countries for eu_vat flow', () => {
      const countries = getCountriesForOnboardingFlow('eu_vat');
      expect(countries).toContain('GB');
      expect(countries).toContain('DE');
      expect(countries).toContain('FR');
      expect(countries.length).toBeGreaterThanOrEqual(3);
    });
    it('returns non-empty list for standard flow', () => {
      const countries = getCountriesForOnboardingFlow('standard');
      expect(countries.length).toBeGreaterThan(0);
    });
  });
});
