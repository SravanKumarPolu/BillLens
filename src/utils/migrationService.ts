/**
 * Migration Service
 * 
 * Handles data migrations for BillLens, ensuring backward compatibility
 * and adding new fields to existing data structures.
 * 
 * Current migrations:
 * - Migration 1: Add settlement immutability fields (createdAt, version)
 */

import { Settlement } from '../types/models';
import { loadAppData, saveAppData, type AppData } from './storageService';

export interface Migration {
  version: number;
  name: string;
  run: (data: AppData) => Promise<AppData>;
}

/**
 * Migration 1: Add settlement immutability fields
 * Adds createdAt, version, and updatedAt to existing settlements
 */
const migration1: Migration = {
  version: 1,
  name: 'Add settlement immutability fields',
  run: async (data: AppData): Promise<AppData> => {
    const migratedSettlements = data.settlements.map(settlement => {
      // Only migrate if fields are missing
      if (settlement.createdAt && settlement.version !== undefined) {
        return settlement; // Already migrated
      }

      return {
        ...settlement,
        createdAt: settlement.createdAt || settlement.date, // Use date as fallback
        version: settlement.version ?? 1, // Default to version 1
        // updatedAt remains undefined for original settlements
      };
    });

    return {
      ...data,
      settlements: migratedSettlements,
    };
  },
};

/**
 * All migrations in order
 */
const migrations: Migration[] = [
  migration1,
  // Add future migrations here
];

/**
 * Get the current data version
 * Stored in a separate field or inferred from data structure
 */
const getDataVersion = (data: AppData): number => {
  // Check if settlements have been migrated (have createdAt and version)
  const hasSettlementMigration = data.settlements.length === 0 || 
    data.settlements.some(s => s.createdAt && s.version !== undefined);
  
  if (hasSettlementMigration) {
    return 1; // At least migration 1 has run
  }
  
  return 0; // No migrations run yet
};

/**
 * Check if migrations are needed
 */
export const checkMigrationsNeeded = async (): Promise<boolean> => {
  try {
    const data = await loadAppData();
    if (!data) return false;

    const currentVersion = getDataVersion(data);
    const latestVersion = migrations.length;

    return currentVersion < latestVersion;
  } catch (error) {
    console.error('[Migration] Error checking migrations:', error);
    return false;
  }
};

/**
 * Migrate a single settlement (for manual migration)
 */
export const migrateSettlements = (settlements: Settlement[]): Settlement[] => {
  return settlements.map(settlement => {
    if (settlement.createdAt && settlement.version !== undefined) {
      return settlement; // Already migrated
    }

    return {
      ...settlement,
      createdAt: settlement.createdAt || settlement.date,
      version: settlement.version ?? 1,
    };
  });
};

/**
 * Run all pending migrations
 */
export const runMigrations = async (): Promise<void> => {
  try {
    const data = await loadAppData();
    if (!data) {
      console.log('[Migration] No data to migrate');
      return;
    }

    const currentVersion = getDataVersion(data);
    const latestVersion = migrations.length;

    if (currentVersion >= latestVersion) {
      console.log('[Migration] All migrations up to date');
      return;
    }

    console.log(`[Migration] Running migrations from version ${currentVersion} to ${latestVersion}`);

    // Run migrations in order
    let migratedData = data;
    for (let i = currentVersion; i < latestVersion; i++) {
      const migration = migrations[i];
      console.log(`[Migration] Running migration ${migration.version}: ${migration.name}`);
      
      try {
        migratedData = await migration.run(migratedData);
        console.log(`[Migration] Migration ${migration.version} completed successfully`);
      } catch (error) {
        console.error(`[Migration] Error running migration ${migration.version}:`, error);
        // Continue with next migration even if one fails
      }
    }

    // Save migrated data
    await saveAppData(migratedData);
    console.log('[Migration] All migrations completed and data saved');
  } catch (error) {
    console.error('[Migration] Error running migrations:', error);
    // Don't throw - migrations are non-critical
  }
};
