export type RootStackParamList = {
  OnboardingWelcome: undefined;
  Permissions: undefined;
  DefaultGroupSetup: undefined;
  Home: undefined;
  Login: undefined;
  CreateGroup: { suggestedName?: string; suggestedEmoji?: string } | undefined;
  CaptureOptions: { groupId?: string } | undefined;
  OcrProcessing: { imageUri: string; groupId?: string };
  ReviewBill: { 
    imageUri: string; 
    groupId?: string;
    parsedAmount?: string;
    parsedMerchant?: string;
    parsedDate?: string;
    expenseId?: string; // For editing existing expenses
    ocrResult?: any; // Full OCR result for itemized split detection
  };
  ConfigureSplit: { 
    draftBillId?: string;
    groupId?: string;
    amount?: string;
    merchant?: string;
    category?: string;
    imageUri?: string;
    paidBy?: string;
  };
  AddExpense: {
    imageUri?: string;
    groupId?: string;
    parsedAmount?: string;
    parsedMerchant?: string;
    parsedDate?: string;
    expenseId?: string; // For editing existing expenses
  };
  GroupDetail: { groupId: string };
  SettleUp: { groupId: string };
  Templates: { groupId: string };
  Ledger: { groupId: string };
  Analytics: { groupId: string };
  PerPersonStats: { groupId: string };
  LensView: { groupId: string };
  MonthlyReport: { groupId: string; month?: number; year?: number };
  Notifications: undefined;
  ItemizedSplit: { groupId: string; items: Array<{ name: string; price: number; quantity?: number }>; total: number; deliveryFee?: number; tax?: number; discount?: number };
  RentSplit: { groupId: string };
  ReceiptGallery: { groupId: string };
  Achievements: undefined;
  BackupRestore: undefined;
};
