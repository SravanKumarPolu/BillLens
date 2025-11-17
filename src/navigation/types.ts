export type RootStackParamList = {
  OnboardingWelcome: undefined;
  Permissions: undefined;
  DefaultGroupSetup: undefined;
  Home: undefined;
  CreateGroup: undefined;
  CaptureOptions: { groupId?: string } | undefined;
  OcrProcessing: { imageUri: string; groupId?: string };
  ReviewBill: { imageUri: string; groupId?: string };
  ConfigureSplit: { draftBillId: string };
  GroupDetail: { groupId: string };
  SettleUp: { groupId: string };
  Templates: { groupId: string };
};
