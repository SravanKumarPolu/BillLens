/**
 * Math Utilities for BillLens
 * 
 * Provides safe, precise financial calculations to prevent floating point errors
 * and ensure mathematical correctness in balance and split calculations.
 */

/**
 * Round to 2 decimal places (standard for currency)
 * Uses proper rounding to avoid floating point errors
 */
export const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100;
};

/**
 * Normalize split amounts to ensure they sum exactly to the total
 * Distributes any rounding difference to the largest split
 * 
 * @param splits - Array of split amounts
 * @param total - Total amount that splits should sum to
 * @returns Normalized splits that sum exactly to total
 */
export const normalizeSplits = (
  splits: Array<{ memberId: string; amount: number }>,
  total: number
): Array<{ memberId: string; amount: number }> => {
  if (splits.length === 0) return [];

  // Round all splits to 2 decimals
  const rounded = splits.map(s => ({
    ...s,
    amount: roundToTwoDecimals(s.amount),
  }));

  // Calculate current sum
  const currentSum = rounded.reduce((sum, s) => sum + s.amount, 0);
  const difference = roundToTwoDecimals(total - currentSum);

  // If there's a difference, adjust the largest split
  if (Math.abs(difference) > 0.001) {
    // Find the split with the largest amount
    const largestIndex = rounded.reduce(
      (maxIdx, s, idx) => (s.amount > rounded[maxIdx].amount ? idx : maxIdx),
      0
    );
    
    // Adjust the largest split to account for the difference
    rounded[largestIndex].amount = roundToTwoDecimals(
      rounded[largestIndex].amount + difference
    );
  }

  return rounded;
};

/**
 * Calculate equal splits ensuring they sum exactly to total
 * Handles rounding differences by distributing to first split
 * 
 * @param total - Total amount to split
 * @param count - Number of people to split between
 * @returns Array of equal amounts that sum exactly to total
 */
export const calculateEqualSplits = (total: number, count: number): number[] => {
  if (count <= 0) return [];
  if (count === 1) return [roundToTwoDecimals(total)];

  const baseAmount = total / count;
  const roundedBase = roundToTwoDecimals(baseAmount);
  
  // Calculate what the rounded splits would sum to
  const roundedSum = roundedBase * count;
  const difference = roundToTwoDecimals(total - roundedSum);

  // Create array with rounded base amounts
  const splits = new Array(count).fill(roundedBase);

  // Add difference to first split to ensure exact total
  splits[0] = roundToTwoDecimals(splits[0] + difference);

  return splits;
};

/**
 * Verify that splits sum to total (within tolerance)
 * 
 * @param splits - Array of split amounts
 * @param total - Expected total
 * @param tolerance - Allowed difference (default 0.01)
 * @returns true if splits sum to total within tolerance
 */
export const verifySplitsSum = (
  splits: Array<{ amount: number }>,
  total: number,
  tolerance = 0.01
): boolean => {
  const sum = splits.reduce((s, split) => s + split.amount, 0);
  return Math.abs(sum - total) <= tolerance;
};

/**
 * Verify that group balances sum to zero (within tolerance)
 * In a closed group, all balances should sum to zero
 * 
 * @param balances - Array of member balances
 * @param tolerance - Allowed difference (default 0.01)
 * @returns true if balances sum to zero within tolerance
 */
export const verifyBalancesSumToZero = (
  balances: Array<{ balance: number }>,
  tolerance = 0.01
): boolean => {
  const sum = balances.reduce((s, b) => s + b.balance, 0);
  return Math.abs(sum) <= tolerance;
};

/**
 * Calculate split amounts for equal split mode
 * Ensures exact total with proper rounding
 * 
 * @param total - Total amount
 * @param memberIds - Array of member IDs
 * @returns Array of splits with normalized amounts
 */
export const createEqualSplits = (
  total: number,
  memberIds: string[]
): Array<{ memberId: string; amount: number }> => {
  const amounts = calculateEqualSplits(total, memberIds.length);
  return memberIds.map((memberId, index) => ({
    memberId,
    amount: amounts[index],
  }));
};

/**
 * Normalize a single amount to 2 decimal places
 */
export const normalizeAmount = (amount: number): number => {
  return roundToTwoDecimals(amount);
};
