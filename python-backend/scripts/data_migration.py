#!/usr/bin/env python3
"""
Data Migration Script
Helps migrate data between formats or versions
"""

import json
import sys
from typing import Dict, List, Any
from datetime import datetime


class DataMigrator:
    """Migrate BillLens data between formats"""
    
    def migrate_export_to_import(self, export_file: str, output_file: str):
        """
        Convert export format to import format
        
        Useful for:
        - Converting between backup formats
        - Migrating from other apps
        - Version upgrades
        """
        with open(export_file, 'r') as f:
            data = json.load(f)
        
        # Transform data structure if needed
        migrated = {
            "version": "1.0",
            "migrated_at": datetime.now().isoformat(),
            "groups": data.get("groups", []),
            "expenses": data.get("expenses", []),
            "settlements": data.get("settlements", []),
        }
        
        with open(output_file, 'w') as f:
            json.dump(migrated, f, indent=2)
        
        print(f"Migration complete: {export_file} -> {output_file}")
    
    def validate_data(self, data_file: str) -> Dict[str, Any]:
        """Validate data structure and integrity"""
        with open(data_file, 'r') as f:
            data = json.load(f)
        
        errors = []
        warnings = []
        
        # Validate required fields
        if "groups" not in data:
            errors.append("Missing 'groups' field")
        
        if "expenses" not in data:
            errors.append("Missing 'expenses' field")
        
        # Validate groups
        if "groups" in data:
            for i, group in enumerate(data["groups"]):
                if "id" not in group:
                    errors.append(f"Group {i} missing 'id'")
                if "name" not in group:
                    errors.append(f"Group {i} missing 'name'")
        
        # Validate expenses
        if "expenses" in data:
            for i, expense in enumerate(data["expenses"]):
                if "id" not in expense:
                    errors.append(f"Expense {i} missing 'id'")
                if "amount" not in expense:
                    errors.append(f"Expense {i} missing 'amount'")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "stats": {
                "groups": len(data.get("groups", [])),
                "expenses": len(data.get("expenses", [])),
                "settlements": len(data.get("settlements", [])),
            }
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python data_migration.py <command> [args]")
        print("Commands:")
        print("  migrate <input> <output> - Migrate data format")
        print("  validate <file> - Validate data structure")
        sys.exit(1)
    
    migrator = DataMigrator()
    command = sys.argv[1]
    
    if command == "migrate":
        if len(sys.argv) < 4:
            print("Usage: python data_migration.py migrate <input> <output>")
            sys.exit(1)
        migrator.migrate_export_to_import(sys.argv[2], sys.argv[3])
    
    elif command == "validate":
        if len(sys.argv) < 3:
            print("Usage: python data_migration.py validate <file>")
            sys.exit(1)
        result = migrator.validate_data(sys.argv[2])
        print(json.dumps(result, indent=2))
