import { StyleSheet, Text, View } from 'react-native';

type ModuleStatus = 'pending' | 'scaffolded' | 'partial' | 'implemented';

interface ModuleRow {
  name: string;
  status: ModuleStatus;
  prompt: number | null;
}

const MODULE_ROWS: readonly ModuleRow[] = [
  { name: 'Project Bootstrap + Capture', status: 'implemented', prompt: 1 },
  { name: 'Architecture + Trust Rules', status: 'implemented', prompt: 2 },
  { name: 'Domain + Draft + Confidence', status: 'implemented', prompt: 3 },
  { name: 'Split + Item Assignment', status: 'implemented', prompt: 4 },
  { name: 'Balance + Explanation Engine', status: 'implemented', prompt: 5 },
  { name: 'Database Schema (21 tables)', status: 'implemented', prompt: 6 },
  { name: 'Repository + CaptureProcessor', status: 'implemented', prompt: 7 },
  { name: 'SQLite + Drafts + Privacy Sync', status: 'partial', prompt: 8 },
  { name: 'Guest Identity + File Migration', status: 'partial', prompt: 9 },
  { name: 'Architecture + Trust Audit', status: 'implemented', prompt: 10 },
];

export function ArchitectureStatus() {
  return (
    <View style={styles.statusList}>
      {MODULE_ROWS.map((row) => (
        <View key={row.name} style={styles.statusRow}>
          <Text style={styles.statusName}>{row.name}</Text>
          <Text style={styles.statusBadge}>
            {row.status} {row.prompt ? `\u00B7 P${row.prompt}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statusList: {
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F2EEE8',
    borderRadius: 8,
  },
  statusName: {
    fontSize: 14,
    color: '#1A1B25',
  },
  statusBadge: {
    fontSize: 11,
    color: '#9B9EA8',
    fontFamily: 'monospace',
  },
});
