export type RootStackParamList = {
  OnboardingWelcome: undefined;
  Permissions: undefined;
  DefaultGroupSetup: undefined;
  Home: undefined;
  Login: undefined;
  CreateGroup: undefined;
  CaptureOptions: { groupId?: string } | undefined;
  OcrProcessing: { imageUri: string; groupId?: string };
  ReviewBill: { 
    imageUri: string; 
    groupId?: string;
    parsedAmount?: string;
    parsedMerchant?: string;
    parsedDate?: string;
    expenseId?: string; // For editing existing expenses
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
  LensView: { groupId: string };
  BackupRestore: undefined;
};
